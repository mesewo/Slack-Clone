package server

import (
	"context"
	"errors"
	"sync"

	"github.com/mesewo/slack-clone/services/channel/internal/hashring"
	"github.com/mesewo/slack-clone/services/contracts/channelpb"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type Server struct {
	channelpb.UnimplementedChannelServiceServer
	ring      *hashring.Ring
	mu        sync.RWMutex
	addresses map[string]string
}

func New(ring *hashring.Ring) *Server {
	return &Server{ring: ring, addresses: make(map[string]string)}
}

func (s *Server) GetOwner(_ context.Context, request *channelpb.GetOwnerRequest) (*channelpb.GetOwnerResponse, error) {
	nodeID, err := s.ring.Get(request.GetChannelId())
	if errors.Is(err, hashring.ErrEmptyRing) {
		return nil, status.Error(codes.Unavailable, "channel ring has no members")
	}
	if err != nil {
		return nil, status.Error(codes.Internal, "channel owner lookup failed")
	}
	s.mu.RLock()
	address, exists := s.addresses[nodeID]
	s.mu.RUnlock()
	if !exists {
		return nil, status.Error(codes.Unavailable, "channel owner address is unavailable")
	}
	return &channelpb.GetOwnerResponse{NodeId: nodeID, Address: address}, nil
}

func (s *Server) JoinRing(_ context.Context, request *channelpb.JoinRingRequest) (*channelpb.JoinRingResponse, error) {
	if request.GetNodeId() == "" || request.GetAddress() == "" {
		return nil, status.Error(codes.InvalidArgument, "node_id and address are required")
	}
	s.mu.Lock()
	s.addresses[request.GetNodeId()] = request.GetAddress()
	s.ring.AddNode(request.GetNodeId())
	s.mu.Unlock()
	return &channelpb.JoinRingResponse{}, nil
}

func (s *Server) LeaveRing(_ context.Context, request *channelpb.LeaveRingRequest) (*channelpb.LeaveRingResponse, error) {
	if request.GetNodeId() == "" {
		return nil, status.Error(codes.InvalidArgument, "node_id is required")
	}
	s.mu.Lock()
	s.ring.RemoveNode(request.GetNodeId())
	delete(s.addresses, request.GetNodeId())
	s.mu.Unlock()
	return &channelpb.LeaveRingResponse{}, nil
}
