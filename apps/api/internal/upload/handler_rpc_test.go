package upload

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/mesewo/slack-clone/apps/api/internal/auth"
	"github.com/mesewo/slack-clone/services/contracts/storagepb"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type storageClientStub struct {
	presignRequest   *storagepb.PresignUploadRequest
	completeRequest  *storagepb.CompleteUploadRequest
	presignResponse  *storagepb.PresignUploadResponse
	completeResponse *storagepb.CompleteUploadResponse
	err              error
}

func (c *storageClientStub) PresignUpload(_ context.Context, request *storagepb.PresignUploadRequest) (*storagepb.PresignUploadResponse, error) {
	c.presignRequest = request
	return c.presignResponse, c.err
}

func (c *storageClientStub) CompleteUpload(_ context.Context, request *storagepb.CompleteUploadRequest) (*storagepb.CompleteUploadResponse, error) {
	c.completeRequest = request
	return c.completeResponse, c.err
}

func TestCreatePresignedUploadCallsStorageAndReturnsLegacyShape(t *testing.T) {
	userID := uuid.New()
	expiry := time.Now().Add(15 * time.Minute).UTC().Truncate(time.Second)
	client := &storageClientStub{presignResponse: &storagepb.PresignUploadResponse{
		Id: "session-1", SessionId: "session-1", ObjectKey: "key-1", Filename: "report.pdf",
		ContentType: "application/pdf", SizeBytes: 12, UploadUrl: "https://minio/upload",
		Expiry: timestamppb.New(expiry), ExpiresAt: timestamppb.New(expiry),
	}}
	handler := &Handler{Storage: client}
	request := httptest.NewRequest(http.MethodPost, "/api/uploads/presign", strings.NewReader(`{"filename":"report.pdf","content_type":"application/pdf","size_bytes":12}`))
	request = request.WithContext(context.WithValue(request.Context(), auth.UserContextKey, &auth.Claims{UserID: userID.String()}))
	response := httptest.NewRecorder()
	handler.CreatePresignedUpload(response, request)
	if response.Code != http.StatusOK || client.presignRequest.GetUserId() != userID.String() || client.presignRequest.GetFilename() != "report.pdf" {
		t.Fatalf("Presign = status %d request %+v body %s", response.Code, client.presignRequest, response.Body.String())
	}
	var body PresignResponse
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode Presign response: %v", err)
	}
	if body.ID != "session-1" || body.SessionID != "session-1" || body.ObjectKey != "key-1" || body.UploadURL != "https://minio/upload" || !body.Expiry.Equal(expiry) || !body.ExpiresAt.Equal(expiry) {
		t.Fatalf("unexpected Presign response: %+v", body)
	}
}

func TestCompletePresignedUploadCallsStorage(t *testing.T) {
	userID, attachmentID := uuid.New(), uuid.New()
	client := &storageClientStub{completeResponse: &storagepb.CompleteUploadResponse{
		Id: attachmentID.String(), Filename: "report.pdf", ContentType: "application/pdf", SizeBytes: 12,
	}}
	handler := &Handler{Storage: client, BaseURL: "https://api.example"}
	request := httptest.NewRequest(http.MethodPost, "/api/uploads/complete", strings.NewReader(`{"session_id":"session-1","key":"key-1","filename":"report.pdf","content_type":"application/pdf","size_bytes":12}`))
	request = request.WithContext(context.WithValue(request.Context(), auth.UserContextKey, &auth.Claims{UserID: userID.String()}))
	response := httptest.NewRecorder()
	handler.CompletePresignedUpload(response, request)
	if response.Code != http.StatusOK || client.completeRequest.GetUserId() != userID.String() || client.completeRequest.GetSessionId() != "session-1" {
		t.Fatalf("Complete = status %d request %+v body %s", response.Code, client.completeRequest, response.Body.String())
	}
	var body Response
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode Complete response: %v", err)
	}
	if body.ID != attachmentID || body.URL != "https://api.example/api/uploads/"+attachmentID.String() || body.Filename != "report.pdf" {
		t.Fatalf("unexpected Complete response: %+v", body)
	}
}
