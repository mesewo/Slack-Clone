package workspace

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

	"github.com/alicebob/miniredis/v2"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/redis/go-redis/v9"

	"github.com/mesewo/slack-clone/apps/api/internal/auth"
	"github.com/mesewo/slack-clone/apps/api/internal/database"
	"github.com/mesewo/slack-clone/apps/api/internal/permission"
)

func TestCreateInvitePermission(t *testing.T) {
	for _, role := range []string{"MEMBER", "OWNER", "ADMIN"} {
		t.Run(role+"/CreateInvite", func(t *testing.T) {
			fixture := newWorkspacePermissionFixture(role)
			router := chi.NewRouter()
			router.Post("/workspaces/{workspaceID}/invites", withWorkspaceClaims(fixture.requesterID, (&Handler{Queries: fixture.queries()}).CreateInvite))
			request := httptest.NewRequest(http.MethodPost, "/workspaces/"+fixture.workspaceID.String()+"/invites", nil)
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			assertWorkspacePermissionStatus(t, response.Code, role)
		})
	}
}

func TestRequirePermissionFallsBackWhenRedisUnavailable(t *testing.T) {
	server, err := miniredis.Run()
	if err != nil {
		t.Fatal(err)
	}
	addr := server.Addr()
	server.Close()
	client := redis.NewClient(&redis.Options{
		Addr:        addr,
		MaxRetries:  -1,
		DialTimeout: 200 * time.Millisecond,
		ReadTimeout: 200 * time.Millisecond,
	})
	defer client.Close()
	cache := permission.NewCache(client, time.Minute)

	fixture := newWorkspacePermissionFixture("OWNER")
	lookups := 0
	fixture.workspaceMemberLookups = &lookups
	router := chi.NewRouter()
	router.Post("/workspaces/{workspaceID}/invites", withWorkspaceClaims(fixture.requesterID, (&Handler{
		Queries: fixture.queries(), PermissionCache: cache,
	}).CreateInvite))
	request := httptest.NewRequest(http.MethodPost, "/workspaces/"+fixture.workspaceID.String()+"/invites", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code == http.StatusForbidden {
		t.Fatalf("CreateInvite returned 403 with Redis unavailable: %s", response.Body.String())
	}
	if lookups != 1 {
		t.Fatalf("GetWorkspaceMember was called %d times, want one DB fallback lookup", lookups)
	}
}

func TestUpdateMemberRolePermission(t *testing.T) {
	for _, role := range []string{"MEMBER", "OWNER", "ADMIN"} {
		t.Run(role+"/UpdateMemberRole", func(t *testing.T) {
			fixture := newWorkspacePermissionFixture(role)
			router := chi.NewRouter()
			router.Put("/workspaces/{workspaceID}/members/{userID}/role", withWorkspaceClaims(fixture.requesterID, (&Handler{Queries: fixture.queries()}).UpdateMemberRole))
			path := "/workspaces/" + fixture.workspaceID.String() + "/members/" + fixture.targetID.String() + "/role"
			request := httptest.NewRequest(http.MethodPut, path, strings.NewReader(`{"role":"MEMBER"}`))
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			assertWorkspacePermissionStatus(t, response.Code, role)
		})
	}

	t.Run("ADMIN/UpdateMemberRoleToOwner", func(t *testing.T) {
		fixture := newWorkspacePermissionFixture("ADMIN")
		router := chi.NewRouter()
		router.Put("/workspaces/{workspaceID}/members/{userID}/role", withWorkspaceClaims(fixture.requesterID, (&Handler{Queries: fixture.queries()}).UpdateMemberRole))
		path := "/workspaces/" + fixture.workspaceID.String() + "/members/" + fixture.targetID.String() + "/role"
		request := httptest.NewRequest(http.MethodPut, path, strings.NewReader(`{"role":"OWNER"}`))
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		if response.Code != http.StatusForbidden {
			t.Fatalf("ADMIN assigning OWNER status = %d, want %d: %s", response.Code, http.StatusForbidden, response.Body.String())
		}
	})
}

func TestRemoveWorkspaceMemberPermission(t *testing.T) {
	for _, role := range []string{"MEMBER", "OWNER", "ADMIN"} {
		t.Run(role+"/RemoveMember", func(t *testing.T) {
			fixture := newWorkspacePermissionFixture(role)
			router := chi.NewRouter()
			router.Delete("/workspaces/{workspaceID}/members/{userID}", withWorkspaceClaims(fixture.requesterID, (&Handler{Queries: fixture.queries()}).RemoveMember))
			path := "/workspaces/" + fixture.workspaceID.String() + "/members/" + fixture.targetID.String()
			request := httptest.NewRequest(http.MethodDelete, path, nil)
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			assertWorkspacePermissionStatus(t, response.Code, role)
		})
	}
}

func TestUpdateMemberRoleInvalidatesCache(t *testing.T) {
	server, err := miniredis.Run()
	if err != nil {
		t.Fatal(err)
	}
	defer server.Close()
	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	defer client.Close()
	cache := permission.NewCache(client, time.Minute)

	fixture := newWorkspacePermissionFixture("OWNER")
	fixture.targetRole = "ADMIN"
	fixture.updateRoleSuccessfully = true
	if err := cache.SetRole(context.Background(), fixture.workspaceID, fixture.targetID, "ADMIN"); err != nil {
		t.Fatal(err)
	}
	if role, hit, err := cache.GetRole(context.Background(), fixture.workspaceID, fixture.targetID); err != nil || !hit || role != "ADMIN" {
		t.Fatalf("primed cache = (%q, %t, %v), want (ADMIN, true, nil)", role, hit, err)
	}

	router := chi.NewRouter()
	router.Put("/workspaces/{workspaceID}/members/{userID}/role", withWorkspaceClaims(fixture.requesterID, (&Handler{
		Queries: fixture.queries(), PermissionCache: cache,
	}).UpdateMemberRole))
	path := "/workspaces/" + fixture.workspaceID.String() + "/members/" + fixture.targetID.String() + "/role"
	request := httptest.NewRequest(http.MethodPut, path, strings.NewReader(`{"role":"MEMBER"}`))
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("demotion status = %d, want %d: %s", response.Code, http.StatusOK, response.Body.String())
	}
	if role, hit, err := cache.GetRole(context.Background(), fixture.workspaceID, fixture.targetID); err != nil || hit {
		t.Fatalf("target cache after demotion = (%q, %t, %v), want invalidated miss", role, hit, err)
	}
}

func assertWorkspacePermissionStatus(t *testing.T, status int, role string) {
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

func withWorkspaceClaims(userID uuid.UUID, handler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := context.WithValue(r.Context(), auth.UserContextKey, &auth.Claims{UserID: userID.String()})
		handler(w, r.WithContext(ctx))
	}
}

type workspacePermissionFixture struct {
	workspaceID            uuid.UUID
	requesterID            uuid.UUID
	targetID               uuid.UUID
	role                   string
	targetRole             string
	updateRoleSuccessfully bool
	workspaceMemberLookups *int
}

func newWorkspacePermissionFixture(role string) workspacePermissionFixture {
	return workspacePermissionFixture{workspaceID: uuid.New(), requesterID: uuid.New(), targetID: uuid.New(), role: role}
}

func (f workspacePermissionFixture) queries() *database.Queries {
	return database.New(workspacePermissionDB{fixture: f})
}

type workspacePermissionDB struct{ fixture workspacePermissionFixture }

func (workspacePermissionDB) Exec(context.Context, string, ...interface{}) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, errors.New("deliberate failure after permission gate")
}

func (workspacePermissionDB) Query(context.Context, string, ...interface{}) (pgx.Rows, error) {
	return nil, errors.New("unexpected Query")
}

func (db workspacePermissionDB) QueryRow(_ context.Context, query string, args ...interface{}) pgx.Row {
	switch {
	case strings.Contains(query, "name: GetWorkspaceMember"):
		if db.fixture.workspaceMemberLookups != nil {
			*db.fixture.workspaceMemberLookups++
		}
		userID := args[1].(uuid.UUID)
		role := db.fixture.role
		if userID == db.fixture.targetID {
			role = db.fixture.targetRole
			if role == "" {
				role = "MEMBER"
			}
		}
		return workspaceValuesRow{values: []interface{}{db.fixture.workspaceID, userID, role, time.Now()}}
	case strings.Contains(query, "name: UpdateWorkspaceMemberRole"):
		if db.fixture.updateRoleSuccessfully {
			return workspaceValuesRow{values: []interface{}{args[0], args[1], args[2], time.Now()}}
		}
		return workspaceErrorRow{err: errors.New("deliberate UpdateWorkspaceMemberRole failure after permission gate")}
	default:
		return workspaceErrorRow{err: fmt.Errorf("unexpected QueryRow: %s", query)}
	}
}

type workspaceValuesRow struct{ values []interface{} }

func (row workspaceValuesRow) Scan(dest ...interface{}) error {
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

type workspaceErrorRow struct{ err error }

func (row workspaceErrorRow) Scan(...interface{}) error { return row.err }
