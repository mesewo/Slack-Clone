# syntax=docker/dockerfile:1
FROM golang:1.26.5 AS builder
WORKDIR /src
COPY apps/api/services/contracts apps/api/services/contracts
COPY apps/api/services/database apps/api/services/database
COPY apps/api/services/telemetry apps/api/services/telemetry
COPY apps/api/services/storage apps/api/services/storage
WORKDIR /src/apps/api/services/storage
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -o /out/storage-service ./cmd/storage-service

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=builder /out/storage-service /storage-service
EXPOSE 9094 9194
ENTRYPOINT ["/storage-service"]
