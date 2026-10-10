package main

import (
	"context"
	"log"
	"net"
	"os"
	"os/signal"
	"strconv"
	"syscall"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/mesewo/slack-clone/services/contracts/storagepb"
	"github.com/mesewo/slack-clone/services/database"
	"github.com/mesewo/slack-clone/services/storage/internal/server"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"google.golang.org/grpc"
)

func main() {
	_ = godotenv.Load(".env", "../../.env", "apps/api/.env")

	address := os.Getenv("STORAGE_GRPC_ADDR")
	if address == "" {
		address = ":9094"
	}
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is not set")
	}
	pool, err := pgxpool.New(context.Background(), databaseURL)
	if err != nil {
		log.Fatalf("create database pool: %v", err)
	}
	defer pool.Close()

	store, bucket := newStore()
	listener, err := net.Listen("tcp", address)
	if err != nil {
		log.Fatalf("listen on %s: %v", address, err)
	}
	grpcServer := grpc.NewServer()
	storagepb.RegisterStorageServiceServer(grpcServer, server.New(database.New(pool), store, bucket))
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-stop
		grpcServer.GracefulStop()
	}()
	log.Printf("storage service listening on %s", address)
	if err := grpcServer.Serve(listener); err != nil {
		log.Printf("storage service stopped: %v", err)
	}
}

func newStore() (*minio.Client, string) {
	endpoint := os.Getenv("S3_ENDPOINT")
	if endpoint == "" {
		endpoint = "127.0.0.1:9000"
	}
	accessKey := os.Getenv("S3_ACCESS_KEY")
	secretKey := os.Getenv("S3_SECRET_KEY")
	useSSL, _ := strconv.ParseBool(os.Getenv("S3_USE_SSL"))
	bucket := os.Getenv("S3_BUCKET")
	if bucket == "" {
		bucket = "slack-uploads"
	}
	store, err := minio.New(endpoint, &minio.Options{Creds: credentials.NewStaticV4(accessKey, secretKey, ""), Secure: useSSL})
	if err != nil {
		log.Fatalf("create MinIO client: %v", err)
	}
	return store, bucket
}
