package gateway

import (
	"context"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// RedisHub extends Hub with Redis-backed channel subscriptions and presence.
// Connections remain in-memory per-gateway-instance, but subscriptions and
// broadcasts are coordinated via Redis so multiple gateway instances can
// share state.
type RedisHub struct {
	// In-memory per-instance state
	clients  map[string]map[*Client]bool
	mu       sync.RWMutex

	// Redis for shared state
	redis *redis.Client
}

func NewRedisHub(redisClient *redis.Client) *RedisHub {
	return &RedisHub{
		clients: make(map[string]map[*Client]bool),
		redis:   redisClient,
	}
}

// Register adds a client connection to the in-memory registry.
func (h *RedisHub) Register(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.clients[client.UserID] == nil {
		h.clients[client.UserID] = make(map[*Client]bool)
	}
	h.clients[client.UserID][client] = true
}

// Unregister removes a specific client connection.
func (h *RedisHub) Unregister(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	conns, ok := h.clients[client.UserID]
	if !ok {
		return
	}
	if _, ok := conns[client]; ok {
		delete(conns, client)
		close(client.Send)
	}
	if len(conns) == 0 {
		delete(h.clients, client.UserID)
	}
}

// SubscribeToChannel adds a user to a channel subscription in Redis.
// Multiple gateway instances query this to know which users to broadcast to.
func (h *RedisHub) SubscribeToChannel(ctx context.Context, userID, channelID string) error {
	// Add user to channel set in Redis (e.g., channel:123:subscribers = {user1, user2})
	key := "channel:" + channelID + ":subscribers"
	err := h.redis.SAdd(ctx, key, userID).Err()
	if err != nil {
		return err
	}

	// Set expiration to 24 hours - if a gateway crashes, subscriptions auto-clean
	h.redis.Expire(ctx, key, 24*time.Hour)
	return nil
}

// GetChannelSubscribers returns all userIDs currently subscribed to a channel.
func (h *RedisHub) GetChannelSubscribers(ctx context.Context, channelID string) ([]string, error) {
	key := "channel:" + channelID + ":subscribers"
	return h.redis.SMembers(ctx, key).Result()
}

// BroadcastToChannel sends a message to all connected clients subscribed to
// a channel. This only broadcasts to clients connected to THIS gateway instance;
// it relies on the gRPC call from Core to hit all gateway instances that have
// subscribers.
func (h *RedisHub) BroadcastToChannel(channelID string, message []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	// Get subscribed users (from Redis)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	subscribers, err := h.GetChannelSubscribers(ctx, channelID)
	cancel()
	if err != nil {
		log.Printf("failed to get channel subscribers from Redis: %v", err)
		return
	}

	// Send to each subscriber's connections on this instance
	for _, userID := range subscribers {
		if conns, ok := h.clients[userID]; ok {
			for conn := range conns {
				select {
				case conn.Send <- message:
				default:
					// Buffer full - skip to avoid blocking
				}
			}
		}
	}
}

// BroadcastPresence sends a presence change to all users in channels
// that the given userID belongs to. Uses Redis to find relevant channels.
func (h *RedisHub) BroadcastPresence(userID string, message []byte) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	// Find all channels this user is subscribed to
	iter := h.redis.Scan(ctx, 0, "channel:*:subscribers", 0).Iterator()
	var channelIDs []string
	for iter.Next(ctx) {
		key := iter.Val()
		// key is like "channel:123:subscribers"
		// Extract channelID by string splitting
		parts := strings.Split(key, ":")
		if len(parts) < 2 {
			continue
		}
		channelID := parts[1]

		isMember, err := h.redis.SIsMember(ctx, key, userID).Result()
		if err != nil || !isMember {
			continue
		}
		channelIDs = append(channelIDs, channelID)
	}
	if err := iter.Err(); err != nil {
		log.Printf("failed to scan channel subscriptions: %v", err)
		return
	}

	// Broadcast to each channel
	for _, channelID := range channelIDs {
		h.BroadcastToChannel(channelID, message)
	}
}
