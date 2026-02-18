#!/usr/bin/env node

import { Command } from "commander";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import chalk from "chalk";
import { resolveConfig } from "./config/loader.js";
import { readProgress } from "./loop/progress.js";
import { runValidations, scoreValidation } from "./loop/validator.js";
import { scaffoldProject } from "./scaffold.js";
import { runTaskLoop } from "./loop/runner.js";
import { log, setLogLevel } from "./utils/logger.js";
import { runInitPrompts } from "./init/prompts.js";
import * as git from "./utils/git.js";
import { resolvePrd } from "./prd/loader.js";
import { resolveTasks } from "./prd/schema.js";
import type { CliFlags } from "./config/schema.js";

const program = new Command();

program
  .name("ralph")
  .description(
    "Stateless AI agent automation loop — eliminates context rot by restarting fresh each iteration"
  )
  .version("0.1.0");

// ─── ralph run ───────────────────────────────────────────────────────────

program
  .command("run")
  .description(
    "Start the Ralph Loop. Reads tasks from prd.json/prd.md by default, or use --task for a single task."
  )
  .option(
    "-t, --task <task>",
    "Single task description (bypasses PRD file). Use for quick one-off tasks."
  )
  .option("-a, --agent <agent>", "Agent to use: codex, claude, opencode")
  .option(
    "-v, --validate <commands...>",
    "Validation commands (repeatable)"
  )
  .option("--max-iterations <n>", "Maximum loop iterations per task")
  .option("--delay <seconds>", "Seconds between iterations")
  .option(
    "--progress-file <path>",
    "Path to progress file"
  )
  .option("--promise <string>", "Custom completion promise string")
  .option("--git-checkpoint", "Auto-commit and revert on regression", true)
  .option("--no-git-checkpoint", "Disable git checkpoint/revert")
  .option("--config <path>", "Path to ralph.json config file")
  .option("--prd <path>", "Explicit path to prd.json or prd.md")
  .option(
    "--dry-run",
    "Show what would be executed without running",
    false
  )
  .option("--verbose", "Enable debug logging", false)
  .action(async (opts) => {
    if (opts.verbose) setLogLevel("debug");

    const cwd = process.cwd();

    try {
      // ─── Determine mode: PRD vs single-task ──────────────────
      const prdResult = opts.task
        ? undefined
        : await resolvePrd(cwd, opts.prd);

      if (prdResult) {
        // ═══════════════════════════════════════════════════════
        //  PRD MODE — run multiple tasks sequentially
        // ═══════════════════════════════════════════════════════
        const { prd, path: prdPath, format } = prdResult;

        log.info(`PRD found: ${chalk.cyan(prdPath)} (${format})`);
        log.info(`Project: ${chalk.bold(prd.name)}`);
        log.info(`Tasks: ${prd.tasks.length}`);

        const tasks = resolveTasks(prd);
        const activeTasks = tasks.filter((t) => !t.skip);
        const skippedTasks = tasks.filter((t) => t.skip);

        if (skippedTasks.length > 0) {
          log.info(
            `Skipping ${skippedTasks.length} task(s): ${skippedTasks.map((t) => t.id).join(", ")}`
          );
        }

        log.info(
          `Running ${activeTasks.length} task(s): ${activeTasks.map((t) => t.id).join(" -> ")}`
        );
        console.error("");

        // Build config from CLI flags + PRD-level defaults
        const cliFlags = buildCliFlags(opts);
        const config = await resolveConfig(cwd, {
          ...cliFlags,
          task: "__prd_mode__", // placeholder, actual task comes from PRD
          validate: cliFlags.validate ?? prd.validate,
        });

        // ─── Git setup (once for the whole PRD run) ──────────
        if (config.gitCheckpoint) {
          await git.ensureGitRepo(cwd);
          const branch = `ralph/${prd.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
          const created = await git.createBranch(cwd, branch);
          if (created) {
            log.info(`Created branch: ${chalk.cyan(branch)}`);
          } else {
            log.warn("Could not create ralph branch — continuing on current branch");
          }
        }

        // ─── Run each task sequentially ──────────────────────
        const completedTasks: { id: string; name: string }[] = [];
        let allSucceeded = true;

        for (const task of activeTasks) {
          console.error("");
          console.error(chalk.bgCyan.black.bold(` TASK ${task.index}/${task.total}: ${task.name} `));
          console.error(chalk.cyan(`  id: ${task.id}`));
          if (task.dependsOn.length > 0) {
            console.error(chalk.dim(`  depends on: ${task.dependsOn.join(", ")}`));
          }
          console.error("");

          const result = await runTaskLoop({
            config,
            cwd,
            task: task.description,
            validate: task.validate,
            maxIterations: task.maxIterations,
            progressFile: config.progressFile,
            failureContextMaxChars: config.failureContextMaxChars,
            gitCheckpoint: config.gitCheckpoint,
            agent: prd.agent ?? config.agent,
            dryRun: opts.dryRun,
            delay: config.delay,
            // PRD context
            prdTask: task,
            prdName: prd.name,
            prdDescription: prd.description,
            completedTasks,
          });

          if (result.success) {
            completedTasks.push({ id: task.id, name: task.name });
            log.info(
              chalk.green(`Task "${task.name}" completed in ${result.iterations} iteration(s)`)
            );
          } else {
            allSucceeded = false;
            log.error(
              `Task "${task.name}" did NOT complete after ${result.iterations} iterations.`
            );
            log.error("Stopping PRD execution. Remaining tasks will not run.");
            break;
          }
        }

        // ─── PRD summary ─────────────────────────────────────
        console.error("");
        if (allSucceeded) {
          console.error(
            chalk.green.bold(
              `  ALL ${activeTasks.length} TASKS COMPLETE`
            )
          );
        } else {
          console.error(
            chalk.yellow.bold(
              `  ${completedTasks.length}/${activeTasks.length} tasks completed`
            )
          );
        }
        console.error("");

        process.exit(allSucceeded ? 0 : 1);
      } else if (opts.task) {
        // ═══════════════════════════════════════════════════════
        //  SINGLE-TASK MODE — one task from --task flag
        // ═══════════════════════════════════════════════════════
        const cliFlags = buildCliFlags(opts);
        const config = await resolveConfig(cwd, cliFlags);

        if (!config.task) {
          log.error("No task description provided. Use --task or set 'task' in ralph.json.");
          process.exit(1);
        }

        log.info(`Mode: ${chalk.bold("single task")}`);
        log.info(`Agent: ${chalk.bold(config.agent)}`);
        log.info(`Task: ${chalk.dim(config.task.slice(0, 80))}...`);
        log.info(`Validations: ${config.validate.join(", ")}`);

        // Git setup
        if (config.gitCheckpoint) {
          await git.ensureGitRepo(cwd);
          const branch = `ralph/run-${Date.now()}`;
          const created = await git.createBranch(cwd, branch);
          if (created) {
            log.info(`Created branch: ${chalk.cyan(branch)}`);
          } else {
            log.warn("Could not create ralph branch — continuing on current branch");
          }
        }

        const result = await runTaskLoop({
          config,
          cwd,
          task: config.task,
          validate: config.validate,
          maxIterations: config.maxIterations,
          progressFile: config.progressFile,
          failureContextMaxChars: config.failureContextMaxChars,
          gitCheckpoint: config.gitCheckpoint,
          agent: config.agent,
          dryRun: opts.dryRun,
          delay: config.delay,
        });

        if (result.success) {
          log.success(result.iterations);
          process.exit(0);
        } else {
          log.maxIterations(config.maxIterations);
          process.exit(1);
        }
      } else {
        // ═══════════════════════════════════════════════════════
        //  NO PRD, NO --task → error with helpful message
        // ═══════════════════════════════════════════════════════
        log.error("No tasks found. Ralph needs something to work on.");
        console.error("");
        console.error("  Options:");
        console.error(
          `    1. Create a ${chalk.cyan("prd.json")} or ${chalk.cyan("prd.md")} in your project root`
        );
        console.error(
          `    2. Create one in a ${chalk.cyan("ralph/")} subfolder`
        );
        console.error(
          `    3. Use ${chalk.cyan("ralph run --task \"your task\"")} for a one-off task`
        );
        console.error(
          `    4. Run ${chalk.cyan("ralph init")} to scaffold all config files`
        );
        console.error("");
        process.exit(1);
      }
    } catch (err) {
      if (err instanceof Error) {
        log.error(err.message);
      } else {
        log.error(String(err));
      }
      process.exit(1);
    }
  });

// ─── ralph init ──────────────────────────────────────────────────────────

program
  .command("init")
  .description(
    "Scaffold a complete ralph setup — interactive by default, or use --yes for defaults"
  )
  .option("--force", "Overwrite existing files", false)
  .option("-y, --yes", "Skip interactive prompts, use defaults", false)
  .action(async (opts) => {
    const cwd = process.cwd();

    if (opts.yes) {
      // ─── Non-interactive: use defaults ───────────────────
      console.error("");
      console.error(chalk.bold("  Scaffolding ralph project (defaults)..."));
      console.error("");

      const result = await scaffoldProject(cwd, { force: opts.force });
      printScaffoldResult(cwd, result);
      return;
    }

    // ─── Interactive: run clack prompts ──────────────────────
    const initOptions = await runInitPrompts();
    if (!initOptions) {
      // User cancelled
      process.exit(0);
    }

    console.error("");
    const result = await scaffoldProject(cwd, {
      force: opts.force,
      init: initOptions,
    });

    // Show what was created
    if (result.created.length > 0) {
      for (const f of result.created) {
        const rel = f.replace(cwd, "").replace(/^[\\/]/, "");
        console.error(`  ${chalk.green("+")} ${rel}`);
      }
    }
    if (result.skipped.length > 0) {
      console.error("");
      for (const f of result.skipped) {
        const rel = f.replace(cwd, "").replace(/^[\\/]/, "");
        console.error(
          `  ${chalk.yellow("~")} ${rel} ${chalk.dim("(already exists, use --force to overwrite)")}`
        );
      }
    }

    const prdFile = initOptions.prdFormat === "json" ? "prd.json" : "prd.md";
    console.error("");
    console.error(chalk.bold("  Next steps:"));
    console.error("");
    console.error(
      `  1. Edit ${chalk.cyan(prdFile)} — replace the example tasks with your own`
    );
    console.error(
      `  2. Review ${chalk.cyan("ralph.json")} — tweak settings if needed`
    );
    console.error(`  3. Run ${chalk.cyan("ralph run")}`);
    console.error("");
  });

// ─── ralph status ────────────────────────────────────────────────────────

program
  .command("status")
  .description("Show current progress and PRD status")
  .option(
    "--progress-file <path>",
    "Path to progress file",
    "ralph-progress.md"
  )
  .action(async (opts) => {
    const cwd = process.cwd();

    // Show git info
    const isRepo = await git.isGitRepo(cwd);
    if (isRepo) {
      const branch = await git.currentBranch(cwd);
      const sha = await git.headSha(cwd);
      const clean = await git.isClean(cwd);
      const gitStatus = clean ? chalk.green("clean") : chalk.yellow("dirty");
      console.log(
        chalk.bold("Git:") +
          ` ${branch ?? "detached"} (${sha ?? "no commits"}) ${gitStatus}`
      );
      console.log("");
    }

    // Show PRD info if found
    const prdResult = await resolvePrd(cwd);
    if (prdResult) {
      const { prd, path: prdPath } = prdResult;
      console.log(chalk.bold(`PRD: ${prd.name}`) + chalk.dim(` (${prdPath})`));
      console.log(`Tasks: ${prd.tasks.length}`);
      for (const task of prd.tasks) {
        const skip = task.skip ? chalk.yellow(" [SKIP]") : "";
        console.log(`  - ${task.id}: ${task.name}${skip}`);
      }
      console.log("");
    }

    // Show progress file
    const progress = await readProgress(cwd, opts.progressFile);
    if (!progress.exists) {
      log.info("No progress file found. Run `ralph run` to start.");
      return;
    }

    console.log(chalk.bold("Progress:"));
    console.log(progress.content);
  });

// ─── ralph reset ─────────────────────────────────────────────────────────

program
  .command("reset")
  .description("Clear the progress file to start fresh")
  .option(
    "--progress-file <path>",
    "Path to progress file",
    "ralph-progress.md"
  )
  .action(async (opts) => {
    const cwd = process.cwd();
    const filePath = resolve(cwd, opts.progressFile);

    if (!existsSync(filePath)) {
      log.info("No progress file to reset.");
      return;
    }

    const { unlink } = await import("node:fs/promises");
    await unlink(filePath);
    log.info(`Deleted ${chalk.cyan(opts.progressFile)}`);
  });

// ─── ralph validate ──────────────────────────────────────────────────────

program
  .command("validate")
  .description(
    "Run validation commands from config/PRD without starting the loop"
  )
  .option(
    "-v, --validate <commands...>",
    "Override validation commands"
  )
  .option("--config <path>", "Path to ralph.json config file")
  .option("--prd <path>", "Explicit path to prd.json or prd.md")
  .option("--verbose", "Enable debug logging", false)
  .action(async (opts) => {
    if (opts.verbose) setLogLevel("debug");

    const cwd = process.cwd();

    // Determine validation commands from: CLI flags > PRD > config > default
    let commands: string[] | undefined = opts.validate;

    if (!commands) {
      // Try PRD
      const prdResult = await resolvePrd(cwd, opts.prd);
      if (prdResult?.prd.validate) {
        commands = prdResult.prd.validate;
      }
    }

    if (!commands) {
      // Try config
      try {
        const config = await resolveConfig(cwd, {
          task: "__validate_mode__",
          config: opts.config,
        });
        commands = config.validate;
      } catch {
        // No config found, use default
        commands = ["npm test"];
      }
    }

    console.error("");
    console.error(chalk.bold("  Running validations..."));
    console.error("");

    const report = await runValidations(commands, cwd);
    const score = scoreValidation(report);

    console.error("");
    if (report.allPassed) {
      console.error(
        chalk.green.bold(`  ALL ${report.totalCount} VALIDATIONS PASSED`)
      );
    } else {
      console.error(
        chalk.red.bold(
          `  ${score}/${report.totalCount} validations passed`
        )
      );
    }
    console.error("");

    process.exit(report.allPassed ? 0 : 1);
  });

// ─── Helpers ─────────────────────────────────────────────────────────────

function buildCliFlags(opts: Record<string, unknown>): CliFlags {
  return {
    agent: opts.agent as string | undefined,
    task: opts.task as string | undefined,
    validate: opts.validate as string[] | undefined,
    maxIterations: opts.maxIterations
      ? parseInt(opts.maxIterations as string, 10)
      : undefined,
    delay: opts.delay ? parseFloat(opts.delay as string) : undefined,
    progressFile: opts.progressFile as string | undefined,
    promise: opts.promise as string | undefined,
    gitCheckpoint: opts.gitCheckpoint as boolean | undefined,
    config: opts.config as string | undefined,
    dryRun: opts.dryRun as boolean | undefined,
  };
}

function printScaffoldResult(
  cwd: string,
  result: { created: string[]; skipped: string[] }
) {
  if (result.created.length > 0) {
    for (const f of result.created) {
      const rel = f.replace(cwd, "").replace(/^[\\/]/, "");
      console.error(`  ${chalk.green("+")} ${rel}`);
    }
  }
  if (result.skipped.length > 0) {
    console.error("");
    for (const f of result.skipped) {
      const rel = f.replace(cwd, "").replace(/^[\\/]/, "");
      console.error(
        `  ${chalk.yellow("~")} ${rel} ${chalk.dim("(already exists, use --force to overwrite)")}`
      );
    }
  }
  console.error("");
  console.error(chalk.bold("  What was created:"));
  console.error("");
  console.error(
    `  ${chalk.cyan("prd.json")}              Your task list. This is the main file.`
  );
  console.error(
    `  ${chalk.cyan("ralph.json")}            Config (agent, validations, iteration limits).`
  );
  console.error(
    `  ${chalk.cyan("ralph/prd.example.md")}  Example PRD in markdown format (reference only).`
  );
  console.error(
    `  ${chalk.cyan("ralph/.gitignore")}      Keeps ralph-progress.md out of git.`
  );
  console.error("");
  console.error(chalk.bold("  Next steps:"));
  console.error("");
  console.error(
    `  1. Edit ${chalk.cyan("prd.json")} — replace the example tasks with your own`
  );
  console.error(
    `  2. Edit ${chalk.cyan("ralph.json")} — pick your agent (claude/codex/opencode)`
  );
  console.error(`  3. Run ${chalk.cyan("ralph run")}`);
  console.error("");
}

program.parse();
