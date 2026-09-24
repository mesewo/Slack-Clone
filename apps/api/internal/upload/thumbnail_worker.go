package upload

import (
	"bytes"
	"context"
	"io"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/mesewo/slack-clone/apps/api/internal/database"
	"github.com/minio/minio-go/v7"
)

type ThumbnailJob struct {
	SessionID  uuid.UUID
	ObjectKey  string
	ContentType string
	Attempt    int
}

type ThumbnailWorker struct {
	Queries *database.Queries
	Store   *minio.Client
	Bucket  string
	queue   chan ThumbnailJob
	workers int
}

func NewThumbnailWorker(queries *database.Queries, store *minio.Client, bucket string, queueSize, workers int) *ThumbnailWorker {
	if queueSize <= 0 {
		queueSize = 32
	}
	if workers <= 0 {
		workers = 1
	}
	return &ThumbnailWorker{
		Queries: queries,
		Store:   store,
		Bucket:  bucket,
		queue:   make(chan ThumbnailJob, queueSize),
		workers: workers,
	}
}

func (w *ThumbnailWorker) Enqueue(ctx context.Context, sessionID uuid.UUID, objectKey, contentType string) error {
	if w == nil || w.queue == nil {
		return nil
	}
	select {
	case <-ctx.Done():
		return ctx.Err()
	case w.queue <- ThumbnailJob{SessionID: sessionID, ObjectKey: objectKey, ContentType: contentType, Attempt: 0}:
		return nil
	}
}

func (w *ThumbnailWorker) Start(ctx context.Context) {
	if w == nil {
		return
	}
	for i := 0; i < w.workers; i++ {
		go func() {
			for {
				select {
				case <-ctx.Done():
					return
				case job := <-w.queue:
					if err := w.process(ctx, job); err != nil {
						log.Printf("thumbnail worker: failed session=%s: %v", job.SessionID, err)
					}
				}
			}
		}()
	}
}

func (w *ThumbnailWorker) RequeueStale(ctx context.Context) error {
	if w == nil || w.Queries == nil {
		return nil
	}
	staleBefore := time.Now().Add(-5 * time.Minute)
	sessions, err := w.Queries.RequeueUploadSessions(ctx, []string{"UPLOADED", "PROCESSING", "FAILED"}, staleBefore)
	if err != nil {
		return err
	}
	for _, session := range sessions {
		if session.Status == "FAILED" && session.AttemptCount >= 3 {
			continue
		}
		if !strings.HasPrefix(session.ContentType, "image/") {
			if err := w.Queries.UpdateUploadSessionStatus(ctx, session.ID, "READY", nil, session.AttemptCount, nil); err != nil {
				log.Printf("thumbnail requeue: failed to finalize non-image session %s: %v", session.ID, err)
			}
			continue
		}
		if err := w.Queries.UpdateUploadSessionStatus(ctx, session.ID, "PROCESSING", nil, session.AttemptCount, nil); err != nil {
			log.Printf("thumbnail requeue: failed to restore processing state for %s: %v", session.ID, err)
			continue
		}
		if err := w.Enqueue(ctx, session.ID, session.ObjectKey, session.ContentType); err != nil {
			log.Printf("thumbnail requeue: enqueue failed for %s: %v", session.ID, err)
		}
	}
	return nil
}

func (w *ThumbnailWorker) RequeueDue(ctx context.Context) error {
	if w == nil || w.Queries == nil {
		return nil
	}
	sessions, err := w.Queries.DueThumbnailRetries(ctx, time.Now())
	if err != nil {
		return err
	}
	for _, session := range sessions {
		if session.Status == "FAILED" && session.AttemptCount >= 3 {
			continue
		}
		if err := w.Queries.UpdateUploadSessionStatus(ctx, session.ID, "PROCESSING", nil, session.AttemptCount, nil); err != nil {
			log.Printf("thumbnail scheduler: failed to resume %s: %v", session.ID, err)
			continue
		}
		if err := w.Enqueue(ctx, session.ID, session.ObjectKey, session.ContentType); err != nil {
			log.Printf("thumbnail scheduler: enqueue failed for %s: %v", session.ID, err)
		}
	}
	return nil
}

func (w *ThumbnailWorker) process(ctx context.Context, job ThumbnailJob) error {
	if w == nil || w.Queries == nil || w.Store == nil {
		return nil
	}
	session, err := w.Queries.GetUploadSessionByID(ctx, job.SessionID)
	if err != nil {
		return err
	}
	if !strings.HasPrefix(session.ContentType, "image/") {
		now := time.Now()
		return w.Queries.UpdateUploadSessionStatus(ctx, session.ID, "READY", &now, session.AttemptCount, nil)
	}
	attempt := session.AttemptCount + 1
	if err := w.Queries.UpdateUploadSessionStatus(ctx, session.ID, "PROCESSING", nil, attempt, nil); err != nil {
		return err
	}
	object, err := w.Store.GetObject(ctx, w.Bucket, session.ObjectKey, minio.GetObjectOptions{})
	if err != nil {
		return w.handleResult(ctx, session, false, attempt)
	}
	defer object.Close()
	data, err := io.ReadAll(object)
	if err != nil {
		return w.handleResult(ctx, session, false, attempt)
	}
	thumbnail, err := makeThumbnail(data)
	if err != nil || len(thumbnail) == 0 {
		return w.handleResult(ctx, session, false, attempt)
	}
	thumbnailPath := session.ObjectKey + ".thumbnail.jpg"
	if _, err := w.Store.PutObject(ctx, w.Bucket, thumbnailPath, bytes.NewReader(thumbnail), int64(len(thumbnail)), minio.PutObjectOptions{ContentType: "image/jpeg"}); err != nil {
		return w.handleResult(ctx, session, false, attempt)
	}
	if err := w.Queries.UpdateAttachmentThumbnailByStoragePath(ctx, session.ObjectKey, session.UserID, thumbnailPath); err != nil {
		log.Printf("thumbnail worker: failed to persist thumbnail path for %s: %v", session.ID, err)
	}
	return w.handleResult(ctx, session, true, attempt)
}

func (w *ThumbnailWorker) handleResult(ctx context.Context, session database.UploadSession, succeeded bool, attempts int32) error {
	next, retry := thumbnailResultState(session.Status, int(attempts), succeeded)
	if next == "READY" {
		now := time.Now()
		return w.Queries.UpdateUploadSessionStatus(ctx, session.ID, "READY", &now, attempts, nil)
	}
	if next == "FAILED" {
		now := time.Now()
		return w.Queries.UpdateUploadSessionStatus(ctx, session.ID, "FAILED", &now, attempts, nil)
	}
	if retry {
		return w.requeueRetry(ctx, session, attempts)
	}
	return nil
}

func (w *ThumbnailWorker) requeueRetry(ctx context.Context, session database.UploadSession, attempts int32) error {
	if attempts >= 3 {
		return w.Queries.UpdateUploadSessionStatus(ctx, session.ID, "FAILED", nil, attempts, nil)
	}
	backoff := time.Duration(attempts+1) * 2 * time.Second
	next := time.Now().Add(backoff)
	if err := w.Queries.UpdateUploadSessionStatus(ctx, session.ID, "PROCESSING", nil, attempts, &next); err != nil {
		return err
	}
	return nil
}

func thumbnailResultState(current string, attempts int, success bool) (string, bool) {
	if success {
		return "READY", false
	}
	if attempts >= 3 {
		return "FAILED", false
	}
	if current == "UPLOADED" || current == "PROCESSING" || current == "FAILED" {
		return "PROCESSING", true
	}
	return "PROCESSING", true
}

