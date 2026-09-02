// Package events defines the WebSocket event envelope and payload shapes
// shared between Core and Gateway. It has zero dependency on the Hub,
// WebSocket handling, or the database - Core imports this package directly
// to build event payloads without pulling in Gateway's WebSocket machinery.
package events

import "encoding/json"

type EventType string

const (
	EventMessageCreated     EventType = "message_created"
	EventMessageEdited      EventType = "message_edited"
	EventMessageDeleted     EventType = "message_deleted"
	EventThreadReplyCreated EventType = "thread_reply_created"
	EventReactionAdded      EventType = "reaction_added"
	EventReactionRemoved    EventType = "reaction_removed"
	EventTyping             EventType = "typing"
	EventPresence           EventType = "presence"
)

// WSEvent is the envelope every message sent over a WebSocket connection
// uses, in both directions. One consistent shape means the frontend has one
// parsing path instead of a special case per event type.
type WSEvent struct {
	Type      EventType       `json:"type"`
	ChannelID string          `json:"channel_id,omitempty"`
	Payload   json.RawMessage `json:"payload"`
}

type TypingPayload struct {
	ChannelID string `json:"channel_id"`
	UserID    string `json:"user_id,omitempty"` // server fills this in, client doesn't send it
}

type PresencePayload struct {
	UserID string `json:"user_id"`
	Status string `json:"status"`
}

type MessageEditedPayload struct {
	MessageID string `json:"message_id"`
	Content   string `json:"content"`
}

type MessageDeletedPayload struct {
	MessageID string `json:"message_id"`
}

type ReactionPayload struct {
	MessageID string `json:"message_id"`
	UserID    string `json:"user_id"`
	Emoji     string `json:"emoji"`
}