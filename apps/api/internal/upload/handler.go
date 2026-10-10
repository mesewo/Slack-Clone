package upload

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/mesewo/slack-clone/apps/api/internal/auth"
	"github.com/mesewo/slack-clone/services/contracts/storagepb"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type Response struct {
	ID          uuid.UUID `json:"id"`
	Filename    string    `json:"filename"`
	ContentType string    `json:"content_type"`
	SizeBytes   int64     `json:"size_bytes"`
	URL         string    `json:"url"`
}

type PresignRequest struct {
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	SizeBytes   int64  `json:"size_bytes"`
}

type PresignResponse struct {
	ID          string    `json:"id"`
	SessionID   string    `json:"session_id"`
	ObjectKey   string    `json:"object_key,omitempty"`
	Filename    string    `json:"filename"`
	ContentType string    `json:"content_type"`
	SizeBytes   int64     `json:"size_bytes"`
	UploadURL   string    `json:"upload_url"`
	Expiry      time.Time `json:"expiry"`
	ExpiresAt   time.Time `json:"expires_at"`
}

type CompleteUploadRequest struct {
	SessionID   string `json:"session_id,omitempty"`
	Key         string `json:"key,omitempty"`
	Filename    string `json:"filename,omitempty"`
	ContentType string `json:"content_type,omitempty"`
	SizeBytes   int64  `json:"size_bytes,omitempty"`
}

func (h *Handler) CreatePresignedUpload(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(auth.UserContextKey).(*auth.Claims)
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	userID, err := uuid.Parse(claims.UserID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "invalid user")
		return
	}
	var req PresignRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid upload request")
		return
	}
	response, err := h.Storage.PresignUpload(r.Context(), &storagepb.PresignUploadRequest{
		UserId: userID.String(), Filename: req.Filename, ContentType: req.ContentType, SizeBytes: req.SizeBytes,
	})
	if err != nil {
		writeStorageRPCError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(PresignResponse{
		ID: response.GetId(), SessionID: response.GetSessionId(), ObjectKey: response.GetObjectKey(),
		Filename: response.GetFilename(), ContentType: response.GetContentType(), SizeBytes: response.GetSizeBytes(),
		UploadURL: response.GetUploadUrl(), Expiry: response.GetExpiry().AsTime(), ExpiresAt: response.GetExpiresAt().AsTime(),
	})
}

func (h *Handler) CompletePresignedUpload(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(auth.UserContextKey).(*auth.Claims)
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	userID, err := uuid.Parse(claims.UserID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "invalid user")
		return
	}
	var req CompleteUploadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid upload completion")
		return
	}
	response, err := h.Storage.CompleteUpload(r.Context(), &storagepb.CompleteUploadRequest{
		UserId: userID.String(), SessionId: req.SessionID, Key: req.Key, Filename: req.Filename,
		ContentType: req.ContentType, SizeBytes: req.SizeBytes,
	})
	if err != nil {
		writeStorageRPCError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(Response{
		ID: uuid.MustParse(response.GetId()), Filename: response.GetFilename(), ContentType: response.GetContentType(),
		SizeBytes: response.GetSizeBytes(), URL: h.BaseURL + "/api/uploads/" + response.GetId(),
	})
}

func writeStorageRPCError(w http.ResponseWriter, err error) {
	message := status.Convert(err).Message()
	statusCode := http.StatusInternalServerError
	switch status.Code(err) {
	case codes.InvalidArgument:
		statusCode = http.StatusBadRequest
		if message == "unsupported file type" {
			statusCode = http.StatusUnsupportedMediaType
		}
	case codes.PermissionDenied:
		statusCode = http.StatusForbidden
	case codes.NotFound:
		statusCode = http.StatusNotFound
	case codes.FailedPrecondition:
		statusCode = http.StatusGone
	case codes.Unavailable, codes.DeadlineExceeded:
		statusCode = http.StatusServiceUnavailable
	}
	writeError(w, statusCode, message)
}

func writeError(w http.ResponseWriter, statusCode int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}
