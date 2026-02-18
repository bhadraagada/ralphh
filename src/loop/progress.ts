import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export interface ProgressData {
  /** Raw markdown content of the progress file */
  content: string;
  /** Whether the file existed before reading */
  exists: boolean;
}

/**
 * Read the progress file from the project directory.
 * Returns empty content if the file doesn't exist yet.
 */
export async function readProgress(
  cwd: string,
  progressFile: string
): Promise<ProgressData> {
  const filePath = resolve(cwd, progressFile);
  if (!existsSync(filePath)) {
    return { content: "", exists: false };
  }
  const content = await readFile(filePath, "utf-8");
  return { content, exists: true };
}

/**
 * Write/overwrite the progress file.
 */
export async function writeProgress(
  cwd: string,
  progressFile: string,
  content: string
): Promise<void> {
  const filePath = resolve(cwd, progressFile);
  await writeFile(filePath, content, "utf-8");
}

/**
 * Initialize a fresh progress file for a new ralph run.
 */
export async function initProgress(
  cwd: string,
  progressFile: string,
  task: string
): Promise<void> {
  const header = `# Ralph Loop Progress

## Task
${task}

## Status
Started — no iterations completed yet.

## Iteration Log
`;
  await writeProgress(cwd, progressFile, header);
}
