import type { EventType, RunRecord } from "@ralphh/shared";
import type { RalphDatabase } from "./db.js";

function cronPartMatches(part: string, value: number): boolean {
  if (part === "*") {
    return true;
  }

  const numeric = Number(part);
  return Number.isInteger(numeric) && numeric === value;
}

function matchesSimpleCron(cron: string, date: Date): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) {
    return false;
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  return (
    cronPartMatches(minute, date.getMinutes()) &&
    cronPartMatches(hour, date.getHours()) &&
    cronPartMatches(dayOfMonth, date.getDate()) &&
    cronPartMatches(month, date.getMonth() + 1) &&
    cronPartMatches(dayOfWeek, date.getDay())
  );
}

interface AutomationSchedulerHooks {
  onEvent: (
    threadId: string,
    runId: string | undefined,
    type: EventType,
    payload?: Record<string, unknown>
  ) => void;
  onRunQueued: (run: RunRecord) => void;
}

export class AutomationScheduler {
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly db: RalphDatabase,
    private readonly hooks: AutomationSchedulerHooks,
    private readonly intervalMs = 30_000
  ) {}

  start(): void {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);
  }

  stop(): void {
    if (!this.timer) {
      return;
    }

    clearInterval(this.timer);
    this.timer = undefined;
  }

  async triggerNow(automationId: string): Promise<RunRecord> {
    return this.triggerAutomationRun(automationId, "manual");
  }

  private async tick(): Promise<void> {
    const automations = this.db.listAutomations().filter((automation) => automation.enabled);
    const now = new Date();
    const currentMinuteBucket = Math.floor(Date.now() / 60_000);

    for (const automation of automations) {
      if (!automation.threadId) {
        continue;
      }

      if (!matchesSimpleCron(automation.cron, now)) {
        continue;
      }

      const lastMinuteBucket = automation.lastRunAt
        ? Math.floor(automation.lastRunAt / 60_000)
        : -1;

      if (lastMinuteBucket === currentMinuteBucket) {
        continue;
      }

      await this.triggerAutomationRun(automation.id, "scheduled");
    }
  }

  private async triggerAutomationRun(
    automationId: string,
    source: "manual" | "scheduled"
  ): Promise<RunRecord> {
    const automation = this.db.getAutomation(automationId);
    if (!automation) {
      throw new Error("Automation not found");
    }

    if (!automation.threadId) {
      throw new Error("Automation is not linked to a thread");
    }

    const thread = this.db.getThread(automation.threadId);
    if (!thread) {
      throw new Error("Automation thread not found");
    }

    const run = this.db.createRun({
      threadId: automation.threadId,
      maxIterations: automation.maxIterations,
    });

    this.db.markAutomationTriggered(automation.id);
    this.hooks.onEvent(thread.id, run.id, "automation.triggered", {
      automationId: automation.id,
      source,
      cron: automation.cron,
    });
    this.hooks.onEvent(thread.id, run.id, "run.queued", {
      source: "automation",
      automationId: automation.id,
      maxIterations: run.maxIterations,
    });
    this.hooks.onRunQueued(run);

    return run;
  }
}
