package webhook

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"testing"
)

func TestSignPayloadCanBeVerifiedByReceiver(t *testing.T) {
	secret := "receiver-shared-secret"
	body := []byte(`{"event":"message.sent","message_id":"msg-123"}`)
	signature := SignPayload(secret, body)

	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(body)
	want := hex.EncodeToString(mac.Sum(nil))
	if signature != want {
		t.Fatalf("signature = %q, want %q", signature, want)
	}
}
