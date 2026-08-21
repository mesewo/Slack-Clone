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

type CreateThreadReplyRequest struct {
	ParentID string `json:"parent_id"`
	Content  string `json:"content"`
}

type ReactionRequest struct {
	Emoji string `json:"emoji"`
}

// MessageResponse adds the sender's display name to the raw DB row - the
// frontend needs a name to render, and messages only store user_id.
type MessageResponse struct {
	database.Message
	AuthorName string `json:"author_name"`
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

	// Best-effort name lookup - if it fails, send the message anyway with an
	// empty author name rather than fail the whole send over a cosmetic field.
	authorName, err := h.Queries.GetUserDisplayName(r.Context(), userID)
	if err != nil {
		authorName = ""
	}
	resp := MessageResponse{Message: msg, AuthorName: authorName}

	// Broadcast only after the DB write succeeds - never the other way
	// around, or a message could appear live but fail to persist.
	payload, err := json.Marshal(resp)
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
	json.NewEncoder(w).Encode(resp)
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

	messages, err := h.Queries.ListChannelMessagesWithAuthor(r.Context(), database.ListChannelMessagesWithAuthorParams{
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

func (h *Handler) ListThreadReplies(w http.ResponseWriter, r *http.Request) {
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
	parentID, err := uuid.Parse(chi.URLParam(r, "messageID"))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid message id")
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

	parent, err := h.Queries.GetMessageByID(r.Context(), parentID)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "parent message not found")
		return
	}
	if parent.ChannelID != channelID {
		writeJSONError(w, http.StatusBadRequest, "parent message does not belong to this channel")
		return
	}

	replies, err := h.Queries.ListThreadReplies(r.Context(), uuid.NullUUID{UUID: parentID, Valid: true})
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to list thread replies")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(replies)
}

func (h *Handler) CreateThreadReply(w http.ResponseWriter, r *http.Request) {
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

	parentIDStr := chi.URLParam(r, "messageID")
	var req CreateThreadReplyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.ParentID == "" {
		req.ParentID = parentIDStr
	}
	if req.ParentID == "" || req.Content == "" {
		writeJSONError(w, http.StatusBadRequest, "parent_id and content are required")
		return
	}

	parentID, err := uuid.Parse(req.ParentID)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid parent_id")
		return
	}

	parentMsg, err := h.Queries.GetMessageByID(r.Context(), parentID)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "parent message not found")
		return
	}
	if parentMsg.ChannelID != channelID {
		writeJSONError(w, http.StatusBadRequest, "parent message does not belong to this channel")
		return
	}

	reply, err := h.Queries.CreateThreadReply(r.Context(), database.CreateThreadReplyParams{
		ChannelID: channelID,
		UserID:    uuid.NullUUID{UUID: userID, Valid: true},
		Content:   req.Content,
		ParentID:  uuid.NullUUID{UUID: parentID, Valid: true},
	})
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to create thread reply")
		return
	}

	if err := h.Queries.IncrementReplyCount(r.Context(), parentID); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to update reply count")
		return
	}

	authorName, err := h.Queries.GetUserDisplayName(r.Context(), userID)
	if err != nil {
		authorName = ""
	}
	resp := MessageResponse{Message: reply, AuthorName: authorName}

	payload, err := json.Marshal(resp)
	if err == nil {
		event, err := json.Marshal(gateway.WSEvent{
			Type:      gateway.EventThreadReplyCreated,
			ChannelID: channelID.String(),
			Payload:   payload,
		})
		if err == nil {
			h.Hub.BroadcastToChannel(channelID.String(), event)
		}
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(resp)
}

func (h *Handler) AddReaction(w http.ResponseWriter, r *http.Request) {
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
	messageID, err := uuid.Parse(chi.URLParam(r, "messageID"))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid message id")
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

	var req ReactionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Emoji == "" {
		writeJSONError(w, http.StatusBadRequest, "emoji is required")
		return
	}

	msg, err := h.Queries.GetMessageByID(r.Context(), messageID)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "message not found")
		return
	}
	if msg.ChannelID != channelID {
		writeJSONError(w, http.StatusBadRequest, "message does not belong to this channel")
		return
	}

	if err := h.Queries.UpsertMessageReaction(r.Context(), database.UpsertMessageReactionParams{
		MessageID: messageID,
		UserID:    userID,
		Emoji:     req.Emoji,
	}); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to save reaction")
		return
	}

	payload, err := json.Marshal(gateway.ReactionPayload{
		MessageID: messageID.String(),
		UserID:    userID.String(),
		Emoji:     req.Emoji,
	})
	if err == nil {
		event, err := json.Marshal(gateway.WSEvent{
			Type:      gateway.EventReactionAdded,
			ChannelID: channelID.String(),
			Payload:   payload,
		})
		if err == nil {
			h.Hub.BroadcastToChannel(channelID.String(), event)
		}
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (h *Handler) ListReactions(w http.ResponseWriter, r *http.Request) {
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
	messageID, err := uuid.Parse(chi.URLParam(r, "messageID"))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid message id")
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

	message, err := h.Queries.GetMessageByID(r.Context(), messageID)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "message not found")
		return
	}
	if message.ChannelID != channelID {
		writeJSONError(w, http.StatusBadRequest, "message does not belong to this channel")
		return
	}

	reactions, err := h.Queries.ListMessageReactions(r.Context(), messageID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to list reactions")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(reactions)
}

func (h *Handler) RemoveReaction(w http.ResponseWriter, r *http.Request) {
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
	messageID, err := uuid.Parse(chi.URLParam(r, "messageID"))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid message id")
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

	msg, err := h.Queries.GetMessageByID(r.Context(), messageID)
	if err != nil {
		writeJSONError(w, http.StatusNotFound, "message not found")
		return
	}
	if msg.ChannelID != channelID {
		writeJSONError(w, http.StatusBadRequest, "message does not belong to this channel")
		return
	}

	if err := h.Queries.RemoveMessageReaction(r.Context(), database.RemoveMessageReactionParams{
		MessageID: messageID,
		UserID:    userID,
	}); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to remove reaction")
		return
	}

	payload, err := json.Marshal(gateway.ReactionPayload{
		MessageID: messageID.String(),
		UserID:    userID.String(),
		Emoji:     "",
	})
	if err == nil {
		event, err := json.Marshal(gateway.WSEvent{
			Type:      gateway.EventReactionRemoved,
			ChannelID: channelID.String(),
			Payload:   payload,
		})
		if err == nil {
			h.Hub.BroadcastToChannel(channelID.String(), event)
		}
	}

	w.WriteHeader(http.StatusNoContent)
}

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}