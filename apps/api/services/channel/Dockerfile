# syntax=docker/dockerfile:1
FROM golang:1.26.5 AS builder
WORKDIR /src
COPY apps/api/services/contracts apps/api/services/contracts
COPY apps/api/services/telemetry apps/api/services/telemetry
COPY apps/api/services/channel apps/api/services/channel
WORKDIR /src/apps/api/services/channel
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -o /out/channel-service ./cmd/channel-service

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=builder /out/channel-service /channel-service
EXPOSE 9092 9192
ENTRYPOINT ["/channel-service"]
