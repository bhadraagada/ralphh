import { describe, test, expect } from "bun:test";
import {
  PrdSchema,
  PrdTaskSchema,
  resolveTasks,
  validateUniqueIds,
} from "../src/prd/schema.js";

describe("PrdTaskSchema", () => {
  test("validates a minimal task", () => {
    const task = PrdTaskSchema.parse({
      id: "auth",
      name: "Add authentication",
      description: "Implement JWT-based auth",
    });
    expect(task.id).toBe("auth");
    expect(task.dependsOn).toEqual([]);
    expect(task.acceptanceCriteria).toEqual([]);
    expect(task.skip).toBe(false);
  });

  test("validates a full task", () => {
    const task = PrdTaskSchema.parse({
      id: "auth",
      name: "Add authentication",
      description: "Implement JWT-based auth",
      validate: ["npm test", "tsc --noEmit"],
      maxIterations: 10,
      dependsOn: ["setup"],
      acceptanceCriteria: ["Login works", "Tokens refresh"],
      skip: false,
    });
    expect(task.validate).toEqual(["npm test", "tsc --noEmit"]);
    expect(task.maxIterations).toBe(10);
    expect(task.dependsOn).toEqual(["setup"]);
    expect(task.acceptanceCriteria).toEqual(["Login works", "Tokens refresh"]);
  });

  test("rejects empty id", () => {
    expect(() =>
      PrdTaskSchema.parse({ id: "", name: "x", description: "x" })
    ).toThrow();
  });

  test("rejects empty name", () => {
    expect(() =>
      PrdTaskSchema.parse({ id: "x", name: "", description: "x" })
    ).toThrow();
  });

  test("rejects empty description", () => {
    expect(() =>
      PrdTaskSchema.parse({ id: "x", name: "x", description: "" })
    ).toThrow();
  });
});

describe("PrdSchema", () => {
  test("validates a minimal PRD", () => {
    const prd = PrdSchema.parse({
      name: "My Project",
      tasks: [
        { id: "t1", name: "Task 1", description: "Do something" },
      ],
    });
    expect(prd.name).toBe("My Project");
    expect(prd.validate).toEqual(["npm test"]);
    expect(prd.maxIterations).toBeUndefined();
    expect(prd.tasks).toHaveLength(1);
  });

  test("validates a full PRD", () => {
    const prd = PrdSchema.parse({
      name: "Auth Feature",
      description: "Add complete auth flow",
      agent: "codex",
      validate: ["bun test", "tsc --noEmit"],
      maxIterations: 30,
      tasks: [
        { id: "setup", name: "Setup", description: "Init project" },
        {
          id: "auth",
          name: "Auth",
          description: "Add JWT",
          dependsOn: ["setup"],
        },
      ],
    });
    expect(prd.agent).toBe("codex");
    expect(prd.validate).toEqual(["bun test", "tsc --noEmit"]);
    expect(prd.tasks).toHaveLength(2);
  });

  test("rejects PRD with no tasks", () => {
    expect(() =>
      PrdSchema.parse({ name: "Empty", tasks: [] })
    ).toThrow();
  });

  test("rejects empty name", () => {
    expect(() =>
      PrdSchema.parse({
        name: "",
        tasks: [{ id: "t1", name: "x", description: "x" }],
      })
    ).toThrow();
  });
});

describe("resolveTasks", () => {
  test("resolves tasks with PRD-level defaults", () => {
    const prd = PrdSchema.parse({
      name: "Test",
      validate: ["npm test"],
      maxIterations: 20,
      tasks: [
        { id: "t1", name: "Task 1", description: "First" },
        { id: "t2", name: "Task 2", description: "Second" },
      ],
    });
    const resolved = resolveTasks(prd);

    expect(resolved).toHaveLength(2);
    expect(resolved[0].validate).toEqual(["npm test"]);
    expect(resolved[0].maxIterations).toBe(20);
    expect(resolved[0].index).toBe(1);
    expect(resolved[0].total).toBe(2);
    expect(resolved[1].index).toBe(2);
    expect(resolved[1].total).toBe(2);
  });

  test("task-level validate overrides PRD-level", () => {
    const prd = PrdSchema.parse({
      name: "Test",
      validate: ["npm test"],
      tasks: [
        {
          id: "t1",
          name: "Task 1",
          description: "First",
          validate: ["bun test", "tsc"],
        },
      ],
    });
    const resolved = resolveTasks(prd);
    expect(resolved[0].validate).toEqual(["bun test", "tsc"]);
  });

  test("task-level maxIterations overrides PRD-level", () => {
    const prd = PrdSchema.parse({
      name: "Test",
      maxIterations: 50,
      tasks: [
        { id: "t1", name: "Task 1", description: "First", maxIterations: 5 },
      ],
    });
    const resolved = resolveTasks(prd);
    expect(resolved[0].maxIterations).toBe(5);
  });

  test("throws on dependency pointing to nonexistent task", () => {
    const prd = PrdSchema.parse({
      name: "Test",
      tasks: [
        { id: "t1", name: "Task 1", description: "x", dependsOn: ["nope"] },
      ],
    });
    expect(() => resolveTasks(prd)).toThrow("does not exist");
  });

  test("throws on forward dependency", () => {
    const prd = PrdSchema.parse({
      name: "Test",
      tasks: [
        { id: "t1", name: "Task 1", description: "x", dependsOn: ["t2"] },
        { id: "t2", name: "Task 2", description: "y" },
      ],
    });
    expect(() => resolveTasks(prd)).toThrow("appears later");
  });

  test("valid dependency order works", () => {
    const prd = PrdSchema.parse({
      name: "Test",
      tasks: [
        { id: "t1", name: "Task 1", description: "x" },
        { id: "t2", name: "Task 2", description: "y", dependsOn: ["t1"] },
        { id: "t3", name: "Task 3", description: "z", dependsOn: ["t1", "t2"] },
      ],
    });
    const resolved = resolveTasks(prd);
    expect(resolved).toHaveLength(3);
    expect(resolved[2].dependsOn).toEqual(["t1", "t2"]);
  });
});

describe("validateUniqueIds", () => {
  test("passes for unique IDs", () => {
    const prd = PrdSchema.parse({
      name: "Test",
      tasks: [
        { id: "a", name: "A", description: "x" },
        { id: "b", name: "B", description: "y" },
      ],
    });
    expect(() => validateUniqueIds(prd)).not.toThrow();
  });

  test("throws for duplicate IDs", () => {
    const prd = PrdSchema.parse({
      name: "Test",
      tasks: [
        { id: "a", name: "A", description: "x" },
        { id: "a", name: "A2", description: "y" },
      ],
    });
    expect(() => validateUniqueIds(prd)).toThrow("Duplicate task ID");
  });
});
