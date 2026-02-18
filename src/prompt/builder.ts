import type { ProgressData } from "../loop/progress.js";
import type { ResolvedTask } from "../prd/schema.js";

export interface PromptContext {
  /** The user's task description */
  task: string;
  /** Current iteration number */
  iteration: number;
  /** Maximum iterations allowed */
  maxIterations: number;
  /** Contents of the progress file */
  progress: ProgressData;
  /** Validation commands the agent must satisfy */
  validationCommands: string[];
  /** The completion promise the agent must output */
  completionPromise: string;
  /** Path to the progress file */
  progressFile: string;
  /** Formatted output from the previous iteration's failures (if any) */
  lastFailureOutput?: string;
  /** Whether the previous iteration was reverted due to regression */
  wasReverted?: boolean;

  // ─── Multi-task PRD context (optional) ───────────────────────
  /** The current task from the PRD (if running in PRD mode) */
  prdTask?: ResolvedTask;
  /** Name of the PRD project */
  prdName?: string;
  /** High-level PRD description */
  prdDescription?: string;
  /** Summary of completed tasks so far */
  completedTasks?: { id: string; name: string }[];
}

/**
 * Build the full prompt to inject into the agent for a single iteration.
 */
export function buildPrompt(ctx: PromptContext): string {
  const sections: string[] = [];

  // --- PRD context (if running multi-task) ---
  if (ctx.prdTask) {
    sections.push(buildPrdHeader(ctx));
  }

  // --- Task ---
  sections.push(`## Your Task\n${ctx.task}`);

  // --- Acceptance criteria (from PRD task) ---
  if (ctx.prdTask && ctx.prdTask.acceptanceCriteria.length > 0) {
    sections.push(
      `## Acceptance Criteria\n` +
        ctx.prdTask.acceptanceCriteria
          .map((c, i) => `${i + 1}. ${c}`)
          .join("\n")
    );
  }

  // --- Rules ---
  sections.push(`## Rules
- You are iteration **${ctx.iteration}** of **${ctx.maxIterations}** in an automated Ralph Loop.
- Previous iterations may have made partial progress on the codebase.
- Read \`${ctx.progressFile}\` FIRST to understand what has been done so far.
- Before you finish, UPDATE \`${ctx.progressFile}\` with:
  - What you accomplished this iteration
  - What still remains to be done
  - Any blockers or issues encountered
- You MUST make ALL of the following validation commands pass:
${ctx.validationCommands.map((cmd, i) => `  ${i + 1}. \`${cmd}\``).join("\n")}
- Run validation commands yourself to verify your work before declaring completion.
- Do NOT modify test files to make tests pass — fix the actual source code.
- Make small, incremental changes. Do not rewrite large sections of code unnecessarily.`);

  // --- Progress ---
  if (ctx.progress.exists && ctx.progress.content.trim()) {
    sections.push(
      `## Current Progress (from ${ctx.progressFile})\n${ctx.progress.content}`
    );
  } else {
    sections.push(
      `## Current Progress\nThis is the first iteration. No previous progress exists. Start from scratch.`
    );
  }

  // --- Previous failure context ---
  if (ctx.wasReverted) {
    sections.push(`## WARNING: Previous Iteration Was Reverted
Your previous iteration's changes were reverted because they caused a **regression** — more tests/validations failed than before. The codebase has been reset to the state before that iteration. Take a different approach this time.`);
  }

  if (ctx.lastFailureOutput) {
    sections.push(
      `## Previous Iteration Validation Results\n${ctx.lastFailureOutput}`
    );
  }

  // --- Completion ---
  sections.push(`## Completion
When ALL validation commands pass and the task is **fully complete**, output this EXACT string as the **last line** of your response:

    ${ctx.completionPromise}

**Do NOT output this string unless you are 100% certain all validations pass.**
**Do NOT output a similar string or a partial match.**
If you cannot complete the task in this iteration, describe what's blocking you in \`${ctx.progressFile}\` and exit normally.`);

  return sections.join("\n\n");
}

/**
 * Build the PRD context header that tells the agent where it is in the
 * larger project plan.
 */
function buildPrdHeader(ctx: PromptContext): string {
  const task = ctx.prdTask!;
  const lines: string[] = [];

  lines.push(`## Project: ${ctx.prdName ?? "Unnamed PRD"}`);

  if (ctx.prdDescription) {
    lines.push(ctx.prdDescription);
  }

  lines.push("");
  lines.push(
    `**You are working on task ${task.index} of ${task.total}: "${task.name}"** (id: \`${task.id}\`)`
  );

  // Show completed tasks
  if (ctx.completedTasks && ctx.completedTasks.length > 0) {
    lines.push("");
    lines.push("### Previously Completed Tasks");
    for (const t of ctx.completedTasks) {
      lines.push(`- [x] \`${t.id}\`: ${t.name}`);
    }
  }

  // Show remaining tasks (after current)
  if (task.index < task.total) {
    lines.push("");
    lines.push(
      `*${task.total - task.index} task(s) remaining after this one. Focus only on the current task.*`
    );
  }

  return lines.join("\n");
}
