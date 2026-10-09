package user

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/mesewo/slack-clone/apps/api/internal/auth"
	"github.com/mesewo/slack-clone/services/contracts/userpb"
	"google.golang.org/grpc"
)

type stubUserClient struct {
	userpb.UserServiceClient
	loginResponse *userpb.AuthResponse
	loginErr      error
	verifyRequest *userpb.VerifyRequest
	callCount     int
}

func (c *stubUserClient) Register(context.Context, *userpb.RegisterRequest, ...grpc.CallOption) (*userpb.AuthResponse, error) {
	c.callCount++
	return &userpb.AuthResponse{UserId: "user-1", Email: "a@example.com", Token: "signed-token", TokenTtlSeconds: 3600}, nil
}

func (c *stubUserClient) Login(context.Context, *userpb.LoginRequest, ...grpc.CallOption) (*userpb.AuthResponse, error) {
	c.callCount++
	return c.loginResponse, c.loginErr
}

func (c *stubUserClient) MFASetup(context.Context, *userpb.MFASetupRequest, ...grpc.CallOption) (*userpb.MFASetupResponse, error) {
	c.callCount++
	return &userpb.MFASetupResponse{Secret: "SECRET", OtpauthUri: "otpauth://totp/SlackClone:a@example.com"}, nil
}

func (c *stubUserClient) MFAConfirm(context.Context, *userpb.MFAConfirmRequest, ...grpc.CallOption) (*userpb.MFAConfirmResponse, error) {
	c.callCount++
	return &userpb.MFAConfirmResponse{}, nil
}

func (c *stubUserClient) MFAChallenge(context.Context, *userpb.MFAChallengeRequest, ...grpc.CallOption) (*userpb.AuthResponse, error) {
	c.callCount++
	return &userpb.AuthResponse{UserId: "user-1", Email: "a@example.com", Token: "signed-token", TokenTtlSeconds: 3600}, nil
}

func (c *stubUserClient) Verify(_ context.Context, request *userpb.VerifyRequest, _ ...grpc.CallOption) (*userpb.UserIdentity, error) {
	c.callCount++
	c.verifyRequest = request
	return &userpb.UserIdentity{UserId: "user-1", Email: "a@example.com"}, nil
}

func TestLoginMFAChallengeDoesNotSetCookie(t *testing.T) {
	client := &stubUserClient{loginResponse: &userpb.AuthResponse{MfaRequired: true, ChallengeId: "challenge-1"}}
	handler := &Handler{Client: client}
	request := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"email":"a@example.com","password":"password"}`))
	response := httptest.NewRecorder()
	handler.Login(response, request)
	if response.Code != http.StatusOK || len(response.Result().Cookies()) != 0 {
		t.Fatalf("MFA Login = status %d cookies %v", response.Code, response.Result().Cookies())
	}
	var body map[string]any
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil || body["mfa_required"] != true || body["challenge_id"] != "challenge-1" {
		t.Fatalf("MFA Login body %s, error %v", response.Body.String(), err)
	}
}

func TestRegisterSetsCookieFromRPCResponse(t *testing.T) {
	client := &stubUserClient{}
	handler := &Handler{Client: client}
	request := httptest.NewRequest(http.MethodPost, "/api/auth/register", strings.NewReader(`{"email":"a@example.com","password":"password","display_name":"A"}`))
	response := httptest.NewRecorder()
	handler.Register(response, request)
	cookies := response.Result().Cookies()
	if response.Code != http.StatusCreated || len(cookies) != 1 || cookies[0].Value != "signed-token" || cookies[0].MaxAge != int(time.Hour.Seconds()) {
		t.Fatalf("Register status %d cookies %v", response.Code, cookies)
	}
}

func TestLogoutClearsCookieWithoutCallingService(t *testing.T) {
	client := &stubUserClient{}
	handler := &Handler{Client: client}
	response := httptest.NewRecorder()
	handler.Logout(response, httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil))
	cookies := response.Result().Cookies()
	if response.Code != http.StatusNoContent || len(cookies) != 1 || cookies[0].Name != auth.CookieName || cookies[0].MaxAge != -1 {
		t.Fatalf("Logout status %d cookies %v", response.Code, cookies)
	}
	if client.callCount != 0 {
		t.Fatalf("Logout called user-service %d times; JWT logout should only expire its cookie", client.callCount)
	}
}
