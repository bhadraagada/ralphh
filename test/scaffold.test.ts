import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scaffoldProject } from "../src/scaffold.js";
import type { InitOptions } from "../src/init/prompts.js";

describe("scaffoldProject", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ralph-scaffold-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("creates all expected files in a clean directory", async () => {
    const result = await scaffoldProject(tempDir);

    // Should have created 4 files
    expect(result.created.length).toBe(4);
    expect(result.skipped.length).toBe(0);

    // Verify each file exists
    expect(existsSync(join(tempDir, "prd.json"))).toBe(true);
    expect(existsSync(join(tempDir, "ralph.json"))).toBe(true);
    expect(existsSync(join(tempDir, "ralph", "prd.example.md"))).toBe(true);
    expect(existsSync(join(tempDir, "ralph", ".gitignore"))).toBe(true);
  });

  test("creates the ralph/ directory if it does not exist", async () => {
    expect(existsSync(join(tempDir, "ralph"))).toBe(false);
    await scaffoldProject(tempDir);
    expect(existsSync(join(tempDir, "ralph"))).toBe(true);
  });

  test("prd.json is valid JSON with correct structure", async () => {
    await scaffoldProject(tempDir);
    const raw = await readFile(join(tempDir, "prd.json"), "utf-8");
    const prd = JSON.parse(raw);

    expect(prd.name).toBeDefined();
    expect(prd.description).toBeDefined();
    expect(prd.validate).toBeDefined();
    expect(Array.isArray(prd.validate)).toBe(true);
    expect(prd.tasks).toBeDefined();
    expect(Array.isArray(prd.tasks)).toBe(true);
    expect(prd.tasks.length).toBeGreaterThan(0);

    // Each task should have required fields
    for (const task of prd.tasks) {
      expect(task.id).toBeDefined();
      expect(task.name).toBeDefined();
      expect(task.description).toBeDefined();
    }
  });

  test("prd.json tasks have valid dependency references", async () => {
    await scaffoldProject(tempDir);
    const raw = await readFile(join(tempDir, "prd.json"), "utf-8");
    const prd = JSON.parse(raw);
    const taskIds = new Set(prd.tasks.map((t: { id: string }) => t.id));

    for (const task of prd.tasks) {
      if (task.dependsOn) {
        for (const dep of task.dependsOn) {
          expect(taskIds.has(dep)).toBe(true);
        }
      }
    }
  });

  test("ralph.json is valid JSON with correct structure", async () => {
    await scaffoldProject(tempDir);
    const raw = await readFile(join(tempDir, "ralph.json"), "utf-8");
    const config = JSON.parse(raw);

    expect(config.agent).toBe("claude");
    expect(config.validate).toBeDefined();
    expect(Array.isArray(config.validate)).toBe(true);
    expect(config.maxIterations).toBeDefined();
    expect(typeof config.maxIterations).toBe("number");
    expect(config.gitCheckpoint).toBe(true);
  });

  test("ralph/.gitignore contains ralph-progress.md", async () => {
    await scaffoldProject(tempDir);
    const content = await readFile(
      join(tempDir, "ralph", ".gitignore"),
      "utf-8"
    );
    expect(content).toContain("ralph-progress.md");
  });

  test("skips existing files when force is false", async () => {
    // Create prd.json manually first
    const existingContent = '{"existing": true}';
    await writeFile(join(tempDir, "prd.json"), existingContent);

    const result = await scaffoldProject(tempDir);

    // prd.json should be skipped
    expect(result.skipped).toContain(join(tempDir, "prd.json"));

    // Other files should be created
    expect(result.created).toContain(join(tempDir, "ralph.json"));
    expect(result.created).toContain(
      join(tempDir, "ralph", "prd.example.md")
    );
    expect(result.created).toContain(join(tempDir, "ralph", ".gitignore"));

    // Existing file should NOT be overwritten
    const raw = await readFile(join(tempDir, "prd.json"), "utf-8");
    expect(raw).toBe(existingContent);
  });

  test("overwrites existing files when force is true", async () => {
    // Create prd.json manually first
    await writeFile(join(tempDir, "prd.json"), '{"existing": true}');

    const result = await scaffoldProject(tempDir, { force: true });

    // prd.json should be in created, not skipped
    expect(result.created).toContain(join(tempDir, "prd.json"));
    expect(result.skipped.length).toBe(0);

    // Content should be overwritten with the template
    const raw = await readFile(join(tempDir, "prd.json"), "utf-8");
    const prd = JSON.parse(raw);
    expect(prd.tasks).toBeDefined();
  });

  test("skips multiple existing files independently", async () => {
    // Create both prd.json and ralph.json
    await writeFile(join(tempDir, "prd.json"), "{}");
    await writeFile(join(tempDir, "ralph.json"), "{}");

    const result = await scaffoldProject(tempDir);

    expect(result.skipped.length).toBe(2);
    expect(result.created.length).toBe(2); // ralph/prd.example.md + ralph/.gitignore
  });

  test("works when ralph/ directory already exists", async () => {
    await mkdir(join(tempDir, "ralph"), { recursive: true });

    const result = await scaffoldProject(tempDir);

    expect(result.created.length).toBe(4);
    expect(result.skipped.length).toBe(0);
  });

  test("prd.example.md contains markdown PRD content", async () => {
    await scaffoldProject(tempDir);
    const content = await readFile(
      join(tempDir, "ralph", "prd.example.md"),
      "utf-8"
    );

    // Should have markdown headings with task IDs
    expect(content).toContain("##");
    // Should mention it's an example
    expect(content.toLowerCase()).toContain("example");
  });

  test("scaffolded prd.json passes PRD schema validation", async () => {
    // This is the real integration test — the scaffolded prd.json should
    // be loadable by the actual PRD loader
    const { loadPrdFile } = await import("../src/prd/loader.js");

    await scaffoldProject(tempDir);

    const prd = await loadPrdFile(join(tempDir, "prd.json"));
    expect(prd.name).toBeDefined();
    expect(prd.tasks.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  Interactive init — scaffoldProject with InitOptions
// ═══════════════════════════════════════════════════════════════════════════

describe("scaffoldProject with InitOptions", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ralph-scaffold-init-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const baseInit: InitOptions = {
    agent: "claude",
    model: "sonnet",
    prdFormat: "json",
    projectName: "Test Project",
    validate: ["bun test"],
    maxIterations: 25,
    gitCheckpoint: false,
    claudeMaxTurns: 30,
  };

  test("creates prd.json when prdFormat is json", async () => {
    const result = await scaffoldProject(tempDir, { init: baseInit });

    expect(result.created.length).toBe(4);
    expect(existsSync(join(tempDir, "prd.json"))).toBe(true);
    expect(existsSync(join(tempDir, "prd.md"))).toBe(false);

    const raw = await readFile(join(tempDir, "prd.json"), "utf-8");
    const prd = JSON.parse(raw);
    expect(prd.name).toBe("Test Project");
    expect(prd.validate).toEqual(["bun test"]);
    expect(prd.maxIterations).toBe(25);
  });

  test("creates prd.md when prdFormat is markdown", async () => {
    const init: InitOptions = { ...baseInit, prdFormat: "markdown" };
    const result = await scaffoldProject(tempDir, { init });

    expect(existsSync(join(tempDir, "prd.md"))).toBe(true);
    expect(existsSync(join(tempDir, "prd.json"))).toBe(false);

    const content = await readFile(join(tempDir, "prd.md"), "utf-8");
    expect(content).toContain("# Test Project");
    expect(content).toContain("`bun test`");
  });

  test("creates prd.example.json when prdFormat is markdown", async () => {
    const init: InitOptions = { ...baseInit, prdFormat: "markdown" };
    await scaffoldProject(tempDir, { init });

    // Should provide the OTHER format as example
    expect(existsSync(join(tempDir, "ralph", "prd.example.json"))).toBe(true);
    expect(existsSync(join(tempDir, "ralph", "prd.example.md"))).toBe(false);
  });

  test("creates prd.example.md when prdFormat is json", async () => {
    await scaffoldProject(tempDir, { init: baseInit });

    expect(existsSync(join(tempDir, "ralph", "prd.example.md"))).toBe(true);
    expect(existsSync(join(tempDir, "ralph", "prd.example.json"))).toBe(false);
  });

  test("ralph.json reflects chosen agent and model", async () => {
    await scaffoldProject(tempDir, { init: baseInit });

    const raw = await readFile(join(tempDir, "ralph.json"), "utf-8");
    const config = JSON.parse(raw);

    expect(config.agent).toBe("claude");
    expect(config.validate).toEqual(["bun test"]);
    expect(config.maxIterations).toBe(25);
    expect(config.gitCheckpoint).toBe(false);
    expect(config.agentOptions.claude.model).toBe("sonnet");
    expect(config.agentOptions.claude.maxTurns).toBe(30);
  });

  test("ralph.json reflects codex agent with sandbox option", async () => {
    const init: InitOptions = {
      ...baseInit,
      agent: "codex",
      model: "gpt-5-codex",
      codexSandbox: "danger-full-access",
      claudeMaxTurns: undefined,
    };
    await scaffoldProject(tempDir, { init });

    const raw = await readFile(join(tempDir, "ralph.json"), "utf-8");
    const config = JSON.parse(raw);

    expect(config.agent).toBe("codex");
    expect(config.agentOptions.codex.model).toBe("gpt-5-codex");
    expect(config.agentOptions.codex.sandbox).toBe("danger-full-access");
    expect(config.agentOptions.claude).toBeUndefined();
  });

  test("ralph.json reflects opencode agent", async () => {
    const init: InitOptions = {
      ...baseInit,
      agent: "opencode",
      model: "anthropic/claude-sonnet-4-20250514",
      claudeMaxTurns: undefined,
    };
    await scaffoldProject(tempDir, { init });

    const raw = await readFile(join(tempDir, "ralph.json"), "utf-8");
    const config = JSON.parse(raw);

    expect(config.agent).toBe("opencode");
    expect(config.agentOptions.opencode.model).toBe("anthropic/claude-sonnet-4-20250514");
    expect(config.agentOptions.claude).toBeUndefined();
    expect(config.agentOptions.codex).toBeUndefined();
  });

  test("multiple validation commands are preserved", async () => {
    const init: InitOptions = {
      ...baseInit,
      validate: ["bun test", "bun run typecheck", "bun run lint"],
    };
    await scaffoldProject(tempDir, { init });

    const configRaw = await readFile(join(tempDir, "ralph.json"), "utf-8");
    const config = JSON.parse(configRaw);
    expect(config.validate).toEqual(["bun test", "bun run typecheck", "bun run lint"]);

    const prdRaw = await readFile(join(tempDir, "prd.json"), "utf-8");
    const prd = JSON.parse(prdRaw);
    expect(prd.validate).toEqual(["bun test", "bun run typecheck", "bun run lint"]);
  });

  test("scaffolded prd.json from init passes PRD schema validation", async () => {
    const { loadPrdFile } = await import("../src/prd/loader.js");

    await scaffoldProject(tempDir, { init: baseInit });

    const prd = await loadPrdFile(join(tempDir, "prd.json"));
    expect(prd.name).toBe("Test Project");
    expect(prd.tasks.length).toBeGreaterThan(0);
  });

  test("scaffolded prd.md from init passes PRD markdown parsing", async () => {
    const { loadPrdFile } = await import("../src/prd/loader.js");

    const init: InitOptions = { ...baseInit, prdFormat: "markdown" };
    await scaffoldProject(tempDir, { init });

    const prd = await loadPrdFile(join(tempDir, "prd.md"));
    expect(prd.name).toBe("Test Project");
    expect(prd.tasks.length).toBeGreaterThan(0);
  });
});
