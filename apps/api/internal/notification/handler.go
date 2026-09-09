package notification

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/mesewo/slack-clone/apps/api/internal/auth"
	"github.com/mesewo/slack-clone/apps/api/internal/database"
)

type Handler struct{ Queries *database.Queries }

func userID(r *http.Request) (uuid.UUID, bool) {
	claims, ok := r.Context().Value(auth.UserContextKey).(*auth.Claims)
	if !ok {
		return uuid.Nil, false
	}
	id, err := uuid.Parse(claims.UserID)
	return id, err == nil
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	id, ok := userID(r)
	if !ok {
		http.Error(w, "not authenticated", http.StatusUnauthorized)
		return
	}
	items, err := h.Queries.ListNotifications(r.Context(), id)
	if err != nil {
		http.Error(w, "failed to load notifications", 500)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(items)
}

func (h *Handler) MarkRead(w http.ResponseWriter, r *http.Request) {
	id, ok := userID(r)
	if !ok {
		http.Error(w, "not authenticated", 401)
		return
	}
	notificationID, err := uuid.Parse(chi.URLParam(r, "notificationID"))
	if err != nil {
		http.Error(w, "invalid notification id", 400)
		return
	}
	if err := h.Queries.MarkNotificationRead(r.Context(), notificationID, id); err != nil {
		http.Error(w, "failed to mark notification read", 500)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) MarkAllRead(w http.ResponseWriter, r *http.Request) {
	id, ok := userID(r)
	if !ok {
		http.Error(w, "not authenticated", 401)
		return
	}
	if err := h.Queries.MarkAllNotificationsRead(r.Context(), id); err != nil {
		http.Error(w, "failed to mark notifications read", 500)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
