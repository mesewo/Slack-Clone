package main

import (
	"context"
	"encoding/json"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
	"google.golang.org/grpc"
	"google.golang.org/grpc/connectivity"
	"google.golang.org/grpc/credentials/insecure"

	"github.com/mesewo/slack-clone/apps/api/internal/auth"
	"github.com/mesewo/slack-clone/apps/api/internal/channel"
	"github.com/mesewo/slack-clone/apps/api/internal/database"
	kafkapkg "github.com/mesewo/slack-clone/apps/api/internal/kafka"
	"github.com/mesewo/slack-clone/apps/api/internal/message"
	"github.com/mesewo/slack-clone/apps/api/internal/rpc/chatpb"
	"github.com/mesewo/slack-clone/apps/api/internal/rpc/coreserver"
	"github.com/mesewo/slack-clone/apps/api/internal/user"
	workspace "github.com/mesewo/slack-clone/apps/api/internal/worksapce"
)

func main() {
	_ = godotenv.Load()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL is not set")
	}
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		log.Fatal("JWT_SECRET is not set")
	}
	gatewayAddr := os.Getenv("GATEWAY_GRPC_ADDR")
	if gatewayAddr == "" {
		gatewayAddr = "localhost:9090"
	}
	coreGRPCAddr := os.Getenv("CORE_GRPC_ADDR")
	if coreGRPCAddr == "" {
		coreGRPCAddr = "localhost:9091"
	}
	kafkaAddr := os.Getenv("KAFKA_BROKER_ADDR")
	if kafkaAddr == "" {
		kafkaAddr = "localhost:19092"
	}
	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		redisAddr = "localhost:6379"
	}

	pool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		log.Fatalf("unable to connect to database: %v", err)
	}
	defer pool.Close()

	queries := database.New(pool)
	tokens := auth.NewTokenManager([]byte(jwtSecret), 24*time.Hour)
	cookies := auth.CookieConfig{Secure: os.Getenv("APP_ENV") == "production"}

	gatewayConn, err := grpc.NewClient(gatewayAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatalf("failed to dial gateway gRPC at %s: %v", gatewayAddr, err)
	}
	defer gatewayConn.Close()

	// Eagerly connect now, at startup, instead of letting the first real
	// broadcast pay for TCP + HTTP/2 handshake setup under a tight deadline -
	// that's what caused the one DeadlineExceeded right after a fresh
	// restart. If Gateway genuinely isn't reachable, this surfaces that in
	// the startup logs instead of as a mysterious first-message failure.
	warmupCtx, warmupCancel := context.WithTimeout(context.Background(), 5*time.Second)
	gatewayConn.Connect()
	for {
		state := gatewayConn.GetState()
		if state == connectivity.Ready {
			break
		}
		if !gatewayConn.WaitForStateChange(warmupCtx, state) {
			log.Printf("warning: gateway connection not ready after warmup (state: %v) - continuing anyway", state)
			break
		}
	}
	warmupCancel()
	gatewayClient := chatpb.NewGatewayServiceClient(gatewayConn)

	kafkaProducer := kafkapkg.NewProducer(kafkaAddr)
	defer kafkaProducer.Close()

	redisClient := redis.NewClient(&redis.Options{Addr: redisAddr})
	defer redisClient.Close()

	userHandler := &user.Handler{Queries: queries, Tokens: tokens, Cookies: cookies, Kafka: kafkaProducer}
	workspaceHandler := &workspace.Handler{Queries: queries}
	channelHandler := &channel.Handler{Queries: queries}
	messageHandler := &message.Handler{Queries: queries, GatewayClient: gatewayClient, Kafka: kafkaProducer}

	messageConsumer := kafkapkg.NewConsumer(kafkaAddr, kafkapkg.TopicMessageCreated, "core-message-created", redisClient)
	defer messageConsumer.Close()
	go messageConsumer.Run(ctx, "dedup:message_created:",
		func(raw []byte) (string, error) {
			var evt kafkapkg.MessageCreatedEvent
			if err := json.Unmarshal(raw, &evt); err != nil {
				return "", err
			}
			return evt.MessageID, nil
		},
		func(raw []byte) error {
			var evt kafkapkg.MessageCreatedEvent
			if err := json.Unmarshal(raw, &evt); err != nil {
				return err
			}
			log.Printf("[kafka] message.created: %s in channel %s by %s", evt.MessageID, evt.ChannelID, evt.UserID)
			return nil
		},
	)

	userConsumer := kafkapkg.NewConsumer(kafkaAddr, kafkapkg.TopicUserRegistered, "core-user-registered", redisClient)
	defer userConsumer.Close()
	go userConsumer.Run(ctx, "dedup:user_registered:",
		func(raw []byte) (string, error) {
			var evt kafkapkg.UserRegisteredEvent
			if err := json.Unmarshal(raw, &evt); err != nil {
				return "", err
			}
			return evt.UserID, nil
		},
		func(raw []byte) error {
			var evt kafkapkg.UserRegisteredEvent
			if err := json.Unmarshal(raw, &evt); err != nil {
				return err
			}
			log.Printf("[kafka] user.registered: %s (%s)", evt.UserID, evt.Email)
			return nil
		},
	)

	grpcServer := grpc.NewServer()
	chatpb.RegisterCoreServiceServer(grpcServer, &coreserver.Server{Queries: queries})

	lis, err := net.Listen("tcp", coreGRPCAddr)
	if err != nil {
		log.Fatalf("failed to listen on %s: %v", coreGRPCAddr, err)
	}
	go func() {
		log.Printf("core gRPC server listening on %s", coreGRPCAddr)
		if err := grpcServer.Serve(lis); err != nil {
			log.Printf("core gRPC server stopped: %v", err)
		}
	}()

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
		r.Get("/api/channels/{channelID}/messages/{messageID}/replies", messageHandler.ListThreadReplies)
		r.Post("/api/channels/{channelID}/messages/{messageID}/replies", messageHandler.CreateThreadReply)
		r.Get("/api/channels/{channelID}/messages/{messageID}/reactions", messageHandler.ListReactions)
		r.Post("/api/channels/{channelID}/messages/{messageID}/reactions", messageHandler.AddReaction)
		r.Delete("/api/channels/{channelID}/messages/{messageID}/reactions", messageHandler.RemoveReaction)
	})

	httpServer := &http.Server{Addr: ":8080", Handler: r}

	// This is the piece that was missing: something has to actually act on
	// ctx being cancelled. Without this goroutine, capturing the interrupt
	// signal above just swallows Ctrl+C and nothing ever happens.
	go func() {
		<-ctx.Done()
		log.Println("shutting down...")
		grpcServer.GracefulStop()

		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := httpServer.Shutdown(shutdownCtx); err != nil {
			log.Printf("http shutdown error: %v", err)
		}
	}()

	log.Println("core HTTP listening on :8080")
	if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("http server failed: %v", err)
	}
	log.Println("core stopped cleanly")
}