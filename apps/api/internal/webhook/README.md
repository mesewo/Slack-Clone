# Outgoing webhooks

Outgoing webhook requests contain the original message event JSON and are
signed with HMAC-SHA256 in the `X-Slack-Clone-Signature` header. Payloads may be
delivered more than once when Kafka retries a transient failure or a consumer
restarts. Receivers should deduplicate deliveries using the payload's
`event_id` field.
