import { z } from "zod";
import { AgentType } from "../config/schema.js";

// ─── Individual Task ─────────────────────────────────────────────────────

export const PrdTaskSchema = z.object({
  /** Unique task identifier — used in progress tracking and logs */
  id: z.string().min(1),

  /** Short human-readable name */
  name: z.string().min(1),

  /** Full task description — this is what gets injected into the agent prompt */
  description: z.string().min(1),

  /**
   * Validation commands for THIS task.
   * If omitted, falls back to the PRD-level `validate` array.
   */
  validate: z.array(z.string().min(1)).optional(),

  /**
   * Max iterations for this specific task.
   * If omitted, falls back to the PRD-level `maxIterations`.
   */
  maxIterations: z.number().int().positive().optional(),

  /**
   * Task IDs that must complete before this task starts.
   * Used for ordering — tasks are run sequentially anyway,
   * but this documents intent and is validated at load time.
   */
  dependsOn: z.array(z.string()).default([]),

  /**
   * Acceptance criteria — human-readable list of conditions.
   * Injected into the prompt so the agent knows what "done" means.
   */
  acceptanceCriteria: z.array(z.string()).default([]),

  /** Whether to skip this task (useful for temporarily disabling) */
  skip: z.boolean().default(false),
});

export type PrdTask = z.infer<typeof PrdTaskSchema>;

// ─── Full PRD ────────────────────────────────────────────────────────────

export const PrdSchema = z.object({
  /** PRD name — used in branch names and logging */
  name: z.string().min(1),

  /** High-level description of the project/feature */
  description: z.string().default(""),

  /** Default agent for all tasks (can be overridden per-task in ralph.json) */
  agent: AgentType.optional(),

  /** Default validation commands — used when a task has no task-level validate */
  validate: z
    .array(z.string().min(1))
    .default(["npm test"]),

  /** Default max iterations per task */
  maxIterations: z.number().int().positive().default(50),

  /** Ordered list of tasks */
  tasks: z.array(PrdTaskSchema).min(1, "PRD must have at least one task"),
});

export type Prd = z.infer<typeof PrdSchema>;

// ─── Resolved task (after merging PRD-level defaults) ────────────────────

export interface ResolvedTask {
  id: string;
  name: string;
  description: string;
  validate: string[];
  maxIterations: number;
  dependsOn: string[];
  acceptanceCriteria: string[];
  skip: boolean;
  /** 1-indexed position in the PRD */
  index: number;
  /** Total number of tasks in the PRD */
  total: number;
}

/**
 * Resolve a PRD into a flat list of tasks with all defaults applied.
 * Validates dependency ordering — a task cannot depend on a later task.
 */
export function resolveTasks(prd: Prd): ResolvedTask[] {
  const taskIds = new Set(prd.tasks.map((t) => t.id));
  const seenIds = new Set<string>();
  const resolved: ResolvedTask[] = [];

  for (let i = 0; i < prd.tasks.length; i++) {
    const task = prd.tasks[i];

    // Validate dependencies exist and come before this task
    for (const dep of task.dependsOn) {
      if (!taskIds.has(dep)) {
        throw new Error(
          `Task "${task.id}" depends on "${dep}" which does not exist in the PRD`
        );
      }
      if (!seenIds.has(dep)) {
        throw new Error(
          `Task "${task.id}" depends on "${dep}" which appears later in the task list. ` +
            `Reorder tasks so dependencies come first.`
        );
      }
    }

    seenIds.add(task.id);

    resolved.push({
      id: task.id,
      name: task.name,
      description: task.description,
      validate: task.validate ?? prd.validate,
      maxIterations: task.maxIterations ?? prd.maxIterations,
      dependsOn: task.dependsOn,
      acceptanceCriteria: task.acceptanceCriteria,
      skip: task.skip,
      index: i + 1,
      total: prd.tasks.length,
    });
  }

  return resolved;
}

/**
 * Validate that all task IDs in the PRD are unique.
 */
export function validateUniqueIds(prd: Prd): void {
  const seen = new Set<string>();
  for (const task of prd.tasks) {
    if (seen.has(task.id)) {
      throw new Error(`Duplicate task ID: "${task.id}"`);
    }
    seen.add(task.id);
  }
}
