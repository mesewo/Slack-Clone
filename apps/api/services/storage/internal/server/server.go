package server

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/mesewo/slack-clone/services/contracts/storagepb"
	"github.com/mesewo/slack-clone/services/database"
	"github.com/minio/minio-go/v7"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

const maxUploadSize = 100 << 20

type Server struct {
	storagepb.UnimplementedStorageServiceServer
	queries *database.Queries
	store   *minio.Client
	bucket  string
}

func New(queries *database.Queries, store *minio.Client, bucket string) *Server {
	return &Server{queries: queries, store: store, bucket: bucket}
}

func (s *Server) PresignUpload(ctx context.Context, request *storagepb.PresignUploadRequest) (*storagepb.PresignUploadResponse, error) {
	userID, err := parseUserID(request.GetUserId())
	if err != nil {
		return nil, err
	}
	filename, contentType, size, err := validatePresignRequest(request.GetFilename(), request.GetContentType(), request.GetSizeBytes())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}
	sessionID := uuid.New()
	key := safeUploadKey(userID.String(), filename)
	expiresAt := time.Now().Add(15 * time.Minute)
	now := time.Now()
	session := database.UploadSession{
		ID: sessionID, UserID: userID, ObjectKey: key, OriginalFilename: filename,
		ContentType: contentType, DeclaredSize: size, Status: "PENDING",
		ExpiresAt: expiresAt, CreatedAt: now, UpdatedAt: now,
	}
	if _, err := s.queries.CreateUploadSession(ctx, session); err != nil {
		return nil, status.Error(codes.Internal, "failed to create upload session")
	}
	uploadURL, err := s.store.PresignedPutObject(ctx, s.bucket, key, 15*time.Minute)
	if err != nil {
		_ = s.queries.UpdateUploadSessionStatus(ctx, sessionID, "FAILED", nil, 0)
		return nil, status.Error(codes.Internal, "failed to generate upload URL")
	}
	return &storagepb.PresignUploadResponse{
		Id: sessionID.String(), SessionId: sessionID.String(), ObjectKey: key,
		Filename: filename, ContentType: contentType, SizeBytes: size,
		UploadUrl: uploadURL.String(), Expiry: timestamppb.New(expiresAt), ExpiresAt: timestamppb.New(expiresAt),
	}, nil
}

func (s *Server) CompleteUpload(ctx context.Context, request *storagepb.CompleteUploadRequest) (*storagepb.CompleteUploadResponse, error) {
	userID, err := parseUserID(request.GetUserId())
	if err != nil {
		return nil, err
	}
	if request.GetSessionId() == "" {
		return nil, status.Error(codes.InvalidArgument, "session_id is required")
	}
	sessionID, err := uuid.Parse(request.GetSessionId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, "invalid session_id")
	}
	session, err := s.queries.GetUploadSessionByID(ctx, sessionID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, status.Error(codes.NotFound, "upload session not found")
		}
		return nil, status.Error(codes.NotFound, "upload session not found")
	}
	if session.UserID != userID {
		return nil, status.Error(codes.PermissionDenied, "upload session does not belong to this user")
	}
	if time.Now().After(session.ExpiresAt) {
		_ = s.queries.UpdateUploadSessionStatus(ctx, sessionID, "EXPIRED", nil, session.AttemptCount)
		return nil, status.Error(codes.FailedPrecondition, "upload session expired")
	}
	if session.Status == "READY" && session.ConfirmedAt != nil {
		attachment, attachmentErr := s.queries.GetAttachmentByStoragePath(ctx, userID, session.ObjectKey)
		if attachmentErr == nil {
			return completeResponse(attachment.ID, attachment.Filename, attachment.ContentType, attachment.SizeBytes), nil
		}
	}
	info, err := s.store.StatObject(ctx, s.bucket, session.ObjectKey, minio.StatObjectOptions{})
	if err != nil {
		_ = s.queries.UpdateUploadSessionStatus(ctx, sessionID, "FAILED", nil, session.AttemptCount)
		return nil, status.Error(codes.NotFound, "uploaded object was not found")
	}
	if info.Size != session.DeclaredSize {
		_ = s.queries.UpdateUploadSessionStatus(ctx, sessionID, "FAILED", nil, session.AttemptCount)
		return nil, status.Error(codes.InvalidArgument, "uploaded file size does not match session metadata")
	}
	if !allowedType(session.ContentType) {
		_ = s.queries.UpdateUploadSessionStatus(ctx, sessionID, "FAILED", nil, session.AttemptCount)
		return nil, status.Error(codes.InvalidArgument, "unsupported file type")
	}
	if info.ContentType != "" && info.ContentType != session.ContentType && info.ContentType != "application/octet-stream" {
		_ = s.queries.UpdateUploadSessionStatus(ctx, sessionID, "FAILED", nil, session.AttemptCount)
		return nil, status.Error(codes.InvalidArgument, "uploaded object metadata does not match the session")
	}
	now := time.Now()
	if err := s.queries.UpdateUploadSessionStatus(ctx, sessionID, "UPLOADED", &now, session.AttemptCount); err != nil {
		return nil, status.Error(codes.Internal, "failed to update upload session")
	}
	attachment, err := s.queries.GetAttachmentByStoragePath(ctx, userID, session.ObjectKey)
	if err == nil && attachment.ID != uuid.Nil {
		return completeResponse(attachment.ID, attachment.Filename, attachment.ContentType, attachment.SizeBytes), nil
	}
	id := uuid.New()
	attachment, err = s.queries.CreateAttachment(ctx, database.CreateAttachmentParams{
		ID: id, UserID: userID, Filename: session.OriginalFilename,
		ContentType: session.ContentType, SizeBytes: info.Size, StoragePath: session.ObjectKey, Column7: "",
	})
	if err != nil {
		_ = s.queries.UpdateUploadSessionStatus(ctx, sessionID, "FAILED", nil, session.AttemptCount)
		return nil, status.Error(codes.Internal, "failed to save attachment metadata")
	}
	if err := s.queries.UpdateUploadSessionStatus(ctx, sessionID, "UPLOADED", &now, session.AttemptCount); err != nil {
		_ = s.queries.UpdateUploadSessionStatus(ctx, sessionID, "FAILED", nil, session.AttemptCount)
		return nil, status.Error(codes.Internal, "failed to finalize upload session")
	}
	if strings.HasPrefix(session.ContentType, "image/") {
		// Persist the due time as the durable thumbnail queue. The independent
		// worker discovers it through DueThumbnailRetries after this RPC returns.
		if err := s.queries.UpdateUploadSessionStatus(ctx, sessionID, "UPLOADED", &now, session.AttemptCount, &now); err != nil {
			// The upload is complete; retain the API's prior best-effort enqueue behavior.
			log.Printf("storage service: enqueue thumbnail job failed for %s: %v", sessionID, err)
		}
	}
	return completeResponse(attachment.ID, attachment.Filename, attachment.ContentType, attachment.SizeBytes), nil
}

func completeResponse(id uuid.UUID, filename, contentType string, size int64) *storagepb.CompleteUploadResponse {
	return &storagepb.CompleteUploadResponse{Id: id.String(), Filename: filename, ContentType: contentType, SizeBytes: size}
}

func parseUserID(value string) (uuid.UUID, error) {
	userID, err := uuid.Parse(value)
	if err != nil {
		return uuid.Nil, status.Error(codes.InvalidArgument, "invalid user")
	}
	return userID, nil
}

func validatePresignRequest(filename, contentType string, size int64) (string, string, int64, error) {
	filename = strings.TrimSpace(filename)
	if filename == "" {
		return "", "", 0, fmt.Errorf("file is required")
	}
	filename = filepath.Base(filename)
	if filename == "" || filename == "." || filename == "/" {
		return "", "", 0, fmt.Errorf("invalid filename")
	}
	if size <= 0 || size > maxUploadSize {
		return "", "", 0, fmt.Errorf("file size is invalid")
	}
	contentType = strings.TrimSpace(contentType)
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	if !allowedType(contentType) {
		return "", "", 0, fmt.Errorf("unsupported file type")
	}
	return filename, contentType, size, nil
}

func safeUploadKey(userID, filename string) string {
	base := strings.TrimSpace(filepath.Base(filename))
	if base == "" || base == "." || base == "/" {
		base = "upload.bin"
	}
	base = strings.TrimSuffix(base, ".")
	base = strings.ReplaceAll(base, "..", "_")
	base = strings.ReplaceAll(base, "/", "_")
	base = strings.ReplaceAll(base, "\\", "_")
	if base == "" {
		base = "upload.bin"
	}
	keyToken := make([]byte, 12)
	if _, err := rand.Read(keyToken); err == nil {
		return userID + "/" + hex.EncodeToString(keyToken) + "/" + base
	}
	return userID + "/upload/" + base
}

func allowedType(contentType string) bool {
	return contentType == "application/pdf" || contentType == "text/plain" || contentType == "application/octet-stream" || strings.HasPrefix(contentType, "image/") || strings.HasPrefix(contentType, "video/")
}
