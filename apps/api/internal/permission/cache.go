package permission

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

var ErrCacheUnavailable = errors.New("permission cache is unavailable")

type Cache struct {
	redis *redis.Client
	ttl   time.Duration
}

func NewCache(redisClient *redis.Client, ttl time.Duration) *Cache {
	return &Cache{redis: redisClient, ttl: ttl}
}

func (c *Cache) GetRole(ctx context.Context, workspaceID, userID uuid.UUID) (role string, hit bool, err error) {
	if c == nil || c.redis == nil {
		return "", false, ErrCacheUnavailable
	}
	role, err = c.redis.Get(ctx, roleCacheKey(workspaceID, userID)).Result()
	if errors.Is(err, redis.Nil) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return role, true, nil
}

func (c *Cache) SetRole(ctx context.Context, workspaceID, userID uuid.UUID, role string) error {
	if c == nil || c.redis == nil {
		return ErrCacheUnavailable
	}
	return c.redis.Set(ctx, roleCacheKey(workspaceID, userID), role, c.ttl).Err()
}

func (c *Cache) Invalidate(ctx context.Context, workspaceID, userID uuid.UUID) error {
	if c == nil || c.redis == nil {
		return ErrCacheUnavailable
	}
	return c.redis.Del(ctx, roleCacheKey(workspaceID, userID)).Err()
}

func roleCacheKey(workspaceID, userID uuid.UUID) string {
	return fmt.Sprintf("permission:role:%s:%s", workspaceID, userID)
}
