package gateway

import "testing"

func TestHubSupportsMultipleClientsPerUser(t *testing.T) {
	hub := NewHub()

	clientOne := &Client{UserID: "user-1", Send: make(chan []byte, 1)}
	clientTwo := &Client{UserID: "user-1", Send: make(chan []byte, 1)}

	hub.RegisterClient(clientOne)
	hub.RegisterClient(clientTwo)

	clients, ok := hub.clients["user-1"]
	if !ok {
		t.Fatalf("expected user mapping to be created")
	}
	if len(clients) != 2 {
		t.Fatalf("expected 2 clients for user, got %d", len(clients))
	}

	hub.UnregisterClient(clientOne)
	clients, ok = hub.clients["user-1"]
	if !ok {
		t.Fatalf("expected user mapping to remain after unregistering one client")
	}
	if len(clients) != 1 {
		t.Fatalf("expected 1 client remaining after unregistering one client, got %d", len(clients))
	}
	if _, exists := clients[clientTwo]; !exists {
		t.Fatalf("expected the other client to remain registered")
	}

	hub.UnregisterClient(clientTwo)
	if _, exists := hub.clients["user-1"]; exists {
		t.Fatalf("expected user mapping to be removed when the last client unregisters")
	}
}
