import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { InitOptions } from "./init/prompts.js";

export interface ScaffoldResult {
  created: string[];
  skipped: string[];
}

/**
 * Scaffold the full ralph setup in a project directory.
 * If `initOptions` is provided, generates files customized to the user's choices.
 * Otherwise, uses sensible defaults (backward compatible).
 */
export async function scaffoldProject(
  cwd: string,
  opts: { force?: boolean; init?: InitOptions } = {}
): Promise<ScaffoldResult> {
  const created: string[] = [];
  const skipped: string[] = [];

  // Ensure ralph/ directory exists
  const ralphDir = join(cwd, "ralph");
  if (!existsSync(ralphDir)) {
    await mkdir(ralphDir, { recursive: true });
  }

  const init = opts.init;

  // ─── PRD file (main file — what ralph run actually reads) ──
  const prdFormat = init?.prdFormat ?? "json";

  if (prdFormat === "json") {
    await writeIfNeeded(
      join(cwd, "prd.json"),
      buildPrdJson(init),
      opts.force,
      created,
      skipped
    );
  } else {
    await writeIfNeeded(
      join(cwd, "prd.md"),
      buildPrdMd(init),
      opts.force,
      created,
      skipped
    );
  }

  // ─── ralph/prd.example.md (reference for the other format) ─
  await writeIfNeeded(
    join(ralphDir, prdFormat === "json" ? "prd.example.md" : "prd.example.json"),
    prdFormat === "json" ? EXAMPLE_PRD_MD : EXAMPLE_PRD_JSON,
    opts.force,
    created,
    skipped
  );

  // ─── ralph.json (config overrides) ─────────────────────────
  await writeIfNeeded(
    join(cwd, "ralph.json"),
    buildRalphConfig(init),
    opts.force,
    created,
    skipped
  );

  // ─── ralph/.gitignore ──────────────────────────────────────
  await writeIfNeeded(
    join(ralphDir, ".gitignore"),
    RALPH_GITIGNORE,
    opts.force,
    created,
    skipped
  );

  return { created, skipped };
}

async function writeIfNeeded(
  path: string,
  content: string,
  force: boolean | undefined,
  created: string[],
  skipped: string[]
) {
  if (existsSync(path) && !force) {
    skipped.push(path);
    return;
  }
  await writeFile(path, content, "utf-8");
  created.push(path);
}

// ═════════════════════════════════════════════════════════════════════════
//  DYNAMIC TEMPLATE BUILDERS
// ═════════════════════════════════════════════════════════════════════════

function buildPrdJson(init?: InitOptions): string {
  const name = init?.projectName ?? "My Awesome Feature";
  const validate = init?.validate ?? ["npm test", "npx tsc --noEmit"];
  const maxIterations = init?.maxIterations ?? 50;

  const prd = {
    name,
    description:
      "A brief summary of what this PRD is about. Ralph shows this to the agent so it understands the big picture.",
    validate,
    maxIterations,
    tasks: [
      {
        id: "setup-models",
        name: "Create database models",
        description:
          "Create Prisma models for User and Session tables. User needs email (unique), passwordHash, name, createdAt. Session needs token (unique), userId (FK), expiresAt. Generate and run the migration.",
        acceptanceCriteria: [
          "User model exists with all required fields",
          "Session model exists with FK to User",
          "Migration runs without errors",
          "npx prisma validate passes",
        ],
        validate: ["npx prisma validate", "npx tsc --noEmit"],
      },
      {
        id: "auth-endpoints",
        name: "Build auth API endpoints",
        description:
          "Create POST /api/auth/signup and POST /api/auth/login endpoints. Signup hashes the password with bcrypt and creates a User + Session. Login verifies credentials and returns a session token. Both return JSON responses with proper HTTP status codes.",
        dependsOn: ["setup-models"],
        acceptanceCriteria: [
          "POST /api/auth/signup creates a user and returns 201",
          "POST /api/auth/signup returns 409 for duplicate email",
          "POST /api/auth/login returns a session token for valid credentials",
          "POST /api/auth/login returns 401 for invalid credentials",
          "Passwords are hashed, never stored in plaintext",
        ],
      },
      {
        id: "auth-middleware",
        name: "Add auth middleware",
        description:
          "Create an auth middleware that reads the Authorization header, validates the session token against the database, and attaches the user to the request context. Protected routes should return 401 if no valid token is provided.",
        dependsOn: ["auth-endpoints"],
        acceptanceCriteria: [
          "Middleware extracts Bearer token from Authorization header",
          "Valid token attaches user to request context",
          "Expired or invalid token returns 401",
          "Missing header returns 401",
        ],
      },
      {
        id: "auth-tests",
        name: "Write comprehensive auth tests",
        description:
          "Write integration tests covering the full auth flow: signup, login, accessing protected routes with valid/invalid/missing tokens, duplicate email handling, and session expiry.",
        dependsOn: ["auth-middleware"],
        acceptanceCriteria: [
          "All auth endpoints have test coverage",
          "Edge cases are tested (duplicate email, bad password, expired token)",
          "npm test passes with 0 failures",
        ],
        validate: ["npm test", "npx tsc --noEmit"],
      },
    ],
  };

  return JSON.stringify(prd, null, 2) + "\n";
}

function buildPrdMd(init?: InitOptions): string {
  const name = init?.projectName ?? "My Awesome Feature";
  const validate = init?.validate ?? ["npm test"];

  const validateBlock = validate.map((v) => `- \`${v}\``).join("\n");

  return `# ${name}

A brief summary of what this PRD is about. Ralph shows this to the agent so it understands the big picture.

## setup: Project Setup

Set up the project structure, install dependencies, and configure the build system.
Define the database schema and run initial migrations.

### Acceptance Criteria
- Project builds with no errors
- Database migrations run successfully
- A basic health-check endpoint returns 200

### Validate
${validateBlock}

## core-feature: Core Feature

Implement the main feature of the project. Add the necessary API endpoints,
business logic, and data access layer.

### Acceptance Criteria
- API endpoints are implemented and return correct responses
- Business logic handles edge cases
- Data is persisted correctly

### Dependencies
- setup

### Validate
${validateBlock}

## tests: Write Tests

Write comprehensive tests covering the core feature, including edge cases
and error handling.

### Acceptance Criteria
- All endpoints have test coverage
- Edge cases are tested
- All tests pass

### Dependencies
- core-feature

### Validate
${validateBlock}
`;
}

function buildRalphConfig(init?: InitOptions): string {
  const agent = init?.agent ?? "claude";
  const validate = init?.validate ?? ["npm test"];
  const maxIterations = init?.maxIterations ?? 50;
  const gitCheckpoint = init?.gitCheckpoint ?? true;
  const model = init?.model;

  // Build agent options based on what agent was chosen
  const agentOptions: Record<string, Record<string, unknown>> = {};

  if (agent === "claude") {
    agentOptions.claude = {
      model: model ?? "sonnet",
      maxTurns: init?.claudeMaxTurns ?? 50,
    };
  } else if (agent === "codex") {
    agentOptions.codex = {
      model: model ?? "gpt-5-codex",
      sandbox: init?.codexSandbox ?? "workspace-write",
    };
  } else if (agent === "opencode") {
    agentOptions.opencode = {
      model: model ?? "anthropic/claude-sonnet-4-20250514",
    };
  }

  const config = {
    _comment:
      "Ralph config — these settings apply to ALL tasks in your PRD. Most of these have sensible defaults, you only need to change what matters to you.",
    agent,
    validate,
    maxIterations,
    delay: 2,
    progressFile: "ralph-progress.md",
    gitCheckpoint,
    failureContextMaxChars: 4000,
    agentOptions,
  };

  return JSON.stringify(config, null, 2) + "\n";
}

// ═════════════════════════════════════════════════════════════════════════
//  STATIC TEMPLATES (used as the "other format" example)
// ═════════════════════════════════════════════════════════════════════════

const EXAMPLE_PRD_JSON = `{
  "name": "Example PRD (JSON format)",
  "description": "This is an example PRD in JSON format for reference. Rename to prd.json in your project root to use it.",

  "validate": [
    "npm test",
    "npx tsc --noEmit"
  ],

  "maxIterations": 50,

  "tasks": [
    {
      "id": "setup",
      "name": "Project Setup",
      "description": "Initialize the project with all required dependencies and configuration.",
      "acceptanceCriteria": [
        "Project builds with no errors",
        "All dependencies installed"
      ],
      "validate": [
        "npm run build",
        "npm test"
      ]
    },
    {
      "id": "core-feature",
      "name": "Core Feature",
      "description": "Implement the main feature with API endpoints and business logic.",
      "dependsOn": ["setup"],
      "acceptanceCriteria": [
        "API endpoints return correct responses",
        "Business logic handles edge cases"
      ]
    }
  ]
}
`;

const EXAMPLE_PRD_MD = `# E-Commerce Shopping Cart

Ralph also supports prd.md as an alternative to prd.json.
This file is an EXAMPLE to show you the markdown format.
To use it, rename it to prd.md and place it in your project root (or keep it in ralph/).

## setup: Project Setup

Initialize the Next.js project with TypeScript, Tailwind CSS, and Prisma.
Install all required dependencies. Set up the database schema for products,
carts, and cart items.

### Acceptance Criteria
- Project builds with no errors
- Database migrations run successfully
- Tailwind CSS is configured and working
- A basic health-check endpoint returns 200

### Validate
- \`npm run build\`
- \`npm test\`

## product-catalog: Product Catalog API

Build CRUD endpoints for products. Each product has a name, description,
price (in cents), imageUrl, and stock count. Add pagination to the
GET /api/products listing endpoint (default 20 per page).

### Acceptance Criteria
- GET /api/products returns paginated product list
- GET /api/products/:id returns a single product
- POST /api/products creates a product (admin only)
- PUT /api/products/:id updates a product (admin only)
- Products with stock 0 show as "out of stock"

### Dependencies
- setup

### Validate
- \`npm test\`
- \`npx tsc --noEmit\`

## cart: Shopping Cart

Implement the shopping cart. Users can add items, update quantities,
remove items, and view their cart. Cart persists across sessions using
the session token. Cart total should be calculated server-side.

### Acceptance Criteria
- POST /api/cart/items adds a product to the cart
- PATCH /api/cart/items/:id updates quantity
- DELETE /api/cart/items/:id removes an item
- GET /api/cart returns all items with calculated total
- Cannot add more items than available stock
- Cart is tied to the authenticated user's session

### Dependencies
- setup
- product-catalog

## checkout: Checkout Flow

Build the checkout endpoint that takes a cart, validates stock availability,
creates an order, decrements stock counts, and clears the cart. This should
be wrapped in a database transaction so partial failures roll back cleanly.

### Acceptance Criteria
- POST /api/checkout creates an order from the current cart
- Stock is decremented atomically
- Out-of-stock items fail the entire checkout (transaction rollback)
- Cart is cleared after successful checkout
- Order confirmation includes order ID and total

### Dependencies
- cart
- product-catalog
`;

const RALPH_GITIGNORE = `# Ralph runtime files — don't commit these
ralph-progress.md
`;
