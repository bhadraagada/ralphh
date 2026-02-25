import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import {
  type AgentName,
  type EventRecord,
  type EventType,
  type RunRecord,
  type RunStatus,
  type ThreadRecord,
} from "@ralphh/shared";

interface CreateThreadInput {
  id?: string;
  name: string;
  task: string;
  repoPath: string;
  baseRepoPath: string;
  worktreePath?: string;
  branchName?: string;
  agent: AgentName;
  validate: string[];
}

interface CreateRunInput {
  threadId: string;
  maxIterations: number;
}

export class RalphDatabase {
  private readonly db: Database;

  constructor(path: string) {
    this.db = new Database(path, { create: true });
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        task TEXT NOT NULL,
        repo_path TEXT NOT NULL,
        base_repo_path TEXT,
        worktree_path TEXT,
        branch_name TEXT,
        agent TEXT NOT NULL,
        validate_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        status TEXT NOT NULL,
        max_iterations INTEGER NOT NULL,
        iterations INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        finished_at INTEGER,
        FOREIGN KEY(thread_id) REFERENCES threads(id)
      );

      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_id TEXT NOT NULL,
        run_id TEXT,
        type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(thread_id) REFERENCES threads(id),
        FOREIGN KEY(run_id) REFERENCES runs(id)
      );

      CREATE TABLE IF NOT EXISTS automations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        cron TEXT NOT NULL,
        thread_template_json TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_runs_thread ON runs(thread_id);
      CREATE INDEX IF NOT EXISTS idx_events_thread_created ON events(thread_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_events_run_created ON events(run_id, created_at DESC);
    `);

    this.ensureColumn("threads", "base_repo_path", "TEXT");
    this.ensureColumn("threads", "worktree_path", "TEXT");
    this.ensureColumn("threads", "branch_name", "TEXT");

    this.db.exec(`
      UPDATE threads
      SET base_repo_path = repo_path
      WHERE base_repo_path IS NULL OR base_repo_path = '';
    `);
  }

  private ensureColumn(table: string, column: string, type: string): void {
    const rows = this.db
      .query(`PRAGMA table_info(${table});`)
      .all() as Array<{ name: string }>;
    const hasColumn = rows.some((row) => row.name === column);
    if (!hasColumn) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type};`);
    }
  }

  createThread(input: CreateThreadInput): ThreadRecord {
    const now = Date.now();
    const id = input.id ?? randomUUID();

    this.db
      .query(
        `
        INSERT INTO threads (id, name, task, repo_path, base_repo_path, worktree_path, branch_name, agent, validate_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        id,
        input.name,
        input.task,
        input.repoPath,
        input.baseRepoPath,
        input.worktreePath ?? null,
        input.branchName ?? null,
        input.agent,
        JSON.stringify(input.validate),
        now,
        now
      );

    return this.getThread(id)!;
  }

  listThreads(): ThreadRecord[] {
    const rows = this.db
      .query(
        `
        SELECT id, name, task, repo_path, base_repo_path, worktree_path, branch_name, agent, validate_json, created_at, updated_at
        FROM threads
        ORDER BY updated_at DESC
      `
      )
      .all() as Array<{
      id: string;
      name: string;
      task: string;
      repo_path: string;
      base_repo_path: string | null;
      worktree_path: string | null;
      branch_name: string | null;
      agent: AgentName;
      validate_json: string;
      created_at: number;
      updated_at: number;
    }>;

    return rows.map((row) => this.mapThreadRow(row));
  }

  getThread(id: string): ThreadRecord | undefined {
    const row = this.db
      .query(
        `
        SELECT id, name, task, repo_path, base_repo_path, worktree_path, branch_name, agent, validate_json, created_at, updated_at
        FROM threads
        WHERE id = ?
      `
      )
      .get(id) as
      | {
          id: string;
          name: string;
          task: string;
          repo_path: string;
          base_repo_path: string | null;
          worktree_path: string | null;
          branch_name: string | null;
          agent: AgentName;
          validate_json: string;
          created_at: number;
          updated_at: number;
        }
      | undefined;

    if (!row) {
      return undefined;
    }

    return this.mapThreadRow(row);
  }

  touchThread(threadId: string): void {
    this.db
      .query("UPDATE threads SET updated_at = ? WHERE id = ?")
      .run(Date.now(), threadId);
  }

  updateThreadWorktree(
    threadId: string,
    worktreePath: string,
    branchName: string
  ): ThreadRecord | undefined {
    this.db
      .query(
        `
        UPDATE threads
        SET worktree_path = ?, branch_name = ?, updated_at = ?
        WHERE id = ?
      `
      )
      .run(worktreePath, branchName, Date.now(), threadId);

    return this.getThread(threadId);
  }

  createRun(input: CreateRunInput): RunRecord {
    const now = Date.now();
    const id = randomUUID();

    this.db
      .query(
        `
        INSERT INTO runs (id, thread_id, status, max_iterations, iterations, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      )
      .run(id, input.threadId, "queued", input.maxIterations, 0, now);

    this.touchThread(input.threadId);
    return this.getRun(id)!;
  }

  getRun(id: string): RunRecord | undefined {
    const row = this.db
      .query(
        `
        SELECT id, thread_id, status, max_iterations, iterations, error, created_at, started_at, finished_at
        FROM runs
        WHERE id = ?
      `
      )
      .get(id) as
      | {
          id: string;
          thread_id: string;
          status: RunStatus;
          max_iterations: number;
          iterations: number;
          error: string | null;
          created_at: number;
          started_at: number | null;
          finished_at: number | null;
        }
      | undefined;

    if (!row) {
      return undefined;
    }

    return this.mapRunRow(row);
  }

  listRunsByThread(threadId: string): RunRecord[] {
    const rows = this.db
      .query(
        `
        SELECT id, thread_id, status, max_iterations, iterations, error, created_at, started_at, finished_at
        FROM runs
        WHERE thread_id = ?
        ORDER BY created_at DESC
      `
      )
      .all(threadId) as Array<{
      id: string;
      thread_id: string;
      status: RunStatus;
      max_iterations: number;
      iterations: number;
      error: string | null;
      created_at: number;
      started_at: number | null;
      finished_at: number | null;
    }>;

    return rows.map((row) => this.mapRunRow(row));
  }

  updateRunStatus(
    runId: string,
    status: RunStatus,
    updates: {
      iterations?: number;
      error?: string;
      startedAt?: number;
      finishedAt?: number;
    } = {}
  ): void {
    const run = this.getRun(runId);
    if (!run) {
      return;
    }

    this.db
      .query(
        `
        UPDATE runs
        SET status = ?,
            iterations = ?,
            error = ?,
            started_at = ?,
            finished_at = ?
        WHERE id = ?
      `
      )
      .run(
        status,
        updates.iterations ?? run.iterations,
        updates.error ?? run.error ?? null,
        updates.startedAt ?? run.startedAt ?? null,
        updates.finishedAt ?? run.finishedAt ?? null,
        runId
      );

    this.touchThread(run.threadId);
  }

  appendEvent(
    threadId: string,
    runId: string | undefined,
    type: EventType,
    payload: Record<string, unknown> = {}
  ): EventRecord {
    const now = Date.now();
    const result = this.db
      .query(
        `
        INSERT INTO events (thread_id, run_id, type, payload_json, created_at)
        VALUES (?, ?, ?, ?, ?)
      `
      )
      .run(threadId, runId ?? null, type, JSON.stringify(payload), now);

    const id = Number(result.lastInsertRowid);
    return this.getEvent(id)!;
  }

  getEvent(id: number): EventRecord | undefined {
    const row = this.db
      .query(
        `
        SELECT id, thread_id, run_id, type, payload_json, created_at
        FROM events
        WHERE id = ?
      `
      )
      .get(id) as
      | {
          id: number;
          thread_id: string;
          run_id: string | null;
          type: EventType;
          payload_json: string;
          created_at: number;
        }
      | undefined;

    if (!row) {
      return undefined;
    }

    return this.mapEventRow(row);
  }

  listEventsByThread(threadId: string, limit = 200): EventRecord[] {
    const rows = this.db
      .query(
        `
        SELECT id, thread_id, run_id, type, payload_json, created_at
        FROM events
        WHERE thread_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `
      )
      .all(threadId, limit) as Array<{
      id: number;
      thread_id: string;
      run_id: string | null;
      type: EventType;
      payload_json: string;
      created_at: number;
    }>;

    return rows.map((row) => this.mapEventRow(row));
  }

  private mapThreadRow(row: {
    id: string;
    name: string;
    task: string;
    repo_path: string;
    base_repo_path: string | null;
    worktree_path: string | null;
    branch_name: string | null;
    agent: AgentName;
    validate_json: string;
    created_at: number;
    updated_at: number;
  }): ThreadRecord {
    return {
      id: row.id,
      name: row.name,
      task: row.task,
      repoPath: row.repo_path,
      baseRepoPath: row.base_repo_path ?? row.repo_path,
      worktreePath: row.worktree_path ?? undefined,
      branchName: row.branch_name ?? undefined,
      agent: row.agent,
      validate: JSON.parse(row.validate_json) as string[],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapRunRow(row: {
    id: string;
    thread_id: string;
    status: RunStatus;
    max_iterations: number;
    iterations: number;
    error: string | null;
    created_at: number;
    started_at: number | null;
    finished_at: number | null;
  }): RunRecord {
    return {
      id: row.id,
      threadId: row.thread_id,
      status: row.status,
      maxIterations: row.max_iterations,
      iterations: row.iterations,
      error: row.error ?? undefined,
      createdAt: row.created_at,
      startedAt: row.started_at ?? undefined,
      finishedAt: row.finished_at ?? undefined,
    };
  }

  private mapEventRow(row: {
    id: number;
    thread_id: string;
    run_id: string | null;
    type: EventType;
    payload_json: string;
    created_at: number;
  }): EventRecord {
    return {
      id: row.id,
      threadId: row.thread_id,
      runId: row.run_id ?? undefined,
      type: row.type,
      payload: JSON.parse(row.payload_json) as Record<string, unknown>,
      createdAt: row.created_at,
    };
  }
}
