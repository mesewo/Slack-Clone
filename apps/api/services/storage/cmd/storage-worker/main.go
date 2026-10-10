package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mesewo/slack-clone/services/database"
	"github.com/mesewo/slack-clone/services/storage/internal/thumbnail"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is not set")
	}
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		log.Fatalf("create database pool: %v", err)
	}
	defer pool.Close()
	store, bucket := newStore()
	queries := database.New(pool)
	worker := thumbnail.NewThumbnailWorker(queries, store, bucket, 64, 2)
	worker.Start(ctx)
	if err := worker.RequeueStale(ctx); err != nil {
		log.Printf("warning: failed to requeue stale thumbnail jobs: %v", err)
	}
	if err := worker.RequeueDue(ctx); err != nil {
		log.Printf("warning: failed to process due thumbnail retries: %v", err)
	}
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	log.Println("storage worker started")
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := worker.RequeueDue(ctx); err != nil {
				log.Printf("warning: failed to process due thumbnail retries: %v", err)
			}
		}
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
