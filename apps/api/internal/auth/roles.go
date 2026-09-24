package auth

import (
	"net/http"

	"github.com/google/uuid"

	"github.com/mesewo/slack-clone/apps/api/internal/database"
)

func RequireRole(
	w http.ResponseWriter,
	r *http.Request,
	queries *database.Queries,
	workspaceID uuid.UUID,
	roles ...string,
) (*database.WorkspaceMember, bool) {
	claims, ok := r.Context().Value(UserContextKey).(*Claims)
	if !ok {
		writeRoleError(w, http.StatusUnauthorized, "not authenticated")
		return nil, false
	}
	userID, err := uuid.Parse(claims.UserID)
	if err != nil {
		writeRoleError(w, http.StatusUnauthorized, "invalid user")
		return nil, false
	}

	member, err := queries.GetWorkspaceMember(r.Context(), database.GetWorkspaceMemberParams{
		WorkspaceID: workspaceID,
		UserID:      userID,
	})
	if err != nil {
		writeRoleError(w, http.StatusForbidden, "not a member of this workspace")
		return nil, false
	}
	for _, role := range roles {
		if member.Role == role {
			return &member, true
		}
	}
	writeRoleError(w, http.StatusForbidden, "insufficient workspace role")
	return nil, false
}

func writeRoleError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(`{"error":"` + message + `"}`))
}