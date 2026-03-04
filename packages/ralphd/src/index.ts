import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  type CreateAutomationRequest,
  type BroadcastEnvelope,
  type CreateReviewCommentRequest,
  type CreateRunRequest,
  type CreateThreadRequest,
  type EventRecord,
  type EventType,
  type FeedbackRerunRequest,
  type RunControlRequest,
  type RunRecord,
  type ThreadRecord,
} from "@ralphh/shared";
import type { RalphConfig } from "../../../src/config/schema.js";
import { spawnProcess } from "../../../src/utils/process.js";
import { runTaskLoop, type LoopEvent } from "../../../src/loop/runner.js";
import { RalphDatabase } from "./db.js";
import { AutomationScheduler } from "./automation-scheduler.js";
import { RunQueue, TERMINAL_RUN_STATES } from "./queue.js";
import { createThreadWorktree } from "./worktree.js";

const DEFAULT_PORT = 4242;
const DEFAULT_HOST = "127.0.0.1";

const createThreadSchema = z.object({
  name: z.string().min(1),
  task: z.string().min(1),
  repoPath: z.string().min(1),
  agent: z.enum(["claude", "codex", "opencode"]).optional(),
  validate: z.array(z.string().min(1)).optional(),
});

const createRunSchema = z.object({
  maxIterations: z.number().int().positive().optional(),
  taskOverride: z.string().min(1).optional(),
  sourceRunId: z.string().min(1).optional(),
});

const runControlSchema = z.object({
  action: z.enum(["pause", "resume", "stop", "retry"]),
});

const createAutomationSchema = z.object({
  name: z.string().min(1),
  cron: z.string().min(1),
  threadId: z.string().min(1),
  maxIterations: z.number().int().positive().optional(),
  enabled: z.boolean().optional(),
});

const toggleAutomationSchema = z.object({
  enabled: z.boolean(),
});

const createReviewCommentSchema = z.object({
  runId: z.string().min(1).optional(),
  filePath: z.string().min(1),
  lineNumber: z.number().int().positive(),
  body: z.string().min(1),
});

const feedbackRerunSchema = z.object({
  commentIds: z.array(z.number().int().positive()).min(1),
});

const here = dirname(fileURLToPath(import.meta.url));
const defaultDbPath = resolve(here, "../data/ralph-studio.db");
const dbPath = process.env.RALPHD_DB_PATH
  ? resolve(process.cwd(), process.env.RALPHD_DB_PATH)
  : defaultDbPath;

if (!existsSync(dirname(dbPath))) {
  mkdirSync(dirname(dbPath), { recursive: true });
}

const db = new RalphDatabase(dbPath);
const wsClients = new Set<any>();

function toEventTypeFromLoop(type: LoopEvent["type"]): EventType {
  return type;
}

function broadcastEvent(event: EventRecord): void {
  const envelope: BroadcastEnvelope = {
    channel: "events",
    event,
  };
  const payload = JSON.stringify(envelope);
  for (const ws of wsClients) {
    ws.send(payload);
  }
}

function emitEvent(
  threadId: string,
  runId: string | undefined,
  type: EventType,
  payload: Record<string, unknown> = {}
): EventRecord {
  const event = db.appendEvent(threadId, runId, type, payload);
  broadcastEvent(event);
  return event;
}

async function executeRun(run: RunRecord, signal: AbortSignal): Promise<void> {
  const thread = db.getThread(run.threadId);
  if (!thread) {
    db.updateRunStatus(run.id, "failed", {
      finishedAt: Date.now(),
      error: "Thread not found",
    });
    emitEvent(run.threadId, run.id, "run.failed", {
      message: "Thread not found",
    });
    return;
  }

  const config: RalphConfig = {
    agent: thread.agent,
    task: run.taskOverride ?? thread.task,
    validate: thread.validate,
    maxIterations: run.maxIterations,
    delay: 0,
    progressFile: `ralph-progress-${thread.id}.md`,
    promise: undefined,
    gitCheckpoint: false,
    failureContextMaxChars: 4000,
    agentOptions: {},
  };

  const result = await runTaskLoop({
    config,
    cwd: thread.worktreePath ?? thread.repoPath,
    task: run.taskOverride ?? thread.task,
    validate: thread.validate,
    maxIterations: run.maxIterations,
    progressFile: `ralph-progress-${thread.id}.md`,
    failureContextMaxChars: 4000,
    gitCheckpoint: false,
    agent: thread.agent,
    dryRun: false,
    delay: 0,
    abortSignal: signal,
    onEvent: (loopEvent) => {
      emitEvent(thread.id, run.id, toEventTypeFromLoop(loopEvent.type), {
        iteration: loopEvent.iteration,
        ...(loopEvent.payload ?? {}),
      });
    },
  });

  if (signal.aborted || result.cancelled) {
    db.updateRunStatus(run.id, "cancelled", {
      iterations: result.iterations,
      finishedAt: Date.now(),
    });
    emitEvent(thread.id, run.id, "run.cancelled", {
      iterations: result.iterations,
    });
    return;
  }

  if (result.success) {
    db.updateRunStatus(run.id, "completed", {
      iterations: result.iterations,
      finishedAt: Date.now(),
    });
    emitEvent(thread.id, run.id, "run.completed", {
      iterations: result.iterations,
    });
    return;
  }

  db.updateRunStatus(run.id, "failed", {
    iterations: result.iterations,
    finishedAt: Date.now(),
    error: "Loop ended before completion",
  });
  emitEvent(thread.id, run.id, "run.failed", {
    iterations: result.iterations,
    message: "Loop ended before completion",
  });
}

const queue = new RunQueue(
  db,
  {
    onRunExecute: executeRun,
    onEvent: (threadId, runId, type, payload) => {
      emitEvent(threadId, runId, type, payload);
    },
  },
  Number(process.env.RALPHD_CONCURRENCY ?? 2)
);

const scheduler = new AutomationScheduler(db, {
  onEvent: (threadId, runId, type, payload) => {
    emitEvent(threadId, runId, type, payload);
  },
  onRunQueued: (run) => {
    queue.enqueue(run.id);
  },
});
scheduler.start();

function withCorsHeaders(init: ResponseInit = {}): ResponseInit {
  const headers = new Headers(init.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  return {
    ...init,
    headers,
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    ...withCorsHeaders({ status }),
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    },
  });
}

async function readJson<T>(request: Request, schema: z.ZodSchema<T>): Promise<T> {
  const payload = await request.json();
  return schema.parse(payload);
}

function getPathParts(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

function threadSummary(thread: ThreadRecord): {
  thread: ThreadRecord;
  runs: RunRecord[];
} {
  return {
    thread,
    runs: db.listRunsByThread(thread.id),
  };
}

const server = Bun.serve({
  hostname: process.env.RALPHD_HOST ?? DEFAULT_HOST,
  port: Number(process.env.RALPHD_PORT ?? DEFAULT_PORT),
  fetch: async (request, server) => {
    const url = new URL(request.url);
    const parts = getPathParts(url.pathname);

    if (request.method === "OPTIONS") {
      return new Response(null, withCorsHeaders({ status: 204 }));
    }

    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(request);
      return upgraded ? undefined : new Response("Upgrade failed", { status: 400 });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        ok: true,
        service: "ralphd",
        dbPath,
      });
    }

    if (request.method === "GET" && url.pathname === "/threads") {
      return json({
        threads: db.listThreads().map(threadSummary),
      });
    }

    if (request.method === "GET" && url.pathname === "/automations") {
      return json({
        automations: db.listAutomations(),
      });
    }

    if (request.method === "POST" && url.pathname === "/automations") {
      try {
        const body = await readJson<CreateAutomationRequest>(request, createAutomationSchema);
        const thread = db.getThread(body.threadId);
        if (!thread) {
          return json({ error: "Thread not found" }, 404);
        }

        const automation = db.createAutomation({
          name: body.name,
          cron: body.cron,
          threadId: body.threadId,
          maxIterations: body.maxIterations ?? 10,
          enabled: body.enabled ?? true,
        });

        emitEvent(thread.id, undefined, "automation.created", {
          automationId: automation.id,
          cron: automation.cron,
          enabled: automation.enabled,
        });

        return json({ automation }, 201);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return json({ error: message }, 400);
      }
    }

    if (request.method === "POST" && url.pathname === "/threads") {
      try {
        const body = await readJson<CreateThreadRequest>(request, createThreadSchema);
        const requestedRepoPath = resolve(body.repoPath);
        const threadId = randomUUID();

        const workspace = await createThreadWorktree(requestedRepoPath, threadId);

        const thread = db.createThread({
          id: threadId,
          name: body.name,
          task: body.task,
          repoPath: workspace.repoRoot,
          baseRepoPath: workspace.repoRoot,
          worktreePath: workspace.worktreePath,
          branchName: workspace.branchName,
          agent: body.agent ?? "claude",
          validate: body.validate ?? ["bun test"],
        });

        emitEvent(thread.id, undefined, "thread.created", {
          name: thread.name,
        });

        emitEvent(thread.id, undefined, "thread.worktree.created", {
          repoRoot: thread.baseRepoPath,
          worktreePath: thread.worktreePath,
          branchName: thread.branchName,
        });

        return json({ thread }, 201);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return json({ error: message }, 400);
      }
    }

    if (
      request.method === "POST" &&
      parts.length === 3 &&
      parts[0] === "automations" &&
      parts[2] === "toggle"
    ) {
      const automationId = parts[1];
      const automation = db.getAutomation(automationId);
      if (!automation) {
        return json({ error: "Automation not found" }, 404);
      }

      try {
        const body = await readJson<{ enabled: boolean }>(request, toggleAutomationSchema);
        const updated = db.updateAutomationEnabled(automationId, body.enabled);
        return json({ automation: updated });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return json({ error: message }, 400);
      }
    }

    if (
      request.method === "POST" &&
      parts.length === 3 &&
      parts[0] === "automations" &&
      parts[2] === "run-now"
    ) {
      const automationId = parts[1];
      try {
        const run = await scheduler.triggerNow(automationId);
        return json({ run }, 201);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return json({ error: message }, 400);
      }
    }

    if (
      request.method === "GET" &&
      parts.length === 3 &&
      parts[0] === "threads" &&
      parts[2] === "events"
    ) {
      const threadId = parts[1];
      const thread = db.getThread(threadId);
      if (!thread) {
        return json({ error: "Thread not found" }, 404);
      }

      const limit = Number(url.searchParams.get("limit") ?? 200);
      return json({
        events: db.listEventsByThread(threadId, Number.isNaN(limit) ? 200 : limit),
      });
    }

    if (
      request.method === "POST" &&
      parts.length === 3 &&
      parts[0] === "threads" &&
      parts[2] === "runs"
    ) {
      const threadId = parts[1];
      const thread = db.getThread(threadId);
      if (!thread) {
        return json({ error: "Thread not found" }, 404);
      }

      try {
        const body = await readJson<CreateRunRequest>(request, createRunSchema);
        const run = db.createRun({
          threadId,
          maxIterations: body.maxIterations ?? 10,
          taskOverride: body.taskOverride,
          sourceRunId: body.sourceRunId,
        });

        emitEvent(threadId, run.id, "run.queued", {
          maxIterations: run.maxIterations,
        });

        queue.enqueue(run.id);
        return json({ run }, 201);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return json({ error: message }, 400);
      }
    }

    if (
      request.method === "GET" &&
      parts.length === 3 &&
      parts[0] === "threads" &&
      parts[2] === "diff"
    ) {
      const threadId = parts[1];
      const thread = db.getThread(threadId);
      if (!thread) {
        return json({ error: "Thread not found" }, 404);
      }

      const cwd = thread.worktreePath ?? thread.repoPath;
      const diffResult = await spawnProcess({
        command: "git",
        args: ["diff", "--no-color"],
        cwd,
      });

      if (diffResult.exitCode !== 0) {
        return json(
          {
            error: diffResult.stderr || "Failed to generate diff",
          },
          500
        );
      }

      return json({
        diff: diffResult.stdout,
      });
    }

    if (
      request.method === "GET" &&
      parts.length === 3 &&
      parts[0] === "threads" &&
      parts[2] === "comments"
    ) {
      const threadId = parts[1];
      const thread = db.getThread(threadId);
      if (!thread) {
        return json({ error: "Thread not found" }, 404);
      }

      return json({
        comments: db.listReviewCommentsByThread(threadId, 250),
      });
    }

    if (
      request.method === "POST" &&
      parts.length === 3 &&
      parts[0] === "threads" &&
      parts[2] === "comments"
    ) {
      const threadId = parts[1];
      const thread = db.getThread(threadId);
      if (!thread) {
        return json({ error: "Thread not found" }, 404);
      }

      try {
        const body = await readJson<CreateReviewCommentRequest>(
          request,
          createReviewCommentSchema
        );

        const comment = db.createReviewComment({
          threadId,
          runId: body.runId,
          filePath: body.filePath,
          lineNumber: body.lineNumber,
          body: body.body,
        });

        emitEvent(threadId, body.runId, "review.comment.created", {
          reviewCommentId: comment.id,
          filePath: comment.filePath,
          lineNumber: comment.lineNumber,
        });

        return json({ comment }, 201);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return json({ error: message }, 400);
      }
    }

    if (
      request.method === "POST" &&
      parts.length === 3 &&
      parts[0] === "threads" &&
      parts[2] === "rerun-from-comments"
    ) {
      const threadId = parts[1];
      const thread = db.getThread(threadId);
      if (!thread) {
        return json({ error: "Thread not found" }, 404);
      }

      try {
        const body = await readJson<FeedbackRerunRequest>(request, feedbackRerunSchema);
        const comments = db.getReviewCommentsByIds(threadId, body.commentIds);
        if (comments.length === 0) {
          return json({ error: "No matching comments found" }, 404);
        }

        const feedbackBlock = comments
          .map(
            (comment, index) =>
              `${index + 1}. ${comment.filePath}:${comment.lineNumber} - ${comment.body}`
          )
          .join("\n");

        const taskOverride = `${thread.task}\n\nAddress the following review feedback before declaring completion:\n${feedbackBlock}`;

        const sourceRunId = comments[0]?.runId;
        const run = db.createRun({
          threadId,
          maxIterations: 10,
          taskOverride,
          sourceRunId,
        });

        db.markReviewCommentsApplied(threadId, body.commentIds);

        emitEvent(threadId, run.id, "review.rerun.queued", {
          source: "review-feedback",
          commentIds: body.commentIds,
        });

        queue.enqueue(run.id);
        return json({ run }, 201);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return json({ error: message }, 400);
      }
    }

    if (request.method === "GET" && parts.length === 2 && parts[0] === "runs") {
      const run = db.getRun(parts[1]);
      if (!run) {
        return json({ error: "Run not found" }, 404);
      }
      return json({ run });
    }

    if (
      request.method === "POST" &&
      parts.length === 3 &&
      parts[0] === "runs" &&
      parts[2] === "control"
    ) {
      const runId = parts[1];
      const run = db.getRun(runId);
      if (!run) {
        return json({ error: "Run not found" }, 404);
      }

      try {
        const body = await readJson<RunControlRequest>(request, runControlSchema);

        if (body.action === "pause") {
          const paused = queue.pause(runId);
          return paused
            ? json({ ok: true })
            : json({ error: "Only queued runs can be paused" }, 409);
        }

        if (body.action === "resume") {
          const resumed = queue.resume(runId);
          return resumed
            ? json({ ok: true })
            : json({ error: "Only paused runs can be resumed" }, 409);
        }

        if (body.action === "stop") {
          if (TERMINAL_RUN_STATES.has(run.status)) {
            return json({ error: "Run already finished" }, 409);
          }

          const stopped = queue.stop(runId);
          return stopped
            ? json({ ok: true })
            : json({ error: "Could not stop run" }, 409);
        }

        const thread = db.getThread(run.threadId);
        if (!thread) {
          return json({ error: "Thread not found" }, 404);
        }

        const retryRun = db.createRun({
          threadId: run.threadId,
          maxIterations: run.maxIterations,
        });
        emitEvent(thread.id, retryRun.id, "run.queued", {
          retryOfRunId: run.id,
        });
        queue.enqueue(retryRun.id);
        return json({ run: retryRun }, 201);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return json({ error: message }, 400);
      }
    }

    return json({ error: "Not found" }, 404);
  },
  websocket: {
    open(ws) {
      wsClients.add(ws);
      ws.send(
        JSON.stringify({
          channel: "system",
          message: "connected",
        })
      );
    },
    close(ws) {
      wsClients.delete(ws);
    },
    message() {
      // no-op
    },
  },
});

console.log(
  `[ralphd] listening on http://${server.hostname}:${server.port} (db: ${dbPath})`
);
