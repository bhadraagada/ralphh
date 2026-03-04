import chalk from "chalk";
import { readProgress, initProgress } from "./progress.js";
import { generatePromise, detectPromise } from "./promise.js";
import {
  runValidations,
  scoreValidation,
  formatFailureContext,
} from "./validator.js";
import { buildPrompt } from "../prompt/builder.js";
import { log } from "../utils/logger.js";
import { spawnProcess } from "../utils/process.js";
import * as git from "../utils/git.js";
import { getAdapter } from "../agents/registry.js";
import type { RalphConfig } from "../config/schema.js";
import type { ResolvedTask } from "../prd/schema.js";

// ─── Types ───────────────────────────────────────────────────────────────

export interface RunTaskOptions {
  config: RalphConfig;
  cwd: string;
  task: string;
  validate: string[];
  maxIterations: number;
  progressFile: string;
  failureContextMaxChars: number;
  gitCheckpoint: boolean;
  agent: string;
  dryRun: boolean;
  delay: number;
  // PRD context (optional)
  prdTask?: ResolvedTask;
  prdName?: string;
  prdDescription?: string;
  completedTasks?: { id: string; name: string }[];
  abortSignal?: AbortSignal;
  onEvent?: (event: LoopEvent) => void;
}

export interface LoopResult {
  success: boolean;
  iterations: number;
  taskId?: string;
  cancelled?: boolean;
}

export interface LoopEvent {
  type:
    | "loop.iteration.started"
    | "loop.agent.spawned"
    | "loop.agent.exited"
    | "loop.validation.completed"
    | "loop.regression.reverted"
    | "loop.checkpoint.committed";
  iteration: number;
  payload?: Record<string, unknown>;
}

// ─── Core loop runner ────────────────────────────────────────────────────

export async function runTaskLoop(opts: RunTaskOptions): Promise<LoopResult> {
  const {
    cwd,
    task,
    validate,
    maxIterations,
    progressFile,
    failureContextMaxChars,
    gitCheckpoint,
    agent,
    dryRun,
    delay,
    prdTask,
    prdName,
    prdDescription,
    completedTasks,
    abortSignal,
    onEvent,
  } = opts;

  const promise = generatePromise();

  // Resolve adapter
  const adapter = getAdapter(agent, opts.config);

  log.info(`Agent: ${chalk.bold(adapter.displayName)}`);
  log.info(`Max iterations: ${maxIterations}`);
  log.info(`Validations: ${validate.join(", ")}`);
  log.debug(`Completion promise: ${promise}`);

  // Check if agent is installed
  const installed = await adapter.checkInstalled();
  if (!installed) {
    log.warn(
      `${adapter.displayName} CLI ("${adapter.command}") not found on PATH — ` +
        `the loop will likely fail. Install it or switch agents.`
    );
  }

  // Initialize progress file
  const existingProgress = await readProgress(cwd, progressFile);
  if (!existingProgress.exists) {
    await initProgress(cwd, progressFile, task);
    log.info(`Initialized ${progressFile}`);
  }

  // Baseline score
  log.info("Running baseline validation...");
  const baseline = await runValidations(validate, cwd, abortSignal);
  let bestScore = scoreValidation(baseline);
  log.info(`Baseline score: ${bestScore}/${baseline.totalCount} passing`);

  if (gitCheckpoint) {
    const sha = await git.headSha(cwd);
    if (sha) log.debug(`Starting from commit: ${sha}`);
  }

  let lastFailureOutput = "";
  let wasReverted = false;

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    if (abortSignal?.aborted) {
      return {
        success: false,
        iterations: iteration - 1,
        taskId: prdTask?.id,
        cancelled: true,
      };
    }

    log.iteration(iteration, maxIterations);
    onEvent?.({
      type: "loop.iteration.started",
      iteration,
    });

    // 1. Read progress
    const progress = await readProgress(cwd, progressFile);

    // 2. Build prompt
    const prompt = buildPrompt({
      task,
      iteration,
      maxIterations,
      progress,
      validationCommands: validate,
      completionPromise: promise,
      progressFile,
      lastFailureOutput: lastFailureOutput || undefined,
      wasReverted,
      prdTask,
      prdName,
      prdDescription,
      completedTasks,
    });

    log.debug(`Prompt length: ${prompt.length} chars`);

    // 3. Build agent command
    const spawnConfig = adapter.buildCommand(prompt, cwd);

    if (dryRun) {
      log.dryRun(spawnConfig.command, spawnConfig.args);
      return { success: true, iterations: 0, taskId: prdTask?.id };
    }

    // 4. Spawn agent
    log.info(`Spawning ${adapter.displayName}...`);
    onEvent?.({
      type: "loop.agent.spawned",
      iteration,
      payload: {
        command: spawnConfig.command,
        args: spawnConfig.args,
      },
    });

    const result = await spawnProcess({
      ...spawnConfig,
      signal: abortSignal,
    });

    log.info(`Agent exited with code ${result.exitCode} (${result.duration}ms)`);
    log.debug(`Agent stdout length: ${result.stdout.length}`);
    onEvent?.({
      type: "loop.agent.exited",
      iteration,
      payload: {
        exitCode: result.exitCode,
        duration: result.duration,
      },
    });

    // 5. Check completion promise
    const agentOutput = result.stdout + "\n" + result.stderr;
    const claimed = detectPromise(agentOutput, promise);
    if (claimed) {
      log.info(chalk.green("Agent claims task is complete!"));
    }

    // 6. Run validation gate (ALWAYS — external validation, not agent's claim)
    log.info("Running validation gate...");
    const validation = await runValidations(validate, cwd, abortSignal);
    const currentScore = scoreValidation(validation);
    onEvent?.({
      type: "loop.validation.completed",
      iteration,
      payload: {
        passCount: validation.passCount,
        totalCount: validation.totalCount,
        allPassed: validation.allPassed,
      },
    });

    // 7. Full success: both promise claimed AND all validations pass
    if (claimed && validation.allPassed) {
      if (gitCheckpoint) {
        const msg = prdTask
          ? `ralph: [${prdTask.id}] complete (iteration ${iteration})`
          : `ralph: task complete (iteration ${iteration})`;
        await git.commitAll(cwd, msg);
      }
      return { success: true, iterations: iteration, taskId: prdTask?.id };
    }

    if (claimed && !validation.allPassed) {
      log.warn("Agent claimed completion but validations failed — continuing loop");
    }

    // 8. Regression check + git checkpoint
    if (gitCheckpoint) {
      if (currentScore < bestScore) {
        log.regression(iteration);
        await git.revertToLastCommit(cwd);
        onEvent?.({
          type: "loop.regression.reverted",
          iteration,
        });
        wasReverted = true;
        lastFailureOutput = formatFailureContext(validation, failureContextMaxChars);
      } else {
        wasReverted = false;
        if (currentScore > bestScore) {
          bestScore = currentScore;
          log.info(chalk.green(`Score improved: ${currentScore}/${validation.totalCount}`));
        }
        const msg = prdTask
          ? `ralph: [${prdTask.id}] iteration ${iteration} (${currentScore}/${validation.totalCount} passing)`
          : `ralph: iteration ${iteration} (${currentScore}/${validation.totalCount} passing)`;
        await git.commitAll(cwd, msg);
        onEvent?.({
          type: "loop.checkpoint.committed",
          iteration,
          payload: {
            score: currentScore,
            total: validation.totalCount,
          },
        });
        lastFailureOutput = formatFailureContext(validation, failureContextMaxChars);
      }
    } else {
      wasReverted = false;
      lastFailureOutput = formatFailureContext(validation, failureContextMaxChars);
    }

    // 9. Delay between iterations
    if (delay > 0 && iteration < maxIterations) {
      log.debug(`Waiting ${delay}s before next iteration...`);
      await new Promise((r) => setTimeout(r, delay * 1000));
    }
  }

  return { success: false, iterations: maxIterations, taskId: prdTask?.id };
}
