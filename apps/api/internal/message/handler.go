package message

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/mesewo/slack-clone/apps/api/internal/auth"
	"github.com/mesewo/slack-clone/apps/api/internal/database"
	"github.com/mesewo/slack-clone/apps/api/internal/events"
	"github.com/mesewo/slack-clone/apps/api/internal/kafka"
	"github.com/mesewo/slack-clone/apps/api/internal/rpc/chatpb"
)

type Handler struct {
	Queries *database.Queries
	// GatewayClient replaces the old *gateway.Hub field - Core no longer
	// calls the Hub as a plain Go function, since Gateway is now a separate
	// process. This is the whole point of Phase 3's split.
	GatewayClient chatpb.GatewayServiceClient
	// Kafka publishes a durable event log entry alongside the live
	// broadcast - two independent side effects, both best-effort relative
	// to the DB write, which is the actual source of truth.
	Kafka *kafka.Producer
}

type SendMessageRequest struct {
	Content string `json:"content"`
}

type CreateThreadReplyRequest struct {
	ParentID string `json:"parent_id"`
	Content  string `json:"content"`
}

type EditMessageRequest struct {
	Content string `json:"content"`
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

// broadcast marshals a WSEvent and sends it to Gateway over gRPC. This is
// best-effort: the DB write has already succeeded by the time this is
// called, so a broadcast failure means live clients miss the real-time
// update (they'll still see it on their next REST fetch) - not worth
// failing the whole request over. The timeout keeps a slow or down Gateway
// from hanging the response indefinitely.
func (h *Handler) broadcast(ctx context.Context, channelID uuid.UUID, eventType events.EventType, payload []byte) {
	event, err := json.Marshal(events.WSEvent{
		Type:      eventType,
		ChannelID: channelID.String(),
		Payload:   payload,
	})
	if err != nil {
		log.Printf("failed to marshal WSEvent: %v", err)
		return
	}

	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	if _, err := h.GatewayClient.Broadcast(ctx, &chatpb.BroadcastRequest{
		ChannelId: channelID.String(),
		Payload:   event,
	}); err != nil {
		log.Printf("failed to broadcast to gateway: %v", err)
	}
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

	authorName, err := h.Queries.GetUserDisplayName(r.Context(), userID)
	if err != nil {
		authorName = ""
	}
	resp := MessageResponse{Message: msg, AuthorName: authorName}

	// Broadcast only after the DB write succeeds - never the other way
	// around, or a message could appear live but fail to persist.
	if payload, err := json.Marshal(resp); err == nil {
		h.broadcast(r.Context(), channelID, events.EventMessageCreated, payload)
	}

	// Durable event log entry - separate from the live broadcast above.
	// Best-effort: the message already persisted, so a Kafka hiccup here
	// shouldn't fail the response.
	if err := h.Kafka.Publish(r.Context(), kafka.TopicMessageCreated, channelID.String(), kafka.MessageCreatedEvent{
		MessageID: msg.ID.String(),
		ChannelID: channelID.String(),
		UserID:    userID.String(),
		Content:   msg.Content,
		CreatedAt: msg.CreatedAt,
	}); err != nil {
		log.Printf("failed to publish message.created event: %v", err)
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

func (h *Handler) EditMessage(w http.ResponseWriter, r *http.Request) {
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
	if !msg.UserID.Valid || msg.UserID.UUID != userID {
		writeJSONError(w, http.StatusForbidden, "you can only edit your own messages")
		return
	}

	var req EditMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.Content) == "" {
		writeJSONError(w, http.StatusBadRequest, "content is required")
		return
	}

	updated, err := h.Queries.UpdateMessageContent(r.Context(), database.UpdateMessageContentParams{
		ID:      messageID,
		Content: req.Content,
	})
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to update message")
		return
	}

	authorName, err := h.Queries.GetUserDisplayName(r.Context(), userID)
	if err != nil {
		authorName = ""
	}
	resp := MessageResponse{Message: updated, AuthorName: authorName}

	if payload, err := json.Marshal(events.MessageEditedPayload{
		MessageID: messageID.String(),
		Content:   updated.Content,
	}); err == nil {
		h.broadcast(r.Context(), channelID, events.EventMessageEdited, payload)
	}

	if err := h.Kafka.Publish(r.Context(), kafka.TopicMessageEdited, messageID.String(), kafka.MessageEditedEvent{
		MessageID: messageID.String(),
		ChannelID: channelID.String(),
		UserID:    userID.String(),
		Content:   updated.Content,
		UpdatedAt: time.Now(),
	}); err != nil {
		log.Printf("failed to publish message.edited event: %v", err)
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
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

	if payload, err := json.Marshal(resp); err == nil {
		h.broadcast(r.Context(), channelID, events.EventThreadReplyCreated, payload)
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

	// Broadcast live update to WebSocket clients
	if payload, err := json.Marshal(events.ReactionPayload{
		MessageID: messageID.String(),
		UserID:    userID.String(),
		Emoji:     req.Emoji,
	}); err == nil {
		h.broadcast(r.Context(), channelID, events.EventReactionAdded, payload)
	}

	// Publish durable event to Kafka for other services
	if err := h.Kafka.Publish(r.Context(), kafka.TopicReactionAdded, messageID.String(), kafka.ReactionAddedEvent{
		ReactionID: uuid.New().String(),
		MessageID:  messageID.String(),
		ChannelID:  channelID.String(),
		UserID:     userID.String(),
		Emoji:      req.Emoji,
		CreatedAt:  time.Now(),
	}); err != nil {
		log.Printf("failed to publish reaction.added event: %v", err)
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

	// Broadcast live update to WebSocket clients
	if payload, err := json.Marshal(events.ReactionPayload{
		MessageID: messageID.String(),
		UserID:    userID.String(),
		Emoji:     "",
	}); err == nil {
		h.broadcast(r.Context(), channelID, events.EventReactionRemoved, payload)
	}

	// Publish durable event to Kafka for other services
	if err := h.Kafka.Publish(r.Context(), kafka.TopicReactionRemoved, messageID.String(), kafka.ReactionRemovedEvent{
		ReactionID: uuid.New().String(),
		MessageID:  messageID.String(),
		ChannelID:  channelID.String(),
		UserID:     userID.String(),
		Emoji:      "",
		RemovedAt:  time.Now(),
	}); err != nil {
		log.Printf("failed to publish reaction.removed event: %v", err)
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) DeleteMessage(w http.ResponseWriter, r *http.Request) {
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

	// Only allow deletion by the message author or an admin
	// For now, just check if the user is the author
	if !msg.UserID.Valid || msg.UserID.UUID != userID {
		writeJSONError(w, http.StatusForbidden, "you can only delete your own messages")
		return
	}

	if err := h.Queries.DeleteMessage(r.Context(), messageID); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to delete message")
		return
	}

	// Broadcast live update to WebSocket clients
	if payload, err := json.Marshal(events.MessageDeletedPayload{
		MessageID: messageID.String(),
	}); err == nil {
		h.broadcast(r.Context(), channelID, events.EventMessageDeleted, payload)
	}

	// Publish durable event to Kafka for other services
	if err := h.Kafka.Publish(r.Context(), kafka.TopicMessageDeleted, messageID.String(), kafka.MessageDeletedEvent{
		MessageID: messageID.String(),
		ChannelID: channelID.String(),
		UserID:    userID.String(),
		DeletedAt: time.Now(),
	}); err != nil {
		log.Printf("failed to publish message.deleted event: %v", err)
	}

	w.WriteHeader(http.StatusNoContent)
}

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}