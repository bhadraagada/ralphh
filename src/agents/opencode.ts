import type { AgentAdapter } from "./types.js";
import type { SpawnConfig } from "../utils/process.js";
import { runShellCommand } from "../utils/process.js";

export interface OpenCodeAdapterOptions {
  model?: string;
  additionalFlags?: string[];
}

const DEFAULT_TIMEOUT = 5 * 60 * 1000; // 5 minutes

export class OpenCodeAdapter implements AgentAdapter {
  readonly name = "opencode";
  readonly displayName = "OpenCode";
  readonly command = "opencode";

  private opts: OpenCodeAdapterOptions;

  constructor(opts: OpenCodeAdapterOptions = {}) {
    this.opts = opts;
  }

  async checkInstalled(): Promise<boolean> {
    const result = await runShellCommand("opencode --version");
    return result.exitCode === 0;
  }

  buildCommand(prompt: string, cwd: string): SpawnConfig {
    const args = ["run"];

    if (this.opts.model) {
      args.push("--model", this.opts.model);
    }
    if (this.opts.additionalFlags) {
      args.push(...this.opts.additionalFlags);
    }

    args.push(prompt);

    return { command: this.command, args, cwd, timeout: DEFAULT_TIMEOUT };
  }
}
