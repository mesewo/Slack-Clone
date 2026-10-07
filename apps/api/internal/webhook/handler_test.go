package webhook

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/mesewo/slack-clone/apps/api/internal/database"
)

func TestWebhookCreateRequiresAuthorizationAndPersistsWorkspaceScopedConfig(t *testing.T) {
	workspaceID := uuid.New()
	db := &webhookTestDB{workspaceID: workspaceID}
	handler := &Handler{
		Queries: database.New(db),
		Authorize: func(_ http.ResponseWriter, _ *http.Request, gotWorkspaceID uuid.UUID) bool {
			return gotWorkspaceID == workspaceID
		},
	}

	request := webhookRequestFor(http.MethodPost, "/api/workspaces/"+workspaceID.String()+"/webhooks", `{"url":"https://8.8.8.8/events","secret":"secret-value"}`, workspaceID, "")
	response := httptest.NewRecorder()
	handler.Create(response, request)
	if response.Code != http.StatusCreated {
		t.Fatalf("authorized create status = %d, want 201: %s", response.Code, response.Body.String())
	}
	if len(db.items) != 1 || db.items[0].WorkspaceID != workspaceID || db.items[0].Secret != "secret-value" {
		t.Fatalf("persisted webhook = %+v, want workspace-scoped URL and secret", db.items)
	}
	if strings.Contains(response.Body.String(), "secret-value") || strings.Contains(response.Body.String(), "\"secret\"") {
		t.Fatalf("create response leaked the webhook secret: %s", response.Body.String())
	}

	handler.Authorize = func(w http.ResponseWriter, _ *http.Request, _ uuid.UUID) bool {
		w.WriteHeader(http.StatusForbidden)
		return false
	}
	request = webhookRequestFor(http.MethodPost, "/api/workspaces/"+workspaceID.String()+"/webhooks", `{"url":"https://8.8.8.8/other","secret":"another"}`, workspaceID, "")
	response = httptest.NewRecorder()
	handler.Create(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("unauthorized create status = %d, want 403", response.Code)
	}
	if len(db.items) != 1 {
		t.Fatalf("unauthorized create changed stored webhooks: %+v", db.items)
	}
}

func TestValidWebhookURLRejectsPrivateAndUnresolvableHosts(t *testing.T) {
	for _, raw := range []string{
		"http://127.0.0.1/hook",
		"http://10.2.3.4/hook",
		"http://169.254.169.254/latest/meta-data/",
		"http://[::1]/hook",
		"http://[fe80::1]/hook",
	} {
		t.Run(raw, func(t *testing.T) {
			if validWebhookURL(raw) {
				t.Fatalf("validWebhookURL(%q) = true, want false", raw)
			}
		})
	}

	originalLookup := lookupWebhookIP
	lookupWebhookIP = func(string) ([]net.IP, error) { return nil, errors.New("lookup failed") }
	t.Cleanup(func() { lookupWebhookIP = originalLookup })
	if validWebhookURL("https://unresolvable.invalid/hook") {
		t.Fatal("validWebhookURL accepted an unresolvable host")
	}
}

func TestWebhookCreateRejectsNonHTTPURL(t *testing.T) {
	workspaceID := uuid.New()
	db := &webhookTestDB{workspaceID: workspaceID}
	handler := &Handler{Queries: database.New(db), Authorize: func(http.ResponseWriter, *http.Request, uuid.UUID) bool { return true }}
	request := webhookRequestFor(http.MethodPost, "/api/workspaces/"+workspaceID.String()+"/webhooks", `{"url":"file:///etc/passwd","secret":"secret"}`, workspaceID, "")
	response := httptest.NewRecorder()
	handler.Create(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("invalid URL status = %d, want 400", response.Code)
	}
	if len(db.items) != 0 {
		t.Fatal("invalid URL reached persistence")
	}
}

func webhookRequestFor(method, path, body string, workspaceID uuid.UUID, webhookID string) *http.Request {
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	routeCtx := chi.NewRouteContext()
	routeCtx.URLParams.Add("workspaceID", workspaceID.String())
	if webhookID != "" {
		routeCtx.URLParams.Add("webhookID", webhookID)
	}
	return request.WithContext(context.WithValue(request.Context(), chi.RouteCtxKey, routeCtx))
}

type webhookTestDB struct {
	workspaceID uuid.UUID
	items       []database.WorkspaceWebhook
}

func (db *webhookTestDB) Exec(context.Context, string, ...interface{}) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, errors.New("unexpected Exec")
}

func (db *webhookTestDB) Query(context.Context, string, ...interface{}) (pgx.Rows, error) {
	return nil, errors.New("unexpected Query")
}

func (db *webhookTestDB) QueryRow(_ context.Context, query string, args ...interface{}) pgx.Row {
	if !strings.Contains(query, "name: CreateWorkspaceWebhook") {
		return webhookTestErrorRow{err: errors.New("unexpected QueryRow")}
	}
	item := database.WorkspaceWebhook{
		ID: uuid.New(), WorkspaceID: args[0].(uuid.UUID), Url: args[1].(string), Secret: args[2].(string),
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	if item.WorkspaceID != db.workspaceID {
		return webhookTestErrorRow{err: errors.New("unexpected workspace")}
	}
	db.items = append(db.items, item)
	return webhookTestValuesRow{values: []interface{}{item.ID, item.WorkspaceID, item.Url, item.Secret, item.CreatedAt, item.UpdatedAt}}
}

type webhookTestValuesRow struct{ values []interface{} }

func (row webhookTestValuesRow) Scan(dest ...interface{}) error {
	if len(dest) != len(row.values) {
		return errors.New("unexpected scan arity")
	}
	for i, value := range row.values {
		switch target := dest[i].(type) {
		case *uuid.UUID:
			*target = value.(uuid.UUID)
		case *string:
			*target = value.(string)
		case *time.Time:
			*target = value.(time.Time)
		case *bool:
			*target = value.(bool)
		default:
			return errors.New("unexpected scan destination")
		}
	}
	return nil
}

type webhookTestErrorRow struct{ err error }

func (row webhookTestErrorRow) Scan(...interface{}) error { return row.err }
