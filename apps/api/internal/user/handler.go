package user

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/mesewo/slack-clone/apps/api/internal/auth"
	"github.com/mesewo/slack-clone/services/contracts/userpb"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type Handler struct {
	Client  userpb.UserServiceClient
	Cookies auth.CookieConfig
}

type AuthRequest struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"display_name,omitempty"`
}

func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	var request AuthRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	response, err := h.Client.Register(r.Context(), &userpb.RegisterRequest{Email: request.Email, Password: request.Password, DisplayName: request.DisplayName})
	if err != nil {
		writeRPCError(w, err)
		return
	}
	h.Cookies.Set(w, response.GetToken(), time.Duration(response.GetTokenTtlSeconds())*time.Second)
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]string{"id": response.GetUserId(), "email": response.GetEmail()})
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var request AuthRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	response, err := h.Client.Login(r.Context(), &userpb.LoginRequest{Email: request.Email, Password: request.Password})
	if err != nil {
		writeRPCError(w, err)
		return
	}
	if response.GetMfaRequired() {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"mfa_required": true, "challenge_id": response.GetChallengeId()})
		return
	}
	h.Cookies.Set(w, response.GetToken(), time.Duration(response.GetTokenTtlSeconds())*time.Second)
	_ = json.NewEncoder(w).Encode(map[string]string{"id": response.GetUserId(), "email": response.GetEmail()})
}

func (h *Handler) MFASetup(w http.ResponseWriter, r *http.Request) {
	userID, ok := authenticatedUser(w, r)
	if !ok {
		return
	}
	response, err := h.Client.MFASetup(r.Context(), &userpb.MFASetupRequest{UserId: userID.String()})
	if err != nil {
		writeRPCError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"secret": response.GetSecret(), "otpauth_uri": response.GetOtpauthUri()})
}

func (h *Handler) MFAConfirm(w http.ResponseWriter, r *http.Request) {
	userID, ok := authenticatedUser(w, r)
	if !ok {
		return
	}
	var request struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if _, err := h.Client.MFAConfirm(r.Context(), &userpb.MFAConfirmRequest{UserId: userID.String(), Code: request.Code}); err != nil {
		writeRPCError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) MFAChallenge(w http.ResponseWriter, r *http.Request) {
	var request struct {
		ChallengeID string `json:"challenge_id"`
		Code        string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil || request.ChallengeID == "" {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	response, err := h.Client.MFAChallenge(r.Context(), &userpb.MFAChallengeRequest{ChallengeId: request.ChallengeID, Code: request.Code})
	if err != nil {
		writeRPCError(w, err)
		return
	}
	h.Cookies.Set(w, response.GetToken(), time.Duration(response.GetTokenTtlSeconds())*time.Second)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"id": response.GetUserId(), "email": response.GetEmail()})
}

// Logout remains HTTP-only: JWTs are stateless, so expiring the cookie is the
// complete logout operation. There is no session or token-revocation store.
func (h *Handler) Logout(w http.ResponseWriter, _ *http.Request) {
	h.Cookies.Clear(w)
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) Verify(w http.ResponseWriter, r *http.Request) {
	if _, ok := r.Context().Value(auth.UserContextKey).(*auth.Claims); !ok {
		writeJSONError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	cookie, err := r.Cookie(auth.CookieName)
	if err != nil {
		writeJSONError(w, http.StatusUnauthorized, "missing token")
		return
	}
	identity, err := h.Client.Verify(r.Context(), &userpb.VerifyRequest{Token: cookie.Value})
	if err != nil {
		writeRPCError(w, err)
		return
	}
	_ = json.NewEncoder(w).Encode(map[string]string{"id": identity.GetUserId(), "email": identity.GetEmail()})
}

func authenticatedUser(w http.ResponseWriter, r *http.Request) (uuid.UUID, bool) {
	claims, ok := r.Context().Value(auth.UserContextKey).(*auth.Claims)
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "not authenticated")
		return uuid.Nil, false
	}
	userID, err := uuid.Parse(claims.UserID)
	if err != nil {
		writeJSONError(w, http.StatusUnauthorized, "invalid user")
		return uuid.Nil, false
	}
	return userID, true
}

func writeRPCError(w http.ResponseWriter, err error) {
	code := status.Code(err)
	statusCode := http.StatusInternalServerError
	switch code {
	case codes.InvalidArgument, codes.FailedPrecondition:
		statusCode = http.StatusBadRequest
	case codes.Unauthenticated, codes.PermissionDenied:
		statusCode = http.StatusUnauthorized
	case codes.AlreadyExists, codes.Aborted:
		statusCode = http.StatusConflict
	case codes.NotFound:
		statusCode = http.StatusNotFound
	case codes.Unavailable, codes.DeadlineExceeded:
		statusCode = http.StatusServiceUnavailable
	}
	writeJSONError(w, statusCode, status.Convert(err).Message())
}

func writeJSONError(w http.ResponseWriter, code int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}
