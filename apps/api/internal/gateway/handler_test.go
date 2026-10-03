package gateway

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/mesewo/slack-clone/apps/api/internal/auth"
	"github.com/mesewo/slack-clone/apps/api/internal/rpc/chatpb"
	"google.golang.org/grpc"
)

type fakeCoreClient struct {
	response *chatpb.GetUserChannelsResponse
	err      error
}

func (f fakeCoreClient) GetUserChannels(context.Context, *chatpb.GetUserChannelsRequest, ...grpc.CallOption) (*chatpb.GetUserChannelsResponse, error) {
	return f.response, f.err
}

type recordingHub struct {
	mu            sync.Mutex
	registered    int
	subscriptions []string
	subscribed    chan struct{}
	once          sync.Once
}

func (h *recordingHub) Register(*Client) {
	h.mu.Lock()
	h.registered++
	h.mu.Unlock()
}
func (h *recordingHub) Unregister(*Client) {}
func (h *recordingHub) SubscribeToChannel(_ context.Context, _, channelID string) error {
	h.mu.Lock()
	h.subscriptions = append(h.subscriptions, channelID)
	if len(h.subscriptions) == 2 && h.subscribed != nil {
		h.once.Do(func() { close(h.subscribed) })
	}
	h.mu.Unlock()
	return nil
}
func (*recordingHub) BroadcastToChannel(string, []byte) {}
func (*recordingHub) BroadcastPresence(string, []byte)  {}

type recordingPresence struct {
	mu       sync.Mutex
	statuses []UserStatus
	active   chan struct{}
	once     sync.Once
}

func (p *recordingPresence) SetStatus(_ string, status UserStatus) {
	p.mu.Lock()
	p.statuses = append(p.statuses, status)
	p.mu.Unlock()
	if status == StatusActive && p.active != nil {
		p.once.Do(func() { close(p.active) })
	}
}
func (p *recordingPresence) GetStatus(string) UserStatus     { return StatusAway }
func (p *recordingPresence) Snapshot() map[string]UserStatus { return map[string]UserStatus{} }
func (p *recordingPresence) recordedStatuses() []UserStatus {
	p.mu.Lock()
	defer p.mu.Unlock()
	return append([]UserStatus(nil), p.statuses...)
}

func TestServeWSRejectsMissingOrInvalidJWT(t *testing.T) {
	for _, tc := range []struct {
		name   string
		cookie *http.Cookie
	}{
		{name: "missing"},
		{name: "invalid", cookie: &http.Cookie{Name: auth.CookieName, Value: "not-a-token"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var called atomic.Bool
			server := newWebSocketTestServer(t, fakeCoreFunc(func() { called.Store(true) }))
			response := websocketRequest(t, server.URL, tc.cookie)
			defer response.Body.Close()
			if response.StatusCode != http.StatusUnauthorized {
				t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusUnauthorized)
			}
			if called.Load() {
				t.Fatal("membership RPC called for unauthenticated request")
			}
		})
	}
}

// fakeCoreFunc provides a test hook while implementing the generated client interface.
type fakeCoreFunc func()

func (f fakeCoreFunc) GetUserChannels(context.Context, *chatpb.GetUserChannelsRequest, ...grpc.CallOption) (*chatpb.GetUserChannelsResponse, error) {
	f()
	return &chatpb.GetUserChannelsResponse{}, nil
}

func TestServeWSLoadsMembershipsBeforeSuccessfulUpgrade(t *testing.T) {
	channelID := uuid.NewString()
	dmID := "dm:" + uuid.NewString()
	hub := &recordingHub{subscribed: make(chan struct{})}
	presence := &recordingPresence{active: make(chan struct{})}
	server := newWebSocketTestServer(t, fakeCoreClient{response: &chatpb.GetUserChannelsResponse{ChannelIds: []string{channelID, dmID}}}, hub, presence)
	cookie := validCookie(t, server.tokens)
	conn, response, err := websocket.DefaultDialer.Dial(server.URL, http.Header{
		"Cookie": []string{cookie.Name + "=" + cookie.Value},
		"Origin": []string{"http://localhost:3000"},
	})
	if err != nil {
		t.Fatalf("websocket dial failed (status %v): %v", responseStatusForTest(response), err)
	}
	defer conn.Close()
	if response.StatusCode != http.StatusSwitchingProtocols {
		t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusSwitchingProtocols)
	}
	select {
	case <-hub.subscribed:
	case <-time.After(time.Second):
		t.Fatal("successful connection did not complete channel subscriptions")
	}
	select {
	case <-presence.active:
	case <-time.After(time.Second):
		t.Fatal("successful connection did not initialize presence")
	}

	if len(hub.subscriptions) != 2 || hub.subscriptions[0] != channelID || hub.subscriptions[1] != dmID {
		t.Fatalf("subscriptions = %#v, want [%s %s]", hub.subscriptions, channelID, dmID)
	}
	if hub.registered != 1 {
		t.Fatalf("registered clients = %d, want 1", hub.registered)
	}
	statuses := presence.recordedStatuses()
	if len(statuses) == 0 || statuses[0] != StatusActive {
		t.Fatalf("presence statuses = %v, want active initialization", statuses)
	}
}

func TestServeWSMembershipFailureReturnsGenericHTTPErrorBeforeUpgrade(t *testing.T) {
	hub := &recordingHub{}
	presence := &recordingPresence{}
	server := newWebSocketTestServer(t, fakeCoreClient{err: context.DeadlineExceeded}, hub, presence)
	cookie := validCookie(t, server.tokens)
	response := websocketRequest(t, server.URL, cookie)
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusServiceUnavailable)
	}
	if strings.TrimSpace(string(body)) != membershipUnavailableMessage {
		t.Fatalf("body = %q, want generic membership error", body)
	}
	if strings.Contains(string(body), "deadline") || strings.Contains(string(body), "context") {
		t.Fatalf("response leaked internal RPC error: %q", body)
	}
	if hub.registered != 0 || len(hub.subscriptions) != 0 {
		t.Fatalf("failed membership lookup left hub state: registered=%d subscriptions=%v", hub.registered, hub.subscriptions)
	}
	if statuses := presence.recordedStatuses(); len(statuses) != 0 {
		t.Fatalf("failed membership lookup changed presence: %v", statuses)
	}
}

func TestServeWSNilMembershipResponseReturnsGenericHTTPErrorBeforeUpgrade(t *testing.T) {
	hub := &recordingHub{}
	presence := &recordingPresence{}
	server := newWebSocketTestServer(t, fakeCoreClient{}, hub, presence)
	cookie := validCookie(t, server.tokens)
	response := websocketRequest(t, server.URL, cookie)
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusServiceUnavailable)
	}
	if strings.TrimSpace(string(body)) != membershipUnavailableMessage {
		t.Fatalf("body = %q, want generic membership error", body)
	}
	if hub.registered != 0 || len(hub.subscriptions) != 0 {
		t.Fatalf("nil response left hub state: registered=%d subscriptions=%v", hub.registered, hub.subscriptions)
	}
	if statuses := presence.recordedStatuses(); len(statuses) != 0 {
		t.Fatalf("nil response changed presence: %v", statuses)
	}
}

type webSocketTestServer struct {
	URL    string
	tokens *auth.TokenManager
}

func newWebSocketTestServer(t *testing.T, core chatpb.CoreServiceClient, dependencies ...any) webSocketTestServer {
	t.Helper()
	hub := HubInterface(NewHub())
	pm := PresenceManagerInterface(NewPresenceManager(hub.(*Hub)))
	if len(dependencies) > 0 {
		if v, ok := dependencies[0].(HubInterface); ok {
			hub = v
		}
	}
	if len(dependencies) > 1 {
		pm = dependencies[1].(PresenceManagerInterface)
	}
	tokens := auth.NewTokenManager([]byte("test-secret"), time.Hour)
	ConfigureAllowedOrigins([]string{"http://localhost:3000"})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ServeWS(hub, pm, tokens, core, w, r)
	}))
	t.Cleanup(srv.Close)
	return webSocketTestServer{URL: "ws" + strings.TrimPrefix(srv.URL, "http"), tokens: tokens}
}

func validCookie(t *testing.T, tokens *auth.TokenManager) *http.Cookie {
	t.Helper()
	value, err := tokens.Generate(uuid.NewString(), "test@example.test")
	if err != nil {
		t.Fatal(err)
	}
	return &http.Cookie{Name: auth.CookieName, Value: value}
}

func websocketRequest(t *testing.T, url string, cookie *http.Cookie) *http.Response {
	t.Helper()
	request, err := http.NewRequest(http.MethodGet, "http"+strings.TrimPrefix(url, "ws"), nil)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Origin", "http://localhost:3000")
	if cookie != nil {
		request.AddCookie(cookie)
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	return response
}

func responseStatusForTest(response *http.Response) any {
	if response == nil {
		return nil
	}
	return response.StatusCode
}
