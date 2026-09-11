package workspace

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
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

type JoinWorkspaceRequest struct {
	Slug string `json:"slug,omitempty"`
}

type UpdateMemberRoleRequest struct {
	Role string `json:"role"`
}

type WorkspaceMemberResponse struct {
	database.WorkspaceMember
	Email          string `json:"email"`
	DisplayName    string `json:"display_name"`
	PresenceStatus string `json:"presence_status"`
}

type WorkspaceInviteResponse struct {
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expires_at"`
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
	if workspaces == nil {
		workspaces = []database.Workspace{}
	}

	for _, ws := range workspaces {
		if err := h.Queries.AddUserToPublicWorkspaceChannels(r.Context(), database.AddUserToPublicWorkspaceChannelsParams{
			WorkspaceID: ws.ID,
			UserID:      userID,
		}); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "failed to join public workspace channels")
			return
		}
	}

	json.NewEncoder(w).Encode(workspaces)
}

func (h *Handler) JoinWorkspace(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(auth.UserContextKey).(*auth.Claims)
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	var req JoinWorkspaceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Slug == "" {
		writeJSONError(w, http.StatusBadRequest, "workspace slug is required")
		return
	}

	userID, err := uuid.Parse(claims.UserID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "invalid user in session")
		return
	}

	ws, err := h.Queries.GetWorkspaceBySlug(r.Context(), req.Slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeJSONError(w, http.StatusNotFound, "workspace not found")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "failed to load workspace")
		return
	}

	if _, err := h.Queries.GetWorkspaceMember(r.Context(), database.GetWorkspaceMemberParams{
		WorkspaceID: ws.ID,
		UserID:      userID,
	}); err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			writeJSONError(w, http.StatusInternalServerError, "failed to verify workspace membership")
			return
		}
		if err := h.Queries.AddWorkspaceMember(r.Context(), database.AddWorkspaceMemberParams{
			WorkspaceID: ws.ID,
			UserID:      userID,
			Role:        "MEMBER",
		}); err != nil {
			writeJSONError(w, http.StatusConflict, "workspace membership already exists")
			return
		}
	}

	if err := h.Queries.AddUserToPublicWorkspaceChannels(r.Context(), database.AddUserToPublicWorkspaceChannelsParams{
		WorkspaceID: ws.ID,
		UserID:      userID,
	}); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "workspace joined but failed to join public channels")
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(ws)
}

func (h *Handler) CreateInvite(w http.ResponseWriter, r *http.Request) {
	workspaceID, err := uuid.Parse(chi.URLParam(r, "workspaceID"))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	requester, ok := auth.RequireRole(w, r, h.Queries, workspaceID, "OWNER", "ADMIN")
	if !ok {
		return
	}
	requesterID, err := uuid.Parse(requester.UserID.String())
	if err != nil {
		writeJSONError(w, http.StatusUnauthorized, "invalid user")
		return
	}
	rawToken := make([]byte, 32)
	if _, err := rand.Read(rawToken); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to generate invite")
		return
	}
	token := hex.EncodeToString(rawToken)
	hash := sha256.Sum256([]byte(token))
	expiresAt := time.Now().Add(24 * time.Hour)
	if err := h.Queries.CreateWorkspaceInvite(r.Context(), database.CreateWorkspaceInviteParams{
		WorkspaceID: workspaceID,
		TokenHash:   hex.EncodeToString(hash[:]),
		ExpiresAt:   expiresAt,
		CreatedBy:   requesterID,
	}); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to save invite")
		return
	}
	json.NewEncoder(w).Encode(WorkspaceInviteResponse{Token: token, ExpiresAt: expiresAt})
}

func (h *Handler) AcceptInvite(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(auth.UserContextKey).(*auth.Claims)
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	userID, err := uuid.Parse(claims.UserID)
	if err != nil {
		writeJSONError(w, http.StatusUnauthorized, "invalid user")
		return
	}
	token := chi.URLParam(r, "token")
	hash := sha256.Sum256([]byte(token))
	workspaceID, err := h.Queries.ConsumeWorkspaceInvite(r.Context(), hex.EncodeToString(hash[:]))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeJSONError(w, http.StatusNotFound, "invite is invalid, expired, or already used")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "failed to accept invite")
		return
	}
	if err := h.Queries.AddWorkspaceMember(r.Context(), database.AddWorkspaceMemberParams{WorkspaceID: workspaceID, UserID: userID, Role: "MEMBER"}); err != nil {
		writeJSONError(w, http.StatusConflict, "workspace membership already exists")
		return
	}
	if err := h.Queries.AddUserToPublicWorkspaceChannels(r.Context(), database.AddUserToPublicWorkspaceChannelsParams{WorkspaceID: workspaceID, UserID: userID}); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "joined workspace but failed to join public channels")
		return
	}
	json.NewEncoder(w).Encode(map[string]string{"workspace_id": workspaceID.String()})
}

func (h *Handler) ListMembers(w http.ResponseWriter, r *http.Request) {
	workspaceID, err := uuid.Parse(chi.URLParam(r, "workspaceID"))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	claims, ok := r.Context().Value(auth.UserContextKey).(*auth.Claims)
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	userID, err := uuid.Parse(claims.UserID)
	if err != nil {
		writeJSONError(w, http.StatusUnauthorized, "invalid user")
		return
	}
	member, err := h.Queries.GetWorkspaceMember(r.Context(), database.GetWorkspaceMemberParams{WorkspaceID: workspaceID, UserID: userID})
	if err != nil {
		writeJSONError(w, http.StatusForbidden, "not a member of this workspace")
		return
	}
	members, err := h.Queries.ListWorkspaceMembers(r.Context(), workspaceID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to list workspace members")
		return
	}
	response := make([]WorkspaceMemberResponse, 0, len(members))
	for _, item := range members {
		response = append(response, WorkspaceMemberResponse{
			WorkspaceMember: database.WorkspaceMember{WorkspaceID: item.WorkspaceID, UserID: item.UserID, Role: item.Role, JoinedAt: item.JoinedAt},
			Email:           item.Email, DisplayName: item.DisplayName, PresenceStatus: item.PresenceStatus,
		})
	}
	json.NewEncoder(w).Encode(map[string]any{"role": member.Role, "members": response})
}

func (h *Handler) UpdateMemberRole(w http.ResponseWriter, r *http.Request) {
	workspaceID, err := uuid.Parse(chi.URLParam(r, "workspaceID"))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	requester, ok := auth.RequireRole(w, r, h.Queries, workspaceID, "OWNER", "ADMIN")
	if !ok {
		return
	}
	targetID, err := uuid.Parse(chi.URLParam(r, "userID"))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	var req UpdateMemberRoleRequest
	if json.NewDecoder(r.Body).Decode(&req) != nil || (req.Role != "OWNER" && req.Role != "ADMIN" && req.Role != "MEMBER") {
		writeJSONError(w, http.StatusBadRequest, "role must be OWNER, ADMIN, or MEMBER")
		return
	}
	if req.Role == "OWNER" && requester.Role != "OWNER" {
		writeJSONError(w, http.StatusForbidden, "only the owner can assign owner role")
		return
	}
	target, err := h.Queries.GetWorkspaceMember(r.Context(), database.GetWorkspaceMemberParams{WorkspaceID: workspaceID, UserID: targetID})
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "workspace member not found")
		return
	}
	if target.Role == "OWNER" && req.Role != "OWNER" {
		writeJSONError(w, http.StatusForbidden, "the workspace owner cannot be demoted")
		return
	}
	updated, err := h.Queries.UpdateWorkspaceMemberRole(r.Context(), database.UpdateWorkspaceMemberRoleParams{WorkspaceID: workspaceID, UserID: targetID, Role: req.Role})
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to update member role")
		return
	}
	json.NewEncoder(w).Encode(updated)
}

func (h *Handler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	workspaceID, err := uuid.Parse(chi.URLParam(r, "workspaceID"))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	requester, ok := auth.RequireRole(w, r, h.Queries, workspaceID, "OWNER", "ADMIN")
	if !ok {
		return
	}
	targetID, err := uuid.Parse(chi.URLParam(r, "userID"))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	target, err := h.Queries.GetWorkspaceMember(r.Context(), database.GetWorkspaceMemberParams{WorkspaceID: workspaceID, UserID: targetID})
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "workspace member not found")
		return
	}
	if target.Role == "OWNER" || (target.Role == "ADMIN" && requester.Role != "OWNER") {
		writeJSONError(w, http.StatusForbidden, "you cannot remove this member")
		return
	}
	if err := h.Queries.RemoveWorkspaceMember(r.Context(), database.RemoveWorkspaceMemberParams{WorkspaceID: workspaceID, UserID: targetID}); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to remove workspace member")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
