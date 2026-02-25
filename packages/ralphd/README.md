# @ralphh/ralphd

Shared backend control plane for Ralph Studio.

## Responsibilities

- Thread and run orchestration
- Concurrent run queue
- SQLite persistence
- Live event streaming over WebSocket
- REST API for CLI/Desktop clients
- Automation scheduler for recurring thread runs (simple cron)

## Local development

```bash
bun run dev:backend
```

Default URL: `http://127.0.0.1:4242`

### Environment variables

- `RALPHD_HOST` (default `127.0.0.1`)
- `RALPHD_PORT` (default `4242`)
- `RALPHD_DB_PATH` (default `packages/ralphd/data/ralph-studio.db`)
- `RALPHD_CONCURRENCY` (default `2`)
