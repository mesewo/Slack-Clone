package gateway

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

// RedisPresenceManager tracks user status using Redis as the backing store,
// so all gateway instances have the same view of who's online and away.
type RedisPresenceManager struct {
	redis *redis.Client
	hub   *RedisHub
	pubSub *redis.PubSub
}

func NewRedisPresenceManager(redisClient *redis.Client, hub *RedisHub) *RedisPresenceManager {
	pm := &RedisPresenceManager{
		redis: redisClient,
		hub:   hub,
	}

	// Subscribe to presence updates published by other instances
	pm.pubSub = redisClient.Subscribe(context.Background(), "presence:updates")
	go pm.listenForPresenceUpdates()

	return pm
}

// listenForPresenceUpdates subscribes to presence changes from all gateway
// instances and broadcasts them locally to clients connected to this instance.
func (pm *RedisPresenceManager) listenForPresenceUpdates() {
	ch := pm.pubSub.Channel()
	for msg := range ch {
		var payload PresencePayload
		if err := json.Unmarshal([]byte(msg.Payload), &payload); err != nil {
			log.Printf("failed to unmarshal presence update: %v", err)
			continue
		}

		event, err := json.Marshal(WSEvent{Type: EventPresence, Payload: []byte(msg.Payload)})
		if err != nil {
			continue
		}

		// Broadcast locally
		for userID, conns := range pm.hub.clients {
			if userID != payload.UserID {
				for conn := range conns {
					select {
					case conn.Send <- event:
					default:
					}
				}
			}
		}
	}
}

// SetStatus updates a user's status in Redis and publishes the change.
func (pm *RedisPresenceManager) SetStatus(userID string, status UserStatus) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	// Get current status
	key := "presence:" + userID
	existingStatus, err := pm.redis.Get(ctx, key).Result()
	if err == redis.Nil {
		existingStatus = ""
	} else if err != nil {
		log.Printf("failed to get status for %s: %v", userID, err)
		return
	}

	// Only publish if status changed
	if existingStatus != string(status) {
		pm.redis.Set(ctx, key, string(status), 24*time.Hour)

		// Publish change to all instances
		payload, err := json.Marshal(PresencePayload{UserID: userID, Status: string(status)})
		if err != nil {
			return
		}

		pm.redis.Publish(ctx, "presence:updates", string(payload))
	}
}

// GetStatus retrieves a user's current status from Redis.
func (pm *RedisPresenceManager) GetStatus(userID string) UserStatus {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	key := "presence:" + userID
	status, err := pm.redis.Get(ctx, key).Result()
	if err == redis.Nil {
		return StatusAway
	}
	if err != nil {
		log.Printf("failed to get status for %s: %v", userID, err)
		return StatusAway
	}

	if status == string(StatusActive) {
		return StatusActive
	}
	return StatusAway
}

// Snapshot returns all currently known user statuses from Redis.
func (pm *RedisPresenceManager) Snapshot() map[string]UserStatus {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	snapshot := make(map[string]UserStatus)

	// Scan all presence keys
	iter := pm.redis.Scan(ctx, 0, "presence:*", 0).Iterator()
	for iter.Next(ctx) {
		key := iter.Val()
		userID := key[9:] // len("presence:") = 9

		status, err := pm.redis.Get(ctx, key).Result()
		if err != nil {
			continue
		}

		if status == string(StatusActive) {
			snapshot[userID] = StatusActive
		} else {
			snapshot[userID] = StatusAway
		}
	}

	if err := iter.Err(); err != nil {
		log.Printf("failed to scan presence keys: %v", err)
	}

	return snapshot
}

// Close cleans up the pub/sub subscription.
func (pm *RedisPresenceManager) Close() error {
	if pm.pubSub != nil {
		return pm.pubSub.Close()
	}
	return nil
}
