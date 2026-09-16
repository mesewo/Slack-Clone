package gateway

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5/pgxpool"
)

// This opt-in test exercises the real running Core/Gateway services. It is
// skipped unless SLACK_LIVE_INTEGRATION=1, so normal unit runs never depend on
// developer service processes or mutate ordinary test data.
func TestLiveCoreGatewayWebSocketMessage(t *testing.T) {
	if os.Getenv("SLACK_LIVE_INTEGRATION") != "1" {
		t.Skip("set SLACK_LIVE_INTEGRATION=1 to run the live Core/Gateway test")
	}
	client := &http.Client{Timeout: 5 * time.Second}
	cookie := liveLogin(t, client)
	workspaceID := liveWorkspaces(t, client, cookie)
	channelID := liveChannels(t, client, cookie, workspaceID)

	request, _ := http.NewRequest(http.MethodGet, "http://localhost:8080/api/auth/verify", nil)
	request.Header.Set("Cookie", cookie)
	response, err := client.Do(request)
	if err != nil || response.StatusCode != http.StatusOK {
		t.Fatalf("auth verification failed: %v status=%v", err, responseStatus(response))
	}
	response.Body.Close()

	dialer := websocket.DefaultDialer
	dialer.HandshakeTimeout = 5 * time.Second
	if _, response, err := dialer.Dial("ws://localhost:8081/ws", http.Header{"Cookie": []string{"token=invalid"}, "Origin": []string{"http://localhost:3000"}}); err == nil || response == nil || response.StatusCode != http.StatusUnauthorized {
		t.Fatalf("invalid JWT was not rejected: err=%v status=%v", err, responseStatus(response))
	}
	if _, response, err := dialer.Dial("ws://localhost:8081/ws", http.Header{"Cookie": []string{cookie}, "Origin": []string{"http://evil.example"}}); err == nil || response == nil || response.StatusCode != http.StatusForbidden {
		t.Fatalf("disallowed origin was not rejected: err=%v status=%v", err, responseStatus(response))
	}
	noOriginConnection, _, err := dialer.Dial("ws://localhost:8081/ws", http.Header{"Cookie": []string{cookie}})
	if err != nil {
		t.Fatalf("non-browser client without Origin was rejected: %v", err)
	}
	_ = noOriginConnection.Close()
	connection, response, err := dialer.Dial("ws://localhost:8081/ws", http.Header{
		"Cookie": []string{cookie},
		"Origin": []string{"http://localhost:3000"},
	})
	if err != nil {
		t.Fatalf("websocket handshake failed: %v status=%v", err, responseStatus(response))
	}
	defer connection.Close()

	content := fmt.Sprintf("live-ws-%d", time.Now().UnixNano())
	body := strings.NewReader(`{"content":"` + content + `"}`)
	request, _ = http.NewRequest(http.MethodPost, "http://localhost:8080/api/channels/"+channelID+"/messages", body)
	request.Header.Set("Cookie", cookie)
	request.Header.Set("Content-Type", "application/json")
	response, err = client.Do(request)
	if err != nil || response.StatusCode != http.StatusCreated {
		t.Fatalf("message creation failed: %v status=%v", err, responseStatus(response))
	}
	var created struct {
		ID string `json:"id"`
	}
	_ = json.NewDecoder(response.Body).Decode(&created)
	response.Body.Close()
	t.Cleanup(func() {
		if created.ID == "" {
			return
		}
		deleteRequest, _ := http.NewRequest(http.MethodDelete, "http://localhost:8080/api/channels/"+channelID+"/messages/"+created.ID, nil)
		deleteRequest.Header.Set("Cookie", cookie)
		deleteResponse, deleteErr := client.Do(deleteRequest)
		if deleteErr == nil && deleteResponse != nil {
			deleteResponse.Body.Close()
		}
	})

	_ = connection.SetReadDeadline(time.Now().Add(10 * time.Second))
	for {
		_, payload, err := connection.ReadMessage()
		if err != nil {
			t.Fatalf("websocket did not receive message: %v", err)
		}
		var envelope struct {
			Type      string `json:"type"`
			ChannelID string `json:"channel_id"`
			Payload   struct {
				ID        string `json:"id"`
				UserID    string `json:"user_id"`
				ChannelID string `json:"channel_id"`
				Content   string `json:"content"`
			} `json:"payload"`
		}
		if json.Unmarshal(payload, &envelope) == nil && envelope.Type == "message_created" && (envelope.Payload.Content == content || string(payload) == content) {
			return
		}
	}
}

func TestLiveTwoUserRealtimeDelivery(t *testing.T) {
	if os.Getenv("SLACK_LIVE_INTEGRATION") != "1" {
		t.Skip("set SLACK_LIVE_INTEGRATION=1 to run the live two-user test")
	}
	client := &http.Client{Timeout: 5 * time.Second}
	userAEmail := "integration-a-" + uuid.NewString() + "@example.test"
	userBEmail := "integration-b-" + uuid.NewString() + "@example.test"
	cookieA, userAID := liveRegister(t, client, userAEmail, "Integration A")
	cookieB, userBID := liveRegister(t, client, userBEmail, "Integration B")
	workspaceID, workspaceSlug := liveCreateWorkspace(t, client, cookieA, "Runtime "+uuid.NewString())
	t.Cleanup(func() {
		liveCleanup(t, userAEmail, userBEmail, workspaceID)
	})
	channelID := liveCreateChannel(t, client, cookieA, workspaceID)
	liveJoinWorkspace(t, client, cookieB, workspaceSlug)
	liveJoinChannel(t, client, cookieB, channelID)

	connectionA := liveConnect(t, cookieA)
	defer connectionA.Close()
	connectionB := liveConnect(t, cookieB)
	defer connectionB.Close()

	content := "two-user-" + uuid.NewString()
	liveCreateMessage(t, client, cookieA, channelID, content)
	event := liveReadMessage(t, connectionB, content)
	if event.Payload.UserID != userAID || event.ChannelID != channelID {
		t.Fatalf("unexpected event identity: user=%s channel=%s expected user=%s channel=%s", event.Payload.UserID, event.ChannelID, userAID, channelID)
	}
	_ = userBID
}

type liveMessageEvent struct {
	Type      string `json:"type"`
	ChannelID string `json:"channel_id"`
	Payload   struct {
		ID        string `json:"id"`
		UserID    string `json:"user_id"`
		ChannelID string `json:"channel_id"`
		Content   string `json:"content"`
	} `json:"payload"`
}

func liveRegister(t *testing.T, client *http.Client, email, name string) (string, string) {
	t.Helper()
	body := fmt.Sprintf(`{"email":%q,"password":"12345678","display_name":%q}`, email, name)
	request, _ := http.NewRequest(http.MethodPost, "http://localhost:8080/api/auth/register", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response, err := client.Do(request)
	if err != nil || response.StatusCode != http.StatusCreated {
		t.Fatalf("register %s failed: %v status=%v", email, err, responseStatus(response))
	}
	defer response.Body.Close()
	var result struct {
		ID string `json:"id"`
	}
	_ = json.NewDecoder(response.Body).Decode(&result)
	if len(response.Cookies()) == 0 || result.ID == "" {
		t.Fatalf("registration returned no identity for %s", email)
	}
	return response.Cookies()[0].Name + "=" + response.Cookies()[0].Value, result.ID
}

func liveCreateWorkspace(t *testing.T, client *http.Client, cookie, name string) (string, string) {
	body := fmt.Sprintf(`{"name":%q}`, name)
	request, _ := http.NewRequest(http.MethodPost, "http://localhost:8080/api/workspaces", strings.NewReader(body))
	request.Header.Set("Cookie", cookie)
	request.Header.Set("Content-Type", "application/json")
	response, err := client.Do(request)
	if err != nil || response.StatusCode != http.StatusCreated {
		t.Fatalf("workspace create failed: %v status=%v", err, responseStatus(response))
	}
	defer response.Body.Close()
	var result struct {
		ID   string `json:"id"`
		Slug string `json:"slug"`
	}
	_ = json.NewDecoder(response.Body).Decode(&result)
	return result.ID, result.Slug
}

func liveCreateChannel(t *testing.T, client *http.Client, cookie, workspaceID string) string {
	body := fmt.Sprintf(`{"workspace_id":%q,"name":%q,"type":"PUBLIC"}`, workspaceID, "runtime-"+uuid.NewString())
	request, _ := http.NewRequest(http.MethodPost, "http://localhost:8080/api/channels", strings.NewReader(body))
	request.Header.Set("Cookie", cookie)
	request.Header.Set("Content-Type", "application/json")
	response, err := client.Do(request)
	if err != nil || response.StatusCode != http.StatusCreated {
		t.Fatalf("channel create failed: %v status=%v", err, responseStatus(response))
	}
	defer response.Body.Close()
	var result struct {
		ID string `json:"id"`
	}
	_ = json.NewDecoder(response.Body).Decode(&result)
	return result.ID
}

func liveJoinWorkspace(t *testing.T, client *http.Client, cookie, slug string) {
	liveJSONPost(t, client, cookie, "/api/workspaces/join", fmt.Sprintf(`{"slug":%q}`, slug), http.StatusOK)
}
func liveJoinChannel(t *testing.T, client *http.Client, cookie, channelID string) {
	request, _ := http.NewRequest(http.MethodPost, "http://localhost:8080/api/channels/"+channelID+"/join", strings.NewReader("{}"))
	request.Header.Set("Cookie", cookie)
	request.Header.Set("Content-Type", "application/json")
	response, err := client.Do(request)
	if err != nil || (response.StatusCode != http.StatusNoContent && response.StatusCode != http.StatusConflict) {
		t.Fatalf("channel join failed: %v status=%v", err, responseStatus(response))
	}
	response.Body.Close()
}

func liveJSONPost(t *testing.T, client *http.Client, cookie, path, body string, expected int) {
	request, _ := http.NewRequest(http.MethodPost, "http://localhost:8080"+path, strings.NewReader(body))
	request.Header.Set("Cookie", cookie)
	request.Header.Set("Content-Type", "application/json")
	response, err := client.Do(request)
	if err != nil || response.StatusCode != expected {
		t.Fatalf("POST %s failed: %v status=%v expected=%d", path, err, responseStatus(response), expected)
	}
	response.Body.Close()
}

func liveConnect(t *testing.T, cookie string) *websocket.Conn {
	connection, response, err := websocket.DefaultDialer.Dial("ws://localhost:8081/ws", http.Header{"Cookie": []string{cookie}, "Origin": []string{"http://localhost:3000"}})
	if err != nil {
		t.Fatalf("websocket connect failed: %v status=%v", err, responseStatus(response))
	}
	return connection
}
func liveCreateMessage(t *testing.T, client *http.Client, cookie, channelID, content string) {
	liveJSONPost(t, client, cookie, "/api/channels/"+channelID+"/messages", fmt.Sprintf(`{"content":%q}`, content), http.StatusCreated)
}
func liveReadMessage(t *testing.T, connection *websocket.Conn, content string) liveMessageEvent {
	_ = connection.SetReadDeadline(time.Now().Add(10 * time.Second))
	for {
		_, data, err := connection.ReadMessage()
		if err != nil {
			t.Fatal(err)
		}
		var event liveMessageEvent
		if json.Unmarshal(data, &event) == nil && event.Type == "message_created" && event.Payload.Content == content {
			return event
		}
	}
}
func liveCleanup(t *testing.T, emailA, emailB, workspaceID string) {
	t.Helper()
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		url = "postgres://postgres:181296@127.0.0.1:5432/slack_db?sslmode=disable"
	}
	pool, err := pgxpool.New(context.Background(), url)
	if err != nil {
		t.Logf("cleanup pool: %v", err)
		return
	}
	defer pool.Close()
	_, _ = pool.Exec(context.Background(), "DELETE FROM workspaces WHERE id = $1", workspaceID)
	_, _ = pool.Exec(context.Background(), "DELETE FROM users WHERE email = ANY($1::text[])", []string{emailA, emailB})
}

func liveLogin(t *testing.T, client *http.Client) string {
	t.Helper()
	request, _ := http.NewRequest(http.MethodPost, "http://localhost:8080/api/auth/login", strings.NewReader(`{"email":"kafka@gmail.com","password":"12345678"}`))
	request.Header.Set("Content-Type", "application/json")
	response, err := client.Do(request)
	if err != nil || response.StatusCode != http.StatusOK {
		t.Fatalf("login failed: %v status=%v", err, responseStatus(response))
	}
	defer response.Body.Close()
	if len(response.Cookies()) == 0 {
		t.Fatal("login returned no auth cookie")
	}
	return response.Cookies()[0].Name + "=" + response.Cookies()[0].Value
}

func liveWorkspaces(t *testing.T, client *http.Client, cookie string) string {
	var items []struct {
		ID string `json:"id"`
	}
	liveGET(t, client, cookie, "/api/workspaces", &items)
	if len(items) == 0 {
		t.Fatal("no live workspaces")
	}
	return items[0].ID
}

func liveChannels(t *testing.T, client *http.Client, cookie, workspaceID string) string {
	var items []struct {
		ID string `json:"id"`
	}
	liveGET(t, client, cookie, "/api/channels?workspace_id="+workspaceID, &items)
	if len(items) == 0 {
		t.Fatal("no live channels")
	}
	return items[0].ID
}

func liveGET(t *testing.T, client *http.Client, cookie, path string, target any) {
	t.Helper()
	request, _ := http.NewRequest(http.MethodGet, "http://localhost:8080"+path, nil)
	request.Header.Set("Cookie", cookie)
	response, err := client.Do(request)
	if err != nil || response.StatusCode != http.StatusOK {
		t.Fatalf("GET %s failed: %v status=%v", path, err, responseStatus(response))
	}
	defer response.Body.Close()
	if err := json.NewDecoder(response.Body).Decode(target); err != nil {
		t.Fatal(err)
	}
}

func responseStatus(response *http.Response) any {
	if response == nil {
		return nil
	}
	return response.StatusCode
}
