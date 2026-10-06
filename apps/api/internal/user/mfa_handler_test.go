package user

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/redis/go-redis/v9"

	"github.com/mesewo/slack-clone/apps/api/internal/auth"
	"github.com/mesewo/slack-clone/apps/api/internal/database"
	"github.com/mesewo/slack-clone/apps/api/internal/totp"
)

func TestLoginWithMfaEnabledRequiresChallenge(t *testing.T) {
	fixture := newMFAHandlerFixture(t, newTestUser(t, true, ""))
	response := performUserRequest(fixture.handler.Login, http.MethodPost, "/api/auth/login", `{"email":"mfa@example.com","password":"correct horse battery staple"}`, uuid.Nil, "")
	if response.Code != http.StatusOK {
		t.Fatalf("login status = %d, want %d: %s", response.Code, http.StatusOK, response.Body.String())
	}
	if cookies := response.Header().Values("Set-Cookie"); len(cookies) != 0 {
		t.Fatalf("MFA login set cookies before challenge: %v", cookies)
	}
	var payload struct {
		MFARequired bool   `json:"mfa_required"`
		ChallengeID string `json:"challenge_id"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if !payload.MFARequired || payload.ChallengeID == "" {
		t.Fatalf("login response = %+v, want MFA challenge", payload)
	}
	userID, err := fixture.redis.Get(context.Background(), mfaChallengeKey(payload.ChallengeID)).Result()
	if err != nil || userID != fixture.db.user.ID.String() {
		t.Fatalf("stored challenge user = %q, err %v; want %q", userID, err, fixture.db.user.ID)
	}
}

func TestLoginWithoutMFAIssuesCookie(t *testing.T) {
	fixture := newMFAHandlerFixture(t, newTestUser(t, false, ""))
	fixture.handler.Redis = nil
	response := performUserRequest(fixture.handler.Login, http.MethodPost, "/api/auth/login", `{"email":"mfa@example.com","password":"correct horse battery staple"}`, uuid.Nil, "")
	if response.Code != http.StatusOK {
		t.Fatalf("non-MFA login status = %d, want %d: %s", response.Code, http.StatusOK, response.Body.String())
	}
	cookies := response.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != auth.CookieName || cookies[0].Value == "" {
		t.Fatalf("non-MFA login cookies = %v, want a non-empty %q cookie", cookies, auth.CookieName)
	}
}

func TestMfaChallengeCompletesLogin(t *testing.T) {
	secret := testMFASecret(t)
	fixture := newMFAHandlerFixture(t, newTestUser(t, true, secret))
	challengeID := "challenge-success"
	seedChallenge(t, fixture.redis, challengeID, fixture.db.user.ID)
	code, err := totp.GenerateCode(secret, time.Now())
	if err != nil {
		t.Fatal(err)
	}

	response := performUserRequest(fixture.handler.MFAChallenge, http.MethodPost, "/api/auth/mfa/challenge", challengeRequest(challengeID, code), uuid.Nil, "")
	if response.Code != http.StatusOK {
		t.Fatalf("challenge status = %d, want %d: %s", response.Code, http.StatusOK, response.Body.String())
	}
	cookie := response.Result().Cookies()
	if len(cookie) != 1 || cookie[0].Name != auth.CookieName || cookie[0].Value == "" {
		t.Fatalf("challenge cookies = %v, want a non-empty %q cookie", cookie, auth.CookieName)
	}
	claims, err := fixture.handler.Tokens.Validate(cookie[0].Value)
	if err != nil || claims.UserID != fixture.db.user.ID.String() {
		t.Fatalf("issued token claims = %+v, err %v", claims, err)
	}
	if fixture.redis.Exists(context.Background(), mfaChallengeKey(challengeID)).Val() != 0 {
		t.Fatal("successful challenge was not deleted")
	}
}

func TestMfaChallengeRejectsReplayedCode(t *testing.T) {
	secret := testMFASecret(t)
	fixture := newMFAHandlerFixture(t, newTestUser(t, true, secret))
	code, err := totp.GenerateCode(secret, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	seedChallenge(t, fixture.redis, "challenge-first", fixture.db.user.ID)
	first := performUserRequest(fixture.handler.MFAChallenge, http.MethodPost, "/api/auth/mfa/challenge", challengeRequest("challenge-first", code), uuid.Nil, "")
	if first.Code != http.StatusOK {
		t.Fatalf("first challenge status = %d, want %d: %s", first.Code, http.StatusOK, first.Body.String())
	}

	seedChallenge(t, fixture.redis, "challenge-second", fixture.db.user.ID)
	second := performUserRequest(fixture.handler.MFAChallenge, http.MethodPost, "/api/auth/mfa/challenge", challengeRequest("challenge-second", code), uuid.Nil, "")
	if second.Code != http.StatusUnauthorized {
		t.Fatalf("replayed code status = %d, want %d: %s", second.Code, http.StatusUnauthorized, second.Body.String())
	}
	if cookies := second.Header().Values("Set-Cookie"); len(cookies) != 0 {
		t.Fatalf("replayed code issued cookies: %v", cookies)
	}
}

func TestMfaChallengeExpires(t *testing.T) {
	fixture := newMFAHandlerFixture(t, newTestUser(t, true, testMFASecret(t)))
	seedChallenge(t, fixture.redis, "challenge-expired", fixture.db.user.ID)
	fixture.server.FastForward(mfaChallengeTTL + time.Second)
	response := performUserRequest(fixture.handler.MFAChallenge, http.MethodPost, "/api/auth/mfa/challenge", challengeRequest("challenge-expired", "123456"), uuid.Nil, "")
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("expired challenge status = %d, want %d: %s", response.Code, http.StatusUnauthorized, response.Body.String())
	}
}

func TestMFASetupAndConfirmation(t *testing.T) {
	fixture := newMFAHandlerFixture(t, newTestUser(t, false, ""))
	setup := performUserRequest(fixture.handler.MFASetup, http.MethodPost, "/api/auth/mfa/setup", "{}", fixture.db.user.ID, fixture.db.user.Email)
	if setup.Code != http.StatusOK {
		t.Fatalf("setup status = %d, want %d: %s", setup.Code, http.StatusOK, setup.Body.String())
	}
	var payload struct {
		Secret     string `json:"secret"`
		OTPAUTHURI string `json:"otpauth_uri"`
	}
	if err := json.Unmarshal(setup.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if !fixture.db.user.MfaSecret.Valid || fixture.db.user.MfaEnabled {
		t.Fatalf("setup DB state = secret valid %t, enabled %t; want secret stored and disabled", fixture.db.user.MfaSecret.Valid, fixture.db.user.MfaEnabled)
	}
	if payload.Secret != fixture.db.user.MfaSecret.String || !strings.HasPrefix(payload.OTPAUTHURI, "otpauth://totp/SlackClone:") || !strings.Contains(payload.OTPAUTHURI, "issuer=SlackClone") {
		t.Fatalf("setup response = %+v, want secret and SlackClone provisioning URI", payload)
	}
	code, err := totp.GenerateCode(payload.Secret, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	confirm := performUserRequest(fixture.handler.MFAConfirm, http.MethodPost, "/api/auth/mfa/confirm", fmt.Sprintf(`{"code":%q}`, code), fixture.db.user.ID, fixture.db.user.Email)
	if confirm.Code != http.StatusNoContent {
		t.Fatalf("confirm status = %d, want %d: %s", confirm.Code, http.StatusNoContent, confirm.Body.String())
	}
	if !fixture.db.user.MfaEnabled {
		t.Fatal("confirmation did not enable MFA")
	}
}

type mfaHandlerFixture struct {
	handler *Handler
	server  *miniredis.Miniredis
	redis   *redis.Client
	db      *mfaHandlerDB
}

func newMFAHandlerFixture(t *testing.T, user database.User) mfaHandlerFixture {
	t.Helper()
	server, err := miniredis.Run()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(server.Close)
	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	t.Cleanup(func() { _ = client.Close() })
	tokens := auth.NewTokenManager([]byte("test signing secret"), time.Hour)
	db := &mfaHandlerDB{user: user}
	return mfaHandlerFixture{
		handler: &Handler{Queries: database.New(db), Tokens: tokens, Redis: client},
		server:  server,
		redis:   client,
		db:      db,
	}
}

func newTestUser(t *testing.T, enabled bool, secret string) database.User {
	t.Helper()
	passwordHash, err := auth.HashPassword("correct horse battery staple")
	if err != nil {
		t.Fatal(err)
	}
	user := database.User{ID: uuid.New(), Email: "mfa@example.com", PasswordHash: passwordHash}
	user.MfaEnabled = enabled
	if secret != "" {
		user.MfaSecret = pgtype.Text{String: secret, Valid: true}
	}
	return user
}

func testMFASecret(t *testing.T) string {
	t.Helper()
	secret, err := totp.GenerateSecret()
	if err != nil {
		t.Fatal(err)
	}
	return secret
}

func seedChallenge(t *testing.T, client *redis.Client, challengeID string, userID uuid.UUID) {
	t.Helper()
	if err := client.Set(context.Background(), mfaChallengeKey(challengeID), userID.String(), mfaChallengeTTL).Err(); err != nil {
		t.Fatal(err)
	}
}

func challengeRequest(challengeID, code string) string {
	return fmt.Sprintf(`{"challenge_id":%q,"code":%q}`, challengeID, code)
}

func performUserRequest(handler http.HandlerFunc, method, path, body string, userID uuid.UUID, email string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	if userID != uuid.Nil {
		ctx := context.WithValue(request.Context(), auth.UserContextKey, &auth.Claims{UserID: userID.String(), Email: email})
		request = request.WithContext(ctx)
	}
	response := httptest.NewRecorder()
	handler(response, request)
	return response
}

type mfaHandlerDB struct{ user database.User }

func (db *mfaHandlerDB) Exec(_ context.Context, query string, args ...interface{}) (pgconn.CommandTag, error) {
	switch {
	case strings.Contains(query, "UPDATE users SET mfa_secret"):
		if db.user.MfaEnabled || args[1] != db.user.ID {
			return pgconn.NewCommandTag("UPDATE 0"), nil
		}
		db.user.MfaSecret = pgtype.Text{String: args[0].(string), Valid: true}
		return pgconn.NewCommandTag("UPDATE 1"), nil
	case strings.Contains(query, "UPDATE users SET mfa_enabled"):
		if !db.user.MfaEnabled && db.user.MfaSecret.Valid && args[0] == db.user.ID && args[1] == db.user.MfaSecret.String {
			db.user.MfaEnabled = true
			return pgconn.NewCommandTag("UPDATE 1"), nil
		}
		return pgconn.NewCommandTag("UPDATE 0"), nil
	default:
		return pgconn.CommandTag{}, fmt.Errorf("unexpected Exec: %s", query)
	}
}

func (db *mfaHandlerDB) Query(context.Context, string, ...interface{}) (pgx.Rows, error) {
	return nil, errors.New("unexpected Query")
}

func (db *mfaHandlerDB) QueryRow(_ context.Context, query string, _ ...interface{}) pgx.Row {
	switch {
	case strings.Contains(query, "name: GetUserByEmail"), strings.Contains(query, "name: GetUserByID"):
		return mfaValuesRow{values: []interface{}{
			db.user.ID, db.user.Email, db.user.PasswordHash, db.user.DisplayName,
			db.user.CreatedAt, db.user.UpdatedAt, db.user.AvatarUrl, db.user.PresenceStatus,
			db.user.MfaSecret, db.user.MfaEnabled,
		}}
	default:
		return mfaErrorRow{err: fmt.Errorf("unexpected QueryRow: %s", query)}
	}
}

type mfaValuesRow struct{ values []interface{} }

func (row mfaValuesRow) Scan(dest ...interface{}) error {
	if len(dest) != len(row.values) {
		return fmt.Errorf("Scan has %d destinations, want %d", len(dest), len(row.values))
	}
	for i, value := range row.values {
		target := reflect.ValueOf(dest[i])
		if target.Kind() != reflect.Pointer || !target.Elem().CanSet() {
			return fmt.Errorf("Scan destination %d is not a settable pointer", i)
		}
		target.Elem().Set(reflect.ValueOf(value))
	}
	return nil
}

type mfaErrorRow struct{ err error }

func (row mfaErrorRow) Scan(...interface{}) error { return row.err }
