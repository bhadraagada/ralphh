import { describe, test, expect } from "bun:test";
import { parseMarkdownPrd } from "../src/prd/markdown.js";

describe("parseMarkdownPrd", () => {
  test("parses a basic prd.md with id:name format", () => {
    const md = `# My Project

This is the project description.

## setup: Project Setup

Initialize the project with TypeScript and install deps.

## auth: Add Authentication

Implement JWT-based auth with login and signup endpoints.
`;
    const prd = parseMarkdownPrd(md);

    expect(prd.name).toBe("My Project");
    expect(prd.description).toBe("This is the project description.");
    expect(prd.tasks).toHaveLength(2);
    expect(prd.tasks[0].id).toBe("setup");
    expect(prd.tasks[0].name).toBe("Project Setup");
    expect(prd.tasks[0].description).toContain("Initialize the project");
    expect(prd.tasks[1].id).toBe("auth");
    expect(prd.tasks[1].name).toBe("Add Authentication");
    expect(prd.tasks[1].description).toContain("JWT-based auth");
  });

  test("parses tasks without explicit id (auto-slugifies)", () => {
    const md = `# Test

## Add User Login

Build a login form.

## Fix Database Connection

Repair the DB pool config.
`;
    const prd = parseMarkdownPrd(md);

    expect(prd.tasks).toHaveLength(2);
    expect(prd.tasks[0].id).toBe("add-user-login");
    expect(prd.tasks[0].name).toBe("Add User Login");
    expect(prd.tasks[1].id).toBe("fix-database-connection");
    expect(prd.tasks[1].name).toBe("Fix Database Connection");
  });

  test("parses acceptance criteria", () => {
    const md = `# Test

## auth: Auth

Add auth.

### Acceptance Criteria
- Users can log in
- JWT tokens are returned
- Tokens expire after 1 hour
`;
    const prd = parseMarkdownPrd(md);

    expect(prd.tasks[0].acceptanceCriteria).toEqual([
      "Users can log in",
      "JWT tokens are returned",
      "Tokens expire after 1 hour",
    ]);
  });

  test("parses per-task validation commands", () => {
    const md = `# Test

## build: Build Step

Build the project.

### Validate
- \`npm run build\`
- \`tsc --noEmit\`
`;
    const prd = parseMarkdownPrd(md);

    expect(prd.tasks[0].validate).toEqual(["npm run build", "tsc --noEmit"]);
  });

  test("parses dependencies", () => {
    const md = `# Test

## setup: Setup

Init.

## auth: Auth

Auth stuff.

### Dependencies
- setup
`;
    const prd = parseMarkdownPrd(md);

    expect(prd.tasks[1].dependsOn).toEqual(["setup"]);
  });

  test("parses a complex prd.md with all features", () => {
    const md = `# E-Commerce Platform

Build a full e-commerce platform with auth, products, and cart.

## setup: Project Setup

Initialize Next.js with TypeScript, Prisma, and testing framework.

### Acceptance Criteria
- Project builds successfully
- Database migrations run
- Test framework configured

### Validate
- \`npm run build\`
- \`npm test\`

## auth: User Authentication

Implement login, signup, and JWT token management.

### Acceptance Criteria
- Users can register
- Users can log in
- Protected routes work

### Dependencies
- setup

## cart: Shopping Cart

Build cart functionality with add/remove/checkout.

### Acceptance Criteria
- Items can be added to cart
- Cart total calculates correctly
- Checkout creates an order

### Dependencies
- setup
- auth

### Validate
- \`npm test\`
- \`npm run lint\`
`;
    const prd = parseMarkdownPrd(md);

    expect(prd.name).toBe("E-Commerce Platform");
    expect(prd.description).toContain("full e-commerce platform");
    expect(prd.tasks).toHaveLength(3);

    // Setup
    expect(prd.tasks[0].id).toBe("setup");
    expect(prd.tasks[0].acceptanceCriteria).toHaveLength(3);
    expect(prd.tasks[0].validate).toEqual(["npm run build", "npm test"]);
    expect(prd.tasks[0].dependsOn).toEqual([]);

    // Auth
    expect(prd.tasks[1].id).toBe("auth");
    expect(prd.tasks[1].dependsOn).toEqual(["setup"]);
    expect(prd.tasks[1].acceptanceCriteria).toHaveLength(3);

    // Cart
    expect(prd.tasks[2].id).toBe("cart");
    expect(prd.tasks[2].dependsOn).toEqual(["setup", "auth"]);
    expect(prd.tasks[2].validate).toEqual(["npm test", "npm run lint"]);
  });

  test("throws when no tasks found", () => {
    const md = `# Just a title

Some description but no ## headings.
`;
    expect(() => parseMarkdownPrd(md)).toThrow("No tasks found");
  });

  test("handles empty description gracefully", () => {
    const md = `# Test

## task-1: Do Something

The task content.
`;
    const prd = parseMarkdownPrd(md);
    expect(prd.tasks).toHaveLength(1);
    expect(prd.tasks[0].description).toContain("task content");
  });

  test("handles task with no body text", () => {
    const md = `# Test

## empty-task: Empty Task

## next-task: Next Task

This one has a body.
`;
    const prd = parseMarkdownPrd(md);
    expect(prd.tasks).toHaveLength(2);
    // empty-task should use its name as description fallback
    expect(prd.tasks[0].id).toBe("empty-task");
    expect(prd.tasks[1].description).toContain("has a body");
  });
});
