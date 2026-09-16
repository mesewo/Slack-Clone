package kafka

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/segmentio/kafka-go"
)

type fakeReader struct {
	messages []kafka.Message
	commits  int
}

func (r *fakeReader) FetchMessage(ctx context.Context) (kafka.Message, error) {
	if len(r.messages) == 0 {
		<-ctx.Done()
		return kafka.Message{}, ctx.Err()
	}
	message := r.messages[0]
	r.messages = r.messages[1:]
	return message, nil
}

func (r *fakeReader) CommitMessages(context.Context, ...kafka.Message) error {
	r.commits++
	return nil
}

func (r *fakeReader) Close() error { return nil }

type fakeDedupStore struct {
	mu        sync.Mutex
	processed map[string]bool
	leases    map[string]string
}

func newFakeDedupStore() *fakeDedupStore {
	return &fakeDedupStore{processed: make(map[string]bool), leases: make(map[string]string)}
}

func (s *fakeDedupStore) Exists(_ context.Context, key string) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.processed[key], nil
}

func (s *fakeDedupStore) Claim(_ context.Context, key, token string, _ time.Duration) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.leases[key]; exists {
		return false, nil
	}
	s.leases[key] = token
	return true, nil
}

func (s *fakeDedupStore) Complete(_ context.Context, key, _ string, _ time.Duration) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.processed[key] = true
	return nil
}

func (s *fakeDedupStore) Release(_ context.Context, key, token string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.leases[key] == token {
		delete(s.leases, key)
	}
	return nil
}

func TestConsumerHandlerFailureRemainsRetryable(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	reader := &fakeReader{messages: []kafka.Message{{Value: []byte("event")}, {Value: []byte("event")}}}
	store := newFakeDedupStore()
	consumer := &Consumer{reader: reader, store: store, topic: "test"}
	attempts := 0

	consumer.Run(ctx, "dedup:", func([]byte) (string, error) { return "event-1", nil }, func([]byte) error {
		attempts++
		if attempts == 1 {
			return errors.New("temporary failure")
		}
		cancel()
		return nil
	})

	if attempts != 2 {
		t.Fatalf("expected failed event to retry, got %d attempts", attempts)
	}
	if reader.commits != 1 {
		t.Fatalf("expected only successful delivery to commit, got %d commits", reader.commits)
	}
}

func TestDedupStoreAllowsOnlyOneConcurrentClaim(t *testing.T) {
	store := newFakeDedupStore()
	const key = "dedup:processing:event-1"
	results := make(chan bool, 2)
	var group sync.WaitGroup
	group.Add(2)
	for _, token := range []string{"one", "two"} {
		go func(token string) {
			defer group.Done()
			claimed, err := store.Claim(context.Background(), key, token, time.Minute)
			if err != nil {
				t.Errorf("claim failed: %v", err)
			}
			results <- claimed
		}(token)
	}
	group.Wait()
	close(results)

	claimedCount := 0
	for claimed := range results {
		if claimed {
			claimedCount++
		}
	}
	if claimedCount != 1 {
		t.Fatalf("expected exactly one concurrent claim, got %d", claimedCount)
	}
}
