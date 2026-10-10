package server

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/mesewo/slack-clone/services/authlib/auth"
	"github.com/mesewo/slack-clone/services/authlib/totp"
	"github.com/mesewo/slack-clone/services/contracts/userpb"
	"github.com/mesewo/slack-clone/services/database"
	"github.com/redis/go-redis/v9"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const (
	mfaChallengeTTL     = 2 * time.Minute
	mfaReplayTTL        = 2 * time.Minute
	userRegisteredTopic = "events.user.registered"
)

var acceptTOTPStepScript = redis.NewScript(`
local last = redis.call('GET', KEYS[1])
if last and tonumber(ARGV[1]) <= tonumber(last) then
  return 0
end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
return 1
`)

type Server struct {
	userpb.UnimplementedUserServiceServer
	queries *database.Queries
	tokens  *auth.TokenManager
	redis   *redis.Client
}

func New(queries *database.Queries, tokens *auth.TokenManager, redisClient *redis.Client) *Server {
	return &Server{queries: queries, tokens: tokens, redis: redisClient}
}

func (s *Server) Register(ctx context.Context, request *userpb.RegisterRequest) (*userpb.AuthResponse, error) {
	if len(request.GetPassword()) < 8 {
		return nil, status.Error(codes.InvalidArgument, "password must be at least 8 characters")
	}
	hash, err := auth.HashPassword(request.GetPassword())
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to hash password")
	}
	var created database.User
	err = s.queries.InTx(ctx, func(tx *database.Queries) error {
		var createErr error
		created, createErr = tx.CreateUser(ctx, database.CreateUserParams{
			Email: request.GetEmail(), PasswordHash: hash, DisplayName: request.GetDisplayName(),
		})
		if createErr != nil {
			return createErr
		}
		payload, marshalErr := json.Marshal(userRegisteredEvent{
			EventID: created.ID.String(), Version: 1, Source: "user-service",
			UserID: created.ID.String(), Email: created.Email, DisplayName: created.DisplayName,
			RegisteredAt: created.CreatedAt,
		})
		if marshalErr != nil {
			return marshalErr
		}
		return tx.EnqueueOutbox(ctx, userRegisteredTopic, created.ID.String(), payload)
	})
	if err != nil {
		var postgresErr *pgconn.PgError
		if errors.As(err, &postgresErr) && postgresErr.Code == "23505" {
			return nil, status.Error(codes.AlreadyExists, "email already exists")
		}
		return nil, status.Error(codes.Internal, "failed to create account")
	}
	return s.authResponse(created, false, "")
}

func (s *Server) Login(ctx context.Context, request *userpb.LoginRequest) (*userpb.AuthResponse, error) {
	user, err := s.queries.GetUserByEmail(ctx, request.GetEmail())
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && !auth.CheckPasswordHash(request.GetPassword(), user.PasswordHash)) {
		return nil, status.Error(codes.Unauthenticated, "invalid credentials")
	}
	if err != nil {
		return nil, status.Error(codes.Internal, "something went wrong")
	}
	if user.MfaEnabled {
		if s.redis == nil {
			return nil, status.Error(codes.Unavailable, "MFA challenge storage is unavailable")
		}
		challengeID, challengeErr := newMFAChallengeID()
		if challengeErr != nil {
			return nil, status.Error(codes.Internal, "failed to create MFA challenge")
		}
		if err := s.redis.Set(ctx, mfaChallengeKey(challengeID), user.ID.String(), mfaChallengeTTL).Err(); err != nil {
			return nil, status.Error(codes.Unavailable, "MFA challenge storage is unavailable")
		}
		return &userpb.AuthResponse{MfaRequired: true, ChallengeId: challengeID}, nil
	}
	return s.authResponse(user, false, "")
}

func (s *Server) MFASetup(ctx context.Context, request *userpb.MFASetupRequest) (*userpb.MFASetupResponse, error) {
	userID, err := parseUserID(request.GetUserId())
	if err != nil {
		return nil, err
	}
	user, err := s.queries.GetUserByID(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, status.Error(codes.NotFound, "user not found")
	}
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to load user")
	}
	secret, err := totp.GenerateSecret()
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to create MFA setup")
	}
	if err := s.queries.SetUserMFASecret(ctx, userID, secret); err != nil {
		if errors.Is(err, database.ErrMFAAlreadyEnabled) {
			return nil, status.Error(codes.AlreadyExists, "MFA is already enabled")
		}
		return nil, status.Error(codes.Internal, "failed to save MFA setup")
	}
	label := url.PathEscape("SlackClone:" + user.Email)
	return &userpb.MFASetupResponse{Secret: secret, OtpauthUri: fmt.Sprintf("otpauth://totp/%s?secret=%s&issuer=SlackClone", label, secret)}, nil
}

func (s *Server) MFAConfirm(ctx context.Context, request *userpb.MFAConfirmRequest) (*userpb.MFAConfirmResponse, error) {
	userID, err := parseUserID(request.GetUserId())
	if err != nil {
		return nil, err
	}
	user, err := s.queries.GetUserByID(ctx, userID)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to load MFA setup")
	}
	if user.MfaEnabled {
		return nil, status.Error(codes.AlreadyExists, "MFA is already enabled")
	}
	if !user.MfaSecret.Valid {
		return nil, status.Error(codes.FailedPrecondition, "MFA setup has not been started")
	}
	if !totp.Verify(user.MfaSecret.String, request.GetCode(), time.Now()) {
		return nil, status.Error(codes.Unauthenticated, "invalid verification code")
	}
	if err := s.queries.EnableUserMFA(ctx, userID, user.MfaSecret.String); err != nil {
		if errors.Is(err, database.ErrMFASetupChanged) {
			return nil, status.Error(codes.Aborted, "MFA setup changed; start setup again")
		}
		return nil, status.Error(codes.Internal, "failed to enable MFA")
	}
	return &userpb.MFAConfirmResponse{}, nil
}

func (s *Server) MFAChallenge(ctx context.Context, request *userpb.MFAChallengeRequest) (*userpb.AuthResponse, error) {
	if s.redis == nil {
		return nil, status.Error(codes.Unavailable, "MFA challenge storage is unavailable")
	}
	if request.GetChallengeId() == "" {
		return nil, status.Error(codes.InvalidArgument, "challenge_id is required")
	}
	challengeKey := mfaChallengeKey(request.GetChallengeId())
	userIDText, err := s.redis.Get(ctx, challengeKey).Result()
	if errors.Is(err, redis.Nil) {
		return nil, status.Error(codes.Unauthenticated, "invalid or expired MFA challenge")
	}
	if err != nil {
		return nil, status.Error(codes.Unavailable, "MFA challenge storage is unavailable")
	}
	userID, err := uuid.Parse(userIDText)
	if err != nil {
		return nil, status.Error(codes.Unauthenticated, "invalid or expired MFA challenge")
	}
	user, err := s.queries.GetUserByID(ctx, userID)
	if err != nil || !user.MfaEnabled || !user.MfaSecret.Valid {
		if errors.Is(err, pgx.ErrNoRows) || err == nil {
			return nil, status.Error(codes.Unauthenticated, "invalid or expired MFA challenge")
		}
		return nil, status.Error(codes.Internal, "something went wrong")
	}
	step, valid := totp.VerifyWithStep(user.MfaSecret.String, request.GetCode(), time.Now())
	if !valid {
		return nil, status.Error(codes.Unauthenticated, "invalid verification code")
	}
	accepted, err := acceptTOTPStepScript.Run(ctx, s.redis, []string{mfaLastUsedKey(userID)}, strconv.FormatInt(step, 10), int(mfaReplayTTL.Seconds())).Int()
	if err != nil {
		return nil, status.Error(codes.Unavailable, "MFA replay storage is unavailable")
	}
	if accepted != 1 {
		return nil, status.Error(codes.Unauthenticated, "verification code already used")
	}
	if err := s.redis.Del(ctx, challengeKey).Err(); err != nil {
		return nil, status.Error(codes.Unavailable, "MFA challenge storage is unavailable")
	}
	return s.authResponse(user, false, "")
}

func (s *Server) Verify(_ context.Context, request *userpb.VerifyRequest) (*userpb.UserIdentity, error) {
	claims, err := s.tokens.Validate(request.GetToken())
	if err != nil {
		return nil, status.Error(codes.Unauthenticated, "invalid or expired token")
	}
	return &userpb.UserIdentity{UserId: claims.UserID, Email: claims.Email, DisplayName: claims.DisplayName}, nil
}

func (s *Server) authResponse(user database.User, mfaRequired bool, challengeID string) (*userpb.AuthResponse, error) {
	token, err := s.tokens.GenerateWithDisplayName(user.ID.String(), user.Email, user.DisplayName)
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to generate token")
	}
	return &userpb.AuthResponse{Token: token, UserId: user.ID.String(), Email: user.Email, DisplayName: user.DisplayName, MfaRequired: mfaRequired, ChallengeId: challengeID, TokenTtlSeconds: int64(s.tokens.TTL().Seconds())}, nil
}

func parseUserID(value string) (uuid.UUID, error) {
	userID, err := uuid.Parse(value)
	if err != nil {
		return uuid.Nil, status.Error(codes.InvalidArgument, "invalid user_id")
	}
	return userID, nil
}

func newMFAChallengeID() (string, error) {
	value := make([]byte, 32)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(value), nil
}

func mfaChallengeKey(challengeID string) string { return "mfa_challenge:" + challengeID }
func mfaLastUsedKey(userID uuid.UUID) string    { return "mfa_lastused:" + userID.String() }

type userRegisteredEvent struct {
	EventID      string    `json:"event_id"`
	Version      int       `json:"version"`
	Source       string    `json:"source"`
	UserID       string    `json:"user_id"`
	Email        string    `json:"email"`
	DisplayName  string    `json:"display_name"`
	RegisteredAt time.Time `json:"registered_at"`
}
