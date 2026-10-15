package webhook

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/mesewo/slack-clone/apps/api/internal/breaker"
)

func TestDispatcherRetriesSignsOpensAndRecovers(t *testing.T) {
	const secret = "integration-secret"
	payload := []byte(`{"type":"message.sent","id":"msg-456"}`)
	var status atomic.Int32
	var requests atomic.Int32
	status.Store(http.StatusInternalServerError)
	receiver := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Errorf("read request body: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		mac := hmac.New(sha256.New, []byte(secret))
		_, _ = mac.Write(body)
		want := hex.EncodeToString(mac.Sum(nil))
		if got := r.Header.Get(signatureHeader); got != want {
			t.Errorf("signature header = %q, want %q", got, want)
		}
		if string(body) != string(payload) {
			t.Errorf("payload = %q, want %q", body, payload)
		}
		w.WriteHeader(int(status.Load()))
	}))
	defer receiver.Close()

	dispatcher := NewDispatcher(receiver.Client(), 3, 40*time.Millisecond)
	err := dispatcher.Send(context.Background(), receiver.URL, secret, payload)
	if err == nil {
		t.Fatal("Send succeeded for receiver returning 500")
	}
	if got := requests.Load(); got != maxAttempts {
		t.Fatalf("requests after failed Send = %d, want %d attempts", got, maxAttempts)
	}
	cb := dispatcher.breakerFor(receiver.URL)
	if got := cb.State(); got != breaker.CircuitOpen {
		t.Fatalf("breaker state after threshold failures = %v, want open", got)
	}
	if err := dispatcher.Send(context.Background(), receiver.URL, secret, payload); !errors.Is(err, ErrCircuitOpen) {
		t.Fatalf("Send while open error = %v, want ErrCircuitOpen", err)
	}
	if got := requests.Load(); got != maxAttempts {
		t.Fatalf("open circuit sent another request: count %d, want %d", got, maxAttempts)
	}

	status.Store(http.StatusNoContent)
	time.Sleep(50 * time.Millisecond)
	if err := dispatcher.Send(context.Background(), receiver.URL, secret, payload); err != nil {
		t.Fatalf("Send after reset window: %v", err)
	}
	if got := requests.Load(); got != maxAttempts+1 {
		t.Fatalf("requests after successful probe = %d, want %d", got, maxAttempts+1)
	}
	if got := cb.State(); got != breaker.CircuitClosed {
		t.Fatalf("breaker state after successful probe = %v, want closed", got)
	}
}

func TestDispatcherDoesNotRetryClientErrors(t *testing.T) {
	var requests atomic.Int32
	receiver := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		requests.Add(1)
		w.WriteHeader(http.StatusBadRequest)
	}))
	defer receiver.Close()
	dispatcher := NewDispatcher(receiver.Client(), 3, time.Second)

	err := dispatcher.Send(context.Background(), receiver.URL, "secret", []byte(`{}`))
	var permanentErr *PermanentDeliveryError
	if !errors.As(err, &permanentErr) || permanentErr.StatusCode != http.StatusBadRequest {
		t.Fatalf("Send error = %v, want permanent HTTP 400 failure", err)
	}
	if got := requests.Load(); got != 1 {
		t.Fatalf("request count for HTTP 400 = %d, want 1", got)
	}
}

func TestDispatcherRetriesTimeouts(t *testing.T) {
	var requests atomic.Int32
	receiver := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		requests.Add(1)
		time.Sleep(30 * time.Millisecond)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer receiver.Close()
	client := &http.Client{Timeout: 5 * time.Millisecond}
	dispatcher := NewDispatcher(client, 5, time.Second)

	if err := dispatcher.Send(context.Background(), receiver.URL, "secret", []byte(`{}`)); err == nil {
		t.Fatal("Send succeeded although each receiver response timed out")
	}
	if got := requests.Load(); got != maxAttempts {
		t.Fatalf("requests after timeout = %d, want %d attempts", got, maxAttempts)
	}
}
