import chalk from "chalk";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentLevel];
}

function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}

export const log = {
  debug(msg: string): void {
    if (shouldLog("debug")) {
      console.error(chalk.gray(`[${timestamp()}] ${msg}`));
    }
  },

  info(msg: string): void {
    if (shouldLog("info")) {
      console.error(chalk.blue(`[${timestamp()}]`) + ` ${msg}`);
    }
  },

  warn(msg: string): void {
    if (shouldLog("warn")) {
      console.error(chalk.yellow(`[${timestamp()}] WARN:`) + ` ${msg}`);
    }
  },

  error(msg: string): void {
    if (shouldLog("error")) {
      console.error(chalk.red(`[${timestamp()}] ERROR:`) + ` ${msg}`);
    }
  },

  /** Log the start of a new iteration */
  iteration(n: number, max: number): void {
    const bar = "=".repeat(50);
    console.error("");
    console.error(chalk.cyan(bar));
    console.error(
      chalk.cyan.bold(`  ITERATION ${n} / ${max}`)
    );
    console.error(chalk.cyan(bar));
    console.error("");
  },

  /** Log a successful loop completion */
  success(iterations: number): void {
    console.error("");
    console.error(
      chalk.green.bold(
        `  RALPH LOOP COMPLETE — finished in ${iterations} iteration(s)`
      )
    );
    console.error("");
  },

  /** Log a regression (code got worse) */
  regression(iteration: number): void {
    console.error(
      chalk.red.bold(
        `  REGRESSION detected at iteration ${iteration} — reverting changes`
      )
    );
  },

  /** Log validation results */
  validation(
    results: { command: string; passed: boolean; duration: number }[]
  ): void {
    for (const r of results) {
      const icon = r.passed ? chalk.green("PASS") : chalk.red("FAIL");
      const dur = chalk.gray(`(${r.duration}ms)`);
      console.error(`  ${icon} ${r.command} ${dur}`);
    }
  },

  /** Log that the loop hit max iterations */
  maxIterations(max: number): void {
    console.error("");
    console.error(
      chalk.yellow.bold(
        `  RALPH LOOP STOPPED — reached max iterations (${max})`
      )
    );
    console.error(
      chalk.yellow(
        "  Check ralph-progress.md for partial progress."
      )
    );
    console.error("");
  },

  /** Dry run banner */
  dryRun(command: string, args: string[]): void {
    console.error("");
    console.error(chalk.magenta.bold("  DRY RUN — would execute:"));
    console.error(chalk.magenta(`  ${command} ${args.join(" ")}`));
    console.error("");
  },
};
