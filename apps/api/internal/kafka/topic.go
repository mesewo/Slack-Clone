package kafka

const (
	TopicMessageCreated = "events.message.created"
	TopicUserRegistered = "events.user.registered"
	// TopicMessageDeleted is deliberately not here yet - there's no
	// delete-message handler to produce it. Add it when that exists.
)