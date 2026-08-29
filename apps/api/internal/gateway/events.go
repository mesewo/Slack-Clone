package gateway

import "github.com/mesewo/slack-clone/apps/api/internal/events"

// Re-exported as type aliases from internal/events, so every existing
// reference in this package (hub.go, handler.go, presence.go) keeps
// compiling unchanged. Core imports internal/events directly instead of
// this package, so it never pulls in the Hub/WebSocket code that lives
// alongside these aliases here.
type EventType = events.EventType

const (
	EventMessageCreated     = events.EventMessageCreated
	EventMessageDeleted     = events.EventMessageDeleted
	EventThreadReplyCreated = events.EventThreadReplyCreated
	EventReactionAdded      = events.EventReactionAdded
	EventReactionRemoved    = events.EventReactionRemoved
	EventTyping             = events.EventTyping
	EventPresence           = events.EventPresence
)

type WSEvent = events.WSEvent
type TypingPayload = events.TypingPayload
type PresencePayload = events.PresencePayload
type MessageDeletedPayload = events.MessageDeletedPayload
type ReactionPayload = events.ReactionPayload