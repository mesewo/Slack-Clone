package telemetry

import (
	"context"
	"testing"

	"github.com/prometheus/client_golang/prometheus/testutil"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestUnaryServerInterceptorMetricsAndPanicRecovery(t *testing.T) {
	const service = "telemetry-interceptor-test"
	tests := []struct {
		name      string
		codeLabel string
		handler   grpc.UnaryHandler
		wantCode  codes.Code
	}{
		{
			name:      "success",
			codeLabel: codes.OK.String(),
			handler: func(context.Context, interface{}) (interface{}, error) {
				return "response", nil
			},
			wantCode: codes.OK,
		},
		{
			name:      "status error",
			codeLabel: codes.NotFound.String(),
			handler: func(context.Context, interface{}) (interface{}, error) {
				return nil, status.Error(codes.NotFound, "missing")
			},
			wantCode: codes.NotFound,
		},
		{
			name:      "panic",
			codeLabel: "panic",
			handler: func(context.Context, interface{}) (interface{}, error) {
				panic("unexpected")
			},
			wantCode: codes.Internal,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			method := "/telemetry.Test/" + test.name
			counter := GRPCRequestsTotal.WithLabelValues(service, method, test.codeLabel)
			before := testutil.ToFloat64(counter)
			response, err := UnaryServerInterceptor(service)(context.Background(), nil, &grpc.UnaryServerInfo{FullMethod: method}, test.handler)
			if got := testutil.ToFloat64(counter) - before; got != 1 {
				t.Fatalf("request counter increase = %v, want 1", got)
			}
			if got := status.Code(err); got != test.wantCode {
				t.Fatalf("status code = %v, want %v (response %v, error %v)", got, test.wantCode, response, err)
			}
		})
	}
}
