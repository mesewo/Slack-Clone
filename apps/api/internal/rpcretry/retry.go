package rpcretry

import (
	"context"
	"time"

	"github.com/mesewo/slack-clone/apps/api/internal/breaker"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

const (
	maxAttempts = 4
	baseBackoff = 100 * time.Millisecond
	rpcTimeout  = time.Second
	opTimeout   = 5 * time.Second
)

// Do retries transient service restart errors with bounded per-call and
// overall deadlines. The wait sequence is 100ms, 200ms, then 300ms.
func Do[T any](ctx context.Context, cb *breaker.CircuitBreaker, call func(context.Context) (T, error)) (T, error) {
	var zero T
	if cb != nil && !cb.Allow() {
		return zero, breaker.ErrOpen
	}
	operationCtx, operationCancel := context.WithTimeout(ctx, opTimeout)
	defer operationCancel()
	var lastErr error
	for attempt := 0; attempt < maxAttempts; attempt++ {
		rpcCtx, rpcCancel := context.WithTimeout(operationCtx, rpcTimeout)
		response, err := call(rpcCtx)
		rpcCancel()
		if err == nil {
			if cb != nil {
				cb.RecordSuccess()
			}
			return response, nil
		}
		if operationCtx.Err() != nil {
			if cb != nil {
				cb.AbortProbe()
			}
			return zero, operationCtx.Err()
		}
		lastErr = err
		code := status.Code(err)
		if code != codes.Unavailable && code != codes.DeadlineExceeded {
			if cb != nil {
				cb.RecordFailure()
			}
			return zero, err
		}
		if attempt == maxAttempts-1 {
			break
		}
		timer := time.NewTimer(time.Duration(attempt+1) * baseBackoff)
		select {
		case <-operationCtx.Done():
			timer.Stop()
			if cb != nil {
				cb.AbortProbe()
			}
			return zero, operationCtx.Err()
		case <-timer.C:
		}
	}
	if cb != nil {
		cb.RecordFailure()
	}
	return zero, lastErr
}
