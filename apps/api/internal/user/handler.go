package user

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/redis/go-redis/v9"

	"github.com/mesewo/slack-clone/apps/api/internal/auth"
	"github.com/mesewo/slack-clone/apps/api/internal/database"
	"github.com/mesewo/slack-clone/apps/api/internal/kafka"
	"github.com/mesewo/slack-clone/apps/api/internal/totp"
)

const (
	mfaChallengeTTL = 2 * time.Minute
	mfaReplayTTL    = 2 * time.Minute
)

var acceptTOTPStepScript = redis.NewScript(`
local last = redis.call('GET', KEYS[1])
if last and tonumber(ARGV[1]) <= tonumber(last) then
  return 0
end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
return 1
`)

type Handler struct {
	Queries *database.Queries
	Tokens  *auth.TokenManager
	Cookies auth.CookieConfig
	Kafka   *kafka.Producer
	Redis   *redis.Client
}

type AuthRequest struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"display_name,omitempty"`
}

func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	var req AuthRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(req.Password) < 8 {
		writeJSONError(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}

	hashed, err := auth.HashPassword(req.Password)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to hash password")
		return
	}

	var u database.User
	if err := h.Queries.InTx(r.Context(), func(txQueries *database.Queries) error {
		var err error
		u, err = txQueries.CreateUser(r.Context(), database.CreateUserParams{Email: req.Email, PasswordHash: hashed, DisplayName: req.DisplayName})
		if err != nil {
			return err
		}
		payload, err := json.Marshal(kafka.UserRegisteredEvent{EventID: u.ID.String(), Version: 1, Source: "core", UserID: u.ID.String(), Email: u.Email, DisplayName: u.DisplayName, RegisteredAt: u.CreatedAt})
		if err != nil {
			return err
		}
		return txQueries.EnqueueOutbox(r.Context(), kafka.TopicUserRegistered, u.ID.String(), payload)
	}); err != nil {
		writeJSONError(w, http.StatusConflict, "email already exists or invalid data")
		return
	}

	token, err := h.Tokens.Generate(u.ID.String(), u.Email)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	h.Cookies.Set(w, token, h.Tokens.TTL())

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"id": u.ID.String(), "email": u.Email})
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req AuthRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	u, err := h.Queries.GetUserByEmail(r.Context(), req.Email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeJSONError(w, http.StatusUnauthorized, "invalid credentials")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "something went wrong")
		return
	}

	if !auth.CheckPasswordHash(req.Password, u.PasswordHash) {
		writeJSONError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	if u.MfaEnabled {
		if h.Redis == nil {
			writeJSONError(w, http.StatusInternalServerError, "something went wrong")
			return
		}
		challengeID, err := newMFAChallengeID()
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "something went wrong")
			return
		}
		if err := h.Redis.Set(r.Context(), mfaChallengeKey(challengeID), u.ID.String(), mfaChallengeTTL).Err(); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "something went wrong")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"mfa_required": true, "challenge_id": challengeID})
		return
	}

	token, err := h.Tokens.Generate(u.ID.String(), u.Email)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	h.Cookies.Set(w, token, h.Tokens.TTL())
	json.NewEncoder(w).Encode(map[string]string{"id": u.ID.String(), "email": u.Email})
}

func (h *Handler) MFASetup(w http.ResponseWriter, r *http.Request) {
	claims, userID, ok := authenticatedUser(w, r)
	if !ok {
		return
	}
	secret, err := totp.GenerateSecret()
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to create MFA setup")
		return
	}
	if err := h.Queries.SetUserMFASecret(r.Context(), userID, secret); err != nil {
		if errors.Is(err, database.ErrMFAAlreadyEnabled) {
			writeJSONError(w, http.StatusConflict, "MFA is already enabled")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "failed to save MFA setup")
		return
	}
	label := url.PathEscape("SlackClone:" + claims.Email)
	provisioningURI := fmt.Sprintf("otpauth://totp/%s?secret=%s&issuer=SlackClone", label, secret)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"secret": secret, "otpauth_uri": provisioningURI})
}

func (h *Handler) MFAConfirm(w http.ResponseWriter, r *http.Request) {
	_, userID, ok := authenticatedUser(w, r)
	if !ok {
		return
	}
	var req struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	u, err := h.Queries.GetUserByID(r.Context(), userID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to load MFA setup")
		return
	}
	if u.MfaEnabled {
		writeJSONError(w, http.StatusConflict, "MFA is already enabled")
		return
	}
	if !u.MfaSecret.Valid {
		writeJSONError(w, http.StatusBadRequest, "MFA setup has not been started")
		return
	}
	if !totp.Verify(u.MfaSecret.String, req.Code, time.Now()) {
		writeJSONError(w, http.StatusUnauthorized, "invalid verification code")
		return
	}
	if err := h.Queries.EnableUserMFA(r.Context(), userID, u.MfaSecret.String); err != nil {
		if errors.Is(err, database.ErrMFASetupChanged) {
			writeJSONError(w, http.StatusConflict, "MFA setup changed; start setup again")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "failed to enable MFA")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) MFAChallenge(w http.ResponseWriter, r *http.Request) {
	if h.Redis == nil {
		writeJSONError(w, http.StatusInternalServerError, "something went wrong")
		return
	}
	var req struct {
		ChallengeID string `json:"challenge_id"`
		Code        string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ChallengeID == "" {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	challengeKey := mfaChallengeKey(req.ChallengeID)
	userIDString, err := h.Redis.Get(r.Context(), challengeKey).Result()
	if errors.Is(err, redis.Nil) {
		writeJSONError(w, http.StatusUnauthorized, "invalid or expired MFA challenge")
		return
	}
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "something went wrong")
		return
	}
	userID, err := uuid.Parse(userIDString)
	if err != nil {
		writeJSONError(w, http.StatusUnauthorized, "invalid or expired MFA challenge")
		return
	}
	u, err := h.Queries.GetUserByID(r.Context(), userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeJSONError(w, http.StatusUnauthorized, "invalid or expired MFA challenge")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "something went wrong")
		return
	}
	if !u.MfaEnabled || !u.MfaSecret.Valid {
		writeJSONError(w, http.StatusUnauthorized, "invalid or expired MFA challenge")
		return
	}
	step, valid := totp.VerifyWithStep(u.MfaSecret.String, req.Code, time.Now())
	if !valid {
		writeJSONError(w, http.StatusUnauthorized, "invalid verification code")
		return
	}
	accepted, err := acceptTOTPStepScript.Run(
		r.Context(), h.Redis, []string{mfaLastUsedKey(userID)},
		strconv.FormatInt(step, 10), int(mfaReplayTTL.Seconds()),
	).Int()
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "something went wrong")
		return
	}
	if accepted != 1 {
		writeJSONError(w, http.StatusUnauthorized, "verification code already used")
		return
	}
	if err := h.Redis.Del(r.Context(), challengeKey).Err(); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "something went wrong")
		return
	}
	token, err := h.Tokens.Generate(u.ID.String(), u.Email)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}
	h.Cookies.Set(w, token, h.Tokens.TTL())
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"id": u.ID.String(), "email": u.Email})
}

func authenticatedUser(w http.ResponseWriter, r *http.Request) (*auth.Claims, uuid.UUID, bool) {
	claims, ok := r.Context().Value(auth.UserContextKey).(*auth.Claims)
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "not authenticated")
		return nil, uuid.Nil, false
	}
	userID, err := uuid.Parse(claims.UserID)
	if err != nil {
		writeJSONError(w, http.StatusUnauthorized, "invalid user")
		return nil, uuid.Nil, false
	}
	return claims, userID, true
}

func newMFAChallengeID() (string, error) {
	value := make([]byte, 32)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(value), nil
}

func mfaChallengeKey(challengeID string) string { return "mfa_challenge:" + challengeID }

func mfaLastUsedKey(userID uuid.UUID) string { return "mfa_lastused:" + userID.String() }

// Logout was missing from the original plan - clearing the cookie is a Phase 1
// requirement, not a later add-on.
func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	h.Cookies.Clear(w)
	w.WriteHeader(http.StatusNoContent)
}

// Verify answers "given this cookie, who is logged in right now?" - this is
// what a dashboard checks on load/refresh to decide whether to render or
// redirect to sign-in. Mount this behind auth.Middleware, never standalone.
func (h *Handler) Verify(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(auth.UserContextKey).(*auth.Claims)
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	json.NewEncoder(w).Encode(map[string]string{"id": claims.UserID, "email": claims.Email})
}

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
