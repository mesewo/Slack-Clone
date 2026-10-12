# syntax=docker/dockerfile:1
FROM golang:1.26.5 AS builder
WORKDIR /src
COPY apps/api apps/api
WORKDIR /src/apps/api
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -o /out/core ./cmd/core

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=builder /out/core /core
EXPOSE 8080 9091
ENTRYPOINT ["/core"]
