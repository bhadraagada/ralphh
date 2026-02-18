import type { Prd, PrdTask } from "./schema.js";

/**
 * Parse a prd.md markdown file into a Prd object.
 *
 * Expected format:
 *
 * ```markdown
 * # Project Name
 *
 * Optional project-level description paragraph(s).
 *
 * ## task-id: Task Name
 *
 * Task description paragraphs...
 *
 * ### Acceptance Criteria
 * - criterion 1
 * - criterion 2
 *
 * ### Validate
 * - `npm test`
 * - `tsc --noEmit`
 *
 * ## another-task: Another Task Name
 * ...
 * ```
 *
 * Rules:
 * - `# Heading` = PRD name
 * - Any text before the first `##` = PRD description
 * - `## id: Name` = task (id is kebab-case slug, name is display name)
 * - `### Acceptance Criteria` with `- items` = acceptance criteria
 * - `### Validate` with `` - `command` `` = per-task validation commands
 * - `### Depends On` with `- task-id` = dependencies
 */
export function parseMarkdownPrd(content: string): Prd {
  const lines = content.split("\n");

  let name = "Untitled PRD";
  let description = "";
  const tasks: PrdTask[] = [];

  let currentTask: Partial<PrdTask> | null = null;
  let currentSection: "description" | "acceptance" | "validate" | "depends" | "task-body" | "prd-description" = "prd-description";
  let bodyLines: string[] = [];

  function flushTask() {
    if (currentTask && currentTask.id) {
      currentTask.description = bodyLines.join("\n").trim();
      tasks.push({
        id: currentTask.id,
        name: currentTask.name ?? currentTask.id,
        description: currentTask.description || currentTask.name || currentTask.id,
        validate: currentTask.validate,
        maxIterations: currentTask.maxIterations,
        dependsOn: currentTask.dependsOn ?? [],
        acceptanceCriteria: currentTask.acceptanceCriteria ?? [],
        skip: currentTask.skip ?? false,
      });
    }
    currentTask = null;
    bodyLines = [];
    currentSection = "prd-description";
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // ─── H1: PRD Name ──────────────────────────────────────────
    const h1Match = trimmed.match(/^#\s+(.+)$/);
    if (h1Match && !trimmed.startsWith("##")) {
      name = h1Match[1].trim();
      currentSection = "prd-description";
      continue;
    }

    // ─── H2: Task heading ──────────────────────────────────────
    const h2Match = trimmed.match(/^##\s+(.+)$/);
    if (h2Match) {
      // Flush previous task
      flushTask();

      const heading = h2Match[1].trim();
      // Try to parse "id: Name" format
      const idNameMatch = heading.match(/^([a-zA-Z0-9_-]+):\s*(.+)$/);
      if (idNameMatch) {
        currentTask = {
          id: idNameMatch[1],
          name: idNameMatch[2].trim(),
          dependsOn: [],
          acceptanceCriteria: [],
        };
      } else {
        // Use slugified heading as ID
        const id = heading
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        currentTask = {
          id: id || `task-${tasks.length + 1}`,
          name: heading,
          dependsOn: [],
          acceptanceCriteria: [],
        };
      }
      bodyLines = [];
      currentSection = "task-body";
      continue;
    }

    // ─── H3: Subsections within a task ─────────────────────────
    const h3Match = trimmed.match(/^###\s+(.+)$/);
    if (h3Match && currentTask) {
      const sectionName = h3Match[1].trim().toLowerCase();
      if (sectionName.includes("acceptance") || sectionName.includes("criteria")) {
        currentSection = "acceptance";
      } else if (sectionName.includes("validate") || sectionName.includes("validation")) {
        currentSection = "validate";
      } else if (sectionName.includes("depends") || sectionName.includes("dependencies")) {
        currentSection = "depends";
      } else {
        // Unknown subsection — treat as task body
        bodyLines.push(line);
      }
      continue;
    }

    // ─── List items in subsections ─────────────────────────────
    const listMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (listMatch && currentTask) {
      const item = listMatch[1].trim();

      if (currentSection === "acceptance") {
        if (!currentTask.acceptanceCriteria) currentTask.acceptanceCriteria = [];
        currentTask.acceptanceCriteria.push(item);
        continue;
      }

      if (currentSection === "validate") {
        // Strip backticks from code-formatted commands
        const cmd = item.replace(/^`(.+)`$/, "$1");
        if (!currentTask.validate) currentTask.validate = [];
        currentTask.validate.push(cmd);
        continue;
      }

      if (currentSection === "depends") {
        if (!currentTask.dependsOn) currentTask.dependsOn = [];
        currentTask.dependsOn.push(item);
        continue;
      }
    }

    // ─── Regular text ──────────────────────────────────────────
    if (currentSection === "prd-description" && !currentTask) {
      description += line + "\n";
    } else if (currentTask && (currentSection === "task-body")) {
      bodyLines.push(line);
    }
  }

  // Flush last task
  flushTask();

  if (tasks.length === 0) {
    throw new Error(
      "No tasks found in prd.md. Use ## headings to define tasks.\n" +
        'Format: "## task-id: Task Name" or "## Task Name"'
    );
  }

  return {
    name,
    description: description.trim(),
    validate: ["npm test"],
    maxIterations: 50,
    tasks,
  };
}
