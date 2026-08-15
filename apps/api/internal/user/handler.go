package user

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/mesewo/slack-clone/apps/api/internal/auth"
	"github.com/mesewo/slack-clone/apps/api/internal/database"
)

type Handler struct {
	Queries *database.Queries
	Tokens  *auth.TokenManager
	Cookies auth.CookieConfig
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
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"id": u.ID.String(), "email": u.Email})
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req AuthRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Debug: log login attempt (email only, do not log password)
	fmt.Printf("Login attempt for email=%s\n", req.Email)

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

	// Debug: log token length but not token contents
	fmt.Printf("Login success for email=%s tokenLen=%d\n", u.Email, len(token))

	h.Cookies.Set(w, token, h.Tokens.TTL())
	json.NewEncoder(w).Encode(map[string]string{"id": u.ID.String(), "email": u.Email})
}

// Logout was missing from the original plan - clearing the cookie is a Phase 1
// requirement, not a later add-on.
func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	h.Cookies.Clear(w)
	w.WriteHeader(http.StatusNoContent)
}

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// Verify checks a bearer token and returns the session info when valid.
func (h *Handler) Verify(w http.ResponseWriter, r *http.Request) {
	authHeader := r.Header.Get("Authorization")
	// Lightweight debug: log presence and length of incoming token header
	if authHeader == "" {
		// no auth header present
		// Avoid logging token content
		// Use standard log package (server main prints to console)
		// (developer debug) - non-sensitive
		//fmt.Println("Verify: no Authorization header")
	} else {
		//fmt.Printf("Verify: Authorization header length=%d\n", len(authHeader))
	}
	if authHeader == "" {
		writeJSONError(w, http.StatusUnauthorized, "missing authorization header")
		return
	}
	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 || parts[0] != "Bearer" {
		writeJSONError(w, http.StatusUnauthorized, "invalid authorization header")
		return
	}
	tokenStr := parts[1]

	claims, err := h.Tokens.Validate(tokenStr)
	if err != nil {
		writeJSONError(w, http.StatusUnauthorized, "invalid or expired token")
		return
	}

	// Look up user by email from the claims
	u, err := h.Queries.GetUserByEmail(r.Context(), claims.Email)
	if err != nil {
		writeJSONError(w, http.StatusUnauthorized, "user not found")
		return
	}

	// Build session response
	resp := map[string]interface{}{
		"user": map[string]string{
			"id":    u.ID.String(),
			"email": u.Email,
			"name":  u.DisplayName,
		},
		"token":     tokenStr,
		"expiresAt": claims.RegisteredClaims.ExpiresAt.Time.Format(time.RFC3339),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}