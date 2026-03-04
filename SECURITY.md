# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1.0 | :x:                |

Only the latest `0.1.x` release receives security updates.

## Reporting a Vulnerability

If you discover a security vulnerability in ralph, please report it responsibly through one of the following channels:

1. **GitHub Security Advisory (preferred)** -- Open a private security advisory at
   [https://github.com/bhadraagada/ralphh/security/advisories/new](https://github.com/bhadraagada/ralphh/security/advisories/new)
2. **Email** -- Send details to the maintainers via the email listed on the
   [@bhadraagada](https://github.com/bhadraagada) GitHub profile.

Please include:

- A description of the vulnerability and its potential impact
- Steps to reproduce
- Any relevant logs or screenshots

**Do not open a public issue for security vulnerabilities.**

## What to Expect

- **Acknowledgment** -- We will acknowledge your report within **72 hours**.
- **Triage** -- We aim to confirm or dismiss the vulnerability within **7 days**.
- **Fix** -- Confirmed vulnerabilities will be patched and released within **30 days**, depending on severity and complexity. Critical issues will be prioritised for a faster turnaround.
- **Disclosure** -- We will coordinate with you on public disclosure timing once a fix is available.

## Scope -- Intended Behavior

Ralph is an AI agent automation loop. By design it:

- Spawns AI coding agents (Claude Code, Codex CLI, OpenCode) in non-interactive mode
- Executes arbitrary shell commands as part of validation steps
- Reads and writes files in the working directory
- Creates and reverts git commits

**These behaviors are core functionality, not vulnerabilities.** Ralph is intended to be run by a developer in a trusted environment on their own machine. Reports that describe these designed capabilities as security issues will be closed as informational.

If you believe one of these mechanisms can be exploited in a way that exceeds the user's intent (e.g., command injection through a crafted PRD that escapes the expected execution context), that _is_ in scope and we encourage you to report it.
