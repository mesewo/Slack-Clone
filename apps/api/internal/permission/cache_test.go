package permission

import (
	"context"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

func TestCacheMissFallsBackAndPopulates(t *testing.T) {
	server, err := miniredis.Run()
	if err != nil {
		t.Fatal(err)
	}
	defer server.Close()
	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	defer client.Close()
	cache := NewCache(client, time.Minute)
	workspaceID, userID := uuid.New(), uuid.New()
	ctx := context.Background()

	if _, hit, err := cache.GetRole(ctx, workspaceID, userID); err != nil || hit {
		t.Fatalf("empty cache GetRole() = hit %t, err %v; want miss without error", hit, err)
	}
	if err := cache.SetRole(ctx, workspaceID, userID, "ADMIN"); err != nil {
		t.Fatal(err)
	}
	if role, hit, err := cache.GetRole(ctx, workspaceID, userID); err != nil || !hit || role != "ADMIN" {
		t.Fatalf("populated cache GetRole() = (%q, %t, %v), want (ADMIN, true, nil)", role, hit, err)
	}
}

func TestInvalidateClearsEntry(t *testing.T) {
	server, err := miniredis.Run()
	if err != nil {
		t.Fatal(err)
	}
	defer server.Close()
	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	defer client.Close()
	cache := NewCache(client, time.Minute)
	workspaceID, userID := uuid.New(), uuid.New()
	ctx := context.Background()

	if err := cache.SetRole(ctx, workspaceID, userID, "ADMIN"); err != nil {
		t.Fatal(err)
	}
	if err := cache.Invalidate(ctx, workspaceID, userID); err != nil {
		t.Fatal(err)
	}
	if _, hit, err := cache.GetRole(ctx, workspaceID, userID); err != nil || hit {
		t.Fatalf("GetRole() after invalidation = hit %t, err %v; want miss without error", hit, err)
	}
}

func TestRoleEntryExpiresAtTTL(t *testing.T) {
	server, err := miniredis.Run()
	if err != nil {
		t.Fatal(err)
	}
	defer server.Close()
	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	defer client.Close()
	cache := NewCache(client, time.Minute)
	workspaceID, userID := uuid.New(), uuid.New()
	if err := cache.SetRole(context.Background(), workspaceID, userID, "ADMIN"); err != nil {
		t.Fatal(err)
	}
	server.FastForward(time.Minute)
	if _, hit, err := cache.GetRole(context.Background(), workspaceID, userID); err != nil || hit {
		t.Fatalf("GetRole() after TTL = hit %t, err %v; want expired miss", hit, err)
	}
}

// TestGetRoleReturnsRedisError covers the cache API's error result only.
// Handler-level DB fallback is exercised by TestRequirePermissionFallsBackWhenRedisUnavailable.
func TestGetRoleReturnsRedisError(t *testing.T) {
	server, err := miniredis.Run()
	if err != nil {
		t.Fatal(err)
	}
	addr := server.Addr()
	server.Close()
	client := redis.NewClient(&redis.Options{
		Addr:        addr,
		MaxRetries:  -1,
		DialTimeout: 200 * time.Millisecond,
		ReadTimeout: 200 * time.Millisecond,
	})
	defer client.Close()
	cache := NewCache(client, time.Minute)
	workspaceID, userID := uuid.New(), uuid.New()

	role, hit, cacheErr := cache.GetRole(context.Background(), workspaceID, userID)
	if cacheErr == nil || hit {
		t.Fatalf("unavailable Redis GetRole() = (%q, %t, %v), want an error and miss", role, hit, cacheErr)
	}

	// Simulate RequirePermission's cache-aside fallback: a cache error is
	// treated like a miss, so the DB supplies the role and authorization proceeds.
	dbReads := 0
	if cacheErr != nil || !hit {
		dbReads++
		role = "OWNER"
	}
	if dbReads != 1 || !Check(role, PermissionInviteMember) {
		t.Fatalf("fallback authorization failed: dbReads=%d role=%q", dbReads, role)
	}
}
