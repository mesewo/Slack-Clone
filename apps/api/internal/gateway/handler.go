package gateway

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"

	"github.com/mesewo/slack-clone/apps/api/internal/auth"
	"github.com/mesewo/slack-clone/apps/api/internal/rpc/chatpb"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // TODO before Phase 7: restrict to your frontend's origin
	},
}

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 512 * 1024
)

// ServeWS upgrades the connection, then subscribes the user to every channel
// they're a member of - without this step, BroadcastToChannel has nobody to
// send to, because nothing else populates the hub's channel subscriptions.
func ServeWS(hub *Hub, pm *PresenceManager, tokens *auth.TokenManager, coreClient chatpb.CoreServiceClient, w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(auth.CookieName)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	claims, err := tokens.Validate(cookie.Value)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if _, err := uuid.Parse(claims.UserID); err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("failed to upgrade connection: %v", err)
		return
	}

	client := &Client{
		UserID: claims.UserID,
		Conn:   conn,
		Send:   make(chan []byte, 256),
	}

	hub.Register(client)

	// Subscribe to every channel this user belongs to, across all their
	// workspaces, so broadcasts reach them without a separate "join" step.
	// This is now a gRPC call to Core instead of a direct DB query - Gateway
	// has no database access under Option B.
	resp, err := coreClient.GetUserChannels(r.Context(), &chatpb.GetUserChannelsRequest{UserId: claims.UserID})
	if err != nil {
		log.Printf("failed to load channel memberships for %s: %v", claims.UserID, err)
	} else {
		for _, channelID := range resp.GetChannelIds() {
			hub.SubscribeToChannel(claims.UserID, channelID)
		}
	}

	// Tell this new connection about everyone who's already online - without
	// this, it only learns about *future* status changes (see Snapshot's
	// comment for why that made the active-user count connection-order
	// dependent). Sent directly to this client's own Send channel, not
	// broadcast - the rest of the hub doesn't need to hear this again.
	for uid, status := range pm.Snapshot() {
		payload, err := json.Marshal(PresencePayload{UserID: uid, Status: string(status)})
		if err != nil {
			continue
		}
		event, err := json.Marshal(WSEvent{Type: EventPresence, Payload: payload})
		if err != nil {
			continue
		}
		select {
		case client.Send <- event:
		default: // buffer full - skip rather than block the upgrade
		}
	}

	go client.writePump()
	go client.readPump(hub, pm)
}

func (c *Client) readPump(hub *Hub, pm *PresenceManager) {
	defer func() {
		pm.SetStatus(c.UserID, StatusAway)
		hub.Unregister(c)
		c.Conn.Close()
	}()

	c.Conn.SetReadLimit(maxMessageSize)
	c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	pm.SetStatus(c.UserID, StatusActive)

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("websocket error: %v", err)
			}
			break
		}

		var event WSEvent
		if err := json.Unmarshal(message, &event); err != nil {
			continue // malformed frame, ignore rather than drop the connection
		}

		switch event.Type {
		case EventTyping:
			var payload TypingPayload
			if err := json.Unmarshal(event.Payload, &payload); err != nil || payload.ChannelID == "" {
				continue
			}
			payload.UserID = c.UserID

			outbound, err := json.Marshal(payload)
			if err != nil {
				continue
			}
			broadcastData, err := json.Marshal(WSEvent{
				Type:      EventTyping,
				ChannelID: payload.ChannelID,
				Payload:   outbound,
			})
			if err != nil {
				continue
			}
			hub.BroadcastToChannel(payload.ChannelID, broadcastData)

			// EventMessageCreated is not handled here on purpose: messages are
			// created via the REST endpoint (internal/message), which broadcasts
			// after a successful DB write. Accepting message creation over the
			// WS connection directly would let a message "send" even when the
			// DB write fails, since there'd be nothing to roll back against.
		}
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)
			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}