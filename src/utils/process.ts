import { execa, type ResultPromise } from "execa";

export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
}

export interface SpawnConfig {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  signal?: AbortSignal;
}

/**
 * Spawn a child process and capture its output.
 * Never throws — always returns a result with exit code.
 */
export async function spawnProcess(config: SpawnConfig): Promise<SpawnResult> {
  const start = Date.now();
  try {
    const result = await execa(config.command, config.args, {
      cwd: config.cwd,
      env: { ...process.env, ...config.env },
      timeout: config.timeout,
      signal: config.signal,
      reject: false, // don't throw on non-zero exit
      all: true, // merge stdout+stderr into .all
    });

    return {
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      exitCode: result.exitCode ?? 1,
      duration: Date.now() - start,
    };
  } catch (err: unknown) {
    return {
      stdout: "",
      stderr: err instanceof Error ? err.message : String(err),
      exitCode: 1,
      duration: Date.now() - start,
    };
  }
}

/**
 * Run a shell command string (e.g. "npm test").
 * Uses shell: true so pipes, &&, etc. work.
 */
export async function runShellCommand(
  cmd: string,
  cwd?: string,
  signal?: AbortSignal
): Promise<SpawnResult> {
  const start = Date.now();
  try {
    const result = await execa(cmd, {
      cwd,
      shell: true,
      reject: false,
      signal,
      env: process.env,
    });

    return {
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      exitCode: result.exitCode ?? 1,
      duration: Date.now() - start,
    };
  } catch (err: unknown) {
    return {
      stdout: "",
      stderr: err instanceof Error ? err.message : String(err),
      exitCode: 1,
      duration: Date.now() - start,
    };
  }
}
