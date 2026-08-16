package message

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/mesewo/slack-clone/apps/api/internal/auth"
	"github.com/mesewo/slack-clone/apps/api/internal/database"
	"github.com/mesewo/slack-clone/apps/api/internal/gateway"
)

type Handler struct {
	Queries *database.Queries
	Hub     *gateway.Hub
}

type SendMessageRequest struct {
	Content string `json:"content"`
}

// SendMessage checks channel membership before writing - Gemini's thread
// reply handler skipped this, which lets anyone post to any channel they
// can guess the ID of.
func (h *Handler) SendMessage(w http.ResponseWriter, r *http.Request) {
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

	isMember, err := h.Queries.IsChannelMember(r.Context(), database.IsChannelMemberParams{
		ChannelID: channelID,
		UserID:    userID,
	})
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to verify channel membership")
		return
	}
	if !isMember {
		writeJSONError(w, http.StatusForbidden, "not a member of this channel")
		return
	}

	var req SendMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Content == "" {
		writeJSONError(w, http.StatusBadRequest, "content is required")
		return
	}

	msg, err := h.Queries.CreateMessage(r.Context(), database.CreateMessageParams{
		ChannelID: channelID,
		UserID:    uuid.NullUUID{UUID: userID, Valid: true},
		Content:   req.Content,
	})
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to send message")
		return
	}

	// Broadcast only after the DB write succeeds - never the other way
	// around, or a message could appear live but fail to persist.
	payload, err := json.Marshal(msg)
	if err == nil {
		event, err := json.Marshal(gateway.WSEvent{
			Type:      gateway.EventMessageCreated,
			ChannelID: channelID.String(),
			Payload:   payload,
		})
		if err == nil {
			h.Hub.BroadcastToChannel(channelID.String(), event)
		}
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(msg)
}

// ListMessages supports cursor pagination via ?before=<RFC3339 timestamp>&limit=50.
// Omit "before" for the first page (defaults to now).
func (h *Handler) ListMessages(w http.ResponseWriter, r *http.Request) {
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

	isMember, err := h.Queries.IsChannelMember(r.Context(), database.IsChannelMemberParams{
		ChannelID: channelID,
		UserID:    userID,
	})
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to verify channel membership")
		return
	}
	if !isMember {
		writeJSONError(w, http.StatusForbidden, "not a member of this channel")
		return
	}

	before := time.Now()
	if b := r.URL.Query().Get("before"); b != "" {
		parsed, err := time.Parse(time.RFC3339, b)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "before must be an RFC3339 timestamp")
			return
		}
		before = parsed
	}

	limit := int32(50)
	if l := r.URL.Query().Get("limit"); l != "" {
		parsed, err := strconv.Atoi(l)
		if err != nil || parsed <= 0 || parsed > 200 {
			writeJSONError(w, http.StatusBadRequest, "limit must be between 1 and 200")
			return
		}
		limit = int32(parsed)
	}

	messages, err := h.Queries.ListChannelMessages(r.Context(), database.ListChannelMessagesParams{
		ChannelID: channelID,
		CreatedAt: before,
		Limit:     limit,
	})
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		writeJSONError(w, http.StatusInternalServerError, "failed to list messages")
		return
	}

	json.NewEncoder(w).Encode(messages)
}

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}