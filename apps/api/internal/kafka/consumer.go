package kafka

import (
	"context"
	"log"
	"time"

	"github.com/google/uuid"
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
	reader consumerReader
	store  dedupStore
	topic  string
}

type consumerReader interface {
	FetchMessage(context.Context) (kafka.Message, error)
	CommitMessages(context.Context, ...kafka.Message) error
	Close() error
}

type dedupStore interface {
	Exists(context.Context, string) (bool, error)
	Claim(context.Context, string, string, time.Duration) (bool, error)
	Complete(context.Context, string, string, time.Duration) error
	Release(context.Context, string, string) error
}

type redisDedupStore struct{ client *redis.Client }

func (s redisDedupStore) Exists(ctx context.Context, key string) (bool, error) {
	count, err := s.client.Exists(ctx, key).Result()
	return count > 0, err
}

func (s redisDedupStore) Claim(ctx context.Context, key, token string, ttl time.Duration) (bool, error) {
	return s.client.SetNX(ctx, key, token, ttl).Result()
}

func (s redisDedupStore) Complete(ctx context.Context, key, value string, ttl time.Duration) error {
	return s.client.Set(ctx, key, value, ttl).Err()
}

func (s redisDedupStore) Release(ctx context.Context, key, token string) error {
	const script = `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) end return 0`
	return s.client.Eval(ctx, script, []string{key}, token).Err()
}

const (
	processingLeaseTTL = 30 * time.Second
	processedEventTTL  = 24 * time.Hour
)

func NewConsumer(brokerAddr, topic, groupID string, redisClient *redis.Client) *Consumer {
	return &Consumer{
		reader: kafka.NewReader(kafka.ReaderConfig{
			Brokers: []string{brokerAddr},
			Topic:   topic,
			GroupID: groupID,
		}),
		store: redisDedupStore{client: redisClient},
		topic: topic,
	}
}

// Run blocks, processing messages until ctx is cancelled.
//   - dedupKeyFunc extracts the event identity / event idempotency key from the
//     raw message bytes. For current events this should be the event_id; legacy
//     payloads may fall back to a deterministic hash of the original event payload.
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

		processedKey := dedupPrefix + "processed:" + dedupKey
		leaseKey := dedupPrefix + "processing:" + dedupKey
		processed, err := c.store.Exists(ctx, processedKey)
		if err != nil {
			log.Printf("kafka[%s]: redis dedup check failed, not committing: %v", c.topic, err)
			continue
		}
		if processed {
			log.Printf("kafka[%s]: duplicate delivery of %s, skipped", c.topic, dedupKey)
			c.commit(ctx, msg)
			continue
		}

		leaseToken := uuid.NewString()
		claimed, err := c.store.Claim(ctx, leaseKey, leaseToken, processingLeaseTTL)
		if err != nil {
			log.Printf("kafka[%s]: redis lease failed, not committing: %v", c.topic, err)
			continue
		}
		if !claimed {
			log.Printf("kafka[%s]: event %s is being processed by another worker, retrying", c.topic, dedupKey)
			continue
		}

		if err := handle(msg.Value); err != nil {
			_ = c.releaseLease(ctx, leaseKey, leaseToken)
			log.Printf("kafka[%s]: handler error, not committing (will retry): %v", c.topic, err)
			continue
		}
		if err := c.store.Complete(ctx, processedKey, "1", processedEventTTL); err != nil {
			_ = c.releaseLease(ctx, leaseKey, leaseToken)
			log.Printf("kafka[%s]: failed to record successful processing, not committing: %v", c.topic, err)
			continue
		}
		_ = c.releaseLease(ctx, leaseKey, leaseToken)

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

func (c *Consumer) releaseLease(ctx context.Context, key, token string) error {
	return c.store.Release(ctx, key, token)
}
