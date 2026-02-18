import type { SpawnConfig } from "../utils/process.js";

/**
 * Common interface that all agent adapters must implement.
 */
export interface AgentAdapter {
  /** Agent identifier (e.g. "claude", "codex", "opencode") */
  readonly name: string;

  /** Display name for logging */
  readonly displayName: string;

  /** CLI command name */
  readonly command: string;

  /**
   * Check if the agent CLI is installed and accessible.
   */
  checkInstalled(): Promise<boolean>;

  /**
   * Build the spawn config for a non-interactive run.
   * The prompt has already been constructed by the prompt builder.
   */
  buildCommand(prompt: string, cwd: string): SpawnConfig;
}

/**
 * Options passed through from config to agent adapters.
 */
export interface AgentOptions {
  model?: string;
  additionalFlags?: string[];
  [key: string]: unknown;
}
