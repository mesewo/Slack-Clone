package telemetry

import (
	"context"
	"runtime/debug"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func UnaryServerInterceptor(serviceName string) grpc.UnaryServerInterceptor {
	return func(ctx context.Context, request interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (response interface{}, err error) {
		started := time.Now()
		code := codes.OK.String()
		panicked := false
		defer func() {
			if recovered := recover(); recovered != nil {
				panicked = true
				code = "panic"
				L.Sugar().Errorw("gRPC handler panicked", "service", serviceName, "method", info.FullMethod, "panic", recovered, "stack", string(debug.Stack()))
				response = nil
				err = status.Errorf(codes.Internal, "internal error")
			}

			duration := time.Since(started)
			GRPCRequestsTotal.WithLabelValues(serviceName, info.FullMethod, code).Inc()
			GRPCRequestDuration.WithLabelValues(serviceName, info.FullMethod).Observe(duration.Seconds())
			if panicked {
				return
			}
			fields := []interface{}{"service", serviceName, "method", info.FullMethod, "duration_ms", float64(duration.Microseconds()) / 1000, "code", code}
			if err != nil {
				L.Sugar().Warnw("gRPC request failed", append(fields, "error", err)...)
			} else {
				L.Sugar().Infow("gRPC request completed", fields...)
			}
		}()

		response, err = handler(ctx, request)
		if err != nil {
			code = status.Code(err).String()
		}
		return response, err
	}
}
