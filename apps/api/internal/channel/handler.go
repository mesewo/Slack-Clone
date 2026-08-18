package channel

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/mesewo/slack-clone/apps/api/internal/auth"
	"github.com/mesewo/slack-clone/apps/api/internal/database"
)

type Handler struct {
	Queries *database.Queries
}

type CreateChannelRequest struct {
	WorkspaceID string `json:"workspace_id"`
	Name        string `json:"name"`
	Type        string `json:"type,omitempty"` // PUBLIC or PRIVATE; defaults to PUBLIC
}

func (h *Handler) CreateChannel(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(auth.UserContextKey).(*auth.Claims)
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	var req CreateChannelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		writeJSONError(w, http.StatusBadRequest, "channel name is required")
		return
	}

	workspaceID, err := uuid.Parse(req.WorkspaceID)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid workspace_id")
		return
	}
	userID, err := uuid.Parse(claims.UserID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "invalid user in session")
		return
	}

	channelType := req.Type
	if channelType == "" {
		channelType = "PUBLIC"
	}

	ch, err := h.Queries.CreateChannel(r.Context(), database.CreateChannelParams{
		WorkspaceID: workspaceID,
		Name:        req.Name,
		Type:        channelType,
		CreatedBy:   uuid.NullUUID{UUID: userID, Valid: true},
	})
	if err != nil {
		writeJSONError(w, http.StatusConflict, "channel name already exists in this workspace")
		return
	}

	// Creator automatically joins their own channel.
	if err := h.Queries.AddChannelMember(r.Context(), database.AddChannelMemberParams{
		ChannelID: ch.ID,
		UserID:    userID,
	}); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "channel created but failed to add you as a member")
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(ch)
}

// JoinChannel takes the channel ID from the URL, not the body - REST
// convention, and one less thing the client can get inconsistent.
func (h *Handler) JoinChannel(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(auth.UserContextKey).(*auth.Claims)
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	channelID, err := uuid.Parse(chi.URLParam(r, "channelID"))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid channel id")
		return
	}
	userID, err := uuid.Parse(claims.UserID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "invalid user in session")
		return
	}

	if err := h.Queries.AddChannelMember(r.Context(), database.AddChannelMemberParams{
		ChannelID: channelID,
		UserID:    userID,
	}); err != nil {
		writeJSONError(w, http.StatusConflict, "already a member, or channel does not exist")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) ListChannels(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(auth.UserContextKey).(*auth.Claims)
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	workspaceID, err := uuid.Parse(r.URL.Query().Get("workspace_id"))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid or missing workspace_id query param")
		return
	}
	userID, err := uuid.Parse(claims.UserID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "invalid user in session")
		return
	}

	channels, err := h.Queries.ListChannelsForUser(r.Context(), database.ListChannelsForUserParams{
		UserID:      userID,
		WorkspaceID: workspaceID,
	})
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		writeJSONError(w, http.StatusInternalServerError, "failed to list channels")
		return
	}
	if channels == nil {
		channels = []database.Channel{}
	}

	json.NewEncoder(w).Encode(channels)
}

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}