package kafka

const (
	TopicMessageSent     = "events.message.sent"
	TopicMessageCreated  = TopicMessageSent
	TopicMessageEdited   = "events.message.edited"
	TopicMessageDeleted  = "events.message.deleted"
	TopicUserRegistered  = "events.user.registered"
	TopicReactionAdded   = "events.reaction.added"
	TopicReactionRemoved = "events.reaction.removed"
)