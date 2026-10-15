package redisclient

import (
	"os"

	"github.com/redis/go-redis/v9"
)

// New returns a Redis client configured from REDIS_URL when present, falling
// back to the service's existing address setting for local deployments.
func New(addr string) (*redis.Client, error) {
	if redisURL := os.Getenv("REDIS_URL"); redisURL != "" {
		options, err := redis.ParseURL(redisURL)
		if err != nil {
			return nil, err
		}
		return redis.NewClient(options), nil
	}
	return redis.NewClient(&redis.Options{Addr: addr}), nil
}
