import type { EventType, RunRecord, RunStatus } from "@ralphh/shared";
import type { RalphDatabase } from "./db.js";

interface QueueHooks {
  onRunExecute: (run: RunRecord, signal: AbortSignal) => Promise<void>;
  onEvent: (
    threadId: string,
    runId: string | undefined,
    type: EventType,
    payload?: Record<string, unknown>
  ) => void;
}

export class RunQueue {
  private readonly pending = new Set<string>();
  private readonly running = new Set<string>();
  private readonly controllers = new Map<string, AbortController>();

  constructor(
    private readonly db: RalphDatabase,
    private readonly hooks: QueueHooks,
    private readonly maxConcurrent = 2
  ) {}

  enqueue(runId: string): void {
    this.pending.add(runId);
    this.tick();
  }

  pause(runId: string): boolean {
    if (!this.pending.has(runId)) {
      return false;
    }

    const run = this.db.getRun(runId);
    if (!run) {
      return false;
    }

    this.pending.delete(runId);
    this.db.updateRunStatus(runId, "paused");
    this.hooks.onEvent(run.threadId, run.id, "run.paused");
    return true;
  }

  resume(runId: string): boolean {
    const run = this.db.getRun(runId);
    if (!run || run.status !== "paused") {
      return false;
    }

    this.db.updateRunStatus(runId, "queued");
    this.hooks.onEvent(run.threadId, run.id, "run.resumed");
    this.enqueue(runId);
    return true;
  }

  stop(runId: string): boolean {
    const run = this.db.getRun(runId);
    if (!run) {
      return false;
    }

    if (this.pending.has(runId)) {
      this.pending.delete(runId);
      this.db.updateRunStatus(runId, "cancelled", { finishedAt: Date.now() });
      this.hooks.onEvent(run.threadId, run.id, "run.cancelled");
      return true;
    }

    const controller = this.controllers.get(runId);
    if (controller) {
      controller.abort();
      return true;
    }

    return false;
  }

  private tick(): void {
    while (
      this.running.size < this.maxConcurrent &&
      this.pending.size > 0
    ) {
      const [nextRunId] = this.pending;
      if (!nextRunId) {
        return;
      }

      this.pending.delete(nextRunId);
      void this.execute(nextRunId);
    }
  }

  private async execute(runId: string): Promise<void> {
    const run = this.db.getRun(runId);
    if (!run) {
      return;
    }

    if (run.status !== "queued") {
      return;
    }

    const controller = new AbortController();
    this.controllers.set(runId, controller);
    this.running.add(runId);

    this.db.updateRunStatus(runId, "running", { startedAt: Date.now() });
    this.hooks.onEvent(run.threadId, run.id, "run.started");

    try {
      await this.hooks.onRunExecute(run, controller.signal);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.db.updateRunStatus(runId, "failed", {
        error: message,
        finishedAt: Date.now(),
      });
      this.hooks.onEvent(run.threadId, run.id, "run.failed", {
        message,
      });
    } finally {
      this.controllers.delete(runId);
      this.running.delete(runId);
      this.tick();
    }
  }
}

export const TERMINAL_RUN_STATES = new Set<RunStatus>([
  "completed",
  "failed",
  "cancelled",
]);
