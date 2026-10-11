package main

import (
	"context"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/mesewo/slack-clone/services/channel/internal/hashring"
	"github.com/mesewo/slack-clone/services/channel/internal/server"
	"github.com/mesewo/slack-clone/services/contracts/channelpb"
	"github.com/mesewo/slack-clone/services/telemetry"
	"google.golang.org/grpc"
)

func main() {
	telemetry.SetDefault(telemetry.NewLogger("channel-service"))
	defer telemetry.L.Sync()
	address := os.Getenv("CHANNEL_GRPC_ADDR")
	if address == "" {
		address = ":9092"
	}
	metricsAddr := os.Getenv("CHANNEL_METRICS_ADDR")
	if metricsAddr == "" {
		metricsAddr = ":9192"
	}
	metricsServer := telemetry.ServeMetricsOnly(metricsAddr)
	go func() {
		if err := metricsServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			telemetry.L.Sugar().Errorf("metrics server failed: %v", err)
		}
	}()
	listener, err := net.Listen("tcp", address)
	if err != nil {
		telemetry.L.Sugar().Fatalf("listen on %s: %v", address, err)
	}
	grpcServer := grpc.NewServer(grpc.ChainUnaryInterceptor(telemetry.UnaryServerInterceptor("channel-service")))
	channelpb.RegisterChannelServiceServer(grpcServer, server.New(hashring.NewRing(100)))
	go func() {
		<-signalCh()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := metricsServer.Shutdown(shutdownCtx); err != nil {
			telemetry.L.Sugar().Errorf("metrics server shutdown failed: %v", err)
		}
		grpcServer.GracefulStop()
	}()
	telemetry.L.Sugar().Infof("channel service listening on %s", address)
	if err := grpcServer.Serve(listener); err != nil {
		telemetry.L.Sugar().Errorf("channel service stopped: %v", err)
	}
}

func signalCh() <-chan os.Signal {
	ch := make(chan os.Signal, 1)
	signal.Notify(ch, os.Interrupt, syscall.SIGTERM)
	return ch
}
