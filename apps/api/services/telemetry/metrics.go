package telemetry

import (
	"net/http"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
	GRPCRequestsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "slack_clone_grpc_requests_total",
		Help: "Total number of gRPC server requests.",
	}, []string{"service", "method", "code"})
	GRPCRequestDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "slack_clone_grpc_request_duration_seconds",
		Help:    "Duration of gRPC server requests in seconds.",
		Buckets: prometheus.DefBuckets,
	}, []string{"service", "method"})
	HTTPRequestsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "slack_clone_http_requests_total",
		Help: "Total number of HTTP server requests.",
	}, []string{"service", "method", "route", "status"})
	HTTPRequestDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "slack_clone_http_request_duration_seconds",
		Help:    "Duration of HTTP server requests in seconds.",
		Buckets: prometheus.DefBuckets,
	}, []string{"service", "method", "route"})
)

func MetricsHandler() http.Handler {
	return promhttp.Handler()
}
