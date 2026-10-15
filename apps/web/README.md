# Web app

The Slack Clone web client is a Next.js app. The repository root [README](../../README.md) has the full-stack setup and deployment notes.

For local frontend development, start the backend services with Docker Compose, copy `.env.example` to `.env.local`, then run:

```sh
bun.cmd install --frozen-lockfile
bun.cmd run dev
```

The app uses the Go API for authentication and workspace data, and the Go gateway for realtime updates. No Clerk account is required.
