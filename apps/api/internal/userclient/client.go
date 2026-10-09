package userclient

import (
	"context"
	"time"

	"github.com/mesewo/slack-clone/services/contracts/userpb"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Client is the subset of user-service operations used by Core's HTTP handlers.
type Client interface {
	Register(context.Context, *userpb.RegisterRequest) (*userpb.AuthResponse, error)
	Login(context.Context, *userpb.LoginRequest) (*userpb.AuthResponse, error)
	MFASetup(context.Context, *userpb.MFASetupRequest) (*userpb.MFASetupResponse, error)
	MFAConfirm(context.Context, *userpb.MFAConfirmRequest) (*userpb.MFAConfirmResponse, error)
	MFAChallenge(context.Context, *userpb.MFAChallengeRequest) (*userpb.AuthResponse, error)
}

type retryingClient struct {
	service userpb.UserServiceClient
}

// New wraps the generated client with bounded retries for transient service
// restarts, matching Core's channelclient retry policy.
func New(service userpb.UserServiceClient) Client {
	return &retryingClient{service: service}
}

func (c *retryingClient) Register(ctx context.Context, req *userpb.RegisterRequest) (*userpb.AuthResponse, error) {
	return retry(ctx, func(ctx context.Context) (*userpb.AuthResponse, error) { return c.service.Register(ctx, req) })
}

func (c *retryingClient) Login(ctx context.Context, req *userpb.LoginRequest) (*userpb.AuthResponse, error) {
	return retry(ctx, func(ctx context.Context) (*userpb.AuthResponse, error) { return c.service.Login(ctx, req) })
}

func (c *retryingClient) MFASetup(ctx context.Context, req *userpb.MFASetupRequest) (*userpb.MFASetupResponse, error) {
	return retry(ctx, func(ctx context.Context) (*userpb.MFASetupResponse, error) {
		return c.service.MFASetup(ctx, req)
	})
}

func (c *retryingClient) MFAConfirm(ctx context.Context, req *userpb.MFAConfirmRequest) (*userpb.MFAConfirmResponse, error) {
	return retry(ctx, func(ctx context.Context) (*userpb.MFAConfirmResponse, error) {
		return c.service.MFAConfirm(ctx, req)
	})
}

func (c *retryingClient) MFAChallenge(ctx context.Context, req *userpb.MFAChallengeRequest) (*userpb.AuthResponse, error) {
	return retry(ctx, func(ctx context.Context) (*userpb.AuthResponse, error) {
		return c.service.MFAChallenge(ctx, req)
	})
}

func retry[T any](ctx context.Context, call func(context.Context) (T, error)) (T, error) {
	var zero T
	operationCtx, operationCancel := context.WithTimeout(ctx, 5*time.Second)
	defer operationCancel()
	var lastErr error
	for attempt := 0; attempt < 4; attempt++ {
		rpcCtx, rpcCancel := context.WithTimeout(operationCtx, time.Second)
		response, err := call(rpcCtx)
		rpcCancel()
		if err == nil {
			return response, nil
		}
		lastErr = err
		if !retryable(err) {
			return zero, err
		}
		if attempt == 3 {
			break
		}
		timer := time.NewTimer(time.Duration(attempt+1) * 100 * time.Millisecond)
		select {
		case <-operationCtx.Done():
			timer.Stop()
			return zero, operationCtx.Err()
		case <-timer.C:
		}
	}
	return zero, lastErr
}

func retryable(err error) bool {
	code := status.Code(err)
	return code == codes.Unavailable || code == codes.DeadlineExceeded
}
