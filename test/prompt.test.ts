import { describe, test, expect } from "bun:test";
import { buildPrompt, type PromptContext } from "../src/prompt/builder.js";

describe("prompt builder", () => {
  function makeContext(overrides?: Partial<PromptContext>): PromptContext {
    return {
      task: "Implement user authentication with JWT",
      iteration: 1,
      maxIterations: 50,
      progress: { content: "", exists: false },
      validationCommands: ["npm test", "tsc --noEmit"],
      completionPromise: "RALPH_COMPLETE_test1234",
      progressFile: "ralph-progress.md",
      ...overrides,
    };
  }

  test("includes task description", () => {
    const prompt = buildPrompt(makeContext());
    expect(prompt).toContain("Implement user authentication with JWT");
  });

  test("includes iteration info", () => {
    const prompt = buildPrompt(makeContext({ iteration: 3, maxIterations: 20 }));
    expect(prompt).toContain("iteration **3**");
    expect(prompt).toContain("**20**");
  });

  test("includes validation commands", () => {
    const prompt = buildPrompt(makeContext());
    expect(prompt).toContain("`npm test`");
    expect(prompt).toContain("`tsc --noEmit`");
  });

  test("includes completion promise", () => {
    const prompt = buildPrompt(makeContext());
    expect(prompt).toContain("RALPH_COMPLETE_test1234");
  });

  test("includes progress file name", () => {
    const prompt = buildPrompt(makeContext());
    expect(prompt).toContain("ralph-progress.md");
  });

  test("shows first iteration message when no progress exists", () => {
    const prompt = buildPrompt(makeContext());
    expect(prompt).toContain("first iteration");
  });

  test("shows existing progress when available", () => {
    const prompt = buildPrompt(
      makeContext({
        progress: {
          content: "## Iteration 1\nAdded login endpoint.",
          exists: true,
        },
      })
    );
    expect(prompt).toContain("Added login endpoint");
    expect(prompt).not.toContain("first iteration");
  });

  test("includes revert warning when wasReverted is true", () => {
    const prompt = buildPrompt(
      makeContext({
        wasReverted: true,
      })
    );
    expect(prompt).toContain("Reverted");
    expect(prompt).toContain("regression");
  });

  test("does not include revert warning when wasReverted is false", () => {
    const prompt = buildPrompt(
      makeContext({
        wasReverted: false,
      })
    );
    expect(prompt).not.toContain("Previous Iteration Was Reverted");
  });

  test("includes last failure output when provided", () => {
    const prompt = buildPrompt(
      makeContext({
        lastFailureOutput:
          "### npm test (FAILED)\n```\nTypeError: foo is not defined\n```",
      })
    );
    expect(prompt).toContain("TypeError: foo is not defined");
    expect(prompt).toContain("Previous Iteration Validation Results");
  });

  test("does not include failure section when no failures", () => {
    const prompt = buildPrompt(makeContext());
    expect(prompt).not.toContain("Previous Iteration Validation Results");
  });

  test("includes rules about not modifying tests", () => {
    const prompt = buildPrompt(makeContext());
    expect(prompt).toContain("Do NOT modify test files");
  });

  test("includes rules about updating progress file", () => {
    const prompt = buildPrompt(makeContext());
    expect(prompt).toContain("UPDATE `ralph-progress.md`");
  });

  // ─── PRD multi-task context tests ────────────────────────────

  test("includes PRD project header when prdTask is set", () => {
    const prompt = buildPrompt(
      makeContext({
        prdTask: {
          id: "auth",
          name: "Add Authentication",
          description: "Implement JWT auth",
          validate: ["npm test"],
          maxIterations: 10,
          dependsOn: [],
          acceptanceCriteria: ["Login works", "Tokens refresh"],
          skip: false,
          index: 2,
          total: 5,
        },
        prdName: "E-Commerce Platform",
        prdDescription: "Building a full e-commerce solution",
      })
    );
    expect(prompt).toContain("E-Commerce Platform");
    expect(prompt).toContain("Building a full e-commerce solution");
    expect(prompt).toContain("task 2 of 5");
    expect(prompt).toContain("Add Authentication");
    expect(prompt).toContain("`auth`");
  });

  test("includes acceptance criteria from PRD task", () => {
    const prompt = buildPrompt(
      makeContext({
        prdTask: {
          id: "auth",
          name: "Auth",
          description: "Do auth",
          validate: ["npm test"],
          maxIterations: 10,
          dependsOn: [],
          acceptanceCriteria: ["Users can log in", "JWT tokens returned"],
          skip: false,
          index: 1,
          total: 1,
        },
      })
    );
    expect(prompt).toContain("Acceptance Criteria");
    expect(prompt).toContain("Users can log in");
    expect(prompt).toContain("JWT tokens returned");
  });

  test("shows completed tasks in PRD context", () => {
    const prompt = buildPrompt(
      makeContext({
        prdTask: {
          id: "auth",
          name: "Auth",
          description: "Do auth",
          validate: ["npm test"],
          maxIterations: 10,
          dependsOn: ["setup"],
          acceptanceCriteria: [],
          skip: false,
          index: 2,
          total: 3,
        },
        prdName: "My Project",
        completedTasks: [{ id: "setup", name: "Project Setup" }],
      })
    );
    expect(prompt).toContain("Previously Completed Tasks");
    expect(prompt).toContain("`setup`");
    expect(prompt).toContain("Project Setup");
  });

  test("shows remaining task count", () => {
    const prompt = buildPrompt(
      makeContext({
        prdTask: {
          id: "t2",
          name: "Middle Task",
          description: "Middle",
          validate: ["npm test"],
          maxIterations: 10,
          dependsOn: [],
          acceptanceCriteria: [],
          skip: false,
          index: 2,
          total: 5,
        },
        prdName: "Test",
      })
    );
    expect(prompt).toContain("3 task(s) remaining");
  });

  test("does not show remaining tasks when on last task", () => {
    const prompt = buildPrompt(
      makeContext({
        prdTask: {
          id: "last",
          name: "Last Task",
          description: "The end",
          validate: ["npm test"],
          maxIterations: 10,
          dependsOn: [],
          acceptanceCriteria: [],
          skip: false,
          index: 3,
          total: 3,
        },
        prdName: "Test",
      })
    );
    expect(prompt).not.toContain("task(s) remaining");
  });

  test("no PRD header when prdTask is not set (single-task mode)", () => {
    const prompt = buildPrompt(makeContext());
    expect(prompt).not.toContain("Project:");
    expect(prompt).not.toContain("Previously Completed Tasks");
  });
});
