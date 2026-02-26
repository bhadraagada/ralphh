export type AgentName = "claude" | "codex" | "opencode";

export type RunStatus =
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export type EventType =
  | "thread.created"
  | "thread.worktree.created"
  | "run.queued"
  | "run.started"
  | "run.paused"
  | "run.resumed"
  | "run.cancelled"
  | "run.completed"
  | "run.failed"
  | "loop.iteration.started"
  | "loop.agent.spawned"
  | "loop.agent.exited"
  | "loop.validation.completed"
  | "loop.regression.reverted"
  | "loop.checkpoint.committed";

export interface ThreadRecord {
  id: string;
  name: string;
  task: string;
  repoPath: string;
  baseRepoPath: string;
  worktreePath?: string;
  branchName?: string;
  agent: AgentName;
  validate: string[];
  createdAt: number;
  updatedAt: number;
}

export interface RunRecord {
  id: string;
  threadId: string;
  status: RunStatus;
  maxIterations: number;
  iterations: number;
  error?: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
}

export interface EventRecord {
  id: number;
  threadId: string;
  runId?: string;
  type: EventType;
  payload: Record<string, unknown>;
  createdAt: number;
}

export interface CreateThreadRequest {
  name: string;
  task: string;
  repoPath: string;
  agent?: AgentName;
  validate?: string[];
}

export interface CreateRunRequest {
  maxIterations?: number;
}

export interface RunControlRequest {
  action: "pause" | "resume" | "stop" | "retry";
}

export interface BroadcastEnvelope {
  channel: "events";
  event: EventRecord;
}
