package workspace

import (
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/mesewo/slack-clone/apps/api/internal/auth"
	"github.com/mesewo/slack-clone/apps/api/internal/database"
)

type Handler struct {
	Queries *database.Queries
}

type CreateWorkspaceRequest struct {
	Name string `json:"name"`
	Slug string `json:"slug,omitempty"` // optional - derived from name if omitted
}

var slugSanitizer = regexp.MustCompile(`[^a-z0-9]+`)

func slugify(name string) string {
	s := strings.ToLower(name)
	s = slugSanitizer.ReplaceAllString(s, "-")
	return strings.Trim(s, "-")
}

func (h *Handler) CreateWorkspace(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(auth.UserContextKey).(*auth.Claims)
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	var req CreateWorkspaceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		writeJSONError(w, http.StatusBadRequest, "workspace name is required")
		return
	}

	slug := req.Slug
	if slug == "" {
		slug = slugify(req.Name)
	}
	if slug == "" {
		writeJSONError(w, http.StatusBadRequest, "could not derive a valid slug from name - provide one explicitly")
		return
	}

	userID, err := uuid.Parse(claims.UserID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "invalid user in session")
		return
	}

	ws, err := h.Queries.CreateWorkspace(r.Context(), database.CreateWorkspaceParams{
		Name: req.Name,
		Slug: slug,
	})
	if err != nil {
		writeJSONError(w, http.StatusConflict, "workspace slug already taken")
		return
	}

	// Creator becomes OWNER of their own workspace - without this, they'd
	// create a workspace they immediately can't do anything in, since every
	// other endpoint checks membership.
	if err := h.Queries.AddWorkspaceMember(r.Context(), database.AddWorkspaceMemberParams{
		WorkspaceID: ws.ID,
		UserID:      userID,
		Role:        "OWNER",
	}); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "workspace created but failed to add you as owner")
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(ws)
}

func (h *Handler) ListWorkspaces(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(auth.UserContextKey).(*auth.Claims)
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	userID, err := uuid.Parse(claims.UserID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "invalid user in session")
		return
	}

	workspaces, err := h.Queries.ListWorkspacesForUser(r.Context(), userID)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		writeJSONError(w, http.StatusInternalServerError, "failed to list workspaces")
		return
	}

	json.NewEncoder(w).Encode(workspaces)
}

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}