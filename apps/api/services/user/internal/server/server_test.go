package server

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/mesewo/slack-clone/services/authlib/auth"
	"github.com/mesewo/slack-clone/services/authlib/totp"
	"github.com/mesewo/slack-clone/services/contracts/userpb"
	"github.com/mesewo/slack-clone/services/database"
	"github.com/redis/go-redis/v9"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestMFASetupConfirmationLoginAndChallenge(t *testing.T) {
	mini, err := miniredis.Run()
	if err != nil {
		t.Fatal(err)
	}
	defer mini.Close()
	redisClient := redis.NewClient(&redis.Options{Addr: mini.Addr()})
	defer redisClient.Close()

	hash, err := auth.HashPassword("correct horse battery staple")
	if err != nil {
		t.Fatal(err)
	}
	user := database.User{ID: uuid.New(), Email: "mfa@example.com", DisplayName: "MFA User", PasswordHash: hash}
	queries := database.New(&testDB{user: &user})
	server := New(queries, auth.NewTokenManager([]byte("test signing secret"), time.Hour), redisClient)

	setup, err := server.MFASetup(context.Background(), &userpb.MFASetupRequest{UserId: user.ID.String()})
	if err != nil || setup.GetSecret() == "" || !strings.Contains(setup.GetOtpauthUri(), user.Email) {
		t.Fatalf("MFASetup() = %+v, %v", setup, err)
	}
	code, err := totp.GenerateCode(setup.GetSecret(), time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := server.MFAConfirm(context.Background(), &userpb.MFAConfirmRequest{UserId: user.ID.String(), Code: code}); err != nil {
		t.Fatalf("MFAConfirm(): %v", err)
	}
	if !user.MfaEnabled {
		t.Fatal("MFAConfirm did not enable MFA")
	}

	login, err := server.Login(context.Background(), &userpb.LoginRequest{Email: user.Email, Password: "correct horse battery staple"})
	if err != nil || !login.GetMfaRequired() || login.GetChallengeId() == "" || login.GetToken() != "" {
		t.Fatalf("MFA Login() = %+v, %v", login, err)
	}
	code, err = totp.GenerateCode(setup.GetSecret(), time.Now())
	if err != nil {
		t.Fatal(err)
	}
	completed, err := server.MFAChallenge(context.Background(), &userpb.MFAChallengeRequest{ChallengeId: login.GetChallengeId(), Code: code})
	if err != nil || completed.GetToken() == "" || completed.GetUserId() != user.ID.String() {
		t.Fatalf("MFAChallenge() = %+v, %v", completed, err)
	}
	if mini.Exists(mfaChallengeKey(login.GetChallengeId())) {
		t.Fatal("successful MFA challenge was not consumed")
	}
	identity, err := server.Verify(context.Background(), &userpb.VerifyRequest{Token: completed.GetToken()})
	if err != nil || identity.GetDisplayName() != user.DisplayName {
		t.Fatalf("Verify() = %+v, %v", identity, err)
	}

	secondChallenge := "second-challenge"
	if err := redisClient.Set(context.Background(), mfaChallengeKey(secondChallenge), user.ID.String(), mfaChallengeTTL).Err(); err != nil {
		t.Fatal(err)
	}
	if _, err := server.MFAChallenge(context.Background(), &userpb.MFAChallengeRequest{ChallengeId: secondChallenge, Code: code}); status.Code(err) != codes.Unauthenticated {
		t.Fatalf("replayed MFA code status = %s, err %v", status.Code(err), err)
	}
}

func TestVerifyRejectsInvalidToken(t *testing.T) {
	server := New(nil, auth.NewTokenManager([]byte("secret"), time.Hour), nil)
	if _, err := server.Verify(context.Background(), &userpb.VerifyRequest{Token: "bad"}); status.Code(err) != codes.Unauthenticated {
		t.Fatalf("Verify invalid token status = %s, err %v", status.Code(err), err)
	}
}

type testDB struct{ user *database.User }

func (db *testDB) Exec(_ context.Context, query string, args ...interface{}) (pgconn.CommandTag, error) {
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

func (*testDB) Query(context.Context, string, ...interface{}) (pgx.Rows, error) {
	return nil, errors.New("unexpected Query")
}

func (db *testDB) QueryRow(_ context.Context, query string, _ ...interface{}) pgx.Row {
	if strings.Contains(query, "name: GetUserByEmail") || strings.Contains(query, "name: GetUserByID") {
		return testValuesRow{values: []interface{}{
			db.user.ID, db.user.Email, db.user.PasswordHash, db.user.DisplayName,
			db.user.CreatedAt, db.user.UpdatedAt, db.user.AvatarUrl, db.user.PresenceStatus,
			db.user.MfaSecret, db.user.MfaEnabled,
		}}
	}
	return testErrorRow{err: fmt.Errorf("unexpected QueryRow: %s", query)}
}

type testValuesRow struct{ values []interface{} }

func (row testValuesRow) Scan(dest ...interface{}) error {
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

type testErrorRow struct{ err error }

func (row testErrorRow) Scan(...interface{}) error { return row.err }
