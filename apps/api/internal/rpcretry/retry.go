package rpcretry

import (
	"context"
	"time"

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
func Do[T any](ctx context.Context, call func(context.Context) (T, error)) (T, error) {
	var zero T
	operationCtx, operationCancel := context.WithTimeout(ctx, opTimeout)
	defer operationCancel()
	var lastErr error
	for attempt := 0; attempt < maxAttempts; attempt++ {
		rpcCtx, rpcCancel := context.WithTimeout(operationCtx, rpcTimeout)
		response, err := call(rpcCtx)
		rpcCancel()
		if err == nil {
			return response, nil
		}
		lastErr = err
		code := status.Code(err)
		if code != codes.Unavailable && code != codes.DeadlineExceeded {
			return zero, err
		}
		if attempt == maxAttempts-1 {
			break
		}
		timer := time.NewTimer(time.Duration(attempt+1) * baseBackoff)
		select {
		case <-operationCtx.Done():
			timer.Stop()
			return zero, operationCtx.Err()
		case <-timer.C:
		}
	}
	return zero, lastErr
}
