package main

import (
	"context"
	"encoding/json"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/minio/minio-go/v7"
	"github.com/redis/go-redis/v9"
	"google.golang.org/grpc"
	"google.golang.org/grpc/connectivity"
	"google.golang.org/grpc/credentials/insecure"

	"github.com/mesewo/slack-clone/apps/api/internal/auth"
	"github.com/mesewo/slack-clone/apps/api/internal/channel"
	"github.com/mesewo/slack-clone/apps/api/internal/database"
	"github.com/mesewo/slack-clone/apps/api/internal/dm"
	"github.com/mesewo/slack-clone/apps/api/internal/events"
	kafkapkg "github.com/mesewo/slack-clone/apps/api/internal/kafka"
	"github.com/mesewo/slack-clone/apps/api/internal/message"
	"github.com/mesewo/slack-clone/apps/api/internal/notification"
	"github.com/mesewo/slack-clone/apps/api/internal/productivity"
	"github.com/mesewo/slack-clone/apps/api/internal/rpc/chatpb"
	"github.com/mesewo/slack-clone/apps/api/internal/rpc/coreserver"
	searchpkg "github.com/mesewo/slack-clone/apps/api/internal/search"
	"github.com/mesewo/slack-clone/apps/api/internal/upload"
	"github.com/mesewo/slack-clone/apps/api/internal/user"
	workspace "github.com/mesewo/slack-clone/apps/api/internal/workspace"
)

func syncSearchDocument(ctx context.Context, queries *database.Queries, searchClient *searchpkg.Client, messageID uuid.UUID) error {
	message, err := queries.GetMessageByID(ctx, messageID)
	if err != nil {
		return err
	}
	author := ""
	if message.UserID.Valid {
		if name, lookupErr := queries.GetUserDisplayName(ctx, message.UserID.UUID); lookupErr == nil {
			author = name
		}
	}
	return searchClient.IndexMessage(ctx, searchpkg.ToDocument(message, author))
}

func main() {
	_ = godotenv.Load()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
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
	searchURL := os.Getenv("ELASTICSEARCH_URL")
	if searchURL == "" {
		searchURL = "http://127.0.0.1:9200"
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
	searchClient := searchpkg.NewClient(searchURL)
	if err := searchClient.EnsureIndex(context.Background()); err != nil {
		log.Printf("warning: Elasticsearch unavailable at startup: %v", err)
	} else if messages, err := queries.ListMessagesForSearch(context.Background()); err != nil {
		log.Printf("warning: failed to load messages for search backfill: %v", err)
	} else if err := searchClient.Reindex(context.Background(), messages); err != nil {
		log.Printf("warning: failed to backfill search index: %v", err)
	}
	s3Endpoint := os.Getenv("S3_ENDPOINT")
	if s3Endpoint == "" {
		s3Endpoint = "127.0.0.1:9000"
	}
	s3AccessKey := os.Getenv("S3_ACCESS_KEY")
	s3SecretKey := os.Getenv("S3_SECRET_KEY")
	s3Bucket := os.Getenv("S3_BUCKET")
	if s3Bucket == "" {
		s3Bucket = "slack-uploads"
	}
	s3UseSSL, _ := strconv.ParseBool(os.Getenv("S3_USE_SSL"))
	objectStore, err := upload.NewStore(s3Endpoint, s3AccessKey, s3SecretKey, s3UseSSL)
	if err != nil {
		log.Fatalf("failed to create object store client: %v", err)
	}
	if err := objectStore.MakeBucket(context.Background(), s3Bucket, minio.MakeBucketOptions{}); err != nil {
		if exists, checkErr := objectStore.BucketExists(context.Background(), s3Bucket); checkErr != nil || !exists {
			log.Fatalf("failed to initialize object store bucket: %v", err)
		}
	}
	uploadHandler := &upload.Handler{Queries: queries, Store: objectStore, Bucket: s3Bucket, BaseURL: ""}

	redisClient := redis.NewClient(&redis.Options{Addr: redisAddr})
	defer redisClient.Close()

	userHandler := &user.Handler{Queries: queries, Tokens: tokens, Cookies: cookies, Kafka: kafkaProducer}
	workspaceHandler := &workspace.Handler{Queries: queries}
	channelHandler := &channel.Handler{Queries: queries}
	dmHandler := &dm.Handler{Queries: queries, GatewayClient: gatewayClient}
	messageHandler := &message.Handler{Queries: queries, GatewayClient: gatewayClient, Kafka: kafkaProducer, Search: searchClient}
	notificationHandler := &notification.Handler{Queries: queries}
	productivityHandler := &productivity.Handler{Queries: queries}
	go runOutbox(ctx, queries, kafkaProducer)
	go runScheduledMessages(ctx, queries, gatewayClient)

	messageConsumer := kafkapkg.NewConsumer(kafkaAddr, kafkapkg.TopicMessageCreated, "core-message-created", redisClient)
	defer messageConsumer.Close()
	go messageConsumer.Run(ctx, "dedup:message_created:",
		func(raw []byte) (string, error) {
			return kafkapkg.EventDedupKey(kafkapkg.TopicMessageCreated, raw)
		},
		func(raw []byte) error {
			var evt kafkapkg.MessageCreatedEvent
			if err := json.Unmarshal(raw, &evt); err != nil {
				return err
			}
			msgID, err := uuid.Parse(evt.MessageID)
			if err != nil {
				return err
			}
			log.Printf("[kafka] message.created: %s in channel %s by %s", evt.MessageID, evt.ChannelID, evt.UserID)
			return syncSearchDocument(ctx, queries, searchClient, msgID)
		},
	)

	messageEditedConsumer := kafkapkg.NewConsumer(kafkaAddr, kafkapkg.TopicMessageEdited, "core-message-edited", redisClient)
	defer messageEditedConsumer.Close()
	go messageEditedConsumer.Run(ctx, "dedup:message_edited:",
		func(raw []byte) (string, error) {
			return kafkapkg.EventDedupKey(kafkapkg.TopicMessageEdited, raw)
		},
		func(raw []byte) error {
			var evt kafkapkg.MessageEditedEvent
			if err := json.Unmarshal(raw, &evt); err != nil {
				return err
			}
			msgID, err := uuid.Parse(evt.MessageID)
			if err != nil {
				return err
			}
			log.Printf("[kafka] message.edited: %s in channel %s by %s", evt.MessageID, evt.ChannelID, evt.UserID)
			return syncSearchDocument(ctx, queries, searchClient, msgID)
		},
	)

	userConsumer := kafkapkg.NewConsumer(kafkaAddr, kafkapkg.TopicUserRegistered, "core-user-registered", redisClient)
	defer userConsumer.Close()
	go userConsumer.Run(ctx, "dedup:user_registered:",
		func(raw []byte) (string, error) {
			return kafkapkg.EventDedupKey(kafkapkg.TopicUserRegistered, raw)
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

	messageDeletedConsumer := kafkapkg.NewConsumer(kafkaAddr, kafkapkg.TopicMessageDeleted, "core-message-deleted", redisClient)
	defer messageDeletedConsumer.Close()
	go messageDeletedConsumer.Run(ctx, "dedup:message_deleted:",
		func(raw []byte) (string, error) {
			return kafkapkg.EventDedupKey(kafkapkg.TopicMessageDeleted, raw)
		},
		func(raw []byte) error {
			var evt kafkapkg.MessageDeletedEvent
			if err := json.Unmarshal(raw, &evt); err != nil {
				return err
			}
			log.Printf("[kafka] message.deleted: %s in channel %s", evt.MessageID, evt.ChannelID)
			if searchClient == nil {
				return nil
			}
			return searchClient.DeleteMessage(ctx, evt.MessageID)
		},
	)

	reactionAddedConsumer := kafkapkg.NewConsumer(kafkaAddr, kafkapkg.TopicReactionAdded, "core-reaction-added", redisClient)
	defer reactionAddedConsumer.Close()
	go reactionAddedConsumer.Run(ctx, "dedup:reaction_added:",
		func(raw []byte) (string, error) {
			return kafkapkg.EventDedupKey(kafkapkg.TopicReactionAdded, raw)
		},
		func(raw []byte) error {
			var evt kafkapkg.ReactionAddedEvent
			if err := json.Unmarshal(raw, &evt); err != nil {
				return err
			}
			log.Printf("[kafka] reaction.added: %s by %s on message %s", evt.Emoji, evt.UserID, evt.MessageID)
			return nil
		},
	)

	reactionRemovedConsumer := kafkapkg.NewConsumer(kafkaAddr, kafkapkg.TopicReactionRemoved, "core-reaction-removed", redisClient)
	defer reactionRemovedConsumer.Close()
	go reactionRemovedConsumer.Run(ctx, "dedup:reaction_removed:",
		func(raw []byte) (string, error) {
			return kafkapkg.EventDedupKey(kafkapkg.TopicReactionRemoved, raw)
		},
		func(raw []byte) error {
			var evt kafkapkg.ReactionRemovedEvent
			if err := json.Unmarshal(raw, &evt); err != nil {
				return err
			}
			log.Printf("[kafka] reaction.removed: %s by %s from message %s", evt.Emoji, evt.UserID, evt.MessageID)
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
	httpAddr := os.Getenv("CORE_HTTP_ADDR")
	if httpAddr == "" {
		httpAddr = ":8080"
	}

	r := chi.NewRouter()
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{frontendURL},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type"},
		ExposedHeaders:   []string{"Content-Length", "Content-Disposition"},
		AllowCredentials: true,
	}))

	r.Post("/api/auth/register", userHandler.Register)
	r.Post("/api/auth/login", userHandler.Login)
	r.Post("/api/auth/logout", userHandler.Logout)

	r.Group(func(r chi.Router) {
		r.Use(auth.Middleware(tokens))

		r.Get("/api/auth/verify", userHandler.Verify)
		r.Get("/api/notifications", notificationHandler.List)
		r.Post("/api/notifications/{notificationID}/read", notificationHandler.MarkRead)
		r.Post("/api/notifications/read-all", notificationHandler.MarkAllRead)
		r.Get("/api/profile", productivityHandler.Profile)
		r.Get("/api/threads", productivityHandler.Threads)
		r.Patch("/api/profile", productivityHandler.UpdateProfile)
		r.Get("/api/saved-messages", productivityHandler.Saved)
		r.Post("/api/saved-messages/{messageID}", productivityHandler.Save)
		r.Delete("/api/saved-messages/{messageID}", productivityHandler.Unsave)
		r.Post("/api/messages/{messageID}/thread-subscription", productivityHandler.SubscribeThread)
		r.Delete("/api/messages/{messageID}/thread-subscription", productivityHandler.UnsubscribeThread)
		r.Get("/api/notification-preferences", productivityHandler.Preferences)
		r.Patch("/api/notification-preferences", productivityHandler.Preferences)
		r.Post("/api/scheduled-messages", productivityHandler.Schedule)

		r.Post("/api/workspaces", workspaceHandler.CreateWorkspace)
		r.Post("/api/workspaces/join", workspaceHandler.JoinWorkspace)
		r.Post("/api/workspaces/{workspaceID}/invites", workspaceHandler.CreateInvite)
		r.Post("/api/workspaces/join/{token}", workspaceHandler.AcceptInvite)
		r.Get("/api/workspaces", workspaceHandler.ListWorkspaces)
		r.Get("/api/workspaces/{workspaceID}/members", workspaceHandler.ListMembers)
		r.Patch("/api/workspaces/{workspaceID}/members/{userID}", workspaceHandler.UpdateMemberRole)
		r.Delete("/api/workspaces/{workspaceID}/members/{userID}", workspaceHandler.RemoveMember)

		r.Post("/api/channels", channelHandler.CreateChannel)
		r.Get("/api/channels", channelHandler.ListChannels)
		r.Post("/api/channels/{channelID}/join", channelHandler.JoinChannel)
		r.Post("/api/channels/{channelID}/members", channelHandler.AddMember)
		r.Get("/api/channels/{channelID}/members", channelHandler.ListMembers)
		r.Delete("/api/channels/{channelID}/members/{userID}", channelHandler.RemoveMember)
		r.Post("/api/channels/{channelID}/read", channelHandler.MarkRead)
		r.Get("/api/channels/{channelID}/unread", channelHandler.Unread)
		r.Get("/api/dms", dmHandler.List)
		r.Post("/api/dms/self", dmHandler.Self)
		r.Get("/api/dms/users", dmHandler.Users)
		r.Post("/api/dms", dmHandler.Create)
		r.Get("/api/dms/{conversationID}/messages", dmHandler.ListMessages)
		r.Post("/api/dms/{conversationID}/messages", dmHandler.SendMessage)
		r.Get("/api/dms/{conversationID}/search", dmHandler.Search)
		r.Get("/api/dms/{conversationID}/messages/{messageID}/replies", dmHandler.ThreadReplies)
		r.Post("/api/dms/{conversationID}/messages/{messageID}/replies", dmHandler.CreateThreadReply)
		r.Get("/api/dms/{conversationID}/messages/{messageID}/reactions", dmHandler.ListReactions)
		r.Post("/api/dms/{conversationID}/messages/{messageID}/reactions", dmHandler.AddReaction)
		r.Delete("/api/dms/{conversationID}/messages/{messageID}/reactions", dmHandler.RemoveReaction)
		r.Post("/api/dms/{conversationID}/read", dmHandler.MarkRead)
		r.Get("/api/dms/{conversationID}/unread", dmHandler.Unread)

		r.Post("/api/channels/{channelID}/messages", messageHandler.SendMessage)
		r.Get("/api/channels/{channelID}/messages", messageHandler.ListMessages)
		r.Get("/api/search/messages", messageHandler.SearchMessages)
		r.Post("/api/uploads/presign", uploadHandler.CreatePresignedUpload)
		r.Post("/api/uploads/complete", uploadHandler.CompletePresignedUpload)
		r.Post("/api/uploads", uploadHandler.Create)
		r.Get("/api/uploads/{id}", uploadHandler.Serve)
		r.Get("/api/uploads/{id}/{variant}", uploadHandler.Serve)
		r.Patch("/api/channels/{channelID}/messages/{messageID}", messageHandler.EditMessage)
		r.Delete("/api/channels/{channelID}/messages/{messageID}", messageHandler.DeleteMessage)
		r.Get("/api/channels/{channelID}/messages/{messageID}/replies", messageHandler.ListThreadReplies)
		r.Post("/api/channels/{channelID}/messages/{messageID}/replies", messageHandler.CreateThreadReply)
		r.Get("/api/channels/{channelID}/messages/{messageID}/reactions", messageHandler.ListReactions)
		r.Post("/api/channels/{channelID}/messages/{messageID}/reactions", messageHandler.AddReaction)
		r.Delete("/api/channels/{channelID}/messages/{messageID}/reactions", messageHandler.RemoveReaction)
	})

	httpServer := &http.Server{Addr: httpAddr, Handler: r}

	// This is the piece that was missing: something has to actually act on
	// ctx being cancelled. Without this goroutine, capturing the interrupt
	// signal above just swallows Ctrl+C and nothing ever happens.
	go func() {
		<-ctx.Done()
		log.Println("shutting down...")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		grpcStopped := make(chan struct{})
		go func() {
			grpcServer.GracefulStop()
			close(grpcStopped)
		}()
		select {
		case <-grpcStopped:
		case <-shutdownCtx.Done():
			grpcServer.Stop()
		}
		if err := httpServer.Shutdown(shutdownCtx); err != nil {
			log.Printf("http shutdown error: %v", err)
		}
	}()

	log.Printf("core HTTP listening on %s", httpAddr)
	if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("http server failed: %v", err)
	}
	log.Println("core stopped cleanly")
}

func runOutbox(ctx context.Context, queries *database.Queries, producer *kafkapkg.Producer) {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			claimToken := uuid.New()
			items, err := queries.ClaimPendingOutbox(ctx, 100, claimToken)
			if err != nil {
				log.Printf("outbox read failed: %v", err)
				continue
			}
			for _, item := range items {
				if err := producer.PublishRaw(ctx, item.Topic, item.EventKey, item.Payload); err != nil {
					log.Printf("outbox publish failed for %s: %v", item.ID, err)
					_ = queries.ReleaseOutboxClaim(ctx, item.ID, item.ClaimToken)
					continue
				}
				if err := queries.MarkOutboxPublished(ctx, item.ID, item.ClaimToken); err != nil {
					log.Printf("outbox ack failed for %s: %v", item.ID, err)
				}
			}
		}
	}
}

func runScheduledMessages(ctx context.Context, queries *database.Queries, gatewayClient chatpb.GatewayServiceClient) {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			items, err := queries.ClaimDueScheduledMessages(ctx, 100)
			if err != nil {
				log.Printf("scheduled message claim failed: %v", err)
				continue
			}
			for _, item := range items {
				if item.ChannelID != nil {
					msg, createErr := queries.CreateMessage(ctx, database.CreateMessageParams{ChannelID: *item.ChannelID, UserID: uuid.NullUUID{UUID: item.UserID, Valid: true}, Content: item.Content})
					if createErr != nil {
						log.Printf("scheduled channel message failed: %v", createErr)
						continue
					}
					payload, _ := json.Marshal(map[string]any{"id": msg.ID, "channel_id": msg.ChannelID, "user_id": msg.UserID, "content": msg.Content, "created_at": msg.CreatedAt, "updated_at": msg.UpdatedAt, "deleted_at": msg.DeletedAt, "parent_id": msg.ParentID, "reply_count": msg.ReplyCount})
					event, _ := json.Marshal(events.WSEvent{Type: events.EventMessageCreated, ChannelID: item.ChannelID.String(), Payload: payload})
					_, _ = gatewayClient.Broadcast(ctx, &chatpb.BroadcastRequest{ChannelId: item.ChannelID.String(), Payload: event})
				}
				if item.ConversationID != nil {
					msg, createErr := queries.CreateDirectMessage(ctx, database.CreateDirectMessageParams{ConversationID: *item.ConversationID, UserID: uuid.NullUUID{UUID: item.UserID, Valid: true}, Content: item.Content})
					if createErr != nil {
						log.Printf("scheduled DM failed: %v", createErr)
						continue
					}
					payload, _ := json.Marshal(map[string]any{"id": msg.ID, "conversation_id": msg.ConversationID, "user_id": msg.UserID, "content": msg.Content, "created_at": msg.CreatedAt, "updated_at": msg.UpdatedAt, "deleted_at": msg.DeletedAt, "parent_id": msg.ParentID, "reply_count": msg.ReplyCount, "author_name": ""})
					event, _ := json.Marshal(events.WSEvent{Type: events.EventMessageCreated, ChannelID: "dm:" + item.ConversationID.String(), Payload: payload})
					_, _ = gatewayClient.Broadcast(ctx, &chatpb.BroadcastRequest{ChannelId: "dm:" + item.ConversationID.String(), Payload: event})
				}
			}
		}
	}
}
