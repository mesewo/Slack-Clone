package gateway

import "testing"

func TestPresenceManagerSupportsDND(t *testing.T) {
	manager := NewPresenceManager(NewHub())
	manager.SetStatus("user-1", StatusDND)

	if got := manager.GetStatus("user-1"); got != StatusDND {
		t.Fatalf("GetStatus() = %q, want %q", got, StatusDND)
	}
	if got := manager.Snapshot()["user-1"]; got != StatusDND {
		t.Fatalf("Snapshot() = %q, want %q", got, StatusDND)
	}
}