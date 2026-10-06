package channel

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/mesewo/slack-clone/apps/api/internal/auth"
	"github.com/mesewo/slack-clone/apps/api/internal/database"
)

func TestCreatePrivateChannelPermission(t *testing.T) {
	for _, role := range []string{"MEMBER", "OWNER", "ADMIN"} {
		t.Run(role+"/CreatePrivateChannel", func(t *testing.T) {
			fixture := newChannelPermissionFixture(role)
			router := chi.NewRouter()
			router.Post("/channels", withClaims(fixture.requesterID, (&Handler{Queries: fixture.queries()}).CreateChannel))
			request := httptest.NewRequest(http.MethodPost, "/channels", strings.NewReader(fmt.Sprintf(`{"workspace_id":%q,"name":"private","type":"PRIVATE"}`, fixture.workspaceID.String())))
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			assertPermissionStatus(t, response.Code, role)
		})
	}
}

func TestAddMemberPermission(t *testing.T) {
	for _, role := range []string{"MEMBER", "OWNER", "ADMIN"} {
		t.Run(role+"/AddMember", func(t *testing.T) {
			fixture := newChannelPermissionFixture(role)
			router := chi.NewRouter()
			router.Post("/channels/{channelID}/members", withClaims(fixture.requesterID, (&Handler{Queries: fixture.queries()}).AddMember))
			path := "/channels/" + fixture.channelID.String() + "/members"
			request := httptest.NewRequest(http.MethodPost, path, strings.NewReader(fmt.Sprintf(`{"user_id":%q}`, fixture.targetID.String())))
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			assertPermissionStatus(t, response.Code, role)
		})
	}
}

func TestRemoveOtherMemberPermission(t *testing.T) {
	for _, role := range []string{"MEMBER", "OWNER", "ADMIN"} {
		t.Run(role+"/RemoveOtherMember", func(t *testing.T) {
			fixture := newChannelPermissionFixture(role)
			router := chi.NewRouter()
			router.Delete("/channels/{channelID}/members/{userID}", withClaims(fixture.requesterID, (&Handler{Queries: fixture.queries()}).RemoveMember))
			path := "/channels/" + fixture.channelID.String() + "/members/" + fixture.targetID.String()
			request := httptest.NewRequest(http.MethodDelete, path, nil)
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			assertPermissionStatus(t, response.Code, role)
		})
	}

	t.Run("MEMBER/RemoveSelf", func(t *testing.T) {
		fixture := newChannelPermissionFixture("MEMBER")
		router := chi.NewRouter()
		router.Delete("/channels/{channelID}/members/{userID}", withClaims(fixture.requesterID, (&Handler{Queries: fixture.queries()}).RemoveMember))
		path := "/channels/" + fixture.channelID.String() + "/members/" + fixture.requesterID.String()
		request := httptest.NewRequest(http.MethodDelete, path, nil)
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		if response.Code != http.StatusNoContent {
			t.Fatalf("self-removal status = %d, want %d: %s", response.Code, http.StatusNoContent, response.Body.String())
		}
	})
}

func assertPermissionStatus(t *testing.T, status int, role string) {
	t.Helper()
	if role == "MEMBER" {
		if status != http.StatusForbidden {
			t.Fatalf("MEMBER status = %d, want %d", status, http.StatusForbidden)
		}
		return
	}
	if status == http.StatusForbidden {
		t.Fatalf("%s unexpectedly denied with 403", role)
	}
}

func withClaims(userID uuid.UUID, handler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := context.WithValue(r.Context(), auth.UserContextKey, &auth.Claims{UserID: userID.String()})
		handler(w, r.WithContext(ctx))
	}
}

type channelPermissionFixture struct {
	workspaceID uuid.UUID
	channelID   uuid.UUID
	requesterID uuid.UUID
	targetID    uuid.UUID
	role        string
}

func newChannelPermissionFixture(role string) channelPermissionFixture {
	return channelPermissionFixture{
		workspaceID: uuid.New(),
		channelID:   uuid.New(),
		requesterID: uuid.New(),
		targetID:    uuid.New(),
		role:        role,
	}
}

func (f channelPermissionFixture) queries() *database.Queries {
	return database.New(channelPermissionDB{fixture: f})
}

type channelPermissionDB struct{ fixture channelPermissionFixture }

func (channelPermissionDB) Exec(_ context.Context, query string, _ ...interface{}) (pgconn.CommandTag, error) {
	if strings.Contains(query, "DELETE FROM channel_members") {
		return pgconn.CommandTag{}, nil
	}
	return pgconn.CommandTag{}, errors.New("deliberate failure after permission gate")
}

func (channelPermissionDB) Query(context.Context, string, ...interface{}) (pgx.Rows, error) {
	return nil, errors.New("unexpected Query")
}

func (db channelPermissionDB) QueryRow(_ context.Context, query string, args ...interface{}) pgx.Row {
	switch {
	case strings.Contains(query, "name: GetWorkspaceMember"):
		userID := args[1].(uuid.UUID)
		role := db.fixture.role
		if userID == db.fixture.targetID {
			role = "MEMBER"
		}
		return valuesRow{values: []interface{}{db.fixture.workspaceID, userID, role, time.Now()}}
	case strings.Contains(query, "FROM channels WHERE id = $1"):
		return valuesRow{values: []interface{}{db.fixture.channelID, db.fixture.workspaceID, "general", "PUBLIC", uuid.NullUUID{}, time.Now()}}
	case strings.Contains(query, "name: CreateChannel"):
		return errorRow{err: errors.New("deliberate CreateChannel failure after permission gate")}
	default:
		return errorRow{err: fmt.Errorf("unexpected QueryRow: %s", query)}
	}
}

type valuesRow struct{ values []interface{} }

func (row valuesRow) Scan(dest ...interface{}) error {
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

type errorRow struct{ err error }

func (row errorRow) Scan(...interface{}) error { return row.err }
