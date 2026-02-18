import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { PrdSchema, validateUniqueIds, type Prd } from "./schema.js";
import { parseMarkdownPrd } from "./markdown.js";

/**
 * Search paths for PRD files, in priority order.
 * First match wins.
 */
const PRD_SEARCH_PATHS = [
  // Project root
  "prd.json",
  "prd.md",
  "prd.markdown",
  // ralph/ subfolder
  "ralph/prd.json",
  "ralph/prd.md",
  "ralph/prd.markdown",
];

export interface PrdDiscoveryResult {
  /** Absolute path to the PRD file found */
  path: string;
  /** Whether it's JSON or Markdown */
  format: "json" | "markdown";
}

/**
 * Discover a PRD file by searching known locations.
 * Returns the first match found, or undefined if none exist.
 */
export function discoverPrd(cwd: string): PrdDiscoveryResult | undefined {
  for (const relPath of PRD_SEARCH_PATHS) {
    const absPath = resolve(cwd, relPath);
    if (existsSync(absPath)) {
      const format = relPath.endsWith(".json") ? "json" : "markdown";
      return { path: absPath, format };
    }
  }
  return undefined;
}

/**
 * Load a PRD file from a specific path.
 * Auto-detects format from extension.
 */
export async function loadPrdFile(path: string): Promise<Prd> {
  const raw = await readFile(path, "utf-8");

  let prd: Prd;

  if (path.endsWith(".json")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Failed to parse PRD file as JSON: ${path}`);
    }
    prd = PrdSchema.parse(parsed);
  } else {
    // Markdown
    const rawPrd = parseMarkdownPrd(raw);
    prd = PrdSchema.parse(rawPrd);
  }

  // Extra validations
  validateUniqueIds(prd);

  return prd;
}

/**
 * Discover and load a PRD from the project.
 * Optionally accepts an explicit path override.
 */
export async function resolvePrd(
  cwd: string,
  explicitPath?: string
): Promise<{ prd: Prd; path: string; format: "json" | "markdown" } | undefined> {
  if (explicitPath) {
    const absPath = resolve(cwd, explicitPath);
    if (!existsSync(absPath)) {
      throw new Error(`PRD file not found: ${absPath}`);
    }
    const format = absPath.endsWith(".json") ? "json" : "markdown";
    const prd = await loadPrdFile(absPath);
    return { prd, path: absPath, format };
  }

  const discovered = discoverPrd(cwd);
  if (!discovered) return undefined;

  const prd = await loadPrdFile(discovered.path);
  return { prd, path: discovered.path, format: discovered.format };
}

/**
 * Generate a default prd.json for scaffolding.
 */
export function generateDefaultPrd(): Record<string, unknown> {
  return {
    name: "My Project",
    description: "Describe the overall project or feature set here.",
    validate: ["npm test"],
    maxIterations: 50,
    tasks: [
      {
        id: "task-1",
        name: "First Task",
        description: "Describe what needs to be done for this task.",
        acceptanceCriteria: [
          "All tests pass",
          "No TypeScript errors",
        ],
      },
      {
        id: "task-2",
        name: "Second Task",
        description: "Describe the second task here.",
        dependsOn: ["task-1"],
        acceptanceCriteria: [
          "All tests pass",
        ],
      },
    ],
  };
}
