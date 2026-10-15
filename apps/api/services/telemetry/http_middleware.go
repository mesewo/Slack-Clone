package telemetry

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func ChiMiddleware(serviceName string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			started := time.Now()
			wrapped := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
			next.ServeHTTP(wrapped, r)
			statusCode := wrapped.Status()
			if statusCode == 0 {
				statusCode = http.StatusOK
			}
			route := chi.RouteContext(r.Context()).RoutePattern()
			if route == "" {
				route = r.URL.Path
			}
			duration := time.Since(started)
			statusText := strconv.Itoa(statusCode)
			HTTPRequestsTotal.WithLabelValues(serviceName, r.Method, route, statusText).Inc()
			HTTPRequestDuration.WithLabelValues(serviceName, r.Method, route).Observe(duration.Seconds())
			L.Sugar().Infow("HTTP request completed", "service", serviceName, "method", r.Method, "route", route, "status", statusCode, "duration_ms", float64(duration.Microseconds())/1000)
		})
	}
}
