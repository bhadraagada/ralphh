# AGENTS.md
Guidance for coding agents operating in this repository.

## Project Overview
- Stack: Bun + TypeScript (ESM) in a Turbo monorepo
- Runtime/package manager: Bun (`bun.lock` present)
- Monorepo manager: Turbo (`turbo.json`)

### Workspaces
- `apps/cli`: Ralph CLI package (builds from root `src/`)
- `packages/ralphd`: backend control plane (queue, SQLite, REST, WS)
- `apps/desktop`: Electron + React + Tailwind desktop UI
- `packages/shared`: shared contracts/types for backend and UI

### Legacy engine source (still canonical)
- Entrypoint: `src/index.ts`
- Source: `src/**/*.ts`
- Tests: `test/**/*.test.ts`

## Setup
Install dependencies:
```bash
bun install
```

Run backend + desktop in parallel:
```bash
bun run dev
```

Run a specific app:
```bash
bun run dev:cli
bun run dev:backend
bun run dev:desktop
```

## Build / Typecheck / Test
From root scripts:
- Build: `bun run build`
- Typecheck: `bun run typecheck`
- Test: `bun run test`

Targeted CLI workflows:
- CLI test file: `bun test test/agents.test.ts`
- CLI test by name: `bun test -t "CodexAdapter"`

## Rule Files (Cursor/Copilot)
Checked locations:
- `.cursorrules`
- `.cursor/rules/`
- `.github/copilot-instructions.md`

Current status: none of the above files exist.

## Code Style Guidelines

### Language And Modules
- Use TypeScript with strict typing.
- Use ESM imports/exports.
- Use `.js` extension on relative imports in TS source.
- Prefer `node:` imports for built-ins.

### Formatting
- Use double quotes.
- Use semicolons.
- Use 2-space indentation.
- Keep formatting consistent with surrounding files.
- Only add comments for non-obvious logic.

### Types And Validation
- Define explicit interfaces/types for structured data.
- Use `unknown` in catch blocks and narrow safely.
- Validate external input with Zod in service/API boundaries.

### Error Handling
- Throw actionable `Error` messages for invalid state/config.
- Fail fast after validation checks.
- Preserve non-throwing subprocess behavior in `src/utils/process.ts`.

### Testing
- Use Bun test APIs from `bun:test`.
- Cover happy path + failure path.
- Keep tests deterministic and isolated.

## Maintenance Notes
- Keep this file in sync with monorepo scripts and workspace layout.
- If linting is added, document exact commands and single-file examples.
