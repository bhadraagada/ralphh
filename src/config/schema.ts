import { z } from "zod";

export const AgentType = z.enum(["codex", "claude", "opencode"]);
export type AgentType = z.infer<typeof AgentType>;

export const CodexOptionsSchema = z.object({
  model: z.string().optional(),
  sandbox: z
    .enum(["read-only", "workspace-write", "danger-full-access"])
    .default("workspace-write"),
  additionalFlags: z.array(z.string()).default([]),
});

export const ClaudeOptionsSchema = z.object({
  model: z.string().optional(),
  maxTurns: z.number().positive().optional(),
  maxBudgetUsd: z.number().positive().optional(),
  additionalFlags: z.array(z.string()).default([]),
});

export const OpenCodeOptionsSchema = z.object({
  model: z.string().optional(),
  additionalFlags: z.array(z.string()).default([]),
});

export const AgentOptionsSchema = z.object({
  codex: CodexOptionsSchema.optional(),
  claude: ClaudeOptionsSchema.optional(),
  opencode: OpenCodeOptionsSchema.optional(),
});

export const RalphConfigSchema = z.object({
  /** Which agent to use */
  agent: AgentType.default("claude"),

  /** Task description — inline string or path to a .md/.txt file (required for single-task mode, not for PRD mode) */
  task: z.string().min(1).optional(),

  /** Validation commands that must ALL pass for completion */
  validate: z
    .array(z.string().min(1))
    .min(1, "At least one validation command is required")
    .default(["npm test"]),

  /** Maximum loop iterations before giving up */
  maxIterations: z.number().int().positive().default(50),

  /** Seconds to wait between iterations */
  delay: z.number().nonnegative().default(2),

  /** Path to the progress file */
  progressFile: z.string().default("ralph-progress.md"),

  /** Custom completion promise string (auto-generated if omitted) */
  promise: z.string().optional(),

  /** Auto-commit after each iteration and revert on regression */
  gitCheckpoint: z.boolean().default(true),

  /** Max chars of failure output to inject into the next prompt */
  failureContextMaxChars: z.number().int().positive().default(4000),

  /** Per-agent configuration overrides */
  agentOptions: AgentOptionsSchema.optional(),
});

export type RalphConfig = z.infer<typeof RalphConfigSchema>;

/** The shape of ralph.json on disk (everything optional) */
export const RalphConfigFileSchema = RalphConfigSchema.partial();

export type RalphConfigFile = z.infer<typeof RalphConfigFileSchema>;

/** CLI flags that override config file values */
export interface CliFlags {
  agent?: string;
  task?: string;
  validate?: string[];
  maxIterations?: number;
  delay?: number;
  progressFile?: string;
  promise?: string;
  gitCheckpoint?: boolean;
  config?: string;
  dryRun?: boolean;
}

/**
 * Merge CLI flags on top of a config file object,
 * then validate with Zod.
 */
export function mergeAndValidate(
  fileConfig: Partial<RalphConfigFile>,
  cliFlags: CliFlags
): RalphConfig {
  const merged = {
    ...fileConfig,
    ...(cliFlags.agent !== undefined && { agent: cliFlags.agent }),
    ...(cliFlags.task !== undefined && { task: cliFlags.task }),
    ...(cliFlags.validate !== undefined && { validate: cliFlags.validate }),
    ...(cliFlags.maxIterations !== undefined && {
      maxIterations: cliFlags.maxIterations,
    }),
    ...(cliFlags.delay !== undefined && { delay: cliFlags.delay }),
    ...(cliFlags.progressFile !== undefined && {
      progressFile: cliFlags.progressFile,
    }),
    ...(cliFlags.promise !== undefined && { promise: cliFlags.promise }),
    ...(cliFlags.gitCheckpoint !== undefined && {
      gitCheckpoint: cliFlags.gitCheckpoint,
    }),
  };

  return RalphConfigSchema.parse(merged);
}
