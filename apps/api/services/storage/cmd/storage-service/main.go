package main

import (
	"context"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
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
	endpoint := strings.TrimSpace(os.Getenv("S3_ENDPOINT"))
	if endpoint == "" {
		endpoint = "127.0.0.1:9000"
	}
	endpointUsesTLS := strings.HasPrefix(strings.ToLower(endpoint), "https://") || strings.Contains(strings.ToLower(endpoint), "backblazeb2.com")
	sanitizeS3 := func(val string) string {
		val = strings.TrimSpace(val)
		val = strings.Trim(val, `"'`)
		val = strings.Trim(val, `/`)
		fields := strings.Fields(val)
		if len(fields) > 0 {
			val = fields[0]
		}
		val = strings.Trim(val, `"'`)
		val = strings.Trim(val, `/`)
		return strings.TrimSpace(val)
	}
	endpoint = sanitizeS3(endpoint)
	endpoint = strings.TrimPrefix(strings.TrimPrefix(endpoint, "https://"), "http://")
	endpoint = strings.Trim(endpoint, "/")
	accessKey := sanitizeS3(os.Getenv("S3_ACCESS_KEY"))
	secretKey := sanitizeS3(os.Getenv("S3_SECRET_KEY"))
	useSSL, _ := strconv.ParseBool(sanitizeS3(os.Getenv("S3_USE_SSL")))
	// Backblaze's S3 API is HTTPS-only. Infer TLS from its endpoint so a missing
	// S3_USE_SSL setting cannot generate unusable HTTP presigned URLs.
	useSSL = useSSL || endpointUsesTLS
	region := sanitizeS3(os.Getenv("S3_REGION"))
	if strings.Contains(region, "backblazeb2.com") {
		parts := strings.Split(region, ".")
		for _, p := range parts {
			if strings.HasPrefix(p, "us-") || strings.HasPrefix(p, "eu-") {
				region = p
				break
			}
		}
	}
	if region == "" && strings.Contains(endpoint, "backblazeb2.com") {
		parts := strings.Split(endpoint, ".")
		for _, p := range parts {
			if strings.HasPrefix(p, "us-") || strings.HasPrefix(p, "eu-") {
				region = p
				break
			}
		}
	}
	bucket := sanitizeS3(os.Getenv("S3_BUCKET"))
	if bucket == "" {
		bucket = "slack-uploads"
	}
	creds := credentials.NewStaticV4(accessKey, secretKey, "")
	store, err := minio.New(endpoint, &minio.Options{Creds: creds, Secure: useSSL, Region: region})
	if err != nil {
		telemetry.L.Sugar().Fatalf("create MinIO client: %v", err)
	}
	presignStore := store
	if publicEndpoint := strings.TrimSpace(os.Getenv("S3_PUBLIC_ENDPOINT")); publicEndpoint != "" && publicEndpoint != endpoint {
		publicEndpointUsesTLS := strings.HasPrefix(strings.ToLower(publicEndpoint), "https://") || strings.Contains(strings.ToLower(publicEndpoint), "backblazeb2.com")
		publicEndpoint = strings.TrimPrefix(strings.TrimPrefix(publicEndpoint, "https://"), "http://")
		publicUseSSL := useSSL || publicEndpointUsesTLS
		if configuredSSL := os.Getenv("S3_PUBLIC_USE_SSL"); configuredSSL != "" {
			publicUseSSL, err = strconv.ParseBool(configuredSSL)
			if err != nil {
				telemetry.L.Sugar().Fatalf("parse S3_PUBLIC_USE_SSL: %v", err)
			}
		}
		publicUseSSL = publicUseSSL || publicEndpointUsesTLS
		presignStore, err = minio.New(publicEndpoint, &minio.Options{Creds: creds, Secure: publicUseSSL, Region: region})
		if err != nil {
			telemetry.L.Sugar().Fatalf("create public MinIO URL signer: %v", err)
		}
	}
	return store, presignStore, bucket
}
