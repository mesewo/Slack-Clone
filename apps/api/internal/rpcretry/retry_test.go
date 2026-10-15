package rpcretry

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"

	"github.com/mesewo/slack-clone/apps/api/internal/breaker"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestCanceledHalfOpenProbeReopensWithoutRecordingFailure(t *testing.T) {
	fakeNow := time.Now()
	cb := breaker.NewCircuitBreakerWithClock(1, 30*time.Second, func() time.Time { return fakeNow })
	cb.RecordFailure()
	fakeNow = fakeNow.Add(31 * time.Second)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()
	var calls atomic.Int32
	_, err := Do(ctx, cb, func(context.Context) (int, error) {
		calls.Add(1)
		return 0, status.Error(codes.Unavailable, "service restarting")
	})
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("Do error = %v, want context deadline exceeded", err)
	}

	if _, err := Do(context.Background(), cb, func(context.Context) (int, error) {
		calls.Add(1)
		return 1, nil
	}); !errors.Is(err, breaker.ErrOpen) {
		t.Fatalf("call after canceled probe error = %v, want ErrOpen", err)
	}
	if got := calls.Load(); got != 1 {
		t.Fatalf("RPC calls = %d, want only the canceled probe", got)
	}
}
