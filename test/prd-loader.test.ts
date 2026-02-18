import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  discoverPrd,
  loadPrdFile,
  resolvePrd,
  generateDefaultPrd,
} from "../src/prd/loader.js";

describe("discoverPrd", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ralph-prd-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("returns undefined when no PRD file exists", () => {
    const result = discoverPrd(tempDir);
    expect(result).toBeUndefined();
  });

  test("finds prd.json in project root", async () => {
    const prdPath = join(tempDir, "prd.json");
    await writeFile(
      prdPath,
      JSON.stringify({
        name: "Test",
        tasks: [{ id: "t1", name: "T", description: "x" }],
      })
    );
    const result = discoverPrd(tempDir);
    expect(result).toBeDefined();
    expect(result!.format).toBe("json");
    expect(result!.path).toBe(prdPath);
  });

  test("finds prd.md in project root", async () => {
    const prdPath = join(tempDir, "prd.md");
    await writeFile(prdPath, "# Test\n\n## t1: Task\n\nDo stuff.\n");
    const result = discoverPrd(tempDir);
    expect(result).toBeDefined();
    expect(result!.format).toBe("markdown");
  });

  test("finds prd.json in ralph/ subfolder", async () => {
    await mkdir(join(tempDir, "ralph"));
    const prdPath = join(tempDir, "ralph", "prd.json");
    await writeFile(
      prdPath,
      JSON.stringify({
        name: "Test",
        tasks: [{ id: "t1", name: "T", description: "x" }],
      })
    );
    const result = discoverPrd(tempDir);
    expect(result).toBeDefined();
    expect(result!.path).toBe(prdPath);
  });

  test("finds prd.md in ralph/ subfolder", async () => {
    await mkdir(join(tempDir, "ralph"));
    const prdPath = join(tempDir, "ralph", "prd.md");
    await writeFile(prdPath, "# Test\n\n## t1: Task\n\nDo stuff.\n");
    const result = discoverPrd(tempDir);
    expect(result).toBeDefined();
    expect(result!.format).toBe("markdown");
  });

  test("prefers project root prd.json over ralph/ subfolder", async () => {
    // Root prd.json
    const rootPath = join(tempDir, "prd.json");
    await writeFile(
      rootPath,
      JSON.stringify({
        name: "Root",
        tasks: [{ id: "t1", name: "T", description: "x" }],
      })
    );
    // ralph/ prd.json
    await mkdir(join(tempDir, "ralph"));
    await writeFile(
      join(tempDir, "ralph", "prd.json"),
      JSON.stringify({
        name: "Sub",
        tasks: [{ id: "t1", name: "T", description: "x" }],
      })
    );
    const result = discoverPrd(tempDir);
    expect(result!.path).toBe(rootPath);
  });

  test("prefers prd.json over prd.md in same directory", async () => {
    await writeFile(
      join(tempDir, "prd.json"),
      JSON.stringify({
        name: "JSON",
        tasks: [{ id: "t1", name: "T", description: "x" }],
      })
    );
    await writeFile(
      join(tempDir, "prd.md"),
      "# Markdown\n\n## t1: Task\n\nDo stuff.\n"
    );
    const result = discoverPrd(tempDir);
    expect(result!.format).toBe("json");
  });
});

describe("loadPrdFile", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ralph-prd-load-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("loads valid prd.json", async () => {
    const path = join(tempDir, "prd.json");
    await writeFile(
      path,
      JSON.stringify({
        name: "Test Project",
        validate: ["npm test"],
        tasks: [
          { id: "setup", name: "Setup", description: "Init everything" },
          {
            id: "build",
            name: "Build",
            description: "Build it",
            dependsOn: ["setup"],
          },
        ],
      })
    );
    const prd = await loadPrdFile(path);
    expect(prd.name).toBe("Test Project");
    expect(prd.tasks).toHaveLength(2);
  });

  test("loads valid prd.md", async () => {
    const path = join(tempDir, "prd.md");
    await writeFile(
      path,
      `# Test Project

## setup: Setup

Init everything.

## build: Build

Build it.
`
    );
    const prd = await loadPrdFile(path);
    expect(prd.name).toBe("Test Project");
    expect(prd.tasks).toHaveLength(2);
  });

  test("throws on invalid JSON", async () => {
    const path = join(tempDir, "prd.json");
    await writeFile(path, "not valid json{{{");
    await expect(loadPrdFile(path)).rejects.toThrow("Failed to parse");
  });

  test("throws on duplicate task IDs", async () => {
    const path = join(tempDir, "prd.json");
    await writeFile(
      path,
      JSON.stringify({
        name: "Test",
        tasks: [
          { id: "dup", name: "First", description: "x" },
          { id: "dup", name: "Second", description: "y" },
        ],
      })
    );
    await expect(loadPrdFile(path)).rejects.toThrow("Duplicate task ID");
  });
});

describe("resolvePrd", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ralph-prd-resolve-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("returns undefined when no PRD found", async () => {
    const result = await resolvePrd(tempDir);
    expect(result).toBeUndefined();
  });

  test("loads from explicit path", async () => {
    const path = join(tempDir, "custom.json");
    await writeFile(
      path,
      JSON.stringify({
        name: "Custom",
        tasks: [{ id: "t1", name: "T", description: "x" }],
      })
    );
    const result = await resolvePrd(tempDir, path);
    expect(result).toBeDefined();
    expect(result!.prd.name).toBe("Custom");
  });

  test("throws on explicit path that does not exist", async () => {
    await expect(
      resolvePrd(tempDir, join(tempDir, "nope.json"))
    ).rejects.toThrow("not found");
  });

  test("auto-discovers prd.json", async () => {
    await writeFile(
      join(tempDir, "prd.json"),
      JSON.stringify({
        name: "Auto",
        tasks: [{ id: "t1", name: "T", description: "x" }],
      })
    );
    const result = await resolvePrd(tempDir);
    expect(result).toBeDefined();
    expect(result!.prd.name).toBe("Auto");
  });
});

describe("generateDefaultPrd", () => {
  test("returns a valid structure", () => {
    const prd = generateDefaultPrd();
    expect(prd.name).toBeDefined();
    expect(prd.tasks).toBeDefined();
    expect(Array.isArray(prd.tasks)).toBe(true);
    expect((prd.tasks as unknown[]).length).toBeGreaterThan(0);
  });
});
