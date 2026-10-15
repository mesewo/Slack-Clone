#!/bin/bash
set -u

trap 'kill $(jobs -p) 2>/dev/null; exit 0' TERM INT

: "${PORT:=10000}"
: "${CORE_HTTP_ADDR:=127.0.0.1:8080}"
: "${GATEWAY_HTTP_ADDR:=127.0.0.1:8081}"
: "${CORE_GRPC_ADDR:=127.0.0.1:9091}"
: "${GATEWAY_GRPC_ADDR:=127.0.0.1:9090}"
: "${CHANNEL_GRPC_ADDR:=127.0.0.1:9092}"
: "${USER_GRPC_ADDR:=127.0.0.1:9093}"
: "${STORAGE_GRPC_ADDR:=127.0.0.1:9094}"
: "${CORE_NODE_ID:=core-1}"
: "${CORE_NODE_ADDRESS:=127.0.0.1:9091}"
: "${CHANNEL_METRICS_ADDR:=127.0.0.1:9192}"
: "${USER_METRICS_ADDR:=127.0.0.1:9193}"
: "${STORAGE_METRICS_ADDR:=127.0.0.1:9194}"
: "${STORAGE_WORKER_METRICS_ADDR:=127.0.0.1:9195}"
: "${REDIS_ADDR:=127.0.0.1:6379}"
: "${KAFKA_BROKER_ADDR:=127.0.0.1:19092}"
: "${ELASTICSEARCH_URL:=http://127.0.0.1:9200}"
: "${S3_ENDPOINT:=127.0.0.1:9000}"
: "${S3_USE_SSL:=false}"
: "${S3_PUBLIC_ENDPOINT:=$S3_ENDPOINT}"
: "${S3_PUBLIC_USE_SSL:=$S3_USE_SSL}"
: "${S3_BUCKET:=slack-uploads}"
: "${S3_REGION:=}"
: "${FRONTEND_URL:=http://localhost:3000}"
: "${ALLOWED_ORIGINS:=$FRONTEND_URL}"

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${JWT_SECRET:?JWT_SECRET is required}"

export PORT CORE_HTTP_ADDR GATEWAY_HTTP_ADDR CORE_GRPC_ADDR GATEWAY_GRPC_ADDR
export CHANNEL_GRPC_ADDR USER_GRPC_ADDR STORAGE_GRPC_ADDR CORE_NODE_ID CORE_NODE_ADDRESS
export CHANNEL_METRICS_ADDR USER_METRICS_ADDR STORAGE_METRICS_ADDR STORAGE_WORKER_METRICS_ADDR
export REDIS_ADDR KAFKA_BROKER_ADDR ELASTICSEARCH_URL S3_ENDPOINT S3_USE_SSL
export S3_PUBLIC_ENDPOINT S3_PUBLIC_USE_SSL S3_BUCKET S3_REGION FRONTEND_URL ALLOWED_ORIGINS
export DATABASE_URL JWT_SECRET REDIS_URL APP_ENV S3_ACCESS_KEY S3_SECRET_KEY

wait_for_port() {
	port="$1"
	timeout="${2:-30}"
	attempt=0
	while [ "$attempt" -lt "$timeout" ]; do
		if (echo >/dev/tcp/127.0.0.1/"$port") >/dev/null 2>&1; then
			return 0
		fi
		sleep 1
		attempt=$((attempt + 1))
	done
	echo "timed out waiting ${timeout}s for 127.0.0.1:$port" >&2
	exit 1
}

/app/channel-service &
/app/user-service &
/app/storage-service &
/app/storage-worker &
wait_for_port 9092
wait_for_port 9093
wait_for_port 9094

/app/core &
wait_for_port 9091 75

/app/gateway &
/usr/bin/caddy run --config /etc/caddy/Caddyfile &

wait -n || true
exit 1
