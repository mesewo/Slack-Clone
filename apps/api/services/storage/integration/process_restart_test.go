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

	"github.com/mesewo/slack-clone/services/contracts/storagepb"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/status"
)

func TestStorageServiceProcessRestart(t *testing.T) {
	if os.Getenv("SLACK_STORAGE_PROCESS_INTEGRATION") != "1" {
		t.Skip("set SLACK_STORAGE_PROCESS_INTEGRATION=1 to run the real storage-service process restart test")
	}
	port := freePort(t)
	address := net.JoinHostPort("127.0.0.1", port)
	binary := filepath.Join(t.TempDir(), "storage-service"+executableSuffix())
	build := exec.Command("go", "build", "-o", binary, "./cmd/storage-service")
	build.Dir = ".."
	if output, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build storage-service: %v\n%s", err, output)
	}
	conn, err := grpc.NewClient(address, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	client := storagepb.NewStorageServiceClient(conn)

	service := startStorageService(t, binary, address)
	assertPresignValidation(t, client)
	if err := service.Process.Kill(); err != nil {
		t.Fatalf("kill first storage-service process: %v", err)
	}
	if err := waitService(service); errors.Is(err, context.DeadlineExceeded) {
		t.Fatal("first storage-service process did not exit after kill")
	}
	startStorageService(t, binary, address)
	assertPresignValidation(t, client)
}

type runningService struct {
	*exec.Cmd
	done chan error
}

func startStorageService(t *testing.T, binary, address string) *runningService {
	t.Helper()
	cmd := exec.Command(binary)
	cmd.Env = append(os.Environ(),
		"STORAGE_GRPC_ADDR="+address,
		"DATABASE_URL=postgres://unused:unused@127.0.0.1:1/unused?sslmode=disable",
		"S3_ENDPOINT=127.0.0.1:1",
		"S3_ACCESS_KEY=unused",
		"S3_SECRET_KEY=unused",
		"S3_BUCKET=unused",
	)
	service := &runningService{Cmd: cmd, done: make(chan error, 1)}
	if err := cmd.Start(); err != nil {
		t.Fatalf("start storage-service: %v", err)
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

func assertPresignValidation(t *testing.T, client storagepb.StorageServiceClient) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	var lastErr error
	for time.Now().Before(deadline) {
		ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
		_, err := client.PresignUpload(ctx, &storagepb.PresignUploadRequest{UserId: "11111111-1111-4111-8111-111111111111"})
		cancel()
		if status.Code(err) == codes.InvalidArgument && status.Convert(err).Message() == "file is required" {
			return
		}
		lastErr = err
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatalf("storage-service validation RPC did not recover before timeout: %v", lastErr)
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
