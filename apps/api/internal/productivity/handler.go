package productivity

import (
	"encoding/json"
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
