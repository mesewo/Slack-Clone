package userclient

import (
	"context"

	"github.com/mesewo/slack-clone/apps/api/internal/rpcretry"
	"github.com/mesewo/slack-clone/services/contracts/userpb"
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
	return rpcretry.Do(ctx, func(ctx context.Context) (*userpb.AuthResponse, error) { return c.service.Register(ctx, req) })
}

func (c *retryingClient) Login(ctx context.Context, req *userpb.LoginRequest) (*userpb.AuthResponse, error) {
	return rpcretry.Do(ctx, func(ctx context.Context) (*userpb.AuthResponse, error) { return c.service.Login(ctx, req) })
}

func (c *retryingClient) MFASetup(ctx context.Context, req *userpb.MFASetupRequest) (*userpb.MFASetupResponse, error) {
	return rpcretry.Do(ctx, func(ctx context.Context) (*userpb.MFASetupResponse, error) {
		return c.service.MFASetup(ctx, req)
	})
}

func (c *retryingClient) MFAConfirm(ctx context.Context, req *userpb.MFAConfirmRequest) (*userpb.MFAConfirmResponse, error) {
	return rpcretry.Do(ctx, func(ctx context.Context) (*userpb.MFAConfirmResponse, error) {
		return c.service.MFAConfirm(ctx, req)
	})
}

func (c *retryingClient) MFAChallenge(ctx context.Context, req *userpb.MFAChallengeRequest) (*userpb.AuthResponse, error) {
	return rpcretry.Do(ctx, func(ctx context.Context) (*userpb.AuthResponse, error) {
		return c.service.MFAChallenge(ctx, req)
	})
}
