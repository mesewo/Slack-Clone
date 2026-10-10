package breaker

import (
	"errors"
	"sync"
	"time"
)

var ErrOpen = errors.New("circuit is open")

type CircuitState uint8

const (
	CircuitClosed CircuitState = iota
	CircuitOpen
	CircuitHalfOpen
)

type CircuitBreaker struct {
	mu            sync.Mutex
	failureLimit  int
	resetTimeout  time.Duration
	state         CircuitState
	failures      int
	openedAt      time.Time
	probeInFlight bool
	now           func() time.Time
}

func NewCircuitBreaker(failureLimit int, resetTimeout time.Duration) *CircuitBreaker {
	return NewCircuitBreakerWithClock(failureLimit, resetTimeout, time.Now)
}

// NewCircuitBreakerWithClock constructs a breaker using the supplied clock.
// It is useful when callers need deterministic control of the reset window.
func NewCircuitBreakerWithClock(failureLimit int, resetTimeout time.Duration, now func() time.Time) *CircuitBreaker {
	if failureLimit < 1 {
		failureLimit = 1
	}
	if resetTimeout < 0 {
		resetTimeout = 0
	}
	if now == nil {
		now = time.Now
	}
	return &CircuitBreaker{
		failureLimit: failureLimit,
		resetTimeout: resetTimeout,
		state:        CircuitClosed,
		now:          now,
	}
}

// Allow reports whether a request may be sent. Exactly one request is allowed
// to probe a half-open circuit at a time.
func (b *CircuitBreaker) Allow() bool {
	b.mu.Lock()
	defer b.mu.Unlock()

	if b.state == CircuitOpen {
		if b.now().Sub(b.openedAt) < b.resetTimeout {
			return false
		}
		b.state = CircuitHalfOpen
	}
	if b.state == CircuitHalfOpen {
		if b.probeInFlight {
			return false
		}
		b.probeInFlight = true
	}
	return true
}

func (b *CircuitBreaker) RecordSuccess() {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.state == CircuitHalfOpen && b.probeInFlight {
		b.state = CircuitClosed
		b.failures = 0
		b.probeInFlight = false
		return
	}
	if b.state == CircuitClosed {
		b.failures = 0
	}
}

func (b *CircuitBreaker) RecordFailure() {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.state == CircuitHalfOpen && b.probeInFlight {
		b.openLocked()
		return
	}
	if b.state != CircuitClosed {
		return
	}
	b.failures++
	if b.failures >= b.failureLimit {
		b.openLocked()
	}
}

// AbortProbe reopens a half-open circuit when its request is canceled before
// producing a receiver result. Cancellation must not leave the probe reserved.
func (b *CircuitBreaker) AbortProbe() {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.state == CircuitHalfOpen && b.probeInFlight {
		b.openLocked()
	}
}

func (b *CircuitBreaker) State() CircuitState {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.state
}

func (b *CircuitBreaker) openLocked() {
	b.state = CircuitOpen
	b.openedAt = b.now()
	b.probeInFlight = false
}
