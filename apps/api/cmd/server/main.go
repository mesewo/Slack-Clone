package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"

	"github.com/mesewo/slack-clone/apps/api/internal/auth"
	"github.com/mesewo/slack-clone/apps/api/internal/database"
	"github.com/mesewo/slack-clone/apps/api/internal/gateway"
	"github.com/mesewo/slack-clone/apps/api/internal/message"
	"github.com/mesewo/slack-clone/apps/api/internal/user"
)

func main() {
	_ = godotenv.Load() // no-op in prod if you're setting real env vars instead

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL is not set")
	}
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		log.Fatal("JWT_SECRET is not set")
	}

	pool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		log.Fatalf("unable to connect to database: %v", err)
	}
	defer pool.Close()

	queries := database.New(pool)
	tokens := auth.NewTokenManager([]byte(jwtSecret), 24*time.Hour)
	cookies := auth.CookieConfig{Secure: os.Getenv("APP_ENV") == "production"}
	hub := gateway.NewHub()

	userHandler := &user.Handler{Queries: queries, Tokens: tokens, Cookies: cookies}
	messageHandler := &message.MessageHandler{Queries: queries, Hub: hub}

	r := chi.NewRouter()

	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	})

	r.Post("/api/auth/register", userHandler.Register)
	r.Post("/api/auth/login", userHandler.Login)
	r.Post("/api/auth/logout", userHandler.Logout)
	r.Get("/api/auth/verify", userHandler.Verify)

	// Dev helper: set a token cookie for quick local testing without login flow.
	r.Get("/api/debug/dev-login", func(w http.ResponseWriter, r *http.Request) {
		// Only enable in non-production (guard by APP_ENV)
		if os.Getenv("APP_ENV") == "production" {
			http.NotFound(w, r)
			return
		}
		// Create a quick dev token for a fake user
		token, err := tokens.Generate("dev-user-id", "dev@example.com")
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		cookies.Set(w, token, tokens.TTL())
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"token": token})
	})

	// Accept WebSocket upgrades on /ws and any subpath (e.g. /ws/chat/{id})
	r.Get("/ws/*", func(w http.ResponseWriter, r *http.Request) {
		gateway.ServeWS(hub, tokens, w, r)
	})

	r.Group(func(r chi.Router) {
		r.Use(auth.Middleware(tokens))
		r.Post("/api/messages", messageHandler.SendMessage)
		r.Get("/api/messages", messageHandler.GetChannelMessages)
	})

	log.Println("listening on :8080")
	log.Fatal(http.ListenAndServe(":8080", r))
}