package user

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"github.com/jackc/pgx/v5"

	"github.com/mesewo/slack-clone/apps/api/internal/auth"
	"github.com/mesewo/slack-clone/apps/api/internal/database"
	"github.com/mesewo/slack-clone/apps/api/internal/kafka"
)

type Handler struct {
	Queries *database.Queries
	Tokens  *auth.TokenManager
	Cookies auth.CookieConfig
	Kafka   *kafka.Producer
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

	u, err := h.Queries.CreateUser(r.Context(), database.CreateUserParams{
		Email:        req.Email,
		PasswordHash: hashed,
		DisplayName:  req.DisplayName,
	})
	if err != nil {
		writeJSONError(w, http.StatusConflict, "email already exists or invalid data")
		return
	}

	token, err := h.Tokens.Generate(u.ID.String(), u.Email)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	h.Cookies.Set(w, token, h.Tokens.TTL())

	// Durable event log entry, best-effort - registration already succeeded.
	if err := h.Kafka.Publish(r.Context(), kafka.TopicUserRegistered, u.ID.String(), kafka.UserRegisteredEvent{
		UserID:       u.ID.String(),
		Email:        u.Email,
		DisplayName:  u.DisplayName,
		RegisteredAt: u.CreatedAt,
	}); err != nil {
		log.Printf("failed to publish user.registered event: %v", err)
	}

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

	token, err := h.Tokens.Generate(u.ID.String(), u.Email)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	h.Cookies.Set(w, token, h.Tokens.TTL())
	json.NewEncoder(w).Encode(map[string]string{"id": u.ID.String(), "email": u.Email})
}

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