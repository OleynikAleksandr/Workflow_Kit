import {
  ensure,
  WorkflowError,
} from "../../workflow-platform/src/workflow-platform-facade.js";
import type {
  WorkflowExecution,
  WorkflowPlan,
  WorkflowRound,
  WorkflowTask,
} from "./plan-model.js";
import { validatePlan } from "./plan-validation.js";

const BEGIN = "<!-- harness-workflow:begin -->";
const END = "<!-- harness-workflow:end -->";
const FENCED_JSON_PATTERN = /^```json\n([\s\S]+)\n```$/u;
const CRLF_PATTERN = /\r\n/gu;

function taskLine(task: WorkflowTask): string[] {
  const lines = [
    `- [${task.status}] ${task.id} — ${task.title} (${task.kind}${task.parallelSafe ? ", parallel-safe" : ""})`,
    `  - Commit: ${task.commitMessage}`,
  ];
  if (task.files.length > 0) {
    lines.push(`  - Files: ${task.files.join(", ")}`);
  }
  if (task.dependencies.length > 0) {
    lines.push(`  - Depends on: ${task.dependencies.join(", ")}`);
  }
  if (task.fixes) {
    lines.push(`  - Fixes: ${task.fixes}`);
  }
  return lines;
}

function roundLines(round: WorkflowRound, tasks: WorkflowTask[]): string[] {
  const lines = [
    `### ${round.id} — ${round.title} (${round.kind}, ${round.status})`,
    "",
  ];
  for (const task of tasks.filter((item) => item.roundId === round.id)) {
    lines.push(...taskLine(task));
  }
  if (round.digest) {
    lines.push("", `Digest: ${round.digest.result}`);
  }
  lines.push("");
  return lines;
}

/** Plans without an execution block render without this line. */
function executionLines(execution: WorkflowExecution | undefined): string[] {
  if (!execution) {
    return [];
  }
  if (execution.strategy === "sequential") {
    return ["- Execution: sequential"];
  }
  const owner = execution.ownerSession
    ? `, owner ${execution.ownerSession}`
    : "";
  return [
    `- Execution: orchestrated (max ${execution.maxWorkers} workers${owner})`,
  ];
}

function scopeLines(plan: WorkflowPlan): string[] {
  const scope = plan.scope;
  if (!scope) {
    const previous = plan.lastClosed
      ? ` Last closed scope: ${plan.lastClosed.scopeId}.`
      : "";
    return ["## State", "", `No active scope.${previous}`, ""];
  }
  const done = plan.tasks.filter((task) => task.status === "DONE").length;
  return [
    "## State",
    "",
    `- Scope: ${scope.id} (${scope.status}${scope.blockedReason ? `: ${scope.blockedReason}` : ""})`,
    `- Delivery: ${scope.delivery}`,
    ...executionLines(scope.execution),
    `- Current task: ${plan.currentTaskId ?? "none"}`,
    `- Progress: ${done}/${plan.tasks.length}`,
    `- Revision: ${plan.revision}`,
    "",
    "## Objective",
    "",
    scope.objective,
    "",
    "## Acceptance",
    "",
    ...scope.acceptance.map((item) => `- ${item}`),
    "",
    "## Rounds",
    "",
    ...plan.rounds.flatMap((round) => roundLines(round, plan.tasks)),
  ];
}

/** Renders the canonical plan document: JSON state plus a readable projection. */
export function renderPlanDocument(plan: WorkflowPlan): string {
  validatePlan(plan);
  return [
    `# Workflow Plan — ${plan.projectName}`,
    "",
    BEGIN,
    "```json",
    JSON.stringify(plan, null, 2),
    "```",
    END,
    "",
    ...scopeLines(plan),
    "State changes only through `scripts/workflow` commands. History lives in Git.",
    "",
  ].join("\n");
}

/** Extracts the JSON state without validating it. */
function extractPlanState(text: string): unknown {
  const normalized = text.replace(CRLF_PATTERN, "\n");
  ensure(
    normalized.split(BEGIN).length === 2 && normalized.split(END).length === 2,
    "PLAN_MARKERS",
    "The plan needs exactly one harness-workflow state block."
  );
  const fragment = normalized.split(BEGIN)[1]?.split(END)[0]?.trim() ?? "";
  const match = FENCED_JSON_PATTERN.exec(fragment);
  ensure(
    match?.[1],
    "PLAN_MARKERS",
    "The state block must hold one fenced JSON block."
  );
  try {
    return JSON.parse(match[1]);
  } catch {
    throw new WorkflowError("PLAN_JSON", "The plan state is not valid JSON.");
  }
}

export function isWorkflowPlanDocument(text: string): boolean {
  return text.includes(BEGIN) && text.includes(END);
}

/**
 * Parses and validates a plan document. With `projection` the readable part
 * must match the canonical rendering, so manual edits are detected.
 */
export function parsePlanDocument(
  text: string,
  options: { projection?: boolean } = {}
): WorkflowPlan {
  const plan = validatePlan(extractPlanState(text) as WorkflowPlan);
  if (options.projection ?? true) {
    ensure(
      renderPlanDocument(plan) === text.replace(CRLF_PATTERN, "\n"),
      "PLAN_PROJECTION",
      "The readable part of the plan was edited manually.",
      {},
      "Run `scripts/workflow repair` to rebuild it from the JSON state."
    );
  }
  return plan;
}
