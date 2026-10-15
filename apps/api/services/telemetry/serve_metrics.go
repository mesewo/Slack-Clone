package telemetry

import (
	"net/http"
)

func ServeMetricsOnly(addr string) *http.Server {
	mux := http.NewServeMux()
	mux.Handle("GET /metrics", MetricsHandler())
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	return &http.Server{Addr: addr, Handler: mux}
}
