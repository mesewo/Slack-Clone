package userclient

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	"github.com/mesewo/slack-clone/apps/api/internal/breaker"
	"github.com/mesewo/slack-clone/services/contracts/userpb"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type breakerTestUserService struct {
	userpb.UserServiceClient
	calls   atomic.Int32
	failing atomic.Bool
}

func (s *breakerTestUserService) Login(context.Context, *userpb.LoginRequest, ...grpc.CallOption) (*userpb.AuthResponse, error) {
	s.calls.Add(1)
	if s.failing.Load() {
		return nil, status.Error(codes.Internal, "service failure")
	}
	return &userpb.AuthResponse{}, nil
}

func TestClientBreakerTripsAndAllowsProbeAfterReset(t *testing.T) {
	service := &breakerTestUserService{}
	service.failing.Store(true)
	client := New(service).(*retryingClient)
	fakeNow := time.Now()
	client.breaker = breaker.NewCircuitBreakerWithClock(5, 30*time.Second, func() time.Time { return fakeNow })

	for i := 0; i < 5; i++ {
		if _, err := client.Login(context.Background(), &userpb.LoginRequest{}); status.Code(err) != codes.Internal {
			t.Fatalf("failing call %d error = %v, want Internal", i+1, err)
		}
	}
	if got := service.calls.Load(); got != 5 {
		t.Fatalf("RPC calls after five failures = %d, want 5", got)
	}
	if _, err := client.Login(context.Background(), &userpb.LoginRequest{}); err != breaker.ErrOpen {
		t.Fatalf("sixth call error = %v, want ErrOpen", err)
	}
	if got := service.calls.Load(); got != 5 {
		t.Fatalf("open breaker invoked RPC: calls = %d, want 5", got)
	}

	fakeNow = fakeNow.Add(31 * time.Second)
	service.failing.Store(false)
	if _, err := client.Login(context.Background(), &userpb.LoginRequest{}); err != nil {
		t.Fatalf("half-open probe error = %v", err)
	}
	if got := service.calls.Load(); got != 6 {
		t.Fatalf("RPC calls after probe = %d, want 6", got)
	}
}
