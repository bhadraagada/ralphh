import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  RalphConfigFileSchema,
  mergeAndValidate,
  type CliFlags,
  type RalphConfig,
  type RalphConfigFile,
} from "./schema.js";

const CONFIG_FILENAMES = ["ralph.json", "ralph.config.json"];

/**
 * Search for a ralph config file starting from `cwd` and walking up.
 * Returns the absolute path if found, undefined otherwise.
 */
export function findConfigFile(cwd: string): string | undefined {
  let dir = resolve(cwd);

  while (true) {
    for (const name of CONFIG_FILENAMES) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }
  return undefined;
}

/**
 * Load and parse a ralph config file from disk.
 */
export async function loadConfigFile(
  path: string
): Promise<RalphConfigFile> {
  const raw = await readFile(path, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Failed to parse config file as JSON: ${path}`);
  }
  return RalphConfigFileSchema.parse(parsed);
}

/**
 * Resolve the final config by:
 *  1. Finding/loading the config file (if any)
 *  2. Overlaying CLI flags
 *  3. Validating with Zod
 *
 * If `cliFlags.task` is a path to an existing file, read its contents.
 */
export async function resolveConfig(
  cwd: string,
  cliFlags: CliFlags
): Promise<RalphConfig> {
  // Load config file
  let fileConfig: Partial<RalphConfigFile> = {};
  const configPath = cliFlags.config ?? findConfigFile(cwd);
  if (configPath) {
    fileConfig = await loadConfigFile(configPath);
  }

  // If task points to a file, read it
  const taskValue = cliFlags.task ?? fileConfig.task;
  if (taskValue) {
    const taskPath = resolve(cwd, taskValue);
    if (
      existsSync(taskPath) &&
      (taskValue.endsWith(".md") ||
        taskValue.endsWith(".txt") ||
        taskValue.endsWith(".markdown"))
    ) {
      const taskContent = await readFile(taskPath, "utf-8");
      if (cliFlags.task) {
        cliFlags = { ...cliFlags, task: taskContent };
      } else {
        fileConfig = { ...fileConfig, task: taskContent };
      }
    }
  }

  return mergeAndValidate(fileConfig, cliFlags);
}

/**
 * Generate a default ralph.json config object for `ralph init`.
 */
export function generateDefaultConfig(): Record<string, unknown> {
  return {
    agent: "claude",
    task: "Describe your task here",
    validate: ["npm test"],
    maxIterations: 50,
    delay: 2,
    progressFile: "ralph-progress.md",
    gitCheckpoint: true,
    agentOptions: {
      claude: {
        maxTurns: 50,
      },
      codex: {
        sandbox: "workspace-write",
      },
      opencode: {},
    },
  };
}
