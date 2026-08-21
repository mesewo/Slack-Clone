package gateway

import (
	"encoding/json"
	"sync"
)

type UserStatus string

const (
	StatusActive UserStatus = "active"
	StatusAway   UserStatus = "away"
)

// PresenceManager tracks each user's status and broadcasts changes.
// Gemini's version tracked status in a map but never told anyone about
// changes - which makes it presence-tracking, not presence.
type PresenceManager struct {
	mu       sync.RWMutex
	statuses map[string]UserStatus
	hub      *Hub
}

func NewPresenceManager(hub *Hub) *PresenceManager {
	return &PresenceManager{statuses: make(map[string]UserStatus), hub: hub}
}

func (pm *PresenceManager) SetStatus(userID string, status UserStatus) {
	pm.mu.Lock()
	changed := pm.statuses[userID] != status
	pm.statuses[userID] = status
	pm.mu.Unlock()

	if !changed {
		return
	}

	payload, err := json.Marshal(PresencePayload{UserID: userID, Status: string(status)})
	if err != nil {
		return
	}
	event, err := json.Marshal(WSEvent{Type: EventPresence, Payload: payload})
	if err != nil {
		return
	}
	pm.hub.BroadcastPresence(userID, event)
}

func (pm *PresenceManager) GetStatus(userID string) UserStatus {
	pm.mu.RLock()
	defer pm.mu.RUnlock()
	if status, ok := pm.statuses[userID]; ok {
		return status
	}
	return StatusAway
}

// Snapshot returns a copy of every known user's current status. A brand-new
// connection has no way to learn about users who were already online -
// SetStatus only broadcasts on change, so anyone whose status hasn't changed
// since before this client connected never gets (re-)announced. ServeWS
// sends this snapshot directly to a new connection right after it registers.
func (pm *PresenceManager) Snapshot() map[string]UserStatus {
	pm.mu.RLock()
	defer pm.mu.RUnlock()
	snap := make(map[string]UserStatus, len(pm.statuses))
	for k, v := range pm.statuses {
		snap[k] = v
	}
	return snap
}