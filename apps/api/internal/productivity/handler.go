package productivity

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/mesewo/slack-clone/apps/api/internal/auth"
	"github.com/mesewo/slack-clone/apps/api/internal/database"
)

type Handler struct{ Queries *database.Queries }

func currentUser(r *http.Request) (uuid.UUID, bool) {
	claims, ok := r.Context().Value(auth.UserContextKey).(*auth.Claims)
	if !ok {
		return uuid.Nil, false
	}
	id, err := uuid.Parse(claims.UserID)
	return id, err == nil
}
func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func (h *Handler) Profile(w http.ResponseWriter, r *http.Request) {
	id, ok := currentUser(r)
	if !ok {
		writeError(w, 401, "not authenticated")
		return
	}
	item, err := h.Queries.GetProfileSettings(r.Context(), id)
	if err != nil {
		writeError(w, 500, "failed to load profile")
		return
	}
	writeJSON(w, 200, item)
}

func (h *Handler) Threads(w http.ResponseWriter, r *http.Request) {
	id, ok := currentUser(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	items, err := h.Queries.ListThreadsForUser(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load threads")
		return
	}
	writeJSON(w, http.StatusOK, items)
}
func (h *Handler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	id, ok := currentUser(r)
	if !ok {
		writeError(w, 401, "not authenticated")
		return
	}
	var req struct {
		DisplayName    string  `json:"display_name"`
		AvatarURL      *string `json:"avatar_url"`
		PresenceStatus string  `json:"presence_status"`
	}
	if json.NewDecoder(r.Body).Decode(&req) != nil {
		writeError(w, 400, "invalid request body")
		return
	}
	avatarURL := ""
	if req.AvatarURL != nil {
		avatarURL = *req.AvatarURL
	}
	item, err := h.Queries.UpdateProfileSettings(r.Context(), id, strings.TrimSpace(req.DisplayName), avatarURL, req.PresenceStatus)
	if err != nil {
		writeError(w, 500, "failed to update profile")
		return
	}
	writeJSON(w, 200, item)
}
func (h *Handler) Saved(w http.ResponseWriter, r *http.Request) {
	id, ok := currentUser(r)
	if !ok {
		writeError(w, 401, "not authenticated")
		return
	}
	items, err := h.Queries.ListSavedMessages(r.Context(), id)
	if err != nil {
		writeError(w, 500, "failed to load saved messages")
		return
	}
	writeJSON(w, 200, items)
}
func (h *Handler) Save(w http.ResponseWriter, r *http.Request) {
	id, ok := currentUser(r)
	if !ok {
		writeError(w, 401, "not authenticated")
		return
	}
	messageID, err := uuid.Parse(chi.URLParam(r, "messageID"))
	if err != nil {
		writeError(w, 400, "invalid message id")
		return
	}
	if err = h.Queries.SaveMessage(r.Context(), id, messageID); err != nil {
		writeError(w, 500, "failed to save message")
		return
	}
	w.WriteHeader(204)
}
func (h *Handler) Unsave(w http.ResponseWriter, r *http.Request) {
	id, ok := currentUser(r)
	if !ok {
		writeError(w, 401, "not authenticated")
		return
	}
	messageID, err := uuid.Parse(chi.URLParam(r, "messageID"))
	if err != nil {
		writeError(w, 400, "invalid message id")
		return
	}
	if err = h.Queries.UnsaveMessage(r.Context(), id, messageID); err != nil {
		writeError(w, 500, "failed to unsave message")
		return
	}
	w.WriteHeader(204)
}

func (h *Handler) Starred(w http.ResponseWriter, r *http.Request) {
	id, ok := currentUser(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	items, err := h.Queries.ListStarredConversations(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load starred conversations")
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (h *Handler) Star(w http.ResponseWriter, r *http.Request) {
	id, ok := currentUser(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	channelID, conversationID, err := parseStarTarget(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid conversation")
		return
	}
	if !h.isConversationMember(r, id, channelID, conversationID) {
		writeError(w, http.StatusForbidden, "not a conversation member")
		return
	}
	if err := h.Queries.StarConversation(r.Context(), id, channelID, conversationID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to star conversation")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) Unstar(w http.ResponseWriter, r *http.Request) {
	id, ok := currentUser(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	channelID, conversationID, err := parseStarTarget(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid conversation")
		return
	}
	if err := h.Queries.UnstarConversation(r.Context(), id, channelID, conversationID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to unstar conversation")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func parseStarTarget(r *http.Request) (*uuid.UUID, *uuid.UUID, error) {
	targetID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		return nil, nil, err
	}
	target := &targetID
	switch chi.URLParam(r, "kind") {
	case "channel":
		return target, nil, nil
	case "dm":
		return nil, target, nil
	default:
		return nil, nil, errors.New("kind must be channel or dm")
	}
}

func (h *Handler) isConversationMember(r *http.Request, userID uuid.UUID, channelID, conversationID *uuid.UUID) bool {
	if channelID != nil {
		member, err := h.Queries.IsChannelMember(r.Context(), database.IsChannelMemberParams{ChannelID: *channelID, UserID: userID})
		return err == nil && member
	}
	if conversationID != nil {
		member, err := h.Queries.IsDirectConversationMember(r.Context(), database.IsDirectConversationMemberParams{ConversationID: *conversationID, UserID: userID})
		return err == nil && member
	}
	return false
}

func parsePinnedScope(r *http.Request) (uuid.UUID, uuid.UUID, error) {
	channelRaw := r.URL.Query().Get("channel_id")
	conversationRaw := r.URL.Query().Get("conversation_id")
	if (channelRaw == "") == (conversationRaw == "") {
		return uuid.Nil, uuid.Nil, errors.New("provide exactly one conversation scope")
	}
	if channelRaw != "" {
		id, err := uuid.Parse(channelRaw)
		return id, uuid.Nil, err
	}
	id, err := uuid.Parse(conversationRaw)
	return uuid.Nil, id, err
}

func (h *Handler) pinnedScope(w http.ResponseWriter, r *http.Request, userID uuid.UUID) (uuid.UUID, uuid.UUID, bool) {
	channelID, conversationID, err := parsePinnedScope(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, "provide exactly one valid channel_id or conversation_id")
		return uuid.Nil, uuid.Nil, false
	}
	channelPtr, conversationPtr := (*uuid.UUID)(nil), (*uuid.UUID)(nil)
	if channelID != uuid.Nil {
		channelPtr = &channelID
	} else {
		conversationPtr = &conversationID
	}
	if !h.isConversationMember(r, userID, channelPtr, conversationPtr) {
		writeError(w, http.StatusForbidden, "not a conversation member")
		return uuid.Nil, uuid.Nil, false
	}
	return channelID, conversationID, true
}

func (h *Handler) Pinned(w http.ResponseWriter, r *http.Request) {
	userID, ok := currentUser(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	channelID, conversationID, ok := h.pinnedScope(w, r, userID)
	if !ok {
		return
	}
	items, err := h.Queries.ListPinnedMessages(r.Context(), channelID, conversationID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load pinned messages")
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (h *Handler) Pin(w http.ResponseWriter, r *http.Request) {
	userID, ok := currentUser(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	channelID, conversationID, ok := h.pinnedScope(w, r, userID)
	if !ok {
		return
	}
	messageID, err := uuid.Parse(chi.URLParam(r, "messageID"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid message id")
		return
	}
	if err := h.Queries.PinMessage(r.Context(), messageID, channelID, conversationID, userID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to pin message")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) Unpin(w http.ResponseWriter, r *http.Request) {
	userID, ok := currentUser(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	channelID, conversationID, ok := h.pinnedScope(w, r, userID)
	if !ok {
		return
	}
	messageID, err := uuid.Parse(chi.URLParam(r, "messageID"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid message id")
		return
	}
	if err := h.Queries.UnpinMessage(r.Context(), messageID, channelID, conversationID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to unpin message")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
func (h *Handler) SubscribeThread(w http.ResponseWriter, r *http.Request) {
	id, ok := currentUser(r)
	if !ok {
		writeError(w, 401, "not authenticated")
		return
	}
	messageID, err := uuid.Parse(chi.URLParam(r, "messageID"))
	if err != nil {
		writeError(w, 400, "invalid message id")
		return
	}
	if err = h.Queries.SubscribeThread(r.Context(), id, messageID); err != nil {
		writeError(w, 500, "failed to subscribe")
		return
	}
	w.WriteHeader(204)
}
func (h *Handler) UnsubscribeThread(w http.ResponseWriter, r *http.Request) {
	id, ok := currentUser(r)
	if !ok {
		writeError(w, 401, "not authenticated")
		return
	}
	messageID, err := uuid.Parse(chi.URLParam(r, "messageID"))
	if err != nil {
		writeError(w, 400, "invalid message id")
		return
	}
	if err = h.Queries.UnsubscribeThread(r.Context(), id, messageID); err != nil {
		writeError(w, 500, "failed to unsubscribe")
		return
	}
	w.WriteHeader(204)
}
func (h *Handler) Preferences(w http.ResponseWriter, r *http.Request) {
	id, ok := currentUser(r)
	if !ok {
		writeError(w, 401, "not authenticated")
		return
	}
	if r.Method == http.MethodGet {
		item, err := h.Queries.GetNotificationPreferences(r.Context(), id)
		if err != nil {
			writeError(w, 500, "failed to load preferences")
			return
		}
		writeJSON(w, 200, item)
		return
	}
	var item database.NotificationPreferences
	if json.NewDecoder(r.Body).Decode(&item) != nil {
		writeError(w, 400, "invalid request body")
		return
	}
	if err := h.Queries.UpdateNotificationPreferences(r.Context(), id, item); err != nil {
		writeError(w, 500, "failed to update preferences")
		return
	}
	writeJSON(w, 200, item)
}
func (h *Handler) Schedule(w http.ResponseWriter, r *http.Request) {
	id, ok := currentUser(r)
	if !ok {
		writeError(w, 401, "not authenticated")
		return
	}
	var req struct {
		ChannelID      *uuid.UUID `json:"channel_id"`
		ConversationID *uuid.UUID `json:"conversation_id"`
		Content        string     `json:"content"`
		ScheduledFor   time.Time  `json:"scheduled_for"`
	}
	if json.NewDecoder(r.Body).Decode(&req) != nil || strings.TrimSpace(req.Content) == "" || req.ScheduledFor.Before(time.Now()) {
		writeError(w, 400, "content and a future scheduled_for are required")
		return
	}
	item, err := h.Queries.CreateScheduledMessage(r.Context(), id, req.ChannelID, req.ConversationID, strings.TrimSpace(req.Content), req.ScheduledFor)
	if err != nil {
		writeError(w, 500, "failed to schedule message")
		return
	}
	writeJSON(w, 201, item)
}
