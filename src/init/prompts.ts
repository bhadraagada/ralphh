import * as p from "@clack/prompts";
import type { AgentType } from "../config/schema.js";

/** The full set of choices the user makes during `ralph init`. */
export interface InitOptions {
  agent: AgentType;
  model: string;
  prdFormat: "json" | "markdown";
  projectName: string;
  validate: string[];
  maxIterations: number;
  gitCheckpoint: boolean;
  // Agent-specific
  claudeMaxTurns?: number;
  codexSandbox?: "read-only" | "workspace-write" | "danger-full-access";
}

const DEFAULT_MODELS: Record<AgentType, string> = {
  claude: "sonnet",
  codex: "gpt-5-codex",
  opencode: "anthropic/claude-sonnet-4-20250514",
};

/**
 * Run the full interactive init flow using clack prompts.
 * Returns undefined if the user cancels at any point.
 */
export async function runInitPrompts(): Promise<InitOptions | undefined> {
  p.intro("ralph init");

  // ─── Step 1: Agent ─────────────────────────────────────────
  const agent = await p.select({
    message: "Which AI agent do you want to use?",
    options: [
      { value: "claude" as const, label: "Claude", hint: "claude code cli" },
      { value: "codex" as const, label: "Codex", hint: "openai codex cli" },
      { value: "opencode" as const, label: "OpenCode", hint: "opencode cli" },
    ],
    initialValue: "claude" as const,
  });
  if (p.isCancel(agent)) {
    p.cancel("Init cancelled.");
    return undefined;
  }

  // ─── Step 2: Model ─────────────────────────────────────────
  const model = await p.text({
    message: "Model to use?",
    placeholder: DEFAULT_MODELS[agent],
    defaultValue: DEFAULT_MODELS[agent],
  });
  if (p.isCancel(model)) {
    p.cancel("Init cancelled.");
    return undefined;
  }

  // ─── Step 3: PRD format ────────────────────────────────────
  const prdFormat = await p.select({
    message: "PRD file format?",
    options: [
      { value: "json" as const, label: "JSON", hint: "prd.json — structured, easy to parse" },
      { value: "markdown" as const, label: "Markdown", hint: "prd.md — human-friendly, more flexible" },
    ],
    initialValue: "json" as const,
  });
  if (p.isCancel(prdFormat)) {
    p.cancel("Init cancelled.");
    return undefined;
  }

  // ─── Step 4: Project name ──────────────────────────────────
  const projectName = await p.text({
    message: "Project name?",
    placeholder: "My Awesome Feature",
    defaultValue: "My Awesome Feature",
  });
  if (p.isCancel(projectName)) {
    p.cancel("Init cancelled.");
    return undefined;
  }

  // ─── Step 5: Validation commands ───────────────────────────
  const validateRaw = await p.text({
    message: "Validation commands (comma-separated)?",
    placeholder: "npm test",
    defaultValue: "npm test",
  });
  if (p.isCancel(validateRaw)) {
    p.cancel("Init cancelled.");
    return undefined;
  }
  const validate = validateRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // ─── Step 6: Max iterations ────────────────────────────────
  const maxIterRaw = await p.text({
    message: "Max iterations per task?",
    placeholder: "50",
    defaultValue: "50",
    validate: (val) => {
      const n = parseInt(val ?? "", 10);
      if (isNaN(n) || n < 1) return "Must be a positive integer";
    },
  });
  if (p.isCancel(maxIterRaw)) {
    p.cancel("Init cancelled.");
    return undefined;
  }
  const maxIterations = parseInt(maxIterRaw, 10);

  // ─── Step 7: Git checkpoint ────────────────────────────────
  const gitCheckpoint = await p.confirm({
    message: "Enable git auto-checkpoint and revert on regression?",
    initialValue: true,
  });
  if (p.isCancel(gitCheckpoint)) {
    p.cancel("Init cancelled.");
    return undefined;
  }

  // ─── Step 8: Agent-specific options ────────────────────────
  let claudeMaxTurns: number | undefined;
  let codexSandbox: InitOptions["codexSandbox"] | undefined;

  if (agent === "claude") {
    const maxTurnsRaw = await p.text({
      message: "Max turns for Claude per iteration?",
      placeholder: "50",
      defaultValue: "50",
      validate: (val) => {
        const n = parseInt(val ?? "", 10);
        if (isNaN(n) || n < 1) return "Must be a positive integer";
      },
    });
    if (p.isCancel(maxTurnsRaw)) {
      p.cancel("Init cancelled.");
      return undefined;
    }
    claudeMaxTurns = parseInt(maxTurnsRaw, 10);
  }

  if (agent === "codex") {
    const sandbox = await p.select({
      message: "Codex sandbox mode?",
      options: [
        { value: "workspace-write" as const, label: "workspace-write", hint: "can write to project (recommended)" },
        { value: "read-only" as const, label: "read-only", hint: "read-only access" },
        { value: "danger-full-access" as const, label: "danger-full-access", hint: "full system access (dangerous)" },
      ],
      initialValue: "workspace-write" as const,
    });
    if (p.isCancel(sandbox)) {
      p.cancel("Init cancelled.");
      return undefined;
    }
    codexSandbox = sandbox;
  }

  // ─── Summary ───────────────────────────────────────────────
  const summaryLines = [
    `Agent:          ${agent}`,
    `Model:          ${model}`,
    `PRD format:     ${prdFormat}`,
    `Project:        ${projectName}`,
    `Validate:       ${validate.join(", ")}`,
    `Max iterations: ${maxIterations}`,
    `Git checkpoint: ${gitCheckpoint ? "yes" : "no"}`,
  ];
  if (claudeMaxTurns !== undefined) summaryLines.push(`Claude turns:   ${claudeMaxTurns}`);
  if (codexSandbox !== undefined) summaryLines.push(`Codex sandbox:  ${codexSandbox}`);

  p.note(summaryLines.join("\n"), "Configuration");

  const confirmed = await p.confirm({
    message: "Scaffold project with these settings?",
    initialValue: true,
  });
  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel("Init cancelled.");
    return undefined;
  }

  return {
    agent,
    model,
    prdFormat,
    projectName,
    validate,
    maxIterations,
    gitCheckpoint,
    claudeMaxTurns,
    codexSandbox,
  };
}
