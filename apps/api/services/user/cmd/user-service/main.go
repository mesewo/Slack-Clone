package main

import (
	"context"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/mesewo/slack-clone/services/authlib/auth"
	"github.com/mesewo/slack-clone/services/contracts/userpb"
	"github.com/mesewo/slack-clone/services/database"
	"github.com/mesewo/slack-clone/services/telemetry"
	"github.com/mesewo/slack-clone/services/user/internal/server"
	"github.com/redis/go-redis/v9"
	"google.golang.org/grpc"
)

func main() {
	telemetry.SetDefault(telemetry.NewLogger("user-service"))
	defer telemetry.L.Sync()
	_ = godotenv.Load(".env", "../../.env", "apps/api/.env")

	address := os.Getenv("USER_GRPC_ADDR")
	if address == "" {
		address = ":9093"
	}
	metricsAddr := os.Getenv("USER_METRICS_ADDR")
	if metricsAddr == "" {
		metricsAddr = ":9193"
	}
	metricsServer := telemetry.ServeMetricsOnly(metricsAddr)
	go func() {
		if err := metricsServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			telemetry.L.Sugar().Errorf("metrics server failed: %v", err)
		}
	}()
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		telemetry.L.Sugar().Fatal("DATABASE_URL is not set")
	}
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		telemetry.L.Sugar().Fatal("JWT_SECRET is not set")
	}
	redisAddress := os.Getenv("REDIS_ADDR")
	if redisAddress == "" {
		redisAddress = "localhost:6379"
	}

	pool, err := pgxpool.New(context.Background(), databaseURL)
	if err != nil {
		telemetry.L.Sugar().Fatalf("create database pool: %v", err)
	}
	defer pool.Close()
	redisClient := redis.NewClient(&redis.Options{Addr: redisAddress})
	defer redisClient.Close()

	listener, err := net.Listen("tcp", address)
	if err != nil {
		telemetry.L.Sugar().Fatalf("listen on %s: %v", address, err)
	}
	grpcServer := grpc.NewServer(grpc.ChainUnaryInterceptor(telemetry.UnaryServerInterceptor("user-service")))
	tokens := auth.NewTokenManager([]byte(jwtSecret), 24*time.Hour)
	userpb.RegisterUserServiceServer(grpcServer, server.New(database.New(pool), tokens, redisClient))

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-stop
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := metricsServer.Shutdown(shutdownCtx); err != nil {
			telemetry.L.Sugar().Errorf("metrics server shutdown failed: %v", err)
		}
		grpcServer.GracefulStop()
	}()
	telemetry.L.Sugar().Infof("user service listening on %s", address)
	if err := grpcServer.Serve(listener); err != nil {
		telemetry.L.Sugar().Errorf("user service stopped: %v", err)
	}
}
