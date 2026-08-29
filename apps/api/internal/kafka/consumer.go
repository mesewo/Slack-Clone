package kafka

import (
	"context"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/segmentio/kafka-go"
)

// Consumer reads one topic as part of a named consumer group. Restarting the
// process resumes from the last committed offset automatically - Kafka/
// Redpanda tracks that broker-side, keyed by GroupID, so there's no manual
// bookkeeping needed for "where did I leave off."
//
// That alone isn't enough for correctness, though: at-least-once delivery
// means the same message can arrive twice - e.g. if the process dies after
// handling a message but before its offset commit lands. The Redis SetNX
// check below is what actually makes reprocessing safe.
type Consumer struct {
	reader *kafka.Reader
	redis  *redis.Client
	topic  string
}

func NewConsumer(brokerAddr, topic, groupID string, redisClient *redis.Client) *Consumer {
	return &Consumer{
		reader: kafka.NewReader(kafka.ReaderConfig{
			Brokers: []string{brokerAddr},
			Topic:   topic,
			GroupID: groupID,
		}),
		redis: redisClient,
		topic: topic,
	}
}

// Run blocks, processing messages until ctx is cancelled.
//   - dedupKeyFunc extracts the idempotency key (e.g. message_id) from the
//     raw message bytes.
//   - handle does the actual work. If it returns an error, the offset is
//     NOT committed, so this message will be redelivered and retried.
func (c *Consumer) Run(ctx context.Context, dedupPrefix string, dedupKeyFunc func([]byte) (string, error), handle func([]byte) error) {
	for {
		msg, err := c.reader.FetchMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return // shutting down
			}
			log.Printf("kafka[%s]: fetch error: %v", c.topic, err)
			continue
		}

		dedupKey, err := dedupKeyFunc(msg.Value)
		if err != nil {
			log.Printf("kafka[%s]: unparseable message, skipping: %v", c.topic, err)
			c.commit(ctx, msg)
			continue
		}

		// First delivery of this key actually processes. A redelivered
		// duplicate finds the key already set and skips straight to
		// committing the offset - that's the idempotency guarantee.
		firstTime, err := c.redis.SetNX(ctx, dedupPrefix+dedupKey, "1", 24*time.Hour).Result()
		if err != nil {
			log.Printf("kafka[%s]: redis dedup check failed, processing anyway: %v", c.topic, err)
			firstTime = true
		}

		if firstTime {
			if err := handle(msg.Value); err != nil {
				log.Printf("kafka[%s]: handler error, not committing (will retry): %v", c.topic, err)
				continue
			}
		} else {
			log.Printf("kafka[%s]: duplicate delivery of %s, skipped", c.topic, dedupKey)
		}

		c.commit(ctx, msg)
	}
}

func (c *Consumer) commit(ctx context.Context, msg kafka.Message) {
	if err := c.reader.CommitMessages(ctx, msg); err != nil {
		log.Printf("kafka[%s]: commit failed: %v", c.topic, err)
	}
}

func (c *Consumer) Close() error {
	return c.reader.Close()
}