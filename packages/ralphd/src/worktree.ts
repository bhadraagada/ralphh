import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnProcess } from "../../../src/utils/process.js";

export interface WorktreeSetupResult {
  repoRoot: string;
  worktreePath: string;
  branchName: string;
}

async function runGit(cwd: string, args: string[]) {
  return spawnProcess({ command: "git", args, cwd });
}

export async function resolveRepoRoot(repoPath: string): Promise<string> {
  const result = await runGit(repoPath, ["rev-parse", "--show-toplevel"]);
  if (result.exitCode !== 0 || !result.stdout.trim()) {
    throw new Error(`Path is not inside a git repository: ${repoPath}`);
  }

  return resolve(result.stdout.trim());
}

export async function createThreadWorktree(
  repoPath: string,
  threadId: string
): Promise<WorktreeSetupResult> {
  const repoRoot = await resolveRepoRoot(repoPath);
  const worktreeRoot = resolve(repoRoot, ".ralph", "worktrees");
  const shortId = threadId.replace(/[^a-z0-9]/gi, "").slice(0, 10).toLowerCase();
  let worktreePath = resolve(worktreeRoot, shortId || "thread");

  await mkdir(worktreeRoot, { recursive: true });

  let branchName = `ralph/thread-${shortId || Date.now()}`;
  let addResult = await runGit(repoRoot, [
    "worktree",
    "add",
    "-b",
    branchName,
    worktreePath,
  ]);

  if (addResult.exitCode !== 0) {
    branchName = `${branchName}-${Date.now()}`;
    worktreePath = resolve(worktreeRoot, `${shortId || "thread"}-${Date.now()}`);
    addResult = await runGit(repoRoot, [
      "worktree",
      "add",
      "-b",
      branchName,
      worktreePath,
    ]);
  }

  if (addResult.exitCode !== 0) {
    throw new Error(
      `Failed to create thread worktree: ${addResult.stderr || addResult.stdout || "unknown git error"}`
    );
  }

  return {
    repoRoot,
    worktreePath,
    branchName,
  };
}
