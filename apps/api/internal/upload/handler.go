package upload

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"image"
	_ "image/gif"
	"image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/mesewo/slack-clone/apps/api/internal/auth"
	"github.com/mesewo/slack-clone/apps/api/internal/database"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"golang.org/x/image/draw"
)

const maxUploadSize = 100 << 20 // 100MB

type Handler struct {
	Queries *database.Queries
	Store   *minio.Client
	Bucket  string
	BaseURL string
}

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
	Key         string    `json:"key"`
	Filename    string    `json:"filename"`
	ContentType string    `json:"content_type"`
	SizeBytes   int64     `json:"size_bytes"`
	UploadURL   string    `json:"upload_url"`
	ExpiresAt   time.Time `json:"expires_at"`
}

type CompleteUploadRequest struct {
	SessionID   string `json:"session_id,omitempty"`
	Key         string `json:"key"`
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	SizeBytes   int64  `json:"size_bytes"`
}

func NewStore(endpoint, accessKey, secretKey string, useSSL bool) (*minio.Client, error) {
	return minio.New(endpoint, &minio.Options{Creds: credentials.NewStaticV4(accessKey, secretKey, ""), Secure: useSSL})
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
	if req.Filename == "" {
		writeError(w, http.StatusBadRequest, "file is required")
		return
	}
	contentType := req.ContentType
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	if req.SizeBytes <= 0 || req.SizeBytes > maxUploadSize {
		writeError(w, http.StatusBadRequest, "file size is invalid")
		return
	}
	if !allowedType(contentType) {
		writeError(w, http.StatusUnsupportedMediaType, "unsupported file type")
		return
	}
	key := safeUploadKey(userID.String(), req.Filename)
	sessionID := uuid.New().String()
	expiresAt := time.Now().Add(15 * time.Minute)
	uploadURL, err := h.Store.PresignedPutObject(r.Context(), h.Bucket, key, 15*time.Minute)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to generate upload URL")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(PresignResponse{
		ID:          sessionID,
		Key:         key,
		Filename:    filepath.Base(req.Filename),
		ContentType: contentType,
		SizeBytes:   req.SizeBytes,
		UploadURL:   uploadURL.String(),
		ExpiresAt:   expiresAt,
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
	if req.Key == "" || req.Filename == "" {
		writeError(w, http.StatusBadRequest, "upload key and filename are required")
		return
	}
	contentType := req.ContentType
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	if !allowedType(contentType) {
		writeError(w, http.StatusUnsupportedMediaType, "unsupported file type")
		return
	}
	info, err := h.Store.StatObject(r.Context(), h.Bucket, req.Key, minio.StatObjectOptions{})
	if err != nil {
		writeError(w, http.StatusNotFound, "uploaded object was not found")
		return
	}
	if req.SizeBytes > 0 && info.Size != req.SizeBytes {
		writeError(w, http.StatusBadRequest, "uploaded file size does not match metadata")
		return
	}
	id := uuid.New()
	thumbnailPath := ""
	if strings.HasPrefix(contentType, "image/") {
		if object, objErr := h.Store.GetObject(r.Context(), h.Bucket, req.Key, minio.GetObjectOptions{}); objErr == nil {
			defer object.Close()
			data, readErr := io.ReadAll(object)
			if readErr == nil {
				if thumbnail, thumbnailErr := makeThumbnail(data); thumbnailErr == nil {
					thumbnailPath = req.Key + ".thumbnail.jpg"
					if _, putErr := h.Store.PutObject(r.Context(), h.Bucket, thumbnailPath, bytes.NewReader(thumbnail), int64(len(thumbnail)), minio.PutObjectOptions{ContentType: "image/jpeg"}); putErr != nil {
						thumbnailPath = ""
					}
				}
			}
		}
	}
	if _, err := h.Queries.CreateAttachment(r.Context(), database.CreateAttachmentParams{ID: id, UserID: userID, Filename: filepath.Base(req.Filename), ContentType: contentType, SizeBytes: info.Size, StoragePath: req.Key, Column7: thumbnailPath}); err != nil {
		if thumbnailPath != "" {
			_ = h.Store.RemoveObject(r.Context(), h.Bucket, thumbnailPath, minio.RemoveObjectOptions{})
		}
		writeError(w, http.StatusInternalServerError, "failed to save attachment metadata")
		return
	}
	response := Response{ID: id, Filename: filepath.Base(req.Filename), ContentType: contentType, SizeBytes: info.Size, URL: h.BaseURL + "/api/uploads/" + id.String()}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(response)
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
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
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)
	if err := r.ParseMultipartForm(maxUploadSize); err != nil {
		writeError(w, http.StatusBadRequest, "file exceeds 100MB limit or is invalid")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "file is required")
		return
	}
	defer file.Close()
	if header.Size <= 0 {
		writeError(w, http.StatusBadRequest, "file is empty")
		return
	}
	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	if !allowedType(contentType) {
		writeError(w, http.StatusUnsupportedMediaType, "unsupported file type")
		return
	}
	data, err := io.ReadAll(file)
	if err != nil {
		writeError(w, http.StatusBadRequest, "failed to read file")
		return
	}
	token := make([]byte, 8)
	_, _ = rand.Read(token)
	key := userID.String() + "/" + hex.EncodeToString(token) + filepath.Ext(filepath.Base(header.Filename))
	if _, err := h.Store.PutObject(r.Context(), h.Bucket, key, bytes.NewReader(data), int64(len(data)), minio.PutObjectOptions{ContentType: contentType}); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to store file")
		return
	}
	id := uuid.New()
	thumbnailPath := ""
	if strings.HasPrefix(contentType, "image/") {
		thumbnail, thumbnailErr := makeThumbnail(data)
		if thumbnailErr == nil {
			thumbnailPath = key + ".thumbnail.jpg"
			if _, putErr := h.Store.PutObject(r.Context(), h.Bucket, thumbnailPath, bytes.NewReader(thumbnail), int64(len(thumbnail)), minio.PutObjectOptions{ContentType: "image/jpeg"}); putErr != nil {
				thumbnailPath = ""
			}
		}
	}
	if _, err := h.Queries.CreateAttachment(r.Context(), database.CreateAttachmentParams{ID: id, UserID: userID, Filename: filepath.Base(header.Filename), ContentType: contentType, SizeBytes: int64(len(data)), StoragePath: key, Column7: thumbnailPath}); err != nil {
		_ = h.Store.RemoveObject(r.Context(), h.Bucket, key, minio.RemoveObjectOptions{})
		if thumbnailPath != "" {
			_ = h.Store.RemoveObject(r.Context(), h.Bucket, thumbnailPath, minio.RemoveObjectOptions{})
		}
		writeError(w, http.StatusInternalServerError, "failed to save attachment metadata")
		return
	}
	response := Response{ID: id, Filename: filepath.Base(header.Filename), ContentType: contentType, SizeBytes: int64(len(data)), URL: h.BaseURL + "/api/uploads/" + id.String()}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(response)
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

func (h *Handler) generateThumbnailAsync(ctx context.Context, key, contentType string, data []byte) {
	if !strings.HasPrefix(contentType, "image/") || len(data) == 0 {
		return
	}
	go func() {
		thumbnail, err := makeThumbnail(data)
		if err != nil || len(thumbnail) == 0 {
			return
		}
		thumbnailPath := key + ".thumbnail.jpg"
		if _, err := h.Store.PutObject(ctx, h.Bucket, thumbnailPath, bytes.NewReader(thumbnail), int64(len(thumbnail)), minio.PutObjectOptions{ContentType: "image/jpeg"}); err != nil {
			return
		}
	}()
}

func (h *Handler) Serve(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(auth.UserContextKey).(*auth.Claims)
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid attachment id")
		return
	}
	attachment, err := h.Queries.GetAttachmentByID(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, "attachment not found")
		return
	}
	userID, err := uuid.Parse(claims.UserID)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid user")
		return
	}
	if attachment.MessageID.Valid {
		message, messageErr := h.Queries.GetMessageByID(r.Context(), attachment.MessageID.UUID)
		if messageErr != nil {
			writeError(w, http.StatusNotFound, "attachment message not found")
			return
		}
		member, memberErr := h.Queries.IsChannelMember(r.Context(), database.IsChannelMemberParams{ChannelID: message.ChannelID, UserID: userID})
		if memberErr != nil || !member {
			writeError(w, http.StatusForbidden, "not allowed to download this file")
			return
		}
	} else {
		directMessageID, directErr := h.Queries.GetAttachmentDirectMessageID(r.Context(), id)
		if directErr == nil && directMessageID.Valid {
			conversationID, conversationErr := h.Queries.GetDirectMessageConversationID(r.Context(), directMessageID.UUID)
			if conversationErr != nil {
				writeError(w, http.StatusNotFound, "attachment conversation not found")
				return
			}
			member, memberErr := h.Queries.IsDirectConversationMember(r.Context(), database.IsDirectConversationMemberParams{ConversationID: conversationID, UserID: userID})
			if memberErr != nil || !member {
				writeError(w, http.StatusForbidden, "not allowed to download this file")
				return
			}
		} else if attachment.UserID != userID {
			writeError(w, http.StatusForbidden, "not allowed to download this file")
			return
		}
	}
	key, contentType, size := attachment.StoragePath, attachment.ContentType, attachment.SizeBytes
	if chi.URLParam(r, "variant") == "thumbnail" {
		if !attachment.ThumbnailPath.Valid || attachment.ThumbnailPath.String == "" {
			writeError(w, http.StatusNotFound, "thumbnail not available")
			return
		}
		key = attachment.ThumbnailPath.String
		contentType = "image/jpeg"
		size = 0
	}
	object, err := h.Store.GetObject(r.Context(), h.Bucket, key, minio.GetObjectOptions{})
	if err != nil {
		writeError(w, http.StatusNotFound, "file not found")
		return
	}
	defer object.Close()
	info, err := object.Stat()
	if err != nil {
		writeError(w, http.StatusNotFound, "file not found")
		return
	}
	if size <= 0 {
		size = info.Size
	}
	start, end, partial, valid := parseRange(r.Header.Get("Range"), size)
	if partial && !valid {
		writeError(w, http.StatusRequestedRangeNotSatisfiable, "invalid byte range")
		return
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Accept-Ranges", "bytes")
	if partial {
		if _, err := object.Seek(start, io.SeekStart); err != nil {
			writeError(w, http.StatusRequestedRangeNotSatisfiable, "invalid byte range")
			return
		}
		size = end - start + 1
		w.Header().Set("Content-Range", "bytes "+strconv.FormatInt(start, 10)+"-"+strconv.FormatInt(end, 10)+"/"+strconv.FormatInt(info.Size, 10))
	}
	w.Header().Set("Content-Length", strconv.FormatInt(size, 10))
	if chi.URLParam(r, "variant") == "thumbnail" {
		w.Header().Set("Content-Disposition", "inline; filename=\""+strings.ReplaceAll(filepath.Base(attachment.Filename), `"`, "")+".jpg\"")
	} else {
		w.Header().Set("Content-Disposition", `attachment; filename="`+strings.ReplaceAll(filepath.Base(attachment.Filename), `"`, "")+`"`)
	}
	if partial {
		w.WriteHeader(http.StatusPartialContent)
		_, _ = io.CopyN(w, object, size)
		return
	}
	_, _ = io.Copy(w, object)
}

func parseRange(value string, size int64) (int64, int64, bool, bool) {
	if value == "" || size <= 0 || !strings.HasPrefix(value, "bytes=") {
		return 0, size - 1, false, true
	}
	parts := strings.SplitN(strings.TrimPrefix(value, "bytes="), "-", 2)
	if len(parts) != 2 {
		return 0, 0, true, false
	}
	start := int64(0)
	end := size - 1
	if parts[0] == "" {
		suffix, err := strconv.ParseInt(parts[1], 10, 64)
		if err != nil || suffix <= 0 {
			return 0, 0, true, false
		}
		start = size - suffix
		if start < 0 {
			start = 0
		}
	} else {
		parsed, err := strconv.ParseInt(parts[0], 10, 64)
		if err != nil || parsed < 0 || parsed >= size {
			return 0, 0, true, false
		}
		start = parsed
		if parts[1] != "" {
			parsedEnd, err := strconv.ParseInt(parts[1], 10, 64)
			if err != nil || parsedEnd < start {
				return 0, 0, true, false
			}
			end = min(parsedEnd, size-1)
		}
	}
	return start, end, true, true
}

func min(left, right int64) int64 {
	if left < right {
		return left
	}
	return right
}

func makeThumbnail(data []byte) ([]byte, error) {
	source, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	bounds := source.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	if width <= 0 || height <= 0 {
		return nil, fmt.Errorf("invalid image dimensions")
	}
	const maxEdge = 200
	scale := float64(maxEdge) / float64(max(width, height))
	if scale > 1 {
		scale = 1
	}
	destination := image.NewRGBA(image.Rect(0, 0, max(1, int(float64(width)*scale)), max(1, int(float64(height)*scale))))
	draw.CatmullRom.Scale(destination, destination.Bounds(), source, bounds, draw.Over, nil)
	var output bytes.Buffer
	if err := jpeg.Encode(&output, destination, &jpeg.Options{Quality: 82}); err != nil {
		return nil, err
	}
	return output.Bytes(), nil
}

func max(left, right int) int {
	if left > right {
		return left
	}
	return right
}

func allowedType(contentType string) bool {
	return contentType == "application/pdf" || contentType == "text/plain" || contentType == "application/octet-stream" || strings.HasPrefix(contentType, "image/") || strings.HasPrefix(contentType, "video/")
}
func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}
