package webhook

import (
	"testing"
	"time"
)

func TestCircuitBreakerTransitions(t *testing.T) {
	tests := []struct {
		name string
		run  func(*testing.T, *CircuitBreaker)
	}{
		{
			name: "closed opens at failure threshold",
			run: func(t *testing.T, breaker *CircuitBreaker) {
				breaker.RecordFailure()
				if got := breaker.State(); got != CircuitClosed {
					t.Fatalf("state after first failure = %v, want closed", got)
				}
				breaker.RecordFailure()
				if got := breaker.State(); got != CircuitOpen {
					t.Fatalf("state at threshold = %v, want open", got)
				}
				if breaker.Allow() {
					t.Fatal("open circuit allowed a request before reset timeout")
				}
			},
		},
		{
			name: "open half-open then closes after successful probe",
			run: func(t *testing.T, breaker *CircuitBreaker) {
				breaker.RecordFailure()
				breaker.RecordFailure()
				breaker.now = func() time.Time { return time.Now().Add(2 * time.Hour) }
				if !breaker.Allow() {
					t.Fatal("circuit did not allow probe after reset timeout")
				}
				if got := breaker.State(); got != CircuitHalfOpen {
					t.Fatalf("state during probe = %v, want half-open", got)
				}
				if breaker.Allow() {
					t.Fatal("half-open circuit allowed more than one probe")
				}
				breaker.RecordSuccess()
				if got := breaker.State(); got != CircuitClosed {
					t.Fatalf("state after successful probe = %v, want closed", got)
				}
			},
		},
		{
			name: "half-open failed probe reopens",
			run: func(t *testing.T, breaker *CircuitBreaker) {
				breaker.RecordFailure()
				breaker.RecordFailure()
				breaker.now = func() time.Time { return time.Now().Add(2 * time.Hour) }
				if !breaker.Allow() {
					t.Fatal("circuit did not allow half-open probe")
				}
				breaker.RecordFailure()
				if got := breaker.State(); got != CircuitOpen {
					t.Fatalf("state after failed probe = %v, want open", got)
				}
			},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			breaker := NewCircuitBreaker(2, time.Hour)
			test.run(t, breaker)
		})
	}
}
