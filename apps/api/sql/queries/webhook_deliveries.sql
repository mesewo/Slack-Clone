-- name: MarkWebhookDelivered :execrows
INSERT INTO webhook_deliveries (event_id, webhook_id)
VALUES ($1, $2)
ON CONFLICT (event_id, webhook_id) DO NOTHING;

-- name: IsWebhookDelivered :one
SELECT EXISTS (
    SELECT 1 FROM webhook_deliveries
    WHERE event_id = $1 AND webhook_id = $2
);
