package channelclient

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	"github.com/mesewo/slack-clone/apps/api/internal/breaker"
	"github.com/mesewo/slack-clone/services/contracts/channelpb"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type breakerTestChannelService struct {
	channelpb.ChannelServiceClient
	getOwnerCalls atomic.Int32
	failing       atomic.Bool
}

func (s *breakerTestChannelService) GetOwner(context.Context, *channelpb.GetOwnerRequest, ...grpc.CallOption) (*channelpb.GetOwnerResponse, error) {
	s.getOwnerCalls.Add(1)
	if s.failing.Load() {
		return nil, status.Error(codes.Unavailable, "service restarting")
	}
	return &channelpb.GetOwnerResponse{NodeId: "node-1", Address: "localhost:9091"}, nil
}

func (s *breakerTestChannelService) JoinRing(context.Context, *channelpb.JoinRingRequest, ...grpc.CallOption) (*channelpb.JoinRingResponse, error) {
	return &channelpb.JoinRingResponse{}, nil
}

func TestClientBreakerTripsAndAllowsProbeAfterReset(t *testing.T) {
	service := &breakerTestChannelService{}
	service.failing.Store(true)
	client := New(service, "node-1", "localhost:9091")
	fakeNow := time.Now()
	client.breaker = breaker.NewCircuitBreakerWithClock(5, 30*time.Second, func() time.Time { return fakeNow })

	for i := 0; i < 5; i++ {
		if _, err := client.GetOwner(context.Background(), "channel-1"); status.Code(err) != codes.Unavailable {
			t.Fatalf("failing call %d error = %v, want Unavailable", i+1, err)
		}
	}
	callsAtOpen := service.getOwnerCalls.Load()
	if callsAtOpen != 20 {
		t.Fatalf("GetOwner RPC calls after five failed operations = %d, want 20", callsAtOpen)
	}
	if _, err := client.GetOwner(context.Background(), "channel-1"); err != breaker.ErrOpen {
		t.Fatalf("call while breaker is open error = %v, want ErrOpen", err)
	}
	if got := service.getOwnerCalls.Load(); got != callsAtOpen {
		t.Fatalf("open breaker invoked GetOwner RPC: calls = %d, want %d", got, callsAtOpen)
	}

	fakeNow = fakeNow.Add(31 * time.Second)
	service.failing.Store(false)
	owner, err := client.GetOwner(context.Background(), "channel-1")
	if err != nil {
		t.Fatalf("half-open probe error = %v", err)
	}
	if owner.NodeID != "node-1" || owner.Address != "localhost:9091" {
		t.Fatalf("half-open probe owner = %+v, want node-1 at localhost:9091", owner)
	}
	if got := service.getOwnerCalls.Load(); got != callsAtOpen+1 {
		t.Fatalf("GetOwner RPC calls after probe = %d, want %d", got, callsAtOpen+1)
	}
}
