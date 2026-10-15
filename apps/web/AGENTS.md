# Web client conventions

- This directory contains the Next.js client for the Slack Clone. The Go API owns authentication and workspace data; the gateway serves realtime connections. Do not add Clerk configuration unless the authentication architecture changes.
- Put user-facing domain code in `src/features/` and keep routes in `src/app/` focused on composing feature components.
- Use the existing API service modules and `src/lib/axios.ts` for HTTP calls. Use the realtime hooks and event dispatcher for WebSocket events.
- Reuse shared UI primitives, theme configuration, and icon exports before adding another dependency or duplicating a component.
- Keep public API and WebSocket URLs configurable through `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL`. Do not put server secrets in `NEXT_PUBLIC_*` variables.
- Follow the formatting already used by the file being changed. Prefer explicit types and handle loading and error states for network requests.
- For full-stack setup, Compose, and deployment constraints, follow the repository root [README](../../README.md).
