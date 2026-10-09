package message

import (
	"bytes"
	"context"
	"errors"
	"log"
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
	"github.com/mesewo/slack-clone/apps/api/internal/channelclient"
	"github.com/mesewo/slack-clone/apps/api/internal/database"
)

func TestSendMessageConsultsChannelOwnerServiceAfterMembershipCheck(t *testing.T) {
	channelID := uuid.New()
	userID := uuid.New()
	owners := &recordingOwnerResolver{owner: channelclient.Owner{NodeID: "core-test", Address: "127.0.0.1:9091"}}
	handler := &Handler{
		Queries:       database.New(&membershipOnlyDB{}),
		ChannelOwners: owners,
	}

	var logs bytes.Buffer
	previousWriter := log.Writer()
	log.SetOutput(&logs)
	t.Cleanup(func() { log.SetOutput(previousWriter) })

	router := chi.NewRouter()
	router.Post("/channels/{channelID}/messages", func(w http.ResponseWriter, r *http.Request) {
		claims := &auth.Claims{UserID: userID.String()}
		ctx := context.WithValue(r.Context(), auth.UserContextKey, claims)
		handler.SendMessage(w, r.WithContext(ctx))
	})
	request := httptest.NewRequest(http.MethodPost, "/channels/"+channelID.String()+"/messages", strings.NewReader(`{"content":"ring lookup test"}`))
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d after the test DB reaches its unsupported transaction", response.Code, http.StatusInternalServerError)
	}
	if owners.channelID != channelID.String() {
		t.Fatalf("owner lookup channel ID = %q, want %q", owners.channelID, channelID)
	}
	if !strings.Contains(logs.String(), "channel "+channelID.String()+" owned by core-test at 127.0.0.1:9091") {
		t.Fatalf("owner lookup log missing; logs: %s", logs.String())
	}
}

type recordingOwnerResolver struct {
	channelID string
	owner     channelclient.Owner
}

func (resolver *recordingOwnerResolver) GetOwner(_ context.Context, channelID string) (channelclient.Owner, error) {
	resolver.channelID = channelID
	return resolver.owner, nil
}

func TestDeleteMessagePermission(t *testing.T) {
	for _, role := range []string{"MEMBER", "OWNER", "ADMIN"} {
		t.Run(role+"/DeleteOtherUsersMessage", func(t *testing.T) {
			status, permissionLookups := deleteMessageWithRole(t, role, false)
			if role == "MEMBER" {
				if status != http.StatusForbidden {
					t.Fatalf("MEMBER status = %d, want %d", status, http.StatusForbidden)
				}
			} else if status == http.StatusForbidden {
				t.Fatalf("%s unexpectedly denied with 403", role)
			}
			if permissionLookups != 1 {
				t.Fatalf("workspace permission lookups = %d, want 1", permissionLookups)
			}
		})
	}

	t.Run("MEMBER/DeleteOwnMessageWithoutPermissionLookup", func(t *testing.T) {
		status, permissionLookups := deleteMessageWithRole(t, "MEMBER", true)
		if status == http.StatusForbidden {
			t.Fatal("author was forbidden from deleting their own message")
		}
		if permissionLookups != 0 {
			t.Fatalf("author deletion made %d workspace permission lookups, want 0", permissionLookups)
		}
	})
}

func deleteMessageWithRole(t *testing.T, role string, authorIsRequester bool) (int, int) {
	t.Helper()
	channelID, workspaceID := uuid.New(), uuid.New()
	requesterID, authorID := uuid.New(), uuid.New()
	if authorIsRequester {
		authorID = requesterID
	}
	db := &membershipOnlyDB{
		channelID: channelID, workspaceID: workspaceID, requesterID: requesterID,
		messageID: uuid.New(), authorID: authorID, role: role,
	}
	handler := &Handler{Queries: database.New(db)}
	router := chi.NewRouter()
	router.Delete("/channels/{channelID}/messages/{messageID}", func(w http.ResponseWriter, r *http.Request) {
		claims := &auth.Claims{UserID: requesterID.String()}
		ctx := context.WithValue(r.Context(), auth.UserContextKey, claims)
		handler.DeleteMessage(w, r.WithContext(ctx))
	})
	path := "/channels/" + channelID.String() + "/messages/" + db.messageID.String()
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodDelete, path, nil))
	return response.Code, db.permissionLookups
}

type membershipOnlyDB struct {
	channelID         uuid.UUID
	workspaceID       uuid.UUID
	requesterID       uuid.UUID
	messageID         uuid.UUID
	authorID          uuid.UUID
	role              string
	permissionLookups int
}

func (membershipOnlyDB) Exec(context.Context, string, ...interface{}) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, errors.New("unexpected Exec")
}

func (membershipOnlyDB) Query(context.Context, string, ...interface{}) (pgx.Rows, error) {
	return nil, errors.New("unexpected Query")
}

func (db *membershipOnlyDB) QueryRow(_ context.Context, query string, args ...interface{}) pgx.Row {
	switch {
	case strings.Contains(query, "name: IsChannelMember"):
		return messageValuesRow{values: []interface{}{true}}
	case strings.Contains(query, "name: GetMessageByID"):
		return messageValuesRow{values: []interface{}{
			db.messageID, db.channelID, uuid.NullUUID{UUID: db.authorID, Valid: true},
			"message", time.Now(), nil, nil, uuid.NullUUID{}, int32(0),
		}}
	case strings.Contains(query, "FROM channels WHERE id = $1"):
		return messageValuesRow{values: []interface{}{db.channelID, db.workspaceID, "general", "PUBLIC", uuid.NullUUID{}, time.Now()}}
	case strings.Contains(query, "name: GetWorkspaceMember"):
		db.permissionLookups++
		userID := args[1].(uuid.UUID)
		return messageValuesRow{values: []interface{}{db.workspaceID, userID, db.role, time.Now()}}
	default:
		return messageErrorRow{err: errors.New("unexpected QueryRow: " + query)}
	}
}

type messageValuesRow struct{ values []interface{} }

func (row messageValuesRow) Scan(dest ...interface{}) error {
	if len(dest) != len(row.values) {
		return errors.New("unexpected QueryRow scan arguments")
	}
	for i, value := range row.values {
		target := reflect.ValueOf(dest[i])
		if target.Kind() != reflect.Pointer || !target.Elem().CanSet() {
			return errors.New("QueryRow scan target is not a settable pointer")
		}
		if value == nil {
			target.Elem().Set(reflect.Zero(target.Elem().Type()))
		} else {
			target.Elem().Set(reflect.ValueOf(value))
		}
	}
	return nil
}

type messageErrorRow struct{ err error }

func (row messageErrorRow) Scan(...interface{}) error { return row.err }
