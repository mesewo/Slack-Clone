package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/mesewo/slack-clone/services/database"
	"github.com/mesewo/slack-clone/services/storage/internal/thumbnail"
	"github.com/mesewo/slack-clone/services/telemetry"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	workerRequeueErrors = promauto.NewCounter(prometheus.CounterOpts{
		Name: "storage_worker_requeue_errors_total",
		Help: "Total number of failed thumbnail requeue passes.",
	})
	workerRequeueSuccesses = promauto.NewCounter(prometheus.CounterOpts{
		Name: "storage_worker_requeue_success_total",
		Help: "Total number of successful thumbnail requeue passes.",
	})
)

func main() {
	telemetry.SetDefault(telemetry.NewLogger("storage-worker"))
	defer telemetry.L.Sync()
	_ = godotenv.Load(".env", "../../.env", "apps/api/.env")

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	metricsAddr := os.Getenv("STORAGE_WORKER_METRICS_ADDR")
	if metricsAddr == "" {
		metricsAddr = ":9195"
	}
	metricsServer := telemetry.ServeMetricsOnly(metricsAddr)
	go func() {
		if err := metricsServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			telemetry.L.Sugar().Errorf("metrics server failed: %v", err)
		}
	}()
	defer func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := metricsServer.Shutdown(shutdownCtx); err != nil {
			telemetry.L.Sugar().Errorf("metrics server shutdown failed: %v", err)
		}
	}()
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		telemetry.L.Sugar().Fatal("DATABASE_URL is not set")
	}
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		telemetry.L.Sugar().Fatalf("create database pool: %v", err)
	}
	defer pool.Close()
	store, bucket := newStore()
	queries := database.New(pool)
	worker := thumbnail.NewThumbnailWorker(queries, store, bucket, 64, 2)
	worker.Start(ctx)
	if err := worker.RequeueStale(ctx); err != nil {
		workerRequeueErrors.Inc()
		telemetry.L.Sugar().Errorf("failed to requeue stale thumbnail jobs: %v", err)
	} else {
		workerRequeueSuccesses.Inc()
	}
	if err := worker.RequeueDue(ctx); err != nil {
		workerRequeueErrors.Inc()
		telemetry.L.Sugar().Errorf("failed to process due thumbnail retries: %v", err)
	} else {
		workerRequeueSuccesses.Inc()
	}
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	telemetry.L.Sugar().Info("storage worker started")
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := worker.RequeueDue(ctx); err != nil {
				workerRequeueErrors.Inc()
				telemetry.L.Sugar().Errorf("failed to process due thumbnail retries: %v", err)
			} else {
				workerRequeueSuccesses.Inc()
			}
		}
	}
}

func newStore() (*minio.Client, string) {
	endpoint := os.Getenv("S3_ENDPOINT")
	if endpoint == "" {
		endpoint = "127.0.0.1:9000"
	}
	endpoint = strings.TrimPrefix(strings.TrimPrefix(endpoint, "https://"), "http://")
	accessKey := os.Getenv("S3_ACCESS_KEY")
	secretKey := os.Getenv("S3_SECRET_KEY")
	useSSL, _ := strconv.ParseBool(os.Getenv("S3_USE_SSL"))
	region := os.Getenv("S3_REGION")
	bucket := os.Getenv("S3_BUCKET")
	if bucket == "" {
		bucket = "slack-uploads"
	}
	store, err := minio.New(endpoint, &minio.Options{Creds: credentials.NewStaticV4(accessKey, secretKey, ""), Secure: useSSL, Region: region})
	if err != nil {
		telemetry.L.Sugar().Fatalf("create MinIO client: %v", err)
	}
	return store, bucket
}
