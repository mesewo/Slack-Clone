package coreserver

import (
	"context"
	"testing"

	"github.com/mesewo/slack-clone/apps/api/internal/rpc/chatpb"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestGetUserChannelsRejectsMalformedUserID(t *testing.T) {
	server := &Server{}
	_, err := server.GetUserChannels(context.Background(), &chatpb.GetUserChannelsRequest{UserId: "bad"})
	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("expected InvalidArgument, got %v", err)
	}
}
