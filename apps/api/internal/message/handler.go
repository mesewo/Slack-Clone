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
	searchpkg "github.com/mesewo/slack-clone/apps/api/internal/search"
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
	Kafka  *kafka.Producer
	Search *searchpkg.Client
}

type SendMessageRequest struct {
	Content       string   `json:"content"`
	AttachmentIDs []string `json:"attachment_ids,omitempty"`
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

func enqueueEvent(ctx context.Context, queries *database.Queries, topic, key string, event any) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return err
	}
	return queries.EnqueueOutbox(ctx, topic, key, payload)
}

// MessageResponse adds the sender's display name to the raw DB row - the
// frontend needs a name to render, and messages only store user_id.
type MessageResponse struct {
	database.Message
	AuthorName  string               `json:"author_name"`
	Attachments []AttachmentResponse `json:"attachments,omitempty"`
}

type AttachmentResponse struct {
	ID           uuid.UUID `json:"id"`
	Filename     string    `json:"filename"`
	ContentType  string    `json:"content_type"`
	SizeBytes    int64     `json:"size_bytes"`
	URL          string    `json:"url"`
	ThumbnailURL string    `json:"thumbnail_url,omitempty"`
}

func (h *Handler) attachmentsForMessage(ctx context.Context, messageID uuid.UUID) []AttachmentResponse {
	attachments, err := h.Queries.ListAttachmentsForMessage(ctx, uuid.NullUUID{UUID: messageID, Valid: true})
	if err != nil {
		log.Printf("failed to load attachments for message %s: %v", messageID, err)
		return nil
	}
	result := make([]AttachmentResponse, 0, len(attachments))
	for _, attachment := range attachments {
		item := AttachmentResponse{
			ID: attachment.ID, Filename: attachment.Filename,
			ContentType: attachment.ContentType, SizeBytes: attachment.SizeBytes,
			URL: "/api/uploads/" + attachment.ID.String(),
		}
		if attachment.ThumbnailPath.Valid && attachment.ThumbnailPath.String != "" {
			item.ThumbnailURL = "/api/uploads/" + attachment.ID.String() + "/thumbnail"
		}
		result = append(result, item)
	}
	return result
}

func (h *Handler) responseFromRow(ctx context.Context, row database.ListChannelMessagesWithAuthorRow) MessageResponse {
	author := ""
	if row.AuthorName.Valid {
		author = row.AuthorName.String
	}
	return MessageResponse{
		Message: database.Message{
			ID: row.ID, ChannelID: row.ChannelID, UserID: row.UserID,
			Content: row.Content, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
			DeletedAt: row.DeletedAt, ParentID: row.ParentID, ReplyCount: row.ReplyCount,
		},
		AuthorName: author, Attachments: h.attachmentsForMessage(ctx, row.ID),
	}
}

// broadcast marshals a WSEvent and sends it to Gateway over gRPC. This is
// best-effort: the DB write has already succeeded by the time this is
// called, so a broadcast failure means live clients miss the real-time
// update (they'll still see it on their next REST fetch) - not worth
// failing the whole request over. The timeout keeps a slow or down Gateway
// from hanging the response indefinitely.
func (h *Handler) broadcast(ctx context.Context, channelID uuid.UUID, eventType events.EventType, payload []byte) {
	if h.GatewayClient == nil {
		return
	}
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

	var broadcastErr error
	for attempt := 0; attempt < 3; attempt++ {
		log.Printf("broadcasting channel=%s event=%s attempt=%d", channelID, eventType, attempt+1)
		if _, broadcastErr = h.GatewayClient.Broadcast(ctx, &chatpb.BroadcastRequest{ChannelId: channelID.String(), Payload: event}); broadcastErr == nil {
			log.Printf("broadcast accepted channel=%s event=%s", channelID, eventType)
			return
		}
		if attempt < 2 {
			timer := time.NewTimer(time.Duration(attempt+1) * 100 * time.Millisecond)
			select {
			case <-ctx.Done():
				timer.Stop()
				return
			case <-timer.C:
			}
		}
	}
	log.Printf("failed to broadcast to gateway after retries: %v", broadcastErr)
}

func (h *Handler) indexMessage(ctx context.Context, message database.Message, author string) {
	if h.Search == nil {
		return
	}
	if err := h.Search.IndexMessage(ctx, searchpkg.ToDocument(message, author)); err != nil {
		log.Printf("failed to index message %s: %v", message.ID, err)
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
	if strings.TrimSpace(req.Content) == "" && len(req.AttachmentIDs) == 0 {
		writeJSONError(w, http.StatusBadRequest, "content is required")
		return
	}

	attachmentIDs := make([]uuid.UUID, 0, len(req.AttachmentIDs))
	for _, rawID := range req.AttachmentIDs {
		attachmentID, parseErr := uuid.Parse(rawID)
		if parseErr != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid attachment id")
			return
		}
		attachmentIDs = append(attachmentIDs, attachmentID)
	}

	var msg database.Message
	if err := h.Queries.InTx(r.Context(), func(txQueries *database.Queries) error {
		var err error
		msg, err = txQueries.CreateMessage(r.Context(), database.CreateMessageParams{
			ChannelID: channelID,
			UserID:    uuid.NullUUID{UUID: userID, Valid: true},
			Content:   req.Content,
		})
		if err != nil {
			return err
		}
		if len(attachmentIDs) > 0 {
			if err := txQueries.AttachFilesToMessage(r.Context(), database.AttachFilesToMessageParams{
				MessageID: uuid.NullUUID{UUID: msg.ID, Valid: true}, Column2: attachmentIDs, UserID: userID, ChannelID: channelID,
			}); err != nil {
				return err
			}
		}
		eventPayload, err := json.Marshal(kafka.MessageCreatedEvent{
			EventID: msg.ID.String(), Version: 1, Source: "core", MessageID: msg.ID.String(), ChannelID: channelID.String(),
			UserID: userID.String(), Content: msg.Content, CreatedAt: msg.CreatedAt,
		})
		if err != nil {
			return err
		}
		return txQueries.EnqueueOutbox(r.Context(), kafka.TopicMessageCreated, msg.ID.String(), eventPayload)
	}); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to persist message")
		return
	}

	authorName, err := h.Queries.GetUserDisplayName(r.Context(), userID)
	if err != nil {
		authorName = ""
	}
	resp := MessageResponse{Message: msg, AuthorName: authorName, Attachments: h.attachmentsForMessage(r.Context(), msg.ID)}
	h.indexMessage(r.Context(), msg, authorName)
	if memberIDs, memberErr := h.Queries.ListChannelMemberIDs(r.Context(), channelID); memberErr == nil {
		for _, memberID := range memberIDs {
			if memberID != userID {
				if enabled, prefErr := h.Queries.NotificationEnabled(r.Context(), memberID, "mentions"); prefErr == nil && enabled {
					_ = h.Queries.CreateNotification(r.Context(), memberID, "New message in a channel", authorName+": "+msg.Content, "open-chat", channelID)
				}
			}
		}
	}

	// Broadcast only after the DB write succeeds - never the other way
	// around, or a message could appear live but fail to persist.
	if payload, err := json.Marshal(resp); err == nil {
		h.broadcast(r.Context(), channelID, events.EventMessageCreated, payload)
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

	responses := make([]MessageResponse, 0, len(messages))
	for _, message := range messages {
		responses = append(responses, h.responseFromRow(r.Context(), message))
	}
	json.NewEncoder(w).Encode(responses)
}

func (h *Handler) SearchMessages(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(auth.UserContextKey).(*auth.Claims)
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if query == "" {
		writeJSONError(w, http.StatusBadRequest, "q is required")
		return
	}
	channelID, err := uuid.Parse(r.URL.Query().Get("channel_id"))
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "valid channel_id is required")
		return
	}
	userID, err := uuid.Parse(claims.UserID)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "invalid user in session")
		return
	}
	isMember, err := h.Queries.IsChannelMember(r.Context(), database.IsChannelMemberParams{ChannelID: channelID, UserID: userID})
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to verify channel membership")
		return
	}
	if !isMember {
		writeJSONError(w, http.StatusForbidden, "not a member of this channel")
		return
	}
	if h.Search == nil {
		writeJSONError(w, http.StatusServiceUnavailable, "search is unavailable")
		return
	}
	results, err := h.Search.SearchMessages(r.Context(), query, []string{channelID.String()}, 50)
	if err != nil {
		writeJSONError(w, http.StatusServiceUnavailable, "search is unavailable")
		return
	}
	json.NewEncoder(w).Encode(results)
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

	var updated database.Message
	if err := h.Queries.InTx(r.Context(), func(txQueries *database.Queries) error {
		var err error
		updated, err = txQueries.UpdateMessageContent(r.Context(), database.UpdateMessageContentParams{ID: messageID, Content: req.Content})
		if err != nil {
			return err
		}
		return enqueueEvent(r.Context(), txQueries, kafka.TopicMessageEdited, messageID.String(), kafka.MessageEditedEvent{
			EventID: messageID.String(), Version: 1, Source: "core", MessageID: messageID.String(), ChannelID: channelID.String(), UserID: userID.String(), Content: updated.Content, UpdatedAt: time.Now(),
		})
	}); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to update message")
		return
	}

	authorName, err := h.Queries.GetUserDisplayName(r.Context(), userID)
	if err != nil {
		authorName = ""
	}
	resp := MessageResponse{Message: updated, AuthorName: authorName, Attachments: h.attachmentsForMessage(r.Context(), updated.ID)}
	h.indexMessage(r.Context(), updated, authorName)

	if payload, err := json.Marshal(events.MessageEditedPayload{
		MessageID: messageID.String(),
		Content:   updated.Content,
	}); err == nil {
		h.broadcast(r.Context(), channelID, events.EventMessageEdited, payload)
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

	var reply database.Message
	if err := h.Queries.InTx(r.Context(), func(txQueries *database.Queries) error {
		var err error
		reply, err = txQueries.CreateThreadReply(r.Context(), database.CreateThreadReplyParams{ChannelID: channelID, UserID: uuid.NullUUID{UUID: userID, Valid: true}, Content: req.Content, ParentID: uuid.NullUUID{UUID: parentID, Valid: true}})
		if err != nil {
			return err
		}
		if err := txQueries.IncrementReplyCount(r.Context(), parentID); err != nil {
			return err
		}
		return enqueueEvent(r.Context(), txQueries, kafka.TopicMessageSent, reply.ID.String(), kafka.MessageCreatedEvent{EventID: reply.ID.String(), Version: 1, Source: "core", MessageID: reply.ID.String(), ChannelID: channelID.String(), UserID: userID.String(), Content: reply.Content, CreatedAt: reply.CreatedAt})
	}); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to create thread reply")
		return
	}

	authorName, err := h.Queries.GetUserDisplayName(r.Context(), userID)
	if err != nil {
		authorName = ""
	}
	resp := MessageResponse{Message: reply, AuthorName: authorName}
	if subscriberIDs, subscriberErr := h.Queries.ListThreadSubscriberIDs(r.Context(), parentID); subscriberErr == nil {
		for _, subscriberID := range subscriberIDs {
			if subscriberID == userID {
				continue
			}
			if enabled, prefErr := h.Queries.NotificationEnabled(r.Context(), subscriberID, "thread_replies"); prefErr == nil && enabled {
				_ = h.Queries.CreateNotification(r.Context(), subscriberID, "New thread reply", authorName+": "+reply.Content, "open-chat", channelID)
			}
		}
	}

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

	reactionID := uuid.New()
	if err := h.Queries.InTx(r.Context(), func(txQueries *database.Queries) error {
		if err := txQueries.UpsertMessageReaction(r.Context(), database.UpsertMessageReactionParams{MessageID: messageID, UserID: userID, Emoji: req.Emoji}); err != nil {
			return err
		}
		return enqueueEvent(r.Context(), txQueries, kafka.TopicReactionAdded, reactionID.String(), kafka.ReactionAddedEvent{EventID: reactionID.String(), Version: 1, Source: "core", ReactionID: reactionID.String(), MessageID: messageID.String(), ChannelID: channelID.String(), UserID: userID.String(), Emoji: req.Emoji, CreatedAt: time.Now()})
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

	reactionID := uuid.New()
	if err := h.Queries.InTx(r.Context(), func(txQueries *database.Queries) error {
		if err := txQueries.RemoveMessageReaction(r.Context(), database.RemoveMessageReactionParams{MessageID: messageID, UserID: userID}); err != nil {
			return err
		}
		return enqueueEvent(r.Context(), txQueries, kafka.TopicReactionRemoved, reactionID.String(), kafka.ReactionRemovedEvent{EventID: reactionID.String(), Version: 1, Source: "core", ReactionID: reactionID.String(), MessageID: messageID.String(), ChannelID: channelID.String(), UserID: userID.String(), RemovedAt: time.Now()})
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

	if err := h.Queries.InTx(r.Context(), func(txQueries *database.Queries) error {
		if err := txQueries.DeleteMessage(r.Context(), messageID); err != nil {
			return err
		}
		return enqueueEvent(r.Context(), txQueries, kafka.TopicMessageDeleted, messageID.String(), kafka.MessageDeletedEvent{EventID: messageID.String(), Version: 1, Source: "core", MessageID: messageID.String(), ChannelID: channelID.String(), UserID: userID.String(), DeletedAt: time.Now()})
	}); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "failed to delete message")
		return
	}
	if h.Search != nil {
		if err := h.Search.DeleteMessage(r.Context(), messageID.String()); err != nil {
			log.Printf("failed to remove message %s from search index: %v", messageID, err)
		}
	}

	// Broadcast live update to WebSocket clients
	if payload, err := json.Marshal(events.MessageDeletedPayload{
		MessageID: messageID.String(),
	}); err == nil {
		h.broadcast(r.Context(), channelID, events.EventMessageDeleted, payload)
	}

	w.WriteHeader(http.StatusNoContent)
}

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
