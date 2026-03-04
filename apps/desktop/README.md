# @ralphh/desktop

Electron + React + Tailwind app for managing Ralph threads and loop runs.

## Features in current scaffold

- Thread creation (name/task/repo path)
- Start/pause/resume/stop/retry run controls
- Live timeline from backend WebSocket events
- Run status snapshot

## Run

```bash
bun run dev:desktop
```

Requires `ralphd` running on `http://127.0.0.1:4242`.
