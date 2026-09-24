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

type AddMemberRequest struct {
	UserID string `json:"user_id"`
}

type ChannelMemberResponse struct {
	database.ChannelMember
	Email          string `json:"email"`
	DisplayName    string `json:"display_name"`
	PresenceStatus string `json:"presence_status"`
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
	if _, err := h.Queries.GetWorkspaceMember(r.Context(), database.GetWorkspaceMemberParams{WorkspaceID: workspaceID, UserID: userID}); err != nil {
		writeJSONError(w, http.StatusForbidden, "you are not a member of this workspace")
		return
	}

	channelType := req.Type
	if channelType == "" {
		channelType = "PUBLIC"
	}
	if channelType != "PUBLIC" && channelType != "PRIVATE" {
		writeJSONError(w, http.StatusBadRequest, "channel type must be PUBLIC or PRIVATE")
		return
	}
	if channelType == "PRIVATE" {
		if _, ok := auth.RequireRole(w, r, h.Queries, workspaceID, "OWNER", "ADMIN"); !ok {
			return
		}
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
	channel, err := h.Queries.GetChannelByID(r.Context(), channelID)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "channel not found")
		return
	}
	if channel.Type == "PRIVATE" {
		writeJSONError(w, http.StatusForbidden, "private channels require an invitation")
		return
	}
	if _, err := h.Queries.GetWorkspaceMember(r.Context(), database.GetWorkspaceMemberParams{WorkspaceID: channel.WorkspaceID, UserID: userID}); err != nil {
		writeJSONError(w, http.StatusForbidden, "you are not a member of this workspace")
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

func (h *Handler) AddMember(w http.ResponseWriter, r *http.Request) {
	channelID, err := uuid.Parse(chi.URLParam(r, "channelID"))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid channel id")
		return
	}
	channel, err := h.Queries.GetChannelByID(r.Context(), channelID)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "channel not found")
		return
	}
	if _, ok := auth.RequireRole(w, r, h.Queries, channel.WorkspaceID, "OWNER", "ADMIN"); !ok {
		return
	}
	var req AddMemberRequest
	if json.NewDecoder(r.Body).Decode(&req) != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	targetID, err := uuid.Parse(req.UserID)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid user_id")
		return
	}
	if _, err := h.Queries.GetWorkspaceMember(r.Context(), database.GetWorkspaceMemberParams{WorkspaceID: channel.WorkspaceID, UserID: targetID}); err != nil {
		writeJSONError(w, http.StatusForbidden, "user is not a workspace member")
		return
	}
	if err := h.Queries.AddChannelMember(r.Context(), database.AddChannelMemberParams{ChannelID: channelID, UserID: targetID}); err != nil {
		writeJSONError(w, http.StatusConflict, "user is already a channel member")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) ListMembers(w http.ResponseWriter, r *http.Request) {
	channelID, err := uuid.Parse(chi.URLParam(r, "channelID"))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid channel id")
		return
	}
	channel, err := h.Queries.GetChannelByID(r.Context(), channelID)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "channel not found")
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
	if member, memberErr := h.Queries.IsChannelMember(r.Context(), database.IsChannelMemberParams{ChannelID: channelID, UserID: userID}); memberErr != nil || !member {
		writeJSONError(w, http.StatusForbidden, "not a member of this channel")
		return
	}
	members, err := h.Queries.ListChannelMembers(r.Context(), channelID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to list channel members")
		return
	}
	response := make([]ChannelMemberResponse, 0, len(members))
	for _, item := range members {
		response = append(response, ChannelMemberResponse{ChannelMember: database.ChannelMember{ChannelID: item.ChannelID, UserID: item.UserID, JoinedAt: item.JoinedAt, LastReadAt: item.LastReadAt}, Email: item.Email, DisplayName: item.DisplayName, PresenceStatus: item.PresenceStatus})
	}
	json.NewEncoder(w).Encode(map[string]any{"channel": channel, "members": response})
}

func (h *Handler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	channelID, err := uuid.Parse(chi.URLParam(r, "channelID"))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid channel id")
		return
	}
	channel, err := h.Queries.GetChannelByID(r.Context(), channelID)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "channel not found")
		return
	}
	if _, ok := auth.RequireRole(w, r, h.Queries, channel.WorkspaceID, "OWNER", "ADMIN"); !ok {
		return
	}
	targetID, err := uuid.Parse(chi.URLParam(r, "userID"))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	if err := h.Queries.RemoveChannelMember(r.Context(), database.RemoveChannelMemberParams{ChannelID: channelID, UserID: targetID}); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to remove channel member")
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

	if err := h.Queries.AddUserToPublicChannelsInWorkspace(r.Context(), database.AddUserToPublicChannelsInWorkspaceParams{
		WorkspaceID: workspaceID,
		UserID:      userID,
	}); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to ensure public channel membership")
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

func (h *Handler) MarkRead(w http.ResponseWriter, r *http.Request) {
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
		writeJSONError(w, http.StatusUnauthorized, "invalid user")
		return
	}
	member, err := h.Queries.IsChannelMember(r.Context(), database.IsChannelMemberParams{ChannelID: channelID, UserID: userID})
	if err != nil || !member {
		writeJSONError(w, http.StatusForbidden, "not a member of this channel")
		return
	}
	if err := h.Queries.UpdateLastRead(r.Context(), database.UpdateLastReadParams{ChannelID: channelID, UserID: userID}); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to mark channel read")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) Unread(w http.ResponseWriter, r *http.Request) {
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
		writeJSONError(w, http.StatusUnauthorized, "invalid user")
		return
	}
	count, err := h.Queries.CountUnreadChannelMessages(r.Context(), database.UnreadCountParams{ChannelID: channelID, UserID: userID})
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to load unread count")
		return
	}
	json.NewEncoder(w).Encode(map[string]int64{"unread": count})
}
