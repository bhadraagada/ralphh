import type { AgentAdapter } from "./types.js";
import type { SpawnConfig } from "../utils/process.js";
import { runShellCommand } from "../utils/process.js";

export interface CodexAdapterOptions {
  model?: string;
  sandbox?: "read-only" | "workspace-write" | "danger-full-access";
  additionalFlags?: string[];
}

const DEFAULT_TIMEOUT = 5 * 60 * 1000; // 5 minutes

export class CodexAdapter implements AgentAdapter {
  readonly name = "codex";
  readonly displayName = "Codex CLI";
  readonly command = "codex";

  private opts: CodexAdapterOptions;

  constructor(opts: CodexAdapterOptions = {}) {
    this.opts = opts;
  }

  async checkInstalled(): Promise<boolean> {
    const result = await runShellCommand("codex --version");
    return result.exitCode === 0;
  }

  buildCommand(prompt: string, cwd: string): SpawnConfig {
    const sandbox = this.opts.sandbox ?? "workspace-write";
    const args = ["exec", "--full-auto", "--sandbox", sandbox];

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
