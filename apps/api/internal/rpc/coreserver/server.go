package coreserver

import (
	"context"

	"github.com/google/uuid"

	"github.com/mesewo/slack-clone/apps/api/internal/database"
	"github.com/mesewo/slack-clone/apps/api/internal/rpc/chatpb"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Server implements chatpb.CoreServiceServer. Gateway calls this on every
// new WebSocket connection to learn which channels to subscribe the user
// to - this is the only way it learns that; Gateway has no direct database
// access (Option B).
type Server struct {
	chatpb.UnimplementedCoreServiceServer
	Queries *database.Queries
}

func (s *Server) GetUserChannels(ctx context.Context, req *chatpb.GetUserChannelsRequest) (*chatpb.GetUserChannelsResponse, error) {
	userID, err := uuid.Parse(req.GetUserId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "user_id must be a valid UUID")
	}

	rows, err := s.Queries.ListWorkspaceChannelsForUser(ctx, userID)
	if err != nil {
		return nil, err
	}

	ids := make([]string, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.ID.String())
	}
	directMessages, err := s.Queries.ListDirectConversationsForUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	for _, conversation := range directMessages {
		ids = append(ids, "dm:"+conversation.ID.String())
	}

	return &chatpb.GetUserChannelsResponse{ChannelIds: ids}, nil
}
