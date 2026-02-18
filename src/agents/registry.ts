import type { AgentAdapter } from "./types.js";
import type { RalphConfig } from "../config/schema.js";
import { ClaudeAdapter } from "./claude.js";
import { CodexAdapter } from "./codex.js";
import { OpenCodeAdapter } from "./opencode.js";

/**
 * Create an agent adapter by name, pulling options from the resolved config.
 */
export function getAdapter(agentName: string, config?: RalphConfig): AgentAdapter {
  const opts = config?.agentOptions;

  switch (agentName) {
    case "claude":
      return new ClaudeAdapter(opts?.claude ?? {});
    case "codex":
      return new CodexAdapter(opts?.codex ?? {});
    case "opencode":
      return new OpenCodeAdapter(opts?.opencode ?? {});
    default:
      throw new Error(
        `Unknown agent: "${agentName}". Supported agents: claude, codex, opencode`
      );
  }
}
