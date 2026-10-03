package gateway

import (
	"context"
	"net/http"
	"time"

	"github.com/mesewo/slack-clone/apps/api/internal/rpc/chatpb"
)

const readinessProbeUserID = "00000000-0000-0000-0000-000000000000"

// LivenessHandler reports that the Gateway HTTP handler is serving requests.
// It intentionally does not depend on Core or Redis.
func LivenessHandler(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("ok\n"))
}

// ReadinessHandler checks the Core RPC Gateway needs to establish WebSocket
// subscriptions. Redis is deliberately excluded because Gateway supports its
// in-memory fallback mode.
func ReadinessHandler(coreClient chatpb.CoreServiceClient, timeout time.Duration) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), timeout)
		defer cancel()

		response, err := coreClient.GetUserChannels(ctx, &chatpb.GetUserChannelsRequest{UserId: readinessProbeUserID})
		if err != nil || response == nil {
			http.Error(w, "not ready", http.StatusServiceUnavailable)
			return
		}

		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ready\n"))
	}
}
