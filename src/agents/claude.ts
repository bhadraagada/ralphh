import type { AgentAdapter } from "./types.js";
import type { SpawnConfig } from "../utils/process.js";
import { runShellCommand } from "../utils/process.js";

export interface ClaudeAdapterOptions {
  model?: string;
  maxTurns?: number;
  maxBudgetUsd?: number;
  additionalFlags?: string[];
}

const DEFAULT_TIMEOUT = 5 * 60 * 1000; // 5 minutes

export class ClaudeAdapter implements AgentAdapter {
  readonly name = "claude";
  readonly displayName = "Claude Code";
  readonly command = "claude";

  private opts: ClaudeAdapterOptions;

  constructor(opts: ClaudeAdapterOptions = {}) {
    this.opts = opts;
  }

  async checkInstalled(): Promise<boolean> {
    const result = await runShellCommand("claude --version");
    return result.exitCode === 0;
  }

  buildCommand(prompt: string, cwd: string): SpawnConfig {
    const args = ["-p", "--dangerously-skip-permissions", "--verbose"];

    if (this.opts.model) {
      args.push("--model", this.opts.model);
    }
    if (this.opts.maxTurns !== undefined) {
      args.push("--max-turns", String(this.opts.maxTurns));
    }
    if (this.opts.additionalFlags) {
      args.push(...this.opts.additionalFlags);
    }

    args.push(prompt);

    return { command: this.command, args, cwd, timeout: DEFAULT_TIMEOUT };
  }
}
