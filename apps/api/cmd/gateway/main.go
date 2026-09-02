package main

import (
	"context"
	"log"
	"net"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	"github.com/mesewo/slack-clone/apps/api/internal/auth"
	"github.com/mesewo/slack-clone/apps/api/internal/gateway"
	"github.com/mesewo/slack-clone/apps/api/internal/rpc/chatpb"
	"github.com/mesewo/slack-clone/apps/api/internal/rpc/gatewayserver"
)

func main() {
	_ = godotenv.Load()

	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		log.Fatal("JWT_SECRET is not set")
	}
	coreAddr := os.Getenv("CORE_GRPC_ADDR")
	if coreAddr == "" {
		coreAddr = "localhost:9091"
	}
	gatewayGRPCAddr := os.Getenv("GATEWAY_GRPC_ADDR")
	if gatewayGRPCAddr == "" {
		gatewayGRPCAddr = "localhost:9090"
	}
	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = "http://localhost:3000"
	}
	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		redisAddr = "localhost:6379"
	}

	// Same signing secret as Core - JWT validation stays local to Gateway
	// since it's pure crypto, not a DB lookup, so it doesn't need a gRPC
	// round-trip to Core for every connection.
	tokens := auth.NewTokenManager([]byte(jwtSecret), 24*time.Hour)

	// Initialize Redis client
	redisClient := redis.NewClient(&redis.Options{Addr: redisAddr})
	defer redisClient.Close()

	// Ping Redis to verify connectivity
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	if err := redisClient.Ping(ctx).Err(); err != nil {
		log.Printf("warning: Redis not available at %s: %v - falling back to in-memory state", redisAddr, err)
		redisClient = nil
	}
	cancel()

	// Create hub and presence manager - Redis-backed if available, in-memory otherwise
	var hubInterface gateway.HubInterface
	var presenceManager *gateway.PresenceManager
	var redisPresence *gateway.RedisPresenceManager

	if redisClient != nil {
		redisHub := gateway.NewRedisHub(redisClient)
		hubInterface = redisHub

		redisPresence = gateway.NewRedisPresenceManager(redisClient, redisHub)

		log.Println("using Redis-backed gateway state")
	} else {
		inMemHub := gateway.NewHub()
		hubInterface = inMemHub
		presenceManager = gateway.NewPresenceManager(inMemHub)

		log.Println("using in-memory gateway state")
	}

	// Dial Core's gRPC server - used on every new connection to learn which
	// channels to subscribe the user to. Gateway has no direct DB access.
	coreConn, err := grpc.NewClient(coreAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatalf("failed to dial core gRPC at %s: %v", coreAddr, err)
	}
	defer coreConn.Close()
	coreClient := chatpb.NewCoreServiceClient(coreConn)

	// gRPC server: Core calls this to push events to connected clients.
	grpcServer := grpc.NewServer()
	chatpb.RegisterGatewayServiceServer(grpcServer, &gatewayserver.Server{Hub: hubInterface})

	lis, err := net.Listen("tcp", gatewayGRPCAddr)
	if err != nil {
		log.Fatalf("failed to listen on %s: %v", gatewayGRPCAddr, err)
	}
	go func() {
		log.Printf("gateway gRPC server listening on %s", gatewayGRPCAddr)
		if err := grpcServer.Serve(lis); err != nil {
			log.Fatalf("gateway gRPC server failed: %v", err)
		}
	}()

	// HTTP server: just the WebSocket upgrade now - auth, channels, and
	// messages all live in Core.
	r := chi.NewRouter()
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{frontendURL},
		AllowedMethods:   []string{"GET", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type"},
		AllowCredentials: true,
	}))

	r.Get("/ws", func(w http.ResponseWriter, r *http.Request) {
		if redisClient != nil && redisPresence != nil {
			gateway.ServeWSWithRedis(hubInterface, redisPresence, tokens, coreClient, redisClient, w, r)
		} else if presenceManager != nil {
			gateway.ServeWS(hubInterface, presenceManager, tokens, coreClient, w, r)
		}
	})

	if redisPresence != nil {
		defer redisPresence.Close()
	}

	log.Println("gateway HTTP listening on :8081")
	log.Fatal(http.ListenAndServe(":8081", r))
}