package kafka

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"os"
	"sync/atomic"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/segmentio/kafka-go"
)

func TestKafkaConsumerRestart(t *testing.T) {
	if os.Getenv("SLACK_KAFKA_INTEGRATION") != "1" {
		t.Skip("set SLACK_KAFKA_INTEGRATION=1 to run the real Redpanda restart test")
	}

	broker := os.Getenv("KAFKA_BROKER_ADDR")
	if broker == "" {
		broker = "localhost:19092"
	}

	redisClient := redis.NewClient(&redis.Options{Addr: "localhost:6379"})
	defer redisClient.Close()
	if err := redisClient.Ping(context.Background()).Err(); err != nil {
		t.Skipf("redis not available for kafka dedup test: %v", err)
	}

	topic := "test.consumer.restart." + uniqueSuffix()
	group := "test.consumer.restart.group." + uniqueSuffix()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	writer := &kafka.Writer{
		Addr:                   kafka.TCP(broker),
		Topic:                  topic,
		Balancer:               &kafka.LeastBytes{},
		RequiredAcks:          kafka.RequireOne,
		WriteTimeout:          10 * time.Second,
		AllowAutoTopicCreation: true,
	}
	defer writer.Close()

	payload := `{"event_id":"evt-restart-1","message_id":"msg-restart-1","content":"restart-unique-message"}`
	if err := writer.WriteMessages(context.Background(), kafka.Message{Key: []byte("evt-restart-1"), Value: []byte(payload)}); err != nil {
		t.Fatalf("publish message: %v", err)
	}

	var businessCount atomic.Int32
	processStarted := make(chan struct{}, 1)
	stopBeforeCommit := make(chan struct{})
	allowResume := make(chan struct{})

	consumer1 := NewConsumer(broker, topic, group, redisClient)
	go func() {
		consumer1.Run(ctx, "dedup:test_restart:", func(raw []byte) (string, error) {
			return EventDedupKey(topic, raw)
		}, func(raw []byte) error {
			select {
			case processStarted <- struct{}{}:
			default:
			}
			<-stopBeforeCommit
			businessCount.Add(1)
			<-allowResume
			return nil
		})
	}()

	select {
	case <-processStarted:
	case <-time.After(30 * time.Second):
		t.Fatal("first consumer never started processing the Kafka record")
	}

	cancel()
	_ = consumer1.Close()

	consumer2 := NewConsumer(broker, topic, group, redisClient)
	defer consumer2.Close()
	go func() {
		consumer2.Run(context.Background(), "dedup:test_restart:", func(raw []byte) (string, error) {
			return EventDedupKey(topic, raw)
		}, func(raw []byte) error {
			businessCount.Add(1)
			return nil
		})
	}()

	deadline := time.Now().Add(30 * time.Second)
	for time.Now().Before(deadline) {
		if businessCount.Load() == 1 {
			close(allowResume)
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	close(stopBeforeCommit)
	close(allowResume)

	for i := 0; i < 50; i++ {
		if businessCount.Load() == 1 {
			break
		}
		time.Sleep(200 * time.Millisecond)
	}
	if got := businessCount.Load(); got != 1 {
		t.Fatalf("expected business effect count=1 after redelivery; got %d", got)
	}
	if err := redisClient.Del(context.Background(), "dedup:test_restart:processed:"+EventDedupKeyForTest(topic, payload)).Err(); err != nil {
		t.Logf("cleanup redis dedup key: %v", err)
	}
}

func uniqueSuffix() string {
	buf := make([]byte, 8)
	_, _ = rand.Read(buf)
	return hex.EncodeToString(buf)
}

func EventDedupKeyForTest(topic, payload string) string {
	key, err := EventDedupKey(topic, []byte(payload))
	if err != nil {
		panic(err)
	}
	return key
}
