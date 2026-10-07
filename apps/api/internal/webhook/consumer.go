package webhook

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/mesewo/slack-clone/apps/api/internal/database"
	"github.com/mesewo/slack-clone/apps/api/internal/kafka"
)

func HandleMessageSent(ctx context.Context, queries *database.Queries, dispatcher *Dispatcher, raw []byte) error {
	var event kafka.MessageCreatedEvent
	if err := json.Unmarshal(raw, &event); err != nil {
		return fmt.Errorf("decode message sent event: %w", err)
	}
	if strings.HasPrefix(event.ChannelID, "dm:") {
		return nil // Direct messages are not scoped to a workspace webhook here.
	}
	eventID, err := kafka.EventDedupKey(kafka.TopicMessageSent, raw)
	if err != nil {
		return fmt.Errorf("resolve message event id: %w", err)
	}
	channelID, err := uuid.Parse(event.ChannelID)
	if err != nil {
		log.Printf("skip message sent event with invalid channel id %q", event.ChannelID)
		return nil
	}
	workspaceID, err := queries.GetChannelWorkspaceID(ctx, channelID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil // The channel was deleted before its queued event was delivered.
	}
	if err != nil {
		return fmt.Errorf("resolve message workspace: %w", err)
	}
	webhooks, err := queries.ListWorkspaceWebhooks(ctx, workspaceID)
	if err != nil {
		return fmt.Errorf("load workspace webhooks: %w", err)
	}
	var deliveryErrors []error
	for _, target := range webhooks {
		delivered, err := queries.IsWebhookDelivered(ctx, database.IsWebhookDeliveredParams{
			EventID:   eventID,
			WebhookID: target.ID,
		})
		if err != nil {
			deliveryErrors = append(deliveryErrors, fmt.Errorf("check delivery record for webhook %s: %w", target.ID, err))
			continue
		}
		if delivered {
			continue
		}

		deliveryErr := dispatcher.Send(ctx, target.Url, target.Secret, raw)
		var permanentErr *PermanentDeliveryError
		if deliveryErr != nil && !errors.As(deliveryErr, &permanentErr) {
			deliveryErrors = append(deliveryErrors, fmt.Errorf("deliver webhook %s: %w", target.ID, deliveryErr))
			continue
		}
		if permanentErr != nil {
			log.Printf("webhook %s rejected event with HTTP %d; recording as resolved", target.ID, permanentErr.StatusCode)
		}
		if _, err := queries.MarkWebhookDelivered(ctx, database.MarkWebhookDeliveredParams{
			EventID:   eventID,
			WebhookID: target.ID,
		}); err != nil {
			deliveryErrors = append(deliveryErrors, fmt.Errorf("record delivery for webhook %s: %w", target.ID, err))
		}
	}
	return errors.Join(deliveryErrors...)
}
