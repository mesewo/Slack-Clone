package gateway

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/mesewo/slack-clone/apps/api/internal/rpc/chatpb"
	"google.golang.org/grpc"
)

type readinessCoreClient struct {
	getUserChannels func(context.Context, *chatpb.GetUserChannelsRequest) (*chatpb.GetUserChannelsResponse, error)
}

func (c readinessCoreClient) GetUserChannels(ctx context.Context, req *chatpb.GetUserChannelsRequest, _ ...grpc.CallOption) (*chatpb.GetUserChannelsResponse, error) {
	return c.getUserChannels(ctx, req)
}

func TestLivenessHandlerSucceedsWithoutCoreOrAuthentication(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	response := httptest.NewRecorder()

	LivenessHandler(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}
	if response.Body.String() != "ok\n" {
		t.Fatalf("body = %q, want %q", response.Body.String(), "ok\\n")
	}
}

func TestReadinessHandlerSucceedsWhenCoreMembershipRPCRespondsWithoutAuthentication(t *testing.T) {
	called := false
	client := readinessCoreClient{getUserChannels: func(_ context.Context, req *chatpb.GetUserChannelsRequest) (*chatpb.GetUserChannelsResponse, error) {
		called = true
		if req.GetUserId() != readinessProbeUserID {
			t.Fatalf("probe user ID = %q, want %q", req.GetUserId(), readinessProbeUserID)
		}
		return &chatpb.GetUserChannelsResponse{}, nil
	}}
	request := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	response := httptest.NewRecorder()

	ReadinessHandler(client, time.Second)(response, request)

	if response.Code != http.StatusOK || response.Body.String() != "ready\n" {
		t.Fatalf("response = %d %q, want %d %q", response.Code, response.Body.String(), http.StatusOK, "ready\\n")
	}
	if !called {
		t.Fatal("Core membership RPC was not called")
	}
}

func TestReadinessHandlerHidesCoreFailureDetails(t *testing.T) {
	client := readinessCoreClient{getUserChannels: func(context.Context, *chatpb.GetUserChannelsRequest) (*chatpb.GetUserChannelsResponse, error) {
		return nil, errors.New("database password leaked by internal error")
	}}
	request := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	response := httptest.NewRecorder()

	ReadinessHandler(client, time.Second)(response, request)

	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusServiceUnavailable)
	}
	if strings.TrimSpace(response.Body.String()) != "not ready" || strings.Contains(response.Body.String(), "password") {
		t.Fatalf("response leaked Core error: %q", response.Body.String())
	}
}

func TestReadinessHandlerReturnsUnavailableWhenCoreCheckTimesOut(t *testing.T) {
	client := readinessCoreClient{getUserChannels: func(ctx context.Context, _ *chatpb.GetUserChannelsRequest) (*chatpb.GetUserChannelsResponse, error) {
		<-ctx.Done()
		return nil, ctx.Err()
	}}
	request := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	response := httptest.NewRecorder()
	started := time.Now()

	ReadinessHandler(client, 20*time.Millisecond)(response, request)

	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusServiceUnavailable)
	}
	if elapsed := time.Since(started); elapsed > time.Second {
		t.Fatalf("readiness check exceeded bound: %s", elapsed)
	}
}

func TestReadinessHandlerRejectsNilCoreResponse(t *testing.T) {
	client := readinessCoreClient{getUserChannels: func(context.Context, *chatpb.GetUserChannelsRequest) (*chatpb.GetUserChannelsResponse, error) {
		return nil, nil
	}}
	request := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	response := httptest.NewRecorder()

	ReadinessHandler(client, time.Second)(response, request)

	if response.Code != http.StatusServiceUnavailable || strings.TrimSpace(response.Body.String()) != "not ready" {
		t.Fatalf("response = %d %q, want generic 503", response.Code, response.Body.String())
	}
}
