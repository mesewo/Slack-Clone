package channelclient

import (
	"context"
	"time"

	"github.com/mesewo/slack-clone/services/contracts/channelpb"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type Owner struct {
	NodeID  string
	Address string
}

type Resolver interface {
	GetOwner(context.Context, string) (Owner, error)
}

type Client struct {
	service channelpb.ChannelServiceClient
	nodeID  string
	address string
}

func New(service channelpb.ChannelServiceClient, nodeID, address string) *Client {
	return &Client{service: service, nodeID: nodeID, address: address}
}

func (c *Client) Join(ctx context.Context) error {
	_, err := c.service.JoinRing(ctx, &channelpb.JoinRingRequest{NodeId: c.nodeID, Address: c.address})
	return err
}

func (c *Client) Leave(ctx context.Context) error {
	_, err := c.service.LeaveRing(ctx, &channelpb.LeaveRingRequest{NodeId: c.nodeID})
	return err
}

// GetOwner re-registers this Core node if the channel service restarted and
// lost its in-memory ring, then retries the lookup with a bounded wait.
func (c *Client) GetOwner(ctx context.Context, channelID string) (Owner, error) {
	operationCtx, operationCancel := context.WithTimeout(ctx, 5*time.Second)
	defer operationCancel()
	var lastErr error
	for attempt := 0; attempt < 4; attempt++ {
		rpcCtx, rpcCancel := context.WithTimeout(operationCtx, time.Second)
		response, err := c.service.GetOwner(rpcCtx, &channelpb.GetOwnerRequest{ChannelId: channelID})
		rpcCancel()
		if err == nil {
			if response == nil {
				return Owner{}, status.Error(codes.Internal, "channel service returned an empty owner response")
			}
			return Owner{NodeID: response.GetNodeId(), Address: response.GetAddress()}, nil
		}
		lastErr = err
		if status.Code(err) != codes.Unavailable && status.Code(err) != codes.DeadlineExceeded {
			return Owner{}, err
		}
		joinCtx, cancel := context.WithTimeout(operationCtx, time.Second)
		joinErr := c.Join(joinCtx)
		cancel()
		if joinErr != nil {
			lastErr = joinErr
		}
		if attempt == 3 {
			break
		}
		timer := time.NewTimer(time.Duration(attempt+1) * 100 * time.Millisecond)
		select {
		case <-operationCtx.Done():
			timer.Stop()
			return Owner{}, operationCtx.Err()
		case <-timer.C:
		}
	}
	return Owner{}, lastErr
}
