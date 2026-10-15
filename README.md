# Slack Clone

A self-hosted team messaging app built as a small service-oriented system. The repository contains a Next.js web client, a Go HTTP API and realtime gateway, and Go services for channels, users, and file storage.

## Run locally with Docker

The recommended first run uses Docker Compose. It starts PostgreSQL, applies the database migrations, starts the backend services and supporting infrastructure, and builds the web app. You do not need to install Go, Node.js, or Goose to use this path.

### Requirements

- Docker Desktop with Docker Compose v2
- At least 8 GB of available memory recommended; Elasticsearch is memory hungry
- Ports 3000, 5432, 6379, 8080, 8081, 9090–9094, 9000–9001, 9099, 9200, and 19092 available

### Start

From the repository root, copy the example files:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
if (-not (Test-Path apps/api/.env)) { Copy-Item apps/api/.env.example apps/api/.env }
```

The examples include local-only credentials so the app starts without external accounts or services. Replace them with unique values before sharing the stack or deploying it. Keep the PostgreSQL password URL-safe (letters, numbers, and hyphens) because Compose uses it in the database connection URL. These commands preserve existing local `.env` files.

Start the stack:

```powershell
docker compose up --build
```

The first start downloads Go modules, builds the frontend, and applies all SQL migrations; it can take several minutes. When the services are ready, open [http://localhost:3000](http://localhost:3000) and create an account.

If the one-shot `migrate` service exits while downloading Go modules, check its output with `docker compose logs migrate`. A DNS or network timeout from `proxy.golang.org` means the migration has not run yet; once the network is available, retry with `docker compose up migrate`, then rerun your original `docker compose up` command. Goose is configured to include only its PostgreSQL driver to avoid downloading unused database drivers.

### Useful local URLs

| Service | URL |
| --- | --- |
| Web app | [http://localhost:3000](http://localhost:3000) |
| Core API | [http://localhost:8080](http://localhost:8080) |
| Core liveness | [http://localhost:8080/healthz](http://localhost:8080/healthz) |
| Core readiness | [http://localhost:8080/readyz](http://localhost:8080/readyz) |
| Realtime WebSocket | `ws://localhost:8081/ws` |
| S3 API (RustFS) | [http://localhost:9000](http://localhost:9000) |
| RustFS console | [http://localhost:9001](http://localhost:9001) |
| Prometheus | [http://localhost:9099](http://localhost:9099) |

RustFS local credentials are in the root `.env` (`MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD` are retained as Compose variable names for compatibility). They are development credentials and must not be used on a public server.

Direct browser uploads use the `S3_PUBLIC_ENDPOINT` configured for the storage service. It defaults to `localhost:9000` in Compose so the presigned upload URL is reachable from your browser; when hosting remotely, set it to the browser-reachable object storage endpoint and set `S3_PUBLIC_USE_SSL=true` when it uses HTTPS.

### Stop and reset

Stop the app and keep its data:

```powershell
docker compose down
```

To delete the local database, uploaded files, search index, and other persisted Compose data as well:

```powershell
docker compose down --volumes
```

## Project layout

```text
apps/
  api/       Go API, realtime gateway, backend services, SQL migrations
  web/       Next.js web application
observability/ Prometheus scrape configuration
docker-compose.yml
```

The Compose stack runs these components:

- **Core API** — HTTP API and application logic (`:8080`)
- **Gateway** — WebSocket realtime connections (`:8081`) and internal gRPC (`:9090`)
- **Channel service** — channel ownership and routing (`:9092`)
- **User service** — user RPC and persistence (`:9093`)
- **Storage service and worker** — upload handling and thumbnail processing (`:9094`)
- **PostgreSQL** — application data; migrations run automatically before API services
- **Redpanda** — Kafka-compatible event broker
- **Redis** — realtime presence and coordination
- **Elasticsearch** — message search
- **RustFS** — local S3-compatible object storage (Compose service name `minio`)
- **Prometheus** — service metrics (`:9099`)

## Configuration

| File | Purpose |
| --- | --- |
| `.env.example` | Docker Compose settings and local infrastructure credentials |
| `apps/api/.env.example` | API signing secret and host-based API development settings |
| `apps/web/.env.example` | Web client API and WebSocket URLs for local development |

Real `.env` files are ignored by Git. Never commit credentials, production secrets, or real user data. Compose supplies container-to-container addresses; the example API and web env files use `localhost` for processes run directly on your machine.

## Development

For a quick full-stack run, use Compose as above. To use the Next.js dev server with the backend and dependencies in Compose, start the backend services without the Compose `web` service:

```powershell
docker compose up --build postgres redpanda redis elasticsearch minio channel-service user-service storage-service storage-worker gateway core
```

In another terminal:

```powershell
cd apps/web
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
bun.cmd install --frozen-lockfile
bun.cmd run dev
```

Then visit [http://localhost:3000](http://localhost:3000). Node.js 22 and Bun are required for this frontend-only workflow. Go 1.26.5 is used by the backend containers. The API migration source is in `apps/api/sql/schema`; `apps/api/Makefile` includes Goose commands for applying migrations to a database when running services directly on the host.

## Deployment notes

The default Compose file is a **local development stack**, not a production deployment. It runs Go source with `go run`, exposes infrastructure ports, and uses local credentials. Do not expose it to the public internet as-is.

Before deployment, provide managed PostgreSQL, Redis, Kafka, search, and object storage (or harden and operate each service); store secrets in the hosting platform; restrict network access; configure TLS and public API/WebSocket origins; use durable backups; and build and publish immutable application images. API container build files are under `apps/api`, but the development Compose stack does not yet build or orchestrate those production images.

## Load testing

`apps/api/loadtest/message_flow.js` is a k6 scenario. With the app running and k6 installed, run:

```sh
k6 run apps/api/loadtest/message_flow.js
```

It creates test accounts and sends messages to the configured API. Results and generated test accounts are not automatically cleaned up.
