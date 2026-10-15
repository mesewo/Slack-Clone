package storageclient

import (
	"context"
	"time"

	"github.com/mesewo/slack-clone/apps/api/internal/breaker"
	"github.com/mesewo/slack-clone/apps/api/internal/rpcretry"
	"github.com/mesewo/slack-clone/services/contracts/storagepb"
)

type Client interface {
	PresignUpload(context.Context, *storagepb.PresignUploadRequest) (*storagepb.PresignUploadResponse, error)
	CompleteUpload(context.Context, *storagepb.CompleteUploadRequest) (*storagepb.CompleteUploadResponse, error)
}

type retryingClient struct {
	service storagepb.StorageServiceClient
	breaker *breaker.CircuitBreaker
}

func New(service storagepb.StorageServiceClient) Client {
	return &retryingClient{service: service, breaker: breaker.NewCircuitBreaker(5, 30*time.Second)}
}

func (c *retryingClient) PresignUpload(ctx context.Context, req *storagepb.PresignUploadRequest) (*storagepb.PresignUploadResponse, error) {
	return rpcretry.Do(ctx, c.breaker, func(ctx context.Context) (*storagepb.PresignUploadResponse, error) {
		return c.service.PresignUpload(ctx, req)
	})
}

func (c *retryingClient) CompleteUpload(ctx context.Context, req *storagepb.CompleteUploadRequest) (*storagepb.CompleteUploadResponse, error) {
	return rpcretry.Do(ctx, c.breaker, func(ctx context.Context) (*storagepb.CompleteUploadResponse, error) {
		return c.service.CompleteUpload(ctx, req)
	})
}
