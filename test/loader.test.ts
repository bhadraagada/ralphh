import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findConfigFile, loadConfigFile, generateDefaultConfig } from "../src/config/loader.js";

describe("config loader", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ralph-config-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("findConfigFile returns undefined when no config exists", () => {
    const result = findConfigFile(tempDir);
    expect(result).toBeUndefined();
  });

  test("findConfigFile finds ralph.json in the given directory", async () => {
    const configPath = join(tempDir, "ralph.json");
    await writeFile(configPath, JSON.stringify({ task: "test" }));
    const result = findConfigFile(tempDir);
    expect(result).toBe(configPath);
  });

  test("findConfigFile finds ralph.config.json", async () => {
    const configPath = join(tempDir, "ralph.config.json");
    await writeFile(configPath, JSON.stringify({ task: "test" }));
    const result = findConfigFile(tempDir);
    expect(result).toBe(configPath);
  });

  test("loadConfigFile parses valid JSON config", async () => {
    const configPath = join(tempDir, "ralph.json");
    await writeFile(
      configPath,
      JSON.stringify({
        task: "implement auth",
        agent: "codex",
        validate: ["npm test"],
      })
    );
    const config = await loadConfigFile(configPath);
    expect(config.task).toBe("implement auth");
    expect(config.agent).toBe("codex");
  });

  test("loadConfigFile throws on invalid JSON", async () => {
    const configPath = join(tempDir, "ralph.json");
    await writeFile(configPath, "not json{{{");
    await expect(loadConfigFile(configPath)).rejects.toThrow("Failed to parse");
  });

  test("loadConfigFile throws on invalid schema", async () => {
    const configPath = join(tempDir, "ralph.json");
    // agent must be a valid enum value
    await writeFile(configPath, JSON.stringify({ agent: "invalid_agent" }));
    await expect(loadConfigFile(configPath)).rejects.toThrow();
  });

  test("generateDefaultConfig returns a valid structure", () => {
    const config = generateDefaultConfig();
    expect(config.agent).toBe("claude");
    expect(config.task).toBeDefined();
    expect(config.validate).toEqual(["npm test"]);
    expect(config.maxIterations).toBe(50);
    expect(config.gitCheckpoint).toBe(true);
    expect(config.agentOptions).toBeDefined();
  });
});
