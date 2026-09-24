package gatewayserver

import (
	"context"
	"log"

	"github.com/mesewo/slack-clone/apps/api/internal/gateway"
	"github.com/mesewo/slack-clone/apps/api/internal/rpc/chatpb"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Server implements chatpb.GatewayServiceServer. Core calls this whenever
// it needs to push a live event out to connected WebSocket clients.
type Server struct {
	chatpb.UnimplementedGatewayServiceServer
	Hub gateway.HubInterface
}

func (s *Server) Broadcast(ctx context.Context, req *chatpb.BroadcastRequest) (*chatpb.BroadcastResponse, error) {
	if s.Hub == nil {
		return nil, status.Error(codes.Unavailable, "gateway hub is unavailable")
	}
	if req.GetChannelId() == "" || len(req.GetPayload()) == 0 {
		return nil, status.Error(codes.InvalidArgument, "channel_id and payload are required")
	}
	log.Printf("gateway broadcast received channel=%s payload_bytes=%d", req.GetChannelId(), len(req.GetPayload()))
	s.Hub.BroadcastToChannel(req.GetChannelId(), req.GetPayload())
	return &chatpb.BroadcastResponse{}, nil
}
