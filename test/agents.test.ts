import { describe, test, expect } from "bun:test";
import { ClaudeAdapter } from "../src/agents/claude.js";
import { CodexAdapter } from "../src/agents/codex.js";
import { OpenCodeAdapter } from "../src/agents/opencode.js";
import { getAdapter } from "../src/agents/registry.js";

// ─── ClaudeAdapter ──────────────────────────────────────────────────────

describe("ClaudeAdapter", () => {
  test("has correct name and command", () => {
    const adapter = new ClaudeAdapter();
    expect(adapter.name).toBe("claude");
    expect(adapter.command).toBe("claude");
    expect(adapter.displayName).toBe("Claude Code");
  });

  test("buildCommand produces correct default args", () => {
    const adapter = new ClaudeAdapter();
    const config = adapter.buildCommand("do the thing", "/tmp/project");

    expect(config.command).toBe("claude");
    expect(config.cwd).toBe("/tmp/project");
    expect(config.args).toContain("-p");
    expect(config.args).toContain("--dangerously-skip-permissions");
    expect(config.args).toContain("--verbose");
    expect(config.args[config.args.length - 1]).toBe("do the thing");
    expect(config.timeout).toBeGreaterThan(0);
  });

  test("buildCommand includes model flag when set", () => {
    const adapter = new ClaudeAdapter({ model: "sonnet" });
    const config = adapter.buildCommand("task", "/tmp");

    expect(config.args).toContain("--model");
    expect(config.args).toContain("sonnet");
  });

  test("buildCommand includes maxTurns flag when set", () => {
    const adapter = new ClaudeAdapter({ maxTurns: 30 });
    const config = adapter.buildCommand("task", "/tmp");

    expect(config.args).toContain("--max-turns");
    expect(config.args).toContain("30");
  });

  test("buildCommand includes additional flags", () => {
    const adapter = new ClaudeAdapter({
      additionalFlags: ["--no-telemetry", "--quiet"],
    });
    const config = adapter.buildCommand("task", "/tmp");

    expect(config.args).toContain("--no-telemetry");
    expect(config.args).toContain("--quiet");
    // prompt should still be last
    expect(config.args[config.args.length - 1]).toBe("task");
  });

  test("buildCommand omits model/maxTurns when not set", () => {
    const adapter = new ClaudeAdapter({});
    const config = adapter.buildCommand("task", "/tmp");

    expect(config.args).not.toContain("--model");
    expect(config.args).not.toContain("--max-turns");
  });
});

// ─── CodexAdapter ───────────────────────────────────────────────────────

describe("CodexAdapter", () => {
  test("has correct name and command", () => {
    const adapter = new CodexAdapter();
    expect(adapter.name).toBe("codex");
    expect(adapter.command).toBe("codex");
    expect(adapter.displayName).toBe("Codex CLI");
  });

  test("buildCommand produces correct default args", () => {
    const adapter = new CodexAdapter();
    const config = adapter.buildCommand("do the thing", "/tmp/project");

    expect(config.command).toBe("codex");
    expect(config.cwd).toBe("/tmp/project");
    expect(config.args).toContain("exec");
    expect(config.args).toContain("--full-auto");
    expect(config.args).toContain("--sandbox");
    expect(config.args).toContain("workspace-write");
    expect(config.args[config.args.length - 1]).toBe("do the thing");
  });

  test("buildCommand uses custom sandbox when set", () => {
    const adapter = new CodexAdapter({ sandbox: "danger-full-access" });
    const config = adapter.buildCommand("task", "/tmp");

    expect(config.args).toContain("danger-full-access");
    expect(config.args).not.toContain("workspace-write");
  });

  test("buildCommand includes model flag when set", () => {
    const adapter = new CodexAdapter({ model: "gpt-5-codex" });
    const config = adapter.buildCommand("task", "/tmp");

    expect(config.args).toContain("--model");
    expect(config.args).toContain("gpt-5-codex");
  });

  test("buildCommand includes additional flags", () => {
    const adapter = new CodexAdapter({
      additionalFlags: ["--debug"],
    });
    const config = adapter.buildCommand("task", "/tmp");

    expect(config.args).toContain("--debug");
    expect(config.args[config.args.length - 1]).toBe("task");
  });
});

// ─── OpenCodeAdapter ────────────────────────────────────────────────────

describe("OpenCodeAdapter", () => {
  test("has correct name and command", () => {
    const adapter = new OpenCodeAdapter();
    expect(adapter.name).toBe("opencode");
    expect(adapter.command).toBe("opencode");
    expect(adapter.displayName).toBe("OpenCode");
  });

  test("buildCommand produces correct default args", () => {
    const adapter = new OpenCodeAdapter();
    const config = adapter.buildCommand("do the thing", "/tmp/project");

    expect(config.command).toBe("opencode");
    expect(config.cwd).toBe("/tmp/project");
    expect(config.args).toContain("run");
    expect(config.args[config.args.length - 1]).toBe("do the thing");
  });

  test("buildCommand includes model flag when set", () => {
    const adapter = new OpenCodeAdapter({ model: "anthropic/claude-sonnet-4-20250514" });
    const config = adapter.buildCommand("task", "/tmp");

    expect(config.args).toContain("--model");
    expect(config.args).toContain("anthropic/claude-sonnet-4-20250514");
  });

  test("buildCommand includes additional flags", () => {
    const adapter = new OpenCodeAdapter({
      additionalFlags: ["--verbose"],
    });
    const config = adapter.buildCommand("task", "/tmp");

    expect(config.args).toContain("--verbose");
    expect(config.args[config.args.length - 1]).toBe("task");
  });
});

// ─── Registry ───────────────────────────────────────────────────────────

describe("getAdapter", () => {
  test("returns ClaudeAdapter for 'claude'", () => {
    const adapter = getAdapter("claude");
    expect(adapter.name).toBe("claude");
  });

  test("returns CodexAdapter for 'codex'", () => {
    const adapter = getAdapter("codex");
    expect(adapter.name).toBe("codex");
  });

  test("returns OpenCodeAdapter for 'opencode'", () => {
    const adapter = getAdapter("opencode");
    expect(adapter.name).toBe("opencode");
  });

  test("throws for unknown agent", () => {
    expect(() => getAdapter("gpt4all")).toThrow(/Unknown agent/);
  });

  test("passes config options to claude adapter", () => {
    const config = {
      agent: "claude" as const,
      task: "test",
      validate: ["npm test"],
      maxIterations: 50,
      delay: 2,
      progressFile: "ralph-progress.md",
      gitCheckpoint: true,
      failureContextMaxChars: 4000,
      agentOptions: {
        claude: {
          model: "opus",
          maxTurns: 10,
          additionalFlags: [],
        },
      },
    };

    const adapter = getAdapter("claude", config);
    const cmd = adapter.buildCommand("task", "/tmp");
    expect(cmd.args).toContain("--model");
    expect(cmd.args).toContain("opus");
    expect(cmd.args).toContain("--max-turns");
    expect(cmd.args).toContain("10");
  });

  test("passes config options to codex adapter", () => {
    const config = {
      agent: "codex" as const,
      task: "test",
      validate: ["npm test"],
      maxIterations: 50,
      delay: 2,
      progressFile: "ralph-progress.md",
      gitCheckpoint: true,
      failureContextMaxChars: 4000,
      agentOptions: {
        codex: {
          sandbox: "danger-full-access" as const,
          additionalFlags: [],
        },
      },
    };

    const adapter = getAdapter("codex", config);
    const cmd = adapter.buildCommand("task", "/tmp");
    expect(cmd.args).toContain("danger-full-access");
  });

  test("works without agentOptions in config", () => {
    const config = {
      agent: "claude" as const,
      task: "test",
      validate: ["npm test"],
      maxIterations: 50,
      delay: 2,
      progressFile: "ralph-progress.md",
      gitCheckpoint: true,
      failureContextMaxChars: 4000,
    };

    const adapter = getAdapter("claude", config);
    expect(adapter.name).toBe("claude");
    // Should still build a valid command with defaults
    const cmd = adapter.buildCommand("task", "/tmp");
    expect(cmd.args).toContain("-p");
  });
});
