package gateway

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

type managedService struct {
	name       string
	cmd        *exec.Cmd
	out        strings.Builder
	mu         sync.Mutex
	done       chan error
	stdoutPath string
	stderrPath string
}

func startManagedService(t *testing.T, name, binary string, env []string, port string) *managedService {
	t.Helper()
	service := &managedService{name: name, done: make(chan error, 1)}
	service.cmd = exec.Command(binary)
	configureProcess(service.cmd)
	service.cmd.Dir = filepath.Join("..", "..")
	service.cmd.Env = append(os.Environ(), loadAPIEnv(t)...)
	service.cmd.Env = append(service.cmd.Env, env...)
	stdoutFile, err := os.CreateTemp("", name+"-stdout-*.log")
	if err != nil {
		t.Fatalf("%s stdout file: %v", name, err)
	}
	stderrFile, err := os.CreateTemp("", name+"-stderr-*.log")
	if err != nil {
		stdoutFile.Close()
		t.Fatalf("%s stderr file: %v", name, err)
	}
	service.stdoutPath = stdoutFile.Name()
	service.stderrPath = stderrFile.Name()
	service.cmd.Stdout = stdoutFile
	service.cmd.Stderr = stderrFile
	if err := service.cmd.Start(); err != nil {
		t.Fatalf("start %s: %v", name, err)
	}
	t.Cleanup(func() {
		if service.cmd.ProcessState == nil && service.cmd.Process != nil {
			_ = service.cmd.Process.Kill()
			<-service.done
		}
	})
	go func() {
		err := service.cmd.Wait()
		stdoutFile.Close()
		stderrFile.Close()
		service.done <- err
	}()
	waitForPort(t, port, 30*time.Second, service)
	return service
}

func loadAPIEnv(t *testing.T) []string {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", ".env"))
	if err != nil {
		t.Fatalf("read API .env: %v", err)
	}
	values := make([]string, 0)
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		values = append(values, line)
	}
	return values
}

func (s *managedService) logs() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	stdout, _ := os.ReadFile(s.stdoutPath)
	stderr, _ := os.ReadFile(s.stderrPath)
	return string(stdout) + string(stderr)
}

func (s *managedService) stopGracefully(t *testing.T, timeout time.Duration) bool {
	t.Helper()
	if s.cmd == nil || s.cmd.Process == nil {
		return true
	}
	if err := gracefulStopProcess(s.cmd.Process); err != nil {
		t.Logf("%s graceful signal unavailable: %v", s.name, err)
		return false
	}
	select {
	case err := <-s.done:
		t.Logf("%s exited after graceful signal: %v", s.name, err)
		return true
	case <-time.After(timeout):
		t.Logf("%s did not exit within %s\n%s", s.name, timeout, s.logs())
		return false
	}
}

func buildRuntimeBinary(t *testing.T, name string) string {
	t.Helper()
	apiDir := filepath.Join("..", "..")
	path := filepath.Join(t.TempDir(), name+exeSuffix())
	cmd := exec.Command("go", "build", "-o", path, "./cmd/"+name)
	cmd.Dir = apiDir
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("build %s: %v\n%s", name, err, output)
	}
	return path
}

func buildChannelServiceBinary(t *testing.T) string {
	t.Helper()
	apiDir := filepath.Join("..", "..")
	path := filepath.Join(t.TempDir(), "channel-service"+exeSuffix())
	cmd := exec.Command("go", "build", "-o", path, "./services/channel/cmd/channel-service")
	cmd.Dir = apiDir
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("build channel-service: %v\n%s", err, output)
	}
	return path
}

func exeSuffix() string {
	if os.PathSeparator == '\\' {
		return ".exe"
	}
	return ""
}

func waitForPort(t *testing.T, address string, timeout time.Duration, service *managedService) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		connection, err := (&net.Dialer{}).DialContext(context.Background(), "tcp", address)
		if err == nil {
			connection.Close()
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("port %s did not become ready\n%s", address, service.logs())
}

func TestLiveGatewayInterruptionProcessOwned(t *testing.T) {
	if os.Getenv("SLACK_PROCESS_INTEGRATION") != "1" {
		t.Skip("set SLACK_PROCESS_INTEGRATION=1 to run process-owned interruption test")
	}
	coreBinary := buildRuntimeBinary(t, "core")
	gatewayBinary := buildRuntimeBinary(t, "gateway")
	coreHTTP, coreGRPC := "18080", "19091"
	gatewayHTTP, gatewayGRPC := "18081", "19090"
	core := startManagedService(t, "core", coreBinary, []string{"CORE_HTTP_ADDR=:" + coreHTTP, "CORE_GRPC_ADDR=localhost:" + coreGRPC, "GATEWAY_GRPC_ADDR=localhost:" + gatewayGRPC}, "localhost:"+coreHTTP)
	gateway := startManagedService(t, "gateway", gatewayBinary, []string{"CORE_GRPC_ADDR=localhost:" + coreGRPC, "GATEWAY_GRPC_ADDR=localhost:" + gatewayGRPC, "GATEWAY_HTTP_ADDR=:" + gatewayHTTP, "FRONTEND_URL=http://localhost:3000"}, "localhost:"+gatewayGRPC)
	defer func() {
		if gateway.cmd.ProcessState == nil {
			_ = gateway.stopGracefully(t, 5*time.Second)
		}
	}()

	client := &http.Client{Timeout: 5 * time.Second}
	baseURL := "http://localhost:" + coreHTTP
	cookieA := processLogin(t, client, baseURL, "kafka@gmail.com", "12345678")
	cookieB := processLogin(t, client, baseURL, "kafka@gmail.com", "12345678")
	workspaceID := processWorkspace(t, client, baseURL, cookieA)
	channelID := processChannel(t, client, baseURL, cookieA, workspaceID)
	wsA := processConnect(t, gatewayHTTP, cookieA)
	defer wsA.Close()
	wsB := processConnect(t, gatewayHTTP, cookieB)
	defer wsB.Close()
	processCreateMessage(t, client, baseURL, cookieA, channelID, "process-baseline")
	if _, _, err := wsB.ReadMessage(); err != nil {
		t.Fatalf("baseline B receive failed: %v", err)
	}

	if !gateway.stopGracefully(t, 5*time.Second) {
		t.Fatalf("gateway graceful shutdown failed: %s", gateway.logs())
	}
	for index := 1; index <= 3; index++ {
		processCreateMessage(t, client, baseURL, cookieA, channelID, fmt.Sprintf("process-outage-%d", index))
	}
	if !processHistoryContains(t, client, baseURL, cookieA, channelID, "process-outage-3") {
		t.Fatal("outage message was not persisted")
	}

	gateway = startManagedService(t, "gateway-restart", gatewayBinary, []string{"CORE_GRPC_ADDR=localhost:" + coreGRPC, "GATEWAY_GRPC_ADDR=localhost:" + gatewayGRPC, "GATEWAY_HTTP_ADDR=:" + gatewayHTTP, "FRONTEND_URL=http://localhost:3000"}, "localhost:"+gatewayGRPC)
	defer gateway.stopGracefully(t, 5*time.Second)
	reconnected := processConnect(t, gatewayHTTP, cookieB)
	defer reconnected.Close()
	reconnectPrefix := "process-after-gateway-restart-" + uuid.NewString()
	reconnectEvent := processCreateUntilLiveDelivery(t, client, baseURL, cookieA, channelID, reconnectPrefix, reconnected)
	if reconnectEvent.ChannelID != channelID || reconnectEvent.Payload.ChannelID != channelID {
		t.Fatalf("unexpected post-Gateway-restart channel event: channel=%s payload_channel=%s", reconnectEvent.ChannelID, reconnectEvent.Payload.ChannelID)
	}
	if !processHistoryContains(t, client, baseURL, cookieA, channelID, reconnectEvent.Payload.Content) {
		t.Fatal("post-restart live message was not persisted")
	}

	if !core.stopGracefully(t, 10*time.Second) {
		t.Fatalf("core graceful shutdown failed: %s", core.logs())
	}
	t.Log("Gateway restart reconnect, subscription restoration, persisted history, and live delivery verified")
	_ = workspaceID
	_ = wsA
}

func TestCoreRestartPreservesEstablishedGatewayWebSocket(t *testing.T) {
	if os.Getenv("SLACK_PROCESS_INTEGRATION") != "1" {
		t.Skip("set SLACK_PROCESS_INTEGRATION=1 to run process-owned Core restart test")
	}
	coreBinary := buildRuntimeBinary(t, "core")
	gatewayBinary := buildRuntimeBinary(t, "gateway")
	coreHTTP, coreGRPC := "18280", "19291"
	gatewayHTTP, gatewayGRPC := "18281", "19290"
	coreEnv := []string{"CORE_HTTP_ADDR=:" + coreHTTP, "CORE_GRPC_ADDR=localhost:" + coreGRPC, "GATEWAY_GRPC_ADDR=localhost:" + gatewayGRPC}
	gatewayEnv := []string{"CORE_GRPC_ADDR=localhost:" + coreGRPC, "GATEWAY_GRPC_ADDR=localhost:" + gatewayGRPC, "GATEWAY_HTTP_ADDR=:" + gatewayHTTP, "FRONTEND_URL=http://localhost:3000"}
	gateway := startManagedService(t, "gateway-core-restart", gatewayBinary, gatewayEnv, "localhost:"+gatewayGRPC)
	defer func() {
		if gateway.cmd.ProcessState == nil {
			_ = gateway.stopGracefully(t, 5*time.Second)
		}
	}()
	core := startManagedService(t, "core-restart-before", coreBinary, coreEnv, "localhost:"+coreHTTP)
	defer func() {
		if core.cmd.ProcessState == nil {
			_ = core.stopGracefully(t, 10*time.Second)
		}
	}()

	client := &http.Client{Timeout: 10 * time.Second}
	baseURL := "http://localhost:" + coreHTTP
	databaseURL := ""
	for _, entry := range loadAPIEnv(t) {
		if strings.HasPrefix(entry, "DATABASE_URL=") {
			databaseURL = strings.TrimPrefix(entry, "DATABASE_URL=")
			break
		}
	}
	if databaseURL == "" {
		t.Fatal("DATABASE_URL is required in apps/api/.env for test cleanup")
	}
	t.Setenv("DATABASE_URL", databaseURL)
	cookie, userID, email := processRegister(t, client, baseURL, "Core restart "+uuid.NewString())
	var workspaceID string
	t.Cleanup(func() { liveCleanup(t, email, email, workspaceID) })
	workspaceID = processCreateWorkspaceAt(t, client, baseURL, cookie, "Core restart "+uuid.NewString())
	channelID := processCreateChannelAt(t, client, baseURL, cookie, workspaceID)
	connection := processConnect(t, gatewayHTTP, cookie)
	defer connection.Close()

	initialContent := "before-core-restart-" + uuid.NewString()
	processCreateMessage(t, client, baseURL, cookie, channelID, initialContent)
	initialEvent := liveReadMessage(t, connection, initialContent)
	if initialEvent.Payload.UserID != userID || initialEvent.ChannelID != channelID {
		t.Fatalf("unexpected initial event user=%s channel=%s", initialEvent.Payload.UserID, initialEvent.ChannelID)
	}

	if !core.stopGracefully(t, 10*time.Second) {
		t.Fatalf("Core did not stop gracefully: %s", core.logs())
	}
	core = startManagedService(t, "core-restart-after", coreBinary, coreEnv, "localhost:"+coreHTTP)

	postRestartContent := "after-core-restart-" + uuid.NewString()
	processCreateMessage(t, client, baseURL, cookie, channelID, postRestartContent)
	postRestartEvent := liveReadMessage(t, connection, postRestartContent)
	if postRestartEvent.Payload.UserID != userID || postRestartEvent.ChannelID != channelID {
		t.Fatalf("unexpected post-restart event user=%s channel=%s", postRestartEvent.Payload.UserID, postRestartEvent.ChannelID)
	}
}

func TestLiveCoreRecoversChannelServiceRestart(t *testing.T) {
	if os.Getenv("SLACK_PROCESS_INTEGRATION") != "1" {
		t.Skip("set SLACK_PROCESS_INTEGRATION=1 to run process-owned channel-service recovery test")
	}
	coreBinary := buildRuntimeBinary(t, "core")
	channelBinary := buildChannelServiceBinary(t)
	channelPort, coreHTTPPort, coreGRPCPort := freePort(t), freePort(t), freePort(t)
	channelAddr := "127.0.0.1:" + channelPort
	coreHTTPAddr := "127.0.0.1:" + coreHTTPPort
	coreGRPCAddr := "127.0.0.1:" + coreGRPCPort
	channelEnv := []string{"CHANNEL_GRPC_ADDR=" + channelAddr}
	coreEnv := []string{
		"CORE_HTTP_ADDR=" + coreHTTPAddr,
		"CORE_GRPC_ADDR=" + coreGRPCAddr,
		"GATEWAY_GRPC_ADDR=127.0.0.1:" + freePort(t),
		"CHANNEL_GRPC_ADDR=" + channelAddr,
		"CORE_NODE_ID=core-live-recovery",
		"CORE_NODE_ADDRESS=" + coreGRPCAddr,
	}
	channelService := startManagedService(t, "channel-service-before-restart", channelBinary, channelEnv, channelAddr)
	core := startManagedService(t, "core-channel-recovery", coreBinary, coreEnv, coreHTTPAddr)
	client := &http.Client{Timeout: 10 * time.Second}
	baseURL := "http://" + coreHTTPAddr
	cookie, _, email := processRegister(t, client, baseURL, "Channel recovery "+uuid.NewString())
	var workspaceID string
	t.Cleanup(func() { liveCleanup(t, email, email, workspaceID) })
	workspaceID = processCreateWorkspaceAt(t, client, baseURL, cookie, "Channel recovery "+uuid.NewString())
	channelID := processCreateChannelAt(t, client, baseURL, cookie, workspaceID)

	processCreateMessage(t, client, baseURL, cookie, channelID, "before-channel-service-restart-"+uuid.NewString())
	wantLog := "channel " + channelID + " owned by core-live-recovery at " + coreGRPCAddr
	waitForLog(t, core, wantLog, 10*time.Second)
	initialOwnerLogCount := strings.Count(core.logs(), wantLog)
	corePID := core.cmd.Process.Pid

	if err := channelService.cmd.Process.Kill(); err != nil {
		t.Fatalf("kill channel service: %v", err)
	}
	select {
	case <-channelService.done:
	case <-time.After(5 * time.Second):
		t.Fatalf("channel service did not exit after kill\n%s", channelService.logs())
	}
	channelService = startManagedService(t, "channel-service-after-restart", channelBinary, channelEnv, channelAddr)

	processCreateMessage(t, client, baseURL, cookie, channelID, "after-channel-service-restart-"+uuid.NewString())
	waitForLogCount(t, core, wantLog, initialOwnerLogCount+1, 15*time.Second)
	if core.cmd.Process.Pid != corePID || core.cmd.ProcessState != nil {
		t.Fatalf("Core process changed or exited during channel-service restart")
	}
	if !core.stopGracefully(t, 10*time.Second) {
		t.Fatalf("Core did not stop cleanly: %s", core.logs())
	}
}

func freePort(t *testing.T) string {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	return strings.TrimPrefix(listener.Addr().String(), "127.0.0.1:")
}

func waitForLog(t *testing.T, service *managedService, expected string, timeout time.Duration) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if strings.Contains(service.logs(), expected) {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("log %q not found\n%s", expected, service.logs())
}

func waitForLogCount(t *testing.T, service *managedService, expected string, count int, timeout time.Duration) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		logs := service.logs()
		if strings.Count(logs, expected) >= count {
			return
		}
		if service.cmd.ProcessState != nil {
			t.Fatalf("Core exited while waiting for owner resolution: %s", logs)
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("owner resolution log %q did not occur %d times after channel restart\n%s", expected, count, service.logs())
}

func processCreateUntilLiveDelivery(t *testing.T, client *http.Client, baseURL, cookie, channelID, contentPrefix string, connection *websocket.Conn) liveMessageEvent {
	t.Helper()
	type readResult struct {
		event   liveMessageEvent
		content string
		err     error
	}
	received := make(chan readResult, 1)
	attemptsByContent := make(map[string]int)
	go func() {
		_ = connection.SetReadDeadline(time.Now().Add(20 * time.Second))
		for {
			_, data, err := connection.ReadMessage()
			if err != nil {
				received <- readResult{err: err}
				return
			}
			var event liveMessageEvent
			if json.Unmarshal(data, &event) == nil && event.Type == "message_created" && strings.HasPrefix(event.Payload.Content, contentPrefix) {
				received <- readResult{event: event, content: event.Payload.Content}
				return
			}
		}
	}()

	for attempt := 1; attempt <= 8; attempt++ {
		content := fmt.Sprintf("%s-%d", contentPrefix, attempt)
		attemptsByContent[content] = attempt
		processCreateMessage(t, client, baseURL, cookie, channelID, content)
		select {
		case result := <-received:
			if result.err != nil {
				t.Fatalf("read post-restart WebSocket event: %v", result.err)
			}
			receivedAttempt, ok := attemptsByContent[result.content]
			if !ok {
				t.Fatalf("received unexpected post-restart event content %q", result.content)
			}
			if result.event.Payload.Content != result.content {
				t.Fatalf("received event content %q does not match attempt content %q", result.event.Payload.Content, result.content)
			}
			t.Logf("post-Gateway-restart live event matched attempt %d content %q", receivedAttempt, result.content)
			return result.event
		case <-time.After(500 * time.Millisecond):
		}
	}
	t.Fatal("no live event arrived over the reconnected WebSocket after 8 message attempts")
	return liveMessageEvent{}
}

func processRegister(t *testing.T, client *http.Client, baseURL, displayName string) (string, string, string) {
	t.Helper()
	email := "process-" + uuid.NewString() + "@example.test"
	body := fmt.Sprintf(`{"email":%q,"password":"12345678","display_name":%q}`, email, displayName)
	request, _ := http.NewRequest(http.MethodPost, baseURL+"/api/auth/register", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response, err := client.Do(request)
	if err != nil || response.StatusCode != http.StatusCreated {
		t.Fatalf("register failed: %v status=%v", err, responseStatus(response))
	}
	defer response.Body.Close()
	var result struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	if len(response.Cookies()) == 0 || result.ID == "" {
		t.Fatal("registration returned no cookie or user ID")
	}
	return response.Cookies()[0].Name + "=" + response.Cookies()[0].Value, result.ID, email
}

func processCreateWorkspaceAt(t *testing.T, client *http.Client, baseURL, cookie, name string) string {
	t.Helper()
	request, _ := http.NewRequest(http.MethodPost, baseURL+"/api/workspaces", strings.NewReader(fmt.Sprintf(`{"name":%q}`, name)))
	request.Header.Set("Cookie", cookie)
	request.Header.Set("Content-Type", "application/json")
	response, err := client.Do(request)
	if err != nil || response.StatusCode != http.StatusCreated {
		t.Fatalf("create workspace failed: %v status=%v", err, responseStatus(response))
	}
	defer response.Body.Close()
	var result struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	return result.ID
}

func processCreateChannelAt(t *testing.T, client *http.Client, baseURL, cookie, workspaceID string) string {
	t.Helper()
	body := fmt.Sprintf(`{"workspace_id":%q,"name":%q,"type":"PUBLIC"}`, workspaceID, "process-"+uuid.NewString())
	request, _ := http.NewRequest(http.MethodPost, baseURL+"/api/channels", strings.NewReader(body))
	request.Header.Set("Cookie", cookie)
	request.Header.Set("Content-Type", "application/json")
	response, err := client.Do(request)
	if err != nil || response.StatusCode != http.StatusCreated {
		t.Fatalf("create channel failed: %v status=%v", err, responseStatus(response))
	}
	defer response.Body.Close()
	var result struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	return result.ID
}

func processLogin(t *testing.T, client *http.Client, baseURL, email, password string) string {
	request, _ := http.NewRequest(http.MethodPost, baseURL+"/api/auth/login", strings.NewReader(fmt.Sprintf(`{"email":%q,"password":%q}`, email, password)))
	request.Header.Set("Content-Type", "application/json")
	response, err := client.Do(request)
	if err != nil || response.StatusCode != http.StatusOK {
		t.Fatalf("login failed: %v status=%v", err, responseStatus(response))
	}
	defer response.Body.Close()
	return response.Cookies()[0].Name + "=" + response.Cookies()[0].Value
}
func processWorkspace(t *testing.T, client *http.Client, baseURL, cookie string) string {
	var items []struct {
		ID string `json:"id"`
	}
	processGET(t, client, baseURL, cookie, "/api/workspaces", &items)
	return items[0].ID
}
func processChannel(t *testing.T, client *http.Client, baseURL, cookie, workspaceID string) string {
	var items []struct {
		ID string `json:"id"`
	}
	processGET(t, client, baseURL, cookie, "/api/channels?workspace_id="+workspaceID, &items)
	return items[0].ID
}
func processConnect(t *testing.T, gatewayHTTP, cookie string) *websocket.Conn {
	connection, response, err := websocket.DefaultDialer.Dial("ws://localhost:"+gatewayHTTP+"/ws", http.Header{"Cookie": []string{cookie}, "Origin": []string{"http://localhost:3000"}})
	if err != nil {
		t.Fatalf("connect failed: %v status=%v", err, responseStatus(response))
	}
	return connection
}
func processCreateMessage(t *testing.T, client *http.Client, baseURL, cookie, channelID, content string) {
	request, _ := http.NewRequest(http.MethodPost, baseURL+"/api/channels/"+channelID+"/messages", strings.NewReader(fmt.Sprintf(`{"content":%q}`, content)))
	request.Header.Set("Cookie", cookie)
	request.Header.Set("Content-Type", "application/json")
	response, err := client.Do(request)
	if err != nil || response.StatusCode != http.StatusCreated {
		t.Fatalf("message %s failed: %v status=%v", content, err, responseStatus(response))
	}
	response.Body.Close()
}
func processHistoryContains(t *testing.T, client *http.Client, baseURL, cookie, channelID, content string) bool {
	var messages []struct {
		Content string `json:"content"`
	}
	processGET(t, client, baseURL, cookie, "/api/channels/"+channelID+"/messages", &messages)
	for _, message := range messages {
		if message.Content == content {
			return true
		}
	}
	return false
}
func processGET(t *testing.T, client *http.Client, baseURL, cookie, path string, target any) {
	request, _ := http.NewRequest(http.MethodGet, baseURL+path, nil)
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
