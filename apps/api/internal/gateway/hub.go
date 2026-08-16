package gateway

import (
	"sync"

	"github.com/gorilla/websocket"
)

type Client struct {
	UserID string
	Conn   *websocket.Conn
	Send   chan []byte
}

type MessagePayload struct {
	ChannelID string `json:"channel_id"`
	UserID    string `json:"user_id"`
	Content   string `json:"content"`
	Type      string `json:"type"` // "message", "typing", ...
}

// Hub tracks live connections and channel subscriptions.
//
// clients is keyed userID -> set of that user's active connections, so a
// user with two tabs open (or phone + laptop) doesn't have one connection
// silently evict the other - which is what happens if you key by userID
// alone and store a single *Client per entry.
type Hub struct {
	clients  map[string]map[*Client]bool
	channels map[string]map[string]bool // channelID -> set of subscribed userIDs
	mu       sync.RWMutex
}

func NewHub() *Hub {
	return &Hub{
		clients:  make(map[string]map[*Client]bool),
		channels: make(map[string]map[string]bool),
	}
}

func (h *Hub) Register(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.clients[client.UserID] == nil {
		h.clients[client.UserID] = make(map[*Client]bool)
	}
	h.clients[client.UserID][client] = true
}

// Unregister removes exactly this connection, not "whatever's registered for
// this userID" - so closing one tab never disconnects a different tab.
func (h *Hub) Unregister(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	conns, ok := h.clients[client.UserID]
	if !ok {
		return
	}
	if _, ok := conns[client]; ok {
		delete(conns, client)
		close(client.Send)
	}
	if len(conns) == 0 {
		delete(h.clients, client.UserID)
	}
}

func (h *Hub) SubscribeToChannel(userID, channelID string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.channels[channelID] == nil {
		h.channels[channelID] = make(map[string]bool)
	}
	h.channels[channelID][userID] = true
}

// BroadcastPresence sends a presence change to every channel this user
// belongs to. This is O(channels), fine at hobby-project scale - revisit
// with a reverse index (userID -> channelIDs) if that ever matters.
func (h *Hub) BroadcastPresence(userID string, message []byte) {
	h.mu.RLock()
	var channelIDs []string
	for channelID, subscribers := range h.channels {
		if subscribers[userID] {
			channelIDs = append(channelIDs, channelID)
		}
	}
	h.mu.RUnlock() // release before calling back into BroadcastToChannel

	for _, channelID := range channelIDs {
		h.BroadcastToChannel(channelID, message)
	}
}

func (h *Hub) BroadcastToChannel(channelID string, message []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	subscribers, ok := h.channels[channelID]
	if !ok {
		return
	}

	for userID := range subscribers {
		for client := range h.clients[userID] {
			select {
			case client.Send <- message:
			default:
				// Slow consumer: drop this message rather than block the whole
				// broadcast. Don't clean up the connection here - we're only
				// holding a read lock. The dead connection gets removed by
				// Unregister once readPump/writePump notices it's gone.
			}
		}
	}
}