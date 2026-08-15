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
	Type      string `json:"type"` // e.g., "message", "typing"
}

type Hub struct {
	// Registered clients grouped by UserID so multiple tabs/devices can stay connected.
	clients map[string]map[*Client]struct{}

	// Channel subscriptions: channelID -> map[userID]bool
	channels map[string]map[string]bool
	mu       sync.RWMutex
}

func NewHub() *Hub {
	return &Hub{
		clients:  make(map[string]map[*Client]struct{}),
		channels: make(map[string]map[string]bool),
	}
}

func (h *Hub) RegisterClient(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.clients[client.UserID]; !ok {
		h.clients[client.UserID] = make(map[*Client]struct{})
	}
	h.clients[client.UserID][client] = struct{}{}
}

func (h *Hub) UnregisterClient(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	clients, ok := h.clients[client.UserID]
	if !ok {
		return
	}

	delete(clients, client)
	if len(clients) == 0 {
		delete(h.clients, client.UserID)
	}
}

func (h *Hub) SubscribeToChannel(userID, channelID string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.channels[channelID]; !ok {
		h.channels[channelID] = make(map[string]bool)
	}
	h.channels[channelID][userID] = true
}

func (h *Hub) BroadcastToChannel(channelID string, message []byte) {
	h.mu.RLock()
	subscribers, ok := h.channels[channelID]
	h.mu.RUnlock()
	if !ok {
		return
	}

	for userID := range subscribers {
		h.mu.RLock()
		clients, exists := h.clients[userID]
		h.mu.RUnlock()
		if !exists {
			continue
		}

		for client := range clients {
			select {
			case client.Send <- message:
			default:
				// If a client is slow, drop the message rather than corrupting state.
				continue
			}
		}
	}
}