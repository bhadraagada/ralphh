# Contributing to Ralph

Thanks for your interest in contributing to Ralph! This document provides guidelines and steps for contributing.

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## How Can I Contribute?

### Reporting Bugs

Before creating a bug report, please check the [existing issues](https://github.com/bhadraagada/ralphh/issues) to avoid duplicates.

When filing a bug report, please include:

- A clear and descriptive title
- Steps to reproduce the behavior
- Expected behavior vs actual behavior
- Your environment (OS, Bun version, Node version)
- Relevant logs or error output

### Suggesting Features

Feature requests are tracked as [GitHub issues](https://github.com/bhadraagada/ralphh/issues). When creating a feature request:

- Use a clear and descriptive title
- Describe the problem your feature would solve
- Describe the solution you'd like
- Note any alternatives you've considered

### Pull Requests

1. **Fork the repo** and create your branch from `main`
2. **Install dependencies**: `bun install`
3. **Make your changes** -- keep PRs focused on a single concern
4. **Add tests** if you're adding new functionality
5. **Run the test suite**: `bun test`
6. **Run the type checker**: `bun run typecheck`
7. **Push your branch** and open a Pull Request

## Development Setup

```bash
# Clone your fork
git clone https://github.com/<your-username>/ralphh.git
cd ralphh

# Install dependencies
bun install

# Run tests
bun test

# Type check
bun run typecheck

# Run in dev mode
bun run dev
```

## Project Structure

```
src/
  index.ts              # CLI entry point (commander)
  scaffold.ts           # Project scaffolding (ralph init --yes)
  agents/               # AI agent adapters (claude, codex, opencode)
  config/               # Config schema + loader
  init/                 # Interactive init prompts
  loop/                 # Core loop runner, validator, progress, promise
  prd/                  # PRD schema, loader, markdown parser
  prompt/               # Agent prompt builder
  utils/                # Git, logging, process utilities
test/                   # Test files (bun:test)
```

## Style Guide

- TypeScript strict mode is enabled -- do not use `any` unless absolutely necessary
- Use ES module imports (`import`/`export`)
- Keep functions small and focused
- Write tests for new functionality

## Commit Messages

Use clear, concise commit messages that describe what changed and why:

- `fix: prevent revert when validation score is unchanged`
- `feat: add support for custom agent adapters`
- `docs: update PRD format examples`
- `test: add coverage for markdown parser edge cases`

We loosely follow [Conventional Commits](https://www.conventionalcommits.org/).

## Questions?

Open a [discussion](https://github.com/bhadraagada/ralphh/discussions) or file an issue. We're happy to help!
