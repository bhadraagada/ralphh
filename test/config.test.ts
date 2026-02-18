import { describe, test, expect } from "bun:test";
import {
  RalphConfigSchema,
  mergeAndValidate,
  type CliFlags,
} from "../src/config/schema.js";

describe("config schema", () => {
  test("validates a minimal config with just task", () => {
    const result = RalphConfigSchema.parse({
      task: "fix all the bugs",
    });
    expect(result.task).toBe("fix all the bugs");
    expect(result.agent).toBe("claude");
    expect(result.validate).toEqual(["npm test"]);
    expect(result.maxIterations).toBe(50);
    expect(result.delay).toBe(2);
    expect(result.progressFile).toBe("ralph-progress.md");
    expect(result.gitCheckpoint).toBe(true);
    expect(result.failureContextMaxChars).toBe(4000);
  });

  test("validates a full config", () => {
    const result = RalphConfigSchema.parse({
      agent: "codex",
      task: "implement auth",
      validate: ["npm test", "tsc --noEmit"],
      maxIterations: 20,
      delay: 5,
      progressFile: "progress.md",
      promise: "RALPH_COMPLETE_custom",
      gitCheckpoint: false,
      failureContextMaxChars: 2000,
    });
    expect(result.agent).toBe("codex");
    expect(result.validate).toEqual(["npm test", "tsc --noEmit"]);
    expect(result.maxIterations).toBe(20);
    expect(result.gitCheckpoint).toBe(false);
  });

  test("rejects empty task", () => {
    expect(() => RalphConfigSchema.parse({ task: "" })).toThrow();
  });

  test("rejects invalid agent", () => {
    expect(() =>
      RalphConfigSchema.parse({ task: "x", agent: "gpt4all" })
    ).toThrow();
  });

  test("rejects empty validate array", () => {
    expect(() =>
      RalphConfigSchema.parse({ task: "x", validate: [] })
    ).toThrow();
  });

  test("rejects negative maxIterations", () => {
    expect(() =>
      RalphConfigSchema.parse({ task: "x", maxIterations: -1 })
    ).toThrow();
  });

  test("rejects negative delay", () => {
    expect(() =>
      RalphConfigSchema.parse({ task: "x", delay: -1 })
    ).toThrow();
  });

  test("accepts all valid agent types", () => {
    for (const agent of ["codex", "claude", "opencode"] as const) {
      const result = RalphConfigSchema.parse({ task: "x", agent });
      expect(result.agent).toBe(agent);
    }
  });
});

describe("mergeAndValidate", () => {
  test("CLI flags override file config", () => {
    const fileConfig = {
      task: "from file",
      agent: "claude" as const,
      maxIterations: 10,
    };
    const cliFlags: CliFlags = {
      task: "from cli",
      maxIterations: 99,
    };
    const result = mergeAndValidate(fileConfig, cliFlags);
    expect(result.task).toBe("from cli");
    expect(result.maxIterations).toBe(99);
    expect(result.agent).toBe("claude"); // not overridden
  });

  test("file config used when CLI flags absent", () => {
    const fileConfig = {
      task: "from file",
      agent: "codex" as const,
      validate: ["bun test"] as [string],
    };
    const cliFlags: CliFlags = {};
    const result = mergeAndValidate(fileConfig, cliFlags);
    expect(result.task).toBe("from file");
    expect(result.agent).toBe("codex");
    expect(result.validate).toEqual(["bun test"]);
  });

  test("returns config with undefined task when no task provided", () => {
    const result = mergeAndValidate({}, {});
    expect(result.task).toBeUndefined();
    expect(result.agent).toBe("claude"); // default
  });
});
