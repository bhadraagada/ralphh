import crypto from "node:crypto";

/**
 * Generate a unique completion promise string.
 * This is generated once per `ralph run` invocation and
 * stays the same across all iterations of that run.
 */
export function generatePromise(): string {
  const hash = crypto.randomBytes(4).toString("hex");
  return `RALPH_COMPLETE_${hash}`;
}

/**
 * Check whether the agent's output contains the completion promise.
 * Strict match — must be the exact string.
 */
export function detectPromise(output: string, promise: string): boolean {
  return output.includes(promise);
}
