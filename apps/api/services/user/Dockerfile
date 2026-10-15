# syntax=docker/dockerfile:1
FROM golang:1.26.5 AS builder
WORKDIR /src
COPY apps/api/services/authlib apps/api/services/authlib
COPY apps/api/services/contracts apps/api/services/contracts
COPY apps/api/services/database apps/api/services/database
COPY apps/api/services/telemetry apps/api/services/telemetry
COPY apps/api/services/user apps/api/services/user
WORKDIR /src/apps/api/services/user
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -o /out/user-service ./cmd/user-service

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=builder /out/user-service /user-service
EXPOSE 9093 9193
ENTRYPOINT ["/user-service"]
