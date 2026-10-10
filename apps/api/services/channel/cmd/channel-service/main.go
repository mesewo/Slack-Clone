package main

import (
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"

	"github.com/mesewo/slack-clone/services/channel/internal/hashring"
	"github.com/mesewo/slack-clone/services/channel/internal/server"
	"github.com/mesewo/slack-clone/services/contracts/channelpb"
	"google.golang.org/grpc"
)

func main() {
	address := os.Getenv("CHANNEL_GRPC_ADDR")
	if address == "" {
		address = ":9092"
	}
	listener, err := net.Listen("tcp", address)
	if err != nil {
		log.Fatalf("listen on %s: %v", address, err)
	}
	grpcServer := grpc.NewServer()
	channelpb.RegisterChannelServiceServer(grpcServer, server.New(hashring.NewRing(100)))
	go func() {
		<-signalCh()
		grpcServer.GracefulStop()
	}()
	log.Printf("channel service listening on %s", address)
	if err := grpcServer.Serve(listener); err != nil {
		log.Printf("channel service stopped: %v", err)
	}
}

func signalCh() <-chan os.Signal {
	ch := make(chan os.Signal, 1)
	signal.Notify(ch, os.Interrupt, syscall.SIGTERM)
	return ch
}
