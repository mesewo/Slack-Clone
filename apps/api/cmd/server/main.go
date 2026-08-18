package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"

	"github.com/mesewo/slack-clone/apps/api/internal/auth"
	"github.com/mesewo/slack-clone/apps/api/internal/channel"
	"github.com/mesewo/slack-clone/apps/api/internal/database"
	"github.com/mesewo/slack-clone/apps/api/internal/gateway"
	"github.com/mesewo/slack-clone/apps/api/internal/message"
	"github.com/mesewo/slack-clone/apps/api/internal/user"
	workspace "github.com/mesewo/slack-clone/apps/api/internal/worksapce"
)

func main() {
	_ = godotenv.Load()

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
	presence := gateway.NewPresenceManager(hub)

	userHandler := &user.Handler{Queries: queries, Tokens: tokens, Cookies: cookies}
	workspaceHandler := &workspace.Handler{Queries: queries}
	channelHandler := &channel.Handler{Queries: queries}
	messageHandler := &message.Handler{Queries: queries, Hub: hub}

	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = "http://localhost:3000"
	}

	r := chi.NewRouter()
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{frontendURL},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type"},
		AllowCredentials: true,
	}))

	r.Post("/api/auth/register", userHandler.Register)
	r.Post("/api/auth/login", userHandler.Login)
	r.Post("/api/auth/logout", userHandler.Logout)

	r.Group(func(r chi.Router) {
		r.Use(auth.Middleware(tokens))

		r.Get("/api/auth/verify", userHandler.Verify)

		r.Post("/api/workspaces", workspaceHandler.CreateWorkspace)
		r.Post("/api/workspaces/join", workspaceHandler.JoinWorkspace)
		r.Get("/api/workspaces", workspaceHandler.ListWorkspaces)

		r.Post("/api/channels", channelHandler.CreateChannel)
		r.Get("/api/channels", channelHandler.ListChannels)
		r.Post("/api/channels/{channelID}/join", channelHandler.JoinChannel)

		r.Post("/api/channels/{channelID}/messages", messageHandler.SendMessage)
		r.Get("/api/channels/{channelID}/messages", messageHandler.ListMessages)

		r.Get("/ws", func(w http.ResponseWriter, r *http.Request) {
			gateway.ServeWS(hub, presence, tokens, queries, w, r)
		})
	})

	log.Println("listening on :8080")
	log.Fatal(http.ListenAndServe(":8080", r))
}