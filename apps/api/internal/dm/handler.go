package dm

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/mesewo/slack-clone/apps/api/internal/auth"
	"github.com/mesewo/slack-clone/apps/api/internal/database"
	"github.com/mesewo/slack-clone/apps/api/internal/events"
	"github.com/mesewo/slack-clone/apps/api/internal/rpc/chatpb"
)

type Handler struct {
	Queries       *database.Queries
	GatewayClient chatpb.GatewayServiceClient
}

type CreateRequest struct {
	UserID string `json:"user_id"`
}
type ConversationResponse struct {
	ID                  uuid.UUID `json:"id"`
	OtherUserID         uuid.UUID `json:"other_user_id"`
	OtherDisplayName    string    `json:"other_display_name"`
	OtherEmail          string    `json:"other_email"`
	OtherPresenceStatus string    `json:"other_presence_status"`
}
type MessageResponse struct {
	ID             uuid.UUID            `json:"id"`
	ConversationID uuid.UUID            `json:"conversation_id"`
	UserID         uuid.NullUUID        `json:"user_id"`
	Content        string               `json:"content"`
	CreatedAt      string               `json:"created_at"`
	AuthorName     string               `json:"author_name"`
	ParentID       uuid.NullUUID        `json:"parent_id"`
	ReplyCount     int32                `json:"reply_count"`
	Attachments    []AttachmentResponse `json:"attachments,omitempty"`
}

type AttachmentResponse struct {
	ID           uuid.UUID `json:"id"`
	Filename     string    `json:"filename"`
	ContentType  string    `json:"content_type"`
	SizeBytes    int64     `json:"size_bytes"`
	URL          string    `json:"url"`
	ThumbnailURL string    `json:"thumbnail_url,omitempty"`
}

type ReactionResponse struct {
	MessageID uuid.UUID `json:"message_id"`
	UserID    uuid.UUID `json:"user_id"`
	Emoji     string    `json:"emoji"`
}

func directAttachments(ctx context.Context, queries *database.Queries, messageID uuid.UUID) []AttachmentResponse {
	items, err := queries.ListAttachmentsForDirectMessage(ctx, messageID)
	if err != nil {
		return nil
	}
	result := make([]AttachmentResponse, 0, len(items))
	for _, item := range items {
		attachment := AttachmentResponse{ID: item.ID, Filename: item.Filename, ContentType: item.ContentType, SizeBytes: item.SizeBytes, URL: "/api/uploads/" + item.ID.String()}
		if item.ThumbnailPath.Valid && item.ThumbnailPath.String != "" {
			attachment.ThumbnailURL = "/api/uploads/" + item.ID.String() + "/thumbnail"
		}
		result = append(result, attachment)
	}
	return result
}

func currentUser(r *http.Request) (uuid.UUID, bool) {
	claims, ok := r.Context().Value(auth.UserContextKey).(*auth.Claims)
	if !ok {
		return uuid.Nil, false
	}
	id, err := uuid.Parse(claims.UserID)
	return id, err == nil
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := currentUser(r)
	if !ok {
		writeError(w, 401, "not authenticated")
		return
	}
	items, err := h.Queries.ListDirectConversationsForUser(r.Context(), userID)
	if err != nil {
		writeError(w, 500, "failed to list direct messages")
		return
	}
	result := make([]ConversationResponse, 0, len(items))
	for _, item := range items {
		result = append(result, ConversationResponse{ID: item.ID, OtherUserID: item.OtherUserID, OtherDisplayName: item.OtherDisplayName, OtherEmail: item.OtherEmail, OtherPresenceStatus: item.OtherPresenceStatus})
	}
	writeJSON(w, result)
}

func (h *Handler) Users(w http.ResponseWriter, r *http.Request) {
	userID, ok := currentUser(r)
	if !ok {
		writeError(w, 401, "not authenticated")
		return
	}
	users, err := h.Queries.ListUsersForDM(r.Context(), userID)
	if err != nil {
		writeError(w, 500, "failed to list users")
		return
	}
	writeJSON(w, users)
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := currentUser(r)
	if !ok {
		writeError(w, 401, "not authenticated")
		return
	}
	var req CreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, 400, "invalid request body")
		return
	}
	otherID, err := uuid.Parse(req.UserID)
	if err != nil || otherID == userID {
		writeError(w, 400, "valid other user is required")
		return
	}
	if _, err := h.Queries.GetUserByID(r.Context(), otherID); err != nil {
		writeError(w, 404, "user not found")
		return
	}
	conversation, err := h.Queries.FindDirectConversation(r.Context(), database.FindDirectConversationParams{UserID: userID, UserID_2: otherID})
	if errors.Is(err, pgx.ErrNoRows) {
		conversation, err = h.Queries.CreateDirectConversation(r.Context(), userID)
		if err == nil {
			err = h.Queries.AddDirectConversationMember(r.Context(), database.AddDirectConversationMemberParams{ConversationID: conversation.ID, UserID: userID})
		}
		if err == nil {
			err = h.Queries.AddDirectConversationMember(r.Context(), database.AddDirectConversationMemberParams{ConversationID: conversation.ID, UserID: otherID})
		}
	}
	if err != nil {
		writeError(w, 500, "failed to create direct conversation")
		return
	}
	writeJSON(w, map[string]string{"id": conversation.ID.String()})
}

func (h *Handler) ListMessages(w http.ResponseWriter, r *http.Request) {
	userID, ok := currentUser(r)
	if !ok {
		writeError(w, 401, "not authenticated")
		return
	}
	conversationID, err := uuid.Parse(chi.URLParam(r, "conversationID"))
	if err != nil {
		writeError(w, 400, "invalid conversation id")
		return
	}
	member, err := h.Queries.IsDirectConversationMember(r.Context(), database.IsDirectConversationMemberParams{ConversationID: conversationID, UserID: userID})
	if err != nil || !member {
		writeError(w, 403, "not a member of this conversation")
		return
	}
	items, err := h.Queries.ListDirectMessages(r.Context(), conversationID)
	if err != nil {
		writeError(w, 500, "failed to list direct messages")
		return
	}
	result := make([]MessageResponse, 0, len(items))
	for _, item := range items {
		author := ""
		if item.AuthorName.Valid {
			author = item.AuthorName.String
		}
		result = append(result, MessageResponse{ID: item.ID, ConversationID: item.ConversationID, UserID: item.UserID, Content: item.Content, CreatedAt: item.CreatedAt.Format("2006-01-02T15:04:05.000Z07:00"), AuthorName: author, Attachments: directAttachments(r.Context(), h.Queries, item.ID)})
	}
	writeJSON(w, result)
}

func (h *Handler) SendMessage(w http.ResponseWriter, r *http.Request) {
	userID, ok := currentUser(r)
	if !ok {
		writeError(w, 401, "not authenticated")
		return
	}
	conversationID, err := uuid.Parse(chi.URLParam(r, "conversationID"))
	if err != nil {
		writeError(w, 400, "invalid conversation id")
		return
	}
	member, err := h.Queries.IsDirectConversationMember(r.Context(), database.IsDirectConversationMemberParams{ConversationID: conversationID, UserID: userID})
	if err != nil || !member {
		writeError(w, 403, "not a member of this conversation")
		return
	}
	var req struct {
		Content       string   `json:"content"`
		AttachmentIDs []string `json:"attachment_ids,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || (strings.TrimSpace(req.Content) == "" && len(req.AttachmentIDs) == 0) {
		writeError(w, 400, "content is required")
		return
	}
	message, err := h.Queries.CreateDirectMessage(r.Context(), database.CreateDirectMessageParams{ConversationID: conversationID, UserID: uuid.NullUUID{UUID: userID, Valid: true}, Content: req.Content})
	if err != nil {
		writeError(w, 500, "failed to send direct message")
		return
	}
	attachmentIDs := make([]uuid.UUID, 0, len(req.AttachmentIDs))
	for _, rawID := range req.AttachmentIDs {
		id, parseErr := uuid.Parse(rawID)
		if parseErr != nil {
			writeError(w, 400, "invalid attachment id")
			return
		}
		attachmentIDs = append(attachmentIDs, id)
	}
	if len(attachmentIDs) > 0 {
		if err := h.Queries.AttachFilesToDirectMessage(r.Context(), message.ID, attachmentIDs, userID); err != nil {
			writeError(w, 500, "failed to attach files")
			return
		}
	}
	author, _ := h.Queries.GetUserDisplayName(r.Context(), userID)
	response := MessageResponse{ID: message.ID, ConversationID: message.ConversationID, UserID: message.UserID, Content: message.Content, CreatedAt: message.CreatedAt.Format("2006-01-02T15:04:05.000Z07:00"), AuthorName: author, Attachments: directAttachments(r.Context(), h.Queries, message.ID)}
	if memberIDs, memberErr := h.Queries.ListDirectConversationMemberIDs(r.Context(), conversationID); memberErr == nil {
		for _, memberID := range memberIDs {
			if memberID != userID {
				if enabled, prefErr := h.Queries.NotificationEnabled(r.Context(), memberID, "direct_messages"); prefErr == nil && enabled {
					_ = h.Queries.CreateNotification(r.Context(), memberID, "New direct message", author+": "+message.Content, "open-chat", conversationID)
				}
			}
		}
	}
	if h.GatewayClient != nil {
		payload, _ := json.Marshal(response)
		event, _ := json.Marshal(events.WSEvent{Type: events.EventMessageCreated, ChannelID: "dm:" + conversationID.String(), Payload: payload})
		_, _ = h.GatewayClient.Broadcast(r.Context(), &chatpb.BroadcastRequest{ChannelId: "dm:" + conversationID.String(), Payload: event})
	}
	writeJSON(w, response)
}

func (h *Handler) ThreadReplies(w http.ResponseWriter, r *http.Request) {
	userID, ok := currentUser(r)
	if !ok {
		writeError(w, 401, "not authenticated")
		return
	}
	conversationID, err := uuid.Parse(chi.URLParam(r, "conversationID"))
	if err != nil {
		writeError(w, 400, "invalid conversation id")
		return
	}
	parentID, err := uuid.Parse(chi.URLParam(r, "messageID"))
	if err != nil {
		writeError(w, 400, "invalid message id")
		return
	}
	member, err := h.Queries.IsDirectConversationMember(r.Context(), database.IsDirectConversationMemberParams{ConversationID: conversationID, UserID: userID})
	if err != nil || !member {
		writeError(w, 403, "not a member of this conversation")
		return
	}
	items, err := h.Queries.ListDirectMessages(r.Context(), conversationID)
	if err != nil {
		writeError(w, 500, "failed to list replies")
		return
	}
	result := make([]MessageResponse, 0)
	for _, item := range items {
		if item.ParentID.Valid && item.ParentID.UUID == parentID {
			author := ""
			if item.AuthorName.Valid {
				author = item.AuthorName.String
			}
			result = append(result, MessageResponse{ID: item.ID, ConversationID: item.ConversationID, UserID: item.UserID, Content: item.Content, CreatedAt: item.CreatedAt.Format(time.RFC3339), AuthorName: author, Attachments: directAttachments(r.Context(), h.Queries, item.ID)})
		}
	}
	writeJSON(w, result)
}

func (h *Handler) CreateThreadReply(w http.ResponseWriter, r *http.Request) {
	userID, ok := currentUser(r)
	if !ok {
		writeError(w, 401, "not authenticated")
		return
	}
	conversationID, err := uuid.Parse(chi.URLParam(r, "conversationID"))
	if err != nil {
		writeError(w, 400, "invalid conversation id")
		return
	}
	parentID, err := uuid.Parse(chi.URLParam(r, "messageID"))
	if err != nil {
		writeError(w, 400, "invalid message id")
		return
	}
	member, err := h.Queries.IsDirectConversationMember(r.Context(), database.IsDirectConversationMemberParams{ConversationID: conversationID, UserID: userID})
	if err != nil || !member {
		writeError(w, 403, "not a member of this conversation")
		return
	}
	var req struct {
		Content string `json:"content"`
	}
	if json.NewDecoder(r.Body).Decode(&req) != nil || strings.TrimSpace(req.Content) == "" {
		writeError(w, 400, "content is required")
		return
	}
	reply, err := h.Queries.CreateDirectThreadReply(r.Context(), conversationID, userID, parentID, strings.TrimSpace(req.Content))
	if err != nil {
		writeError(w, 500, "failed to create thread reply")
		return
	}
	author, _ := h.Queries.GetUserDisplayName(r.Context(), userID)
	response := MessageResponse{ID: reply.ID, ConversationID: reply.ConversationID, UserID: reply.UserID, Content: reply.Content, CreatedAt: reply.CreatedAt.Format(time.RFC3339), AuthorName: author}
	if h.GatewayClient != nil {
		payload, _ := json.Marshal(response)
		event, _ := json.Marshal(events.WSEvent{Type: events.EventThreadReplyCreated, ChannelID: "dm:" + conversationID.String(), Payload: payload})
		_, _ = h.GatewayClient.Broadcast(r.Context(), &chatpb.BroadcastRequest{ChannelId: "dm:" + conversationID.String(), Payload: event})
	}
	writeJSON(w, response)
}

func (h *Handler) ListReactions(w http.ResponseWriter, r *http.Request) {
	userID, ok := currentUser(r)
	if !ok {
		writeError(w, 401, "not authenticated")
		return
	}
	conversationID, err := uuid.Parse(chi.URLParam(r, "conversationID"))
	if err != nil {
		writeError(w, 400, "invalid conversation id")
		return
	}
	messageID, err := uuid.Parse(chi.URLParam(r, "messageID"))
	if err != nil {
		writeError(w, 400, "invalid message id")
		return
	}
	member, err := h.Queries.IsDirectConversationMember(r.Context(), database.IsDirectConversationMemberParams{ConversationID: conversationID, UserID: userID})
	if err != nil || !member {
		writeError(w, 403, "not a member of this conversation")
		return
	}
	items, err := h.Queries.ListDirectMessageReactions(r.Context(), messageID)
	if err != nil {
		writeError(w, 500, "failed to list reactions")
		return
	}
	writeJSON(w, items)
}

func (h *Handler) AddReaction(w http.ResponseWriter, r *http.Request) {
	userID, ok := currentUser(r)
	if !ok {
		writeError(w, 401, "not authenticated")
		return
	}
	conversationID, err := uuid.Parse(chi.URLParam(r, "conversationID"))
	if err != nil {
		writeError(w, 400, "invalid conversation id")
		return
	}
	messageID, err := uuid.Parse(chi.URLParam(r, "messageID"))
	if err != nil {
		writeError(w, 400, "invalid message id")
		return
	}
	member, err := h.Queries.IsDirectConversationMember(r.Context(), database.IsDirectConversationMemberParams{ConversationID: conversationID, UserID: userID})
	if err != nil || !member {
		writeError(w, 403, "not a member of this conversation")
		return
	}
	var req struct {
		Emoji string `json:"emoji"`
	}
	if json.NewDecoder(r.Body).Decode(&req) != nil || req.Emoji == "" {
		writeError(w, 400, "emoji is required")
		return
	}
	if err := h.Queries.UpsertDirectMessageReaction(r.Context(), messageID, userID, req.Emoji); err != nil {
		writeError(w, 500, "failed to save reaction")
		return
	}
	if h.GatewayClient != nil {
		payload, _ := json.Marshal(events.ReactionPayload{MessageID: messageID.String(), UserID: userID.String(), Emoji: req.Emoji})
		event, _ := json.Marshal(events.WSEvent{Type: events.EventReactionAdded, ChannelID: "dm:" + conversationID.String(), Payload: payload})
		_, _ = h.GatewayClient.Broadcast(r.Context(), &chatpb.BroadcastRequest{ChannelId: "dm:" + conversationID.String(), Payload: event})
	}
	w.WriteHeader(http.StatusCreated)
}

func (h *Handler) RemoveReaction(w http.ResponseWriter, r *http.Request) {
	userID, ok := currentUser(r)
	if !ok {
		writeError(w, 401, "not authenticated")
		return
	}
	conversationID, err := uuid.Parse(chi.URLParam(r, "conversationID"))
	if err != nil {
		writeError(w, 400, "invalid conversation id")
		return
	}
	messageID, err := uuid.Parse(chi.URLParam(r, "messageID"))
	if err != nil {
		writeError(w, 400, "invalid message id")
		return
	}
	member, err := h.Queries.IsDirectConversationMember(r.Context(), database.IsDirectConversationMemberParams{ConversationID: conversationID, UserID: userID})
	if err != nil || !member {
		writeError(w, 403, "not a member of this conversation")
		return
	}
	if err := h.Queries.RemoveDirectMessageReaction(r.Context(), messageID, userID); err != nil {
		writeError(w, 500, "failed to remove reaction")
		return
	}
	if h.GatewayClient != nil {
		payload, _ := json.Marshal(events.ReactionPayload{MessageID: messageID.String(), UserID: userID.String()})
		event, _ := json.Marshal(events.WSEvent{Type: events.EventReactionRemoved, ChannelID: "dm:" + conversationID.String(), Payload: payload})
		_, _ = h.GatewayClient.Broadcast(r.Context(), &chatpb.BroadcastRequest{ChannelId: "dm:" + conversationID.String(), Payload: event})
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) Search(w http.ResponseWriter, r *http.Request) {
	userID, ok := currentUser(r)
	if !ok {
		writeError(w, 401, "not authenticated")
		return
	}
	conversationID, err := uuid.Parse(chi.URLParam(r, "conversationID"))
	if err != nil {
		writeError(w, 400, "invalid conversation id")
		return
	}
	member, err := h.Queries.IsDirectConversationMember(r.Context(), database.IsDirectConversationMemberParams{ConversationID: conversationID, UserID: userID})
	if err != nil || !member {
		writeError(w, 403, "not a member of this conversation")
		return
	}
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if query == "" {
		writeError(w, 400, "q is required")
		return
	}
	items, err := h.Queries.SearchDirectMessages(r.Context(), conversationID, query)
	if err != nil {
		writeError(w, 500, "failed to search direct messages")
		return
	}
	result := make([]map[string]any, 0, len(items))
	for _, item := range items {
		author := ""
		if item.UserID.Valid {
			author, _ = h.Queries.GetUserDisplayName(r.Context(), item.UserID.UUID)
		}
		result = append(result, map[string]any{"id": item.ID, "channel_id": "dm:" + conversationID.String(), "content": item.Content, "created_at": item.CreatedAt, "author": author})
	}
	writeJSON(w, result)
}

func (h *Handler) MarkRead(w http.ResponseWriter, r *http.Request) {
	userID, ok := currentUser(r)
	if !ok {
		writeError(w, 401, "not authenticated")
		return
	}
	conversationID, err := uuid.Parse(chi.URLParam(r, "conversationID"))
	if err != nil {
		writeError(w, 400, "invalid conversation id")
		return
	}
	member, err := h.Queries.IsDirectConversationMember(r.Context(), database.IsDirectConversationMemberParams{ConversationID: conversationID, UserID: userID})
	if err != nil || !member {
		writeError(w, 403, "not a member of this conversation")
		return
	}
	if err := h.Queries.UpdateDirectConversationLastRead(r.Context(), conversationID, userID); err != nil {
		writeError(w, 500, "failed to mark conversation read")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) Unread(w http.ResponseWriter, r *http.Request) {
	userID, ok := currentUser(r)
	if !ok {
		writeError(w, 401, "not authenticated")
		return
	}
	conversationID, err := uuid.Parse(chi.URLParam(r, "conversationID"))
	if err != nil {
		writeError(w, 400, "invalid conversation id")
		return
	}
	count, err := h.Queries.CountUnreadDirectMessages(r.Context(), conversationID, userID)
	if err != nil {
		writeError(w, 500, "failed to load unread count")
		return
	}
	writeJSON(w, map[string]int64{"unread": count})
}

func writeJSON(w http.ResponseWriter, value any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(value)
}
func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}
