package gatewayserver

import (
	"context"

	"github.com/mesewo/slack-clone/apps/api/internal/gateway"
	"github.com/mesewo/slack-clone/apps/api/internal/rpc/chatpb"
)

// Server implements chatpb.GatewayServiceServer. Core calls this whenever
// it needs to push a live event out to connected WebSocket clients.
type Server struct {
	chatpb.UnimplementedGatewayServiceServer
	Hub gateway.HubInterface
}

func (s *Server) Broadcast(ctx context.Context, req *chatpb.BroadcastRequest) (*chatpb.BroadcastResponse, error) {
	s.Hub.BroadcastToChannel(req.GetChannelId(), req.GetPayload())
	return &chatpb.BroadcastResponse{}, nil
}