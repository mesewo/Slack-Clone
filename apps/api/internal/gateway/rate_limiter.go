package gateway

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// RateLimiter enforces a sliding-window limit per user+connection pair.
// This is a better fit for chat traffic than a token bucket because it
// measures the actual recent event count, matching the expected semantics.
type RateLimiter struct {
	redis    *redis.Client
	rate     int           // max events in the window
	window   time.Duration // rolling window
	connID   string        // unique per client connection
	userID   string
}

// NewRateLimiter creates a rate limiter for a specific user+connection pair.
func NewRateLimiter(redisClient *redis.Client, userID, connID string, rate int, window time.Duration) *RateLimiter {
	return &RateLimiter{
		redis:  redisClient,
		rate:   rate,
		window: window,
		connID: connID,
		userID: userID,
	}
}

func shouldAllowSlidingWindow(timestamps []int64, nowMillis int64, rate int, window time.Duration) bool {
	if rate <= 0 {
		return false
	}
	if len(timestamps) == 0 {
		return true
	}

	cutoff := nowMillis - window.Milliseconds()
	inWindow := 0
	for _, ts := range timestamps {
		if ts >= cutoff {
			inWindow++
		}
	}
	return inWindow < rate
}

// Allow checks if the next message is allowed. It uses a Redis sorted set
// to track event timestamps inside a rolling window and rejects when the
// count reaches the configured limit.
func (rl *RateLimiter) Allow(ctx context.Context) (bool, error) {
	key := fmt.Sprintf("ratelimit:%s:%s", rl.userID, rl.connID)

	script := redis.NewScript(`
	local key = KEYS[1]
	local rate = tonumber(ARGV[1])
	local window_ms = tonumber(ARGV[2])
	local now_ms = tonumber(ARGV[3])
	local cutoff = now_ms - window_ms

	redis.call('ZREMRANGEBYSCORE', key, '-inf', cutoff)
	local count = tonumber(redis.call('ZCARD', key))
	if count >= rate then
		local member = tostring(now_ms) .. ':' .. tostring(math.random(0, 1000000))
		redis.call('ZADD', key, now_ms, member)
		redis.call('PEXPIRE', key, window_ms + 1000)
		return 0
	end

	local member = tostring(now_ms) .. ':' .. tostring(math.random(0, 1000000))
	redis.call('ZADD', key, now_ms, member)
	redis.call('PEXPIRE', key, window_ms + 1000)
	return 1
	`)

	result, err := script.Run(ctx, rl.redis,
		[]string{key},
		rl.rate,
		rl.window.Milliseconds(),
		time.Now().UnixMilli(),
	).Result()
	if err != nil {
		return false, err
	}

	allowed := result.(int64) == 1
	return allowed, nil
}

// AllowN checks if N messages are allowed. Useful for burst operations.
func (rl *RateLimiter) AllowN(ctx context.Context, n int) (bool, error) {
	for i := 0; i < n; i++ {
		allowed, err := rl.Allow(ctx)
		if err != nil {
			return false, err
		}
		if !allowed {
			return false, nil
		}
	}
	return true, nil
}

// Reset clears the rate limit state for this connection.
func (rl *RateLimiter) Reset(ctx context.Context) error {
	key := fmt.Sprintf("ratelimit:%s:%s", rl.userID, rl.connID)
	return rl.redis.Del(ctx, key).Err()
}
