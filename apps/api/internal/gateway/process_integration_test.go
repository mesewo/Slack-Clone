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
	if !core.stopGracefully(t, 10*time.Second) {
		t.Fatalf("core graceful shutdown failed: %s", core.logs())
	}
	t.Log("process lifecycle verified; client-side automatic reconnect/history synchronization requires the browser frontend harness")
	_ = workspaceID
	_ = wsA
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
