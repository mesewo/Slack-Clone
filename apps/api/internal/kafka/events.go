package kafka

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"
)

// EventDedupKey returns the event-specific idempotency key.
//
// For current events, event_id is the canonical deduplication identity.
// Legacy payloads may not have event_id; in those cases we fall back to a
// deterministic hash of the topic + raw payload so redelivery of the same legacy
// event still maps to the same key without inventing a random identity.
func EventDedupKey(topic string, raw []byte) (string, error) {
	var base map[string]any
	if err := json.Unmarshal(raw, &base); err != nil {
		return "", err
	}
	if eventID, ok := base["event_id"].(string); ok && eventID != "" {
		return eventID, nil
	}

	legacySeed := fmt.Sprintf("%s:%s", topic, string(raw))
	sum := sha256.Sum256([]byte(legacySeed))
	return hex.EncodeToString(sum[:]), nil
}

type MessageCreatedEvent struct {
	EventID   string    `json:"event_id"`
	Version   int       `json:"version"`
	Source    string    `json:"source"`
	MessageID string    `json:"message_id"`
	ChannelID string    `json:"channel_id"`
	UserID    string    `json:"user_id"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
}

type MessageEditedEvent struct {
	EventID   string    `json:"event_id"`
	Version   int       `json:"version"`
	Source    string    `json:"source"`
	MessageID string    `json:"message_id"`
	ChannelID string    `json:"channel_id"`
	UserID    string    `json:"user_id"`
	Content   string    `json:"content"`
	UpdatedAt time.Time `json:"updated_at"`
}

type MessageDeletedEvent struct {
	EventID   string    `json:"event_id"`
	Version   int       `json:"version"`
	Source    string    `json:"source"`
	MessageID string    `json:"message_id"`
	ChannelID string    `json:"channel_id"`
	UserID    string    `json:"user_id"`
	DeletedAt time.Time `json:"deleted_at"`
}

type UserRegisteredEvent struct {
	EventID      string    `json:"event_id"`
	Version      int       `json:"version"`
	Source       string    `json:"source"`
	UserID       string    `json:"user_id"`
	Email        string    `json:"email"`
	DisplayName  string    `json:"display_name"`
	RegisteredAt time.Time `json:"registered_at"`
}

type ReactionAddedEvent struct {
	EventID    string    `json:"event_id"`
	Version    int       `json:"version"`
	Source     string    `json:"source"`
	ReactionID string    `json:"reaction_id"`
	MessageID  string    `json:"message_id"`
	ChannelID  string    `json:"channel_id"`
	UserID     string    `json:"user_id"`
	Emoji      string    `json:"emoji"`
	CreatedAt  time.Time `json:"created_at"`
}

type ReactionRemovedEvent struct {
	EventID    string    `json:"event_id"`
	Version    int       `json:"version"`
	Source     string    `json:"source"`
	ReactionID string    `json:"reaction_id"`
	MessageID  string    `json:"message_id"`
	ChannelID  string    `json:"channel_id"`
	UserID     string    `json:"user_id"`
	Emoji      string    `json:"emoji"`
	RemovedAt  time.Time `json:"removed_at"`
}
