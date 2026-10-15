package main

import (
	"context"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/mesewo/slack-clone/services/contracts/storagepb"
	"github.com/mesewo/slack-clone/services/database"
	"github.com/mesewo/slack-clone/services/storage/internal/server"
	"github.com/mesewo/slack-clone/services/telemetry"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"google.golang.org/grpc"
)

func main() {
	telemetry.SetDefault(telemetry.NewLogger("storage-service"))
	defer telemetry.L.Sync()
	_ = godotenv.Load(".env", "../../.env", "apps/api/.env")

	address := os.Getenv("STORAGE_GRPC_ADDR")
	if address == "" {
		address = ":9094"
	}
	metricsAddr := os.Getenv("STORAGE_METRICS_ADDR")
	if metricsAddr == "" {
		metricsAddr = ":9194"
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
	pool, err := pgxpool.New(context.Background(), databaseURL)
	if err != nil {
		telemetry.L.Sugar().Fatalf("create database pool: %v", err)
	}
	defer pool.Close()

	store, presignStore, bucket := newStore()
	listener, err := net.Listen("tcp", address)
	if err != nil {
		telemetry.L.Sugar().Fatalf("listen on %s: %v", address, err)
	}
	grpcServer := grpc.NewServer(grpc.ChainUnaryInterceptor(telemetry.UnaryServerInterceptor("storage-service")))
	storagepb.RegisterStorageServiceServer(grpcServer, server.NewWithPresignStore(database.New(pool), store, presignStore, bucket))
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
	telemetry.L.Sugar().Infof("storage service listening on %s", address)
	if err := grpcServer.Serve(listener); err != nil {
		telemetry.L.Sugar().Errorf("storage service stopped: %v", err)
	}
}

func newStore() (*minio.Client, *minio.Client, string) {
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
	creds := credentials.NewStaticV4(accessKey, secretKey, "")
	store, err := minio.New(endpoint, &minio.Options{Creds: creds, Secure: useSSL})
	if err != nil {
		telemetry.L.Sugar().Fatalf("create MinIO client: %v", err)
	}
	presignStore := store
	if publicEndpoint := os.Getenv("S3_PUBLIC_ENDPOINT"); publicEndpoint != "" && publicEndpoint != endpoint {
		publicUseSSL := useSSL
		if configuredSSL := os.Getenv("S3_PUBLIC_USE_SSL"); configuredSSL != "" {
			publicUseSSL, err = strconv.ParseBool(configuredSSL)
			if err != nil {
				telemetry.L.Sugar().Fatalf("parse S3_PUBLIC_USE_SSL: %v", err)
			}
		}
		presignStore, err = minio.New(publicEndpoint, &minio.Options{Creds: creds, Secure: publicUseSSL})
		if err != nil {
			telemetry.L.Sugar().Fatalf("create public MinIO URL signer: %v", err)
		}
	}
	return store, presignStore, bucket
}
