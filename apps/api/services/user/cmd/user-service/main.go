package main

import (
	"context"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesewo/slack-clone/services/authlib/auth"
	"github.com/mesewo/slack-clone/services/contracts/userpb"
	"github.com/mesewo/slack-clone/services/database"
	"github.com/mesewo/slack-clone/services/user/internal/server"
	"github.com/redis/go-redis/v9"
	"google.golang.org/grpc"
)

func main() {
	address := os.Getenv("USER_GRPC_ADDR")
	if address == "" {
		address = ":9093"
	}
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is not set")
	}
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		log.Fatal("JWT_SECRET is not set")
	}
	redisAddress := os.Getenv("REDIS_ADDR")
	if redisAddress == "" {
		redisAddress = "localhost:6379"
	}

	pool, err := pgxpool.New(context.Background(), databaseURL)
	if err != nil {
		log.Fatalf("create database pool: %v", err)
	}
	defer pool.Close()
	redisClient := redis.NewClient(&redis.Options{Addr: redisAddress})
	defer redisClient.Close()

	listener, err := net.Listen("tcp", address)
	if err != nil {
		log.Fatalf("listen on %s: %v", address, err)
	}
	grpcServer := grpc.NewServer()
	tokens := auth.NewTokenManager([]byte(jwtSecret), 24*time.Hour)
	userpb.RegisterUserServiceServer(grpcServer, server.New(database.New(pool), tokens, redisClient))

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-stop
		grpcServer.GracefulStop()
	}()
	log.Printf("user service listening on %s", address)
	if err := grpcServer.Serve(listener); err != nil {
		log.Printf("user service stopped: %v", err)
	}
}
