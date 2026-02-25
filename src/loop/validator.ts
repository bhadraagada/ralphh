import { runShellCommand, type SpawnResult } from "../utils/process.js";
import { log } from "../utils/logger.js";

export interface ValidationResult {
  command: string;
  passed: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
}

export interface ValidationReport {
  allPassed: boolean;
  results: ValidationResult[];
  /** Number of commands that passed */
  passCount: number;
  /** Total number of commands */
  totalCount: number;
}

/**
 * Run all validation commands sequentially and return a report.
 * Each command must exit 0 to be considered passing.
 */
export async function runValidations(
  commands: string[],
  cwd: string,
  signal?: AbortSignal
): Promise<ValidationReport> {
  const results: ValidationResult[] = [];

  for (const cmd of commands) {
    log.info(`Running validation: ${cmd}`);
    const result = await runShellCommand(cmd, cwd, signal);

    results.push({
      command: cmd,
      passed: result.exitCode === 0,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      duration: result.duration,
    });
  }

  const passCount = results.filter((r) => r.passed).length;

  log.validation(
    results.map((r) => ({
      command: r.command,
      passed: r.passed,
      duration: r.duration,
    }))
  );

  return {
    allPassed: passCount === results.length,
    results,
    passCount,
    totalCount: results.length,
  };
}

/**
 * Compute a numeric score from validation results.
 * Higher is better. Used for regression detection.
 */
export function scoreValidation(report: ValidationReport): number {
  return report.passCount;
}

/**
 * Format validation failures into a string suitable for
 * injection into the next iteration's prompt.
 * Truncated to maxChars to avoid blowing up the context window.
 */
export function formatFailureContext(
  report: ValidationReport,
  maxChars: number
): string {
  if (report.allPassed) return "";

  const sections: string[] = [];

  for (const r of report.results) {
    const status = r.passed ? "PASSED" : `FAILED (exit code ${r.exitCode})`;
    let section = `### ${r.command} (${status})\n`;

    if (!r.passed) {
      // Prefer stderr, fall back to stdout for failure output
      const output = r.stderr.trim() || r.stdout.trim();
      if (output) {
        section += "```\n" + output + "\n```\n";
      }
    }
    sections.push(section);
  }

  let full = sections.join("\n");

  // Truncate if needed, keeping the end (most useful part of error output)
  if (full.length > maxChars) {
    full =
      "...(truncated)\n" + full.slice(full.length - maxChars + 20);
  }

  return full;
}
