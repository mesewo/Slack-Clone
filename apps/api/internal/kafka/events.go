package kafka

import "time"

type MessageCreatedEvent struct {
	MessageID string    `json:"message_id"`
	ChannelID string    `json:"channel_id"`
	UserID    string    `json:"user_id"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
}

type MessageEditedEvent struct {
	MessageID string    `json:"message_id"`
	ChannelID string    `json:"channel_id"`
	UserID    string    `json:"user_id"`
	Content   string    `json:"content"`
	UpdatedAt time.Time `json:"updated_at"`
}

type MessageDeletedEvent struct {
	MessageID string    `json:"message_id"`
	ChannelID string    `json:"channel_id"`
	UserID    string    `json:"user_id"`
	DeletedAt time.Time `json:"deleted_at"`
}

type UserRegisteredEvent struct {
	UserID       string    `json:"user_id"`
	Email        string    `json:"email"`
	DisplayName  string    `json:"display_name"`
	RegisteredAt time.Time `json:"registered_at"`
}

type ReactionAddedEvent struct {
	ReactionID string `json:"reaction_id"`
	MessageID  string `json:"message_id"`
	ChannelID  string `json:"channel_id"`
	UserID     string `json:"user_id"`
	Emoji      string `json:"emoji"`
	CreatedAt  time.Time `json:"created_at"`
}

type ReactionRemovedEvent struct {
	ReactionID string `json:"reaction_id"`
	MessageID  string `json:"message_id"`
	ChannelID  string `json:"channel_id"`
	UserID     string `json:"user_id"`
	Emoji      string `json:"emoji"`
	RemovedAt  time.Time `json:"removed_at"`
}