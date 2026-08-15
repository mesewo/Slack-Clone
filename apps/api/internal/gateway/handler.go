package gateway

import (
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/mesewo/slack-clone/apps/api/internal/auth"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Configure origin validation for production
	},
}

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 512 * 1024
)

func ServeWS(hub *Hub, tm *auth.TokenManager, w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(auth.CookieName)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	claims, err := tm.Validate(cookie.Value)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Failed to upgrade connection: %v", err)
		return
	}

	client := &Client{
		UserID: claims.UserID,
		Conn:   conn,
		Send:   make(chan []byte, 256),
	}

	hub.RegisterClient(client)

	// Optionally subscribe the connecting client to a channel passed via query
	// param `channel_id` or encoded in the request path (e.g. /ws/chat/{id}).
	if channelID := r.URL.Query().Get("channel_id"); channelID != "" {
		hub.SubscribeToChannel(claims.UserID, channelID)
	} else {
		// Support path formats like /ws/chat/{id} or /ws/{id}
		path := r.URL.Path
		parts := strings.Split(path, "/")
		// parts[0] == "" since path starts with '/'
		if len(parts) >= 4 && parts[2] == "chat" && parts[3] != "" {
			hub.SubscribeToChannel(claims.UserID, parts[3])
		} else if len(parts) >= 3 && parts[2] != "" {
			hub.SubscribeToChannel(claims.UserID, parts[2])
		}
	}

	go client.writePump(hub)
	go client.readPump(hub)
}

func (c *Client) readPump(hub *Hub) {
	defer func() {
		hub.UnregisterClient(c)
		c.Conn.Close()
	}()

	c.Conn.SetReadLimit(maxMessageSize)
	c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, _, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}
		// Note: incoming messages are currently ignored. In future we can
		// parse subscribe/unsubscribe actions from clients here.
	}
}

func (c *Client) writePump(_ *Hub) {
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