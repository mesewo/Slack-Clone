package upload

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"image"
	_ "image/gif"
	"image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/mesewo/slack-clone/apps/api/internal/auth"
	"github.com/mesewo/slack-clone/apps/api/internal/database"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

const maxUploadSize = 25 << 20

type Handler struct {
	Queries *database.Queries
	Store   *minio.Client
	Bucket  string
	BaseURL string
}

type Response struct {
	ID           uuid.UUID `json:"id"`
	Filename     string    `json:"filename"`
	ContentType  string    `json:"content_type"`
	SizeBytes    int64     `json:"size_bytes"`
	URL          string    `json:"url"`
	ThumbnailURL string    `json:"thumbnail_url,omitempty"`
}

func NewStore(endpoint, accessKey, secretKey string, useSSL bool) (*minio.Client, error) {
	return minio.New(endpoint, &minio.Options{Creds: credentials.NewStaticV4(accessKey, secretKey, ""), Secure: useSSL})
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
		writeError(w, http.StatusBadRequest, "file is too large or invalid")
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
	thumbnailKey := ""
	if strings.HasPrefix(contentType, "image/") {
		if thumb, ok := makeThumbnail(data); ok {
			thumbnailKey = key + ".thumb.jpg"
			if _, err := h.Store.PutObject(r.Context(), h.Bucket, thumbnailKey, bytes.NewReader(thumb), int64(len(thumb)), minio.PutObjectOptions{ContentType: "image/jpeg"}); err != nil {
				thumbnailKey = ""
			}
		}
	}
	id := uuid.New()
	if _, err := h.Queries.CreateAttachment(r.Context(), database.CreateAttachmentParams{ID: id, UserID: userID, Filename: filepath.Base(header.Filename), ContentType: contentType, SizeBytes: int64(len(data)), StoragePath: key, Column7: thumbnailKey}); err != nil {
		_ = h.Store.RemoveObject(r.Context(), h.Bucket, key, minio.RemoveObjectOptions{})
		writeError(w, http.StatusInternalServerError, "failed to save attachment metadata")
		return
	}
	response := Response{ID: id, Filename: filepath.Base(header.Filename), ContentType: contentType, SizeBytes: int64(len(data)), URL: h.BaseURL + "/api/uploads/" + id.String(), ThumbnailURL: h.BaseURL + "/api/uploads/" + id.String() + "/thumbnail"}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(response)
}

func (h *Handler) Serve(w http.ResponseWriter, r *http.Request) {
	if _, ok := r.Context().Value(auth.UserContextKey).(*auth.Claims); !ok {
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
	key, contentType, size := attachment.StoragePath, attachment.ContentType, attachment.SizeBytes
	if chi.URLParam(r, "variant") == "thumbnail" {
		if !attachment.ThumbnailPath.Valid {
			writeError(w, http.StatusNotFound, "thumbnail not found")
			return
		}
		key, contentType, size = attachment.ThumbnailPath.String, "image/jpeg", 0
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
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Length", strconv.FormatInt(size, 10))
	_, _ = io.Copy(w, object)
}

func allowedType(contentType string) bool {
	return contentType == "application/pdf" || contentType == "text/plain" || strings.HasPrefix(contentType, "image/")
}
func makeThumbnail(data []byte) ([]byte, bool) {
	source, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, false
	}
	bounds := source.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	if width > 320 {
		height = height * 320 / width
		width = 320
	}
	if height > 240 {
		width = width * 240 / height
		height = 240
	}
	target := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			target.Set(x, y, source.At(x*bounds.Dx()/width, y*bounds.Dy()/height))
		}
	}
	var out bytes.Buffer
	if err := jpeg.Encode(&out, target, &jpeg.Options{Quality: 82}); err != nil {
		return nil, false
	}
	return out.Bytes(), true
}
func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}
