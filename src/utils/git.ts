import { spawnProcess, runShellCommand, type SpawnResult } from "./process.js";

/**
 * Run a git command in the given working directory.
 * Uses spawnProcess (no shell) to avoid escaping issues with arguments.
 */
async function git(cwd: string, ...args: string[]): Promise<SpawnResult> {
  return spawnProcess({ command: "git", args, cwd });
}

/**
 * Check if the cwd is inside a git repository.
 */
export async function isGitRepo(cwd: string): Promise<boolean> {
  const result = await git(cwd, "rev-parse", "--is-inside-work-tree");
  return result.exitCode === 0 && result.stdout.trim() === "true";
}

/**
 * Initialize a git repo if one doesn't exist.
 */
export async function ensureGitRepo(cwd: string): Promise<void> {
  if (!(await isGitRepo(cwd))) {
    await git(cwd, "init");
  }
}

/**
 * Check if the working tree is clean (no uncommitted changes).
 */
export async function isClean(cwd: string): Promise<boolean> {
  const result = await git(cwd, "status", "--porcelain");
  return result.exitCode === 0 && result.stdout.trim() === "";
}

/**
 * Stage all changes and commit with a message.
 * Message is passed as a direct argument (no shell escaping needed).
 */
export async function commitAll(
  cwd: string,
  message: string
): Promise<boolean> {
  const addResult = await git(cwd, "add", "-A");
  if (addResult.exitCode !== 0) return false;

  // Check if there's anything to commit
  if (await isClean(cwd)) return true; // nothing to commit is OK

  const commitResult = await git(cwd, "commit", "-m", message);
  return commitResult.exitCode === 0;
}

/**
 * Create and checkout a new branch.
 * Commits dirty state first so nothing is lost.
 */
export async function createBranch(
  cwd: string,
  branchName: string
): Promise<boolean> {
  const clean = await isClean(cwd);
  if (!clean) {
    await commitAll(cwd, "ralph: snapshot before loop start");
  }

  const result = await git(cwd, "checkout", "-b", branchName);
  return result.exitCode === 0;
}

/**
 * Get the current branch name.
 */
export async function currentBranch(cwd: string): Promise<string | null> {
  const result = await git(cwd, "rev-parse", "--abbrev-ref", "HEAD");
  if (result.exitCode !== 0) return null;
  return result.stdout.trim();
}

/**
 * Revert all working tree changes to the last commit.
 * This is the "regression revert" — restores working tree to HEAD.
 */
export async function revertToLastCommit(cwd: string): Promise<boolean> {
  const resetResult = await git(cwd, "checkout", "--", ".");
  const cleanResult = await git(cwd, "clean", "-fd");
  return resetResult.exitCode === 0 && cleanResult.exitCode === 0;
}

/**
 * Get the short SHA of the current HEAD.
 */
export async function headSha(cwd: string): Promise<string | null> {
  const result = await git(cwd, "rev-parse", "--short", "HEAD");
  if (result.exitCode !== 0) return null;
  return result.stdout.trim();
}

/**
 * Get a brief diff summary since a given ref.
 */
export async function diffSummary(
  cwd: string,
  sinceRef: string
): Promise<string> {
  const result = await git(cwd, "diff", "--stat", sinceRef);
  if (result.exitCode !== 0) return "";
  return result.stdout;
}

/**
 * Switch back to a branch (used for cleanup after loop).
 */
export async function checkoutBranch(
  cwd: string,
  branchName: string
): Promise<boolean> {
  const result = await git(cwd, "checkout", branchName);
  return result.exitCode === 0;
}
