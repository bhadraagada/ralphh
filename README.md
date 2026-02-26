# ralph

[![CI](https://github.com/bhadraagada/ralphh/actions/workflows/ci.yml/badge.svg)](https://github.com/bhadraagada/ralphh/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/ralph-loop.svg)](https://www.npmjs.com/package/ralph-loop)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Stateless AI agent automation loop -- eliminates context rot by restarting fresh each iteration.

Ralph drives AI coding agents (Claude Code, Codex CLI, OpenCode) through a structured task loop. It reads a PRD, spawns agents in non-interactive mode, validates their output, commits progress via git checkpoints, and reverts regressions automatically. Each iteration starts fresh so agents never degrade from bloated context.

## Features

- **PRD-driven execution** -- Define tasks in JSON or Markdown with dependencies, descriptions, and acceptance criteria
- **Multi-agent support** -- Claude Code, Codex CLI, and OpenCode adapters out of the box
- **Git checkpoint/revert** -- Auto-commits after each iteration, reverts if validation score drops
- **Stateless by design** -- Agents restart fresh each iteration, reading progress from a markdown log
- **Validation scoring** -- Run arbitrary commands to verify agent output before moving on
- **Task dependency ordering** -- Tasks execute in topological order based on declared dependencies

## Installation

```bash
# With bun (recommended)
bun add -g ralph-loop

# With npm
npm install -g ralph-loop
```

## Quick Start

```bash
# Initialize ralph in your project
ralph init

# Run the automation loop
ralph run

# Run a single ad-hoc task
ralph run --task "Add input validation to the API endpoints"

# Check current progress
ralph status

# Run validations without starting the loop
ralph validate
```

## Configuration

Ralph looks for a `ralph.json` config file in your project root:

```json
{
  "agent": "claude",
  "validation": ["npm test", "tsc --noEmit"],
  "maxIterations": 10,
  "prd": "prd.md"
}
```

### Supported Agents

| Agent | CLI | Flag |
|-------|-----|------|
| Claude Code | `claude` | `--agent claude` |
| Codex CLI | `codex` | `--agent codex` |
| OpenCode | `opencode` | `--agent opencode` |

## PRD Format

### Markdown

```markdown
# My Project PRD

## auth: User Authentication
Implement JWT-based authentication.

**Depends on:** none

**Acceptance Criteria:**
- Login endpoint returns a valid JWT
- Protected routes reject unauthenticated requests

**Validation:** npm test -- --grep auth
```

### JSON

```json
{
  "tasks": [
    {
      "id": "auth",
      "name": "User Authentication",
      "description": "Implement JWT-based authentication",
      "dependencies": [],
      "acceptanceCriteria": [
        "Login endpoint returns a valid JWT",
        "Protected routes reject unauthenticated requests"
      ],
      "validation": ["npm test -- --grep auth"]
    }
  ]
}
```

## CLI Reference

```
Usage: ralph [command] [options]

Commands:
  run        Start the automation loop
  init       Interactive setup wizard
  status     Show current progress
  reset      Clear the progress file
  validate   Run validation commands

Options:
  --agent <name>         AI agent to use (claude|codex|opencode)
  --task <description>   Run a single ad-hoc task instead of PRD
  --max-iterations <n>   Maximum iterations per task
  --dry-run              Print the prompt without running the agent
  -h, --help             Show help
  -V, --version          Show version
```

## Development

```bash
# Install dependencies
bun install

# Run in development mode
bun run dev

# Run tests
bun test

# Type check
bun run typecheck

# Build
bun run build
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) before submitting a PR.

## License

[MIT](LICENSE)
