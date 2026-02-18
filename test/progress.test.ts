import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readProgress,
  writeProgress,
  initProgress,
} from "../src/loop/progress.js";

describe("progress", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ralph-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("readProgress returns empty content when file does not exist", async () => {
    const result = await readProgress(tempDir, "ralph-progress.md");
    expect(result.exists).toBe(false);
    expect(result.content).toBe("");
  });

  test("writeProgress creates a file with content", async () => {
    await writeProgress(tempDir, "ralph-progress.md", "hello world");
    const content = await readFile(
      join(tempDir, "ralph-progress.md"),
      "utf-8"
    );
    expect(content).toBe("hello world");
  });

  test("readProgress reads existing file", async () => {
    await writeProgress(tempDir, "ralph-progress.md", "iteration 1 done");
    const result = await readProgress(tempDir, "ralph-progress.md");
    expect(result.exists).toBe(true);
    expect(result.content).toBe("iteration 1 done");
  });

  test("initProgress creates a structured progress file", async () => {
    await initProgress(tempDir, "ralph-progress.md", "Add user authentication");
    const result = await readProgress(tempDir, "ralph-progress.md");
    expect(result.exists).toBe(true);
    expect(result.content).toContain("# Ralph Loop Progress");
    expect(result.content).toContain("Add user authentication");
    expect(result.content).toContain("## Status");
    expect(result.content).toContain("## Iteration Log");
  });

  test("writeProgress overwrites existing content", async () => {
    await writeProgress(tempDir, "ralph-progress.md", "first");
    await writeProgress(tempDir, "ralph-progress.md", "second");
    const result = await readProgress(tempDir, "ralph-progress.md");
    expect(result.content).toBe("second");
  });

  test("works with custom progress file names", async () => {
    await writeProgress(tempDir, "my-progress.txt", "custom file");
    const result = await readProgress(tempDir, "my-progress.txt");
    expect(result.exists).toBe(true);
    expect(result.content).toBe("custom file");
  });
});
