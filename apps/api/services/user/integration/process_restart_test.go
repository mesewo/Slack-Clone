package integration

import (
	"context"
	"errors"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/mesewo/slack-clone/services/authlib/auth"
	"github.com/mesewo/slack-clone/services/contracts/userpb"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

func TestUserServiceProcessRestart(t *testing.T) {
	if os.Getenv("SLACK_USER_PROCESS_INTEGRATION") != "1" {
		t.Skip("set SLACK_USER_PROCESS_INTEGRATION=1 to run the real user-service process restart test")
	}
	port := freePort(t)
	address := net.JoinHostPort("127.0.0.1", port)
	secret := "process-restart-test-secret"
	binary := filepath.Join(t.TempDir(), "user-service"+executableSuffix())
	build := exec.Command("go", "build", "-o", binary, "./cmd/user-service")
	build.Dir = ".."
	if output, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build user-service: %v\n%s", err, output)
	}

	clientConn, err := grpc.NewClient(address, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		t.Fatal(err)
	}
	defer clientConn.Close()
	client := userpb.NewUserServiceClient(clientConn)
	tokens := auth.NewTokenManager([]byte(secret), time.Hour)
	token, err := tokens.GenerateWithDisplayName("user-process-test", "process@example.com", "Process Test")
	if err != nil {
		t.Fatal(err)
	}
	request := &userpb.VerifyRequest{Token: token}

	service := startUserService(t, binary, address, secret)
	assertVerify(t, client, request)
	if err := service.Process.Kill(); err != nil {
		t.Fatalf("kill first user-service process: %v", err)
	}
	if err := waitService(service); errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("first user-service process did not exit after kill")
	}

	startUserService(t, binary, address, secret)
	assertVerify(t, client, request)
}

type runningService struct {
	*exec.Cmd
	done chan error
}

func startUserService(t *testing.T, binary, address, secret string) *runningService {
	t.Helper()
	cmd := exec.Command(binary)
	cmd.Env = append(os.Environ(),
		"USER_GRPC_ADDR="+address,
		"DATABASE_URL=postgres://unused:unused@127.0.0.1:1/unused?sslmode=disable",
		"REDIS_ADDR=127.0.0.1:1",
		"JWT_SECRET="+secret,
	)
	service := &runningService{Cmd: cmd, done: make(chan error, 1)}
	if err := cmd.Start(); err != nil {
		t.Fatalf("start user-service: %v", err)
	}
	go func() { service.done <- cmd.Wait() }()
	t.Cleanup(func() {
		if cmd.ProcessState == nil && cmd.Process != nil {
			_ = cmd.Process.Kill()
			<-service.done
		}
	})
	return service
}

func assertVerify(t *testing.T, client userpb.UserServiceClient, request *userpb.VerifyRequest) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	var lastErr error
	for time.Now().Before(deadline) {
		ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
		response, err := client.Verify(ctx, request)
		cancel()
		if err == nil {
			if response.GetUserId() != "user-process-test" || response.GetEmail() != "process@example.com" || response.GetDisplayName() != "Process Test" {
				t.Fatalf("Verify response = %+v", response)
			}
			return
		}
		lastErr = err
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatalf("user-service Verify did not recover before timeout: %v", lastErr)
}

func waitService(service *runningService) error {
	select {
	case err := <-service.done:
		return err
	case <-time.After(5 * time.Second):
		return context.DeadlineExceeded
	}
}

func freePort(t *testing.T) string {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	return fmt.Sprint(listener.Addr().(*net.TCPAddr).Port)
}

func executableSuffix() string {
	if runtime.GOOS == "windows" {
		return ".exe"
	}
	return ""
}
