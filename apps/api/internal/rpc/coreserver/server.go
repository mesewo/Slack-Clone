package coreserver

import (
	"context"

	"github.com/google/uuid"

	"github.com/mesewo/slack-clone/apps/api/internal/database"
	"github.com/mesewo/slack-clone/apps/api/internal/rpc/chatpb"
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
		// Malformed ID - respond with no channels rather than an RPC error;
		// the caller (Gateway) just won't subscribe this connection to anything.
		return &chatpb.GetUserChannelsResponse{}, nil
	}

	rows, err := s.Queries.ListWorkspaceChannelsForUser(ctx, userID)
	if err != nil {
		return nil, err
	}

	ids := make([]string, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.ID.String())
	}

	return &chatpb.GetUserChannelsResponse{ChannelIds: ids}, nil
}