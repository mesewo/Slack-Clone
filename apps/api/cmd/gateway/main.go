package main

import (
	"log"
	"net"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/joho/godotenv"
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

	// Same signing secret as Core - JWT validation stays local to Gateway
	// since it's pure crypto, not a DB lookup, so it doesn't need a gRPC
	// round-trip to Core for every connection.
	tokens := auth.NewTokenManager([]byte(jwtSecret), 24*time.Hour)
	hub := gateway.NewHub()
	presence := gateway.NewPresenceManager(hub)

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
	chatpb.RegisterGatewayServiceServer(grpcServer, &gatewayserver.Server{Hub: hub})

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
		gateway.ServeWS(hub, presence, tokens, coreClient, w, r)
	})

	log.Println("gateway HTTP listening on :8081")
	log.Fatal(http.ListenAndServe(":8081", r))
}