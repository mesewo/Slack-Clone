package webhook

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"
)

const (
	maxAttempts     = 3
	requestTimeout  = 10 * time.Second
	initialBackoff  = 100 * time.Millisecond
	signatureHeader = "X-Slack-Clone-Signature"
)

var ErrCircuitOpen = errors.New("webhook circuit is open")

type PermanentDeliveryError struct {
	StatusCode int
}

func (e *PermanentDeliveryError) Error() string {
	return fmt.Sprintf("webhook receiver returned HTTP %d", e.StatusCode)
}

type Dispatcher struct {
	client       *http.Client
	failureLimit int
	resetTimeout time.Duration
	breakersMu   sync.Mutex
	breakers     map[string]*CircuitBreaker
}

func NewDispatcher(client *http.Client, failureLimit int, resetTimeout time.Duration) *Dispatcher {
	if client == nil {
		client = http.DefaultClient
	}
	return &Dispatcher{
		client:       client,
		failureLimit: failureLimit,
		resetTimeout: resetTimeout,
		breakers:     make(map[string]*CircuitBreaker),
	}
}

func (d *Dispatcher) Send(ctx context.Context, targetURL, secret string, payload []byte) error {
	breaker := d.breakerFor(targetURL)
	if !breaker.Allow() {
		return ErrCircuitOpen
	}

	for attempt := 0; attempt < maxAttempts; attempt++ {
		attemptCtx, cancel := context.WithTimeout(ctx, requestTimeout)
		req, err := http.NewRequestWithContext(attemptCtx, http.MethodPost, targetURL, bytes.NewReader(payload))
		if err != nil {
			cancel()
			breaker.RecordSuccess()
			return fmt.Errorf("create webhook request: %w", err)
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set(signatureHeader, SignPayload(secret, payload))
		resp, err := d.client.Do(req)
		if err != nil {
			cancel()
			if ctx.Err() != nil {
				breaker.AbortProbe()
				return ctx.Err()
			}
			breaker.RecordFailure()
			if attempt == maxAttempts-1 {
				return fmt.Errorf("webhook request failed after %d attempts: %w", maxAttempts, err)
			}
			if err := waitBackoff(ctx, attempt); err != nil {
				return err
			}
			continue
		}
		_, _ = io.Copy(io.Discard, resp.Body)
		_ = resp.Body.Close()
		cancel()
		if resp.StatusCode >= http.StatusInternalServerError {
			breaker.RecordFailure()
			if attempt == maxAttempts-1 {
				return fmt.Errorf("webhook receiver returned HTTP %d after %d attempts", resp.StatusCode, maxAttempts)
			}
			if err := waitBackoff(ctx, attempt); err != nil {
				return err
			}
			continue
		}
		breaker.RecordSuccess()
		if resp.StatusCode >= http.StatusBadRequest {
			return &PermanentDeliveryError{StatusCode: resp.StatusCode}
		}
		return nil
	}
	return errors.New("webhook delivery attempts exhausted")
}

func (d *Dispatcher) breakerFor(targetURL string) *CircuitBreaker {
	d.breakersMu.Lock()
	defer d.breakersMu.Unlock()
	if breaker := d.breakers[targetURL]; breaker != nil {
		return breaker
	}
	breaker := NewCircuitBreaker(d.failureLimit, d.resetTimeout)
	d.breakers[targetURL] = breaker
	return breaker
}

func waitBackoff(ctx context.Context, attempt int) error {
	delay := initialBackoff << attempt
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
