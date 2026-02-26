# Ralph Studio Monorepo

Ralph Studio is a Bun + Turbo monorepo for running and managing autonomous coding loops.

## Workspace layout

- `apps/cli` - existing Ralph CLI (`ralph run`, `ralph tasks`, etc.)
- `packages/ralphd` - shared backend control plane (threads, queue, SQLite, live events)
- `apps/desktop` - Electron + React + Tailwind desktop manager UI
- `packages/shared` - shared contracts/types used by backend and frontend
- `src` + `test` - current CLI engine source and tests (consumed by `apps/cli`)

## Quick start

```bash
bun install
```

Run backend + desktop together:

```bash
bun run dev
```

Run individual apps:

```bash
bun run dev:backend
bun run dev:desktop
bun run dev:cli
```

## Build / Test / Typecheck

```bash
bun run build
bun run test
bun run typecheck
```

## Backend API (`ralphd`)

Default URL: `http://127.0.0.1:4242`

- `GET /health`
- `GET /threads`
- `POST /threads`
- `GET /threads/:threadId/events`
- `POST /threads/:threadId/runs`
- `GET /runs/:runId`
- `POST /runs/:runId/control`
- `WS /ws` (event stream)

## Notes

- `packages/ralphd` runs real Ralph loops by calling the existing `runTaskLoop` engine.
- Loop events are persisted to SQLite and broadcast over WebSocket for live timeline UI.
- Desktop UI currently includes thread creation, run controls (run/pause/resume/stop/retry), and live event timeline.
