import {
  ensure,
  workflowPlatformFacade,
} from "../../workflow-platform/src/workflow-platform-facade.js";
import { validatePlanExecution } from "./plan-execution.js";
import {
  byteLength,
  decision,
  documents,
  identifier,
  relativePaths,
  schemaError,
  text,
  textList,
} from "./plan-field-checks.js";
import {
  DIGEST_ITEM_MAX_BYTES,
  DIGEST_MAX_ITEMS,
  DIGEST_RESULT_MAX_BYTES,
  docsTaskId,
  functionalFiles,
  PLAN_SCHEMA,
  type RoundDigest,
  type WorkflowPlan,
  type WorkflowRound,
  type WorkflowScope,
  type WorkflowTask,
} from "./plan-model.js";

const ROUND_ID_PATTERN = /^R[0-9]+(?:-[a-z]+)?$/u;
const SHA_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u;
const LINE_BREAK_PATTERN = /[\r\n]/u;
const TASK_STATUSES = new Set(["TODO", "IN_PROGRESS", "DONE"]);
const TASK_KINDS = new Set(["work", "quality", "docs", "delivery"]);
const ROUND_KINDS = new Set(["implementation", "fixes", "legacy"]);
const DELIVERY_STATES = new Set([
  "IN_PROGRESS",
  "READY_FOR_ACCEPTANCE",
  "ACCEPTED",
]);

/**
 * Validates the round digest written by a DOCS task. Refusals name the
 * field of the digest input (`result`, `decisions`, `decisions[2]`); a
 * stored digest passes its plan path as `prefix`.
 */
export function validateDigest(
  digest: RoundDigest | null | undefined,
  prefix = ""
): void {
  const at = (name: string): string => (prefix ? `${prefix}.${name}` : name);
  ensure(
    digest && typeof digest === "object",
    "ROUND_DIGEST_REQUIRED",
    "A round digest with at least `result` is required.",
    { field: prefix || "digest" }
  );
  text(digest.result, at("result"));
  ensure(
    byteLength(digest.result) <= DIGEST_RESULT_MAX_BYTES,
    "ROUND_DIGEST_TOO_LARGE",
    `Digest result exceeds ${DIGEST_RESULT_MAX_BYTES} bytes.`,
    { field: at("result") }
  );
  for (const key of ["decisions", "contracts", "references"] as const) {
    const items = digest[key];
    textList(items, at(key));
    ensure(
      items.length <= DIGEST_MAX_ITEMS,
      "ROUND_DIGEST_TOO_LARGE",
      `Digest ${key} has more than ${DIGEST_MAX_ITEMS} items.`,
      { field: at(key) }
    );
    const large = items.findIndex(
      (item) => byteLength(item) > DIGEST_ITEM_MAX_BYTES
    );
    ensure(
      large < 0,
      "ROUND_DIGEST_TOO_LARGE",
      `Digest ${key} item exceeds ${DIGEST_ITEM_MAX_BYTES} bytes.`,
      { field: at(`${key}[${large}]`) }
    );
  }
}

function validateScope(scope: WorkflowScope): void {
  identifier(scope.id, "scope.id");
  text(scope.objective, "scope.objective");
  textList(scope.acceptance, "scope.acceptance", { nonEmpty: true });
  decision(scope.approval, "scope.approval");
  ensure(
    Array.isArray(scope.decisions),
    schemaError,
    "scope.decisions must be a list.",
    { field: "scope.decisions" }
  );
  for (const [index, item] of scope.decisions.entries()) {
    decision(item, `scope.decisions[${index}]`);
  }
  ensure(
    SHA_PATTERN.test(scope.baselineCommit),
    schemaError,
    "scope.baselineCommit must be a full commit SHA."
  );
  ensure(
    scope.spec === null ||
      workflowPlatformFacade.normalizeRelative(scope.spec) === scope.spec,
    schemaError,
    "scope.spec must be a canonical path or null.",
    { field: "scope.spec" }
  );
  documents(scope.context, "scope.context");
  ensure(
    scope.status === "ACTIVE" || scope.status === "BLOCKED",
    schemaError,
    "scope.status must be ACTIVE or BLOCKED."
  );
  ensure(
    (scope.status === "BLOCKED") ===
      (typeof scope.blockedReason === "string" &&
        scope.blockedReason.trim() !== ""),
    schemaError,
    "A BLOCKED scope needs blockedReason; an ACTIVE scope has none."
  );
  ensure(
    DELIVERY_STATES.has(scope.delivery),
    schemaError,
    "Unknown scope.delivery state."
  );
  ensure(
    (scope.delivery === "ACCEPTED") === (scope.acceptanceNote !== null),
    schemaError,
    "acceptanceNote is present exactly when the scope is ACCEPTED."
  );
  if (scope.acceptanceNote) {
    decision(scope.acceptanceNote, "scope.acceptanceNote");
  }
}

function roundDocsDone(plan: WorkflowPlan, roundId: string): boolean {
  return plan.tasks.some(
    (task) =>
      task.roundId === roundId && task.kind === "docs" && task.status === "DONE"
  );
}

function validateRounds(plan: WorkflowPlan): void {
  const rounds: WorkflowRound[] = plan.rounds;
  ensure(
    rounds.length > 0,
    schemaError,
    "An active scope needs at least one round."
  );
  ensure(
    new Set(rounds.map((round) => round.id)).size === rounds.length,
    schemaError,
    "Round ids must be unique."
  );
  rounds.forEach((round, index) => {
    ensure(
      ROUND_ID_PATTERN.test(round.id),
      schemaError,
      `Invalid round id: ${round.id}`
    );
    ensure(
      ROUND_KINDS.has(round.kind),
      schemaError,
      `Invalid round kind: ${round.id}`
    );
    text(round.title, `rounds.${round.id}.title`);
    ensure(
      round.status === "OPEN" || round.status === "CLOSED",
      schemaError,
      `Invalid round status: ${round.id}`
    );
    ensure(
      round.status === "CLOSED" || index === rounds.length - 1,
      schemaError,
      "Only the last round may be OPEN."
    );
    if (round.status === "CLOSED" || roundDocsDone(plan, round.id)) {
      validateDigest(round.digest, `rounds.${round.id}.digest`);
    } else {
      ensure(
        round.digest === null,
        schemaError,
        `A round gets its digest with its DOCS task: ${round.id}`
      );
    }
  });
}

function validateTaskFields(task: WorkflowTask): void {
  identifier(task.id, "task.id");
  text(task.title, `tasks.${task.id}.title`);
  text(task.why, `tasks.${task.id}.why`);
  text(task.commitMessage, `tasks.${task.id}.commitMessage`);
  ensure(
    !LINE_BREAK_PATTERN.test(task.commitMessage),
    schemaError,
    `commitMessage must be one line: ${task.id}`,
    { field: `tasks.${task.id}.commitMessage` }
  );
  ensure(
    TASK_KINDS.has(task.kind),
    schemaError,
    `Invalid task kind: ${task.id}`,
    { field: `tasks.${task.id}.kind` }
  );
  ensure(
    TASK_STATUSES.has(task.status),
    schemaError,
    `Invalid task status: ${task.id}`
  );
  ensure(
    Number.isSafeInteger(task.iteration) && task.iteration >= 1,
    schemaError,
    `iteration must be a positive integer: ${task.id}`
  );
  relativePaths(task.files, `tasks.${task.id}.files`);
  textList(task.dependencies, `tasks.${task.id}.dependencies`);
  textList(task.acceptance, `tasks.${task.id}.acceptance`, { nonEmpty: true });
  textList(task.checks, `tasks.${task.id}.checks`);
  documents(task.context, `tasks.${task.id}.context`);
  ensure(
    task.docsWaiver === null || typeof task.docsWaiver === "string",
    schemaError,
    `docsWaiver must be text or null: ${task.id}`,
    { field: `tasks.${task.id}.docsWaiver` }
  );
  ensure(
    task.confirmation === null || task.kind === "delivery",
    schemaError,
    `Only delivery tasks carry a confirmation: ${task.id}`
  );
  if (task.integration !== undefined) {
    ensure(
      task.status === "DONE" &&
        typeof task.integration === "object" &&
        task.integration !== null &&
        SHA_PATTERN.test(String(task.integration.sourceCommit)),
      schemaError,
      `integration belongs to a DONE task and names a full source SHA: ${task.id}`
    );
    identifier(
      task.integration.operationId,
      `tasks.${task.id}.integration.operationId`
    );
  }
}

function validateTaskGraph(plan: WorkflowPlan): void {
  const positions = new Map(plan.tasks.map((task, index) => [task.id, index]));
  ensure(
    positions.size === plan.tasks.length,
    schemaError,
    "Task ids must be unique."
  );
  const rounds = new Map(plan.rounds.map((round) => [round.id, round]));
  plan.tasks.forEach((task, index) => {
    const round = rounds.get(task.roundId);
    ensure(round, schemaError, `Task references an unknown round: ${task.id}`);
    ensure(
      round.status === "OPEN" || task.status === "DONE",
      schemaError,
      `Tasks of a closed round are DONE: ${task.id}`
    );
    for (const dependency of task.dependencies) {
      const position = positions.get(dependency);
      ensure(
        position !== undefined && position < index,
        "TASK_ORDER",
        `Dependency must exist and come earlier: ${task.id} -> ${dependency}`,
        { field: `tasks.${task.id}.dependencies` }
      );
    }
    if (task.fixes !== null) {
      const fixed = positions.get(task.fixes);
      ensure(
        fixed !== undefined && fixed < index,
        schemaError,
        `fixes must reference an earlier task: ${task.id}`,
        { field: `tasks.${task.id}.fixes` }
      );
    }
  });
}

function validateServiceTasks(plan: WorkflowPlan): void {
  for (const round of plan.rounds.filter((item) => item.kind !== "legacy")) {
    const roundTasks = plan.tasks.filter((task) => task.roundId === round.id);
    const docs = roundTasks.filter((task) => task.kind === "docs");
    ensure(
      docs.length <= 1,
      "DOCS_TASK",
      `A round has at most one DOCS task: ${round.id}`
    );
    const docsTask = docs[0];
    ensure(
      !docsTask || docsTask.id === docsTaskId(round.id),
      "DOCS_TASK",
      `DOCS task id must be ${docsTaskId(round.id)}.`
    );
    ensure(
      !docsTask || functionalFiles(docsTask).length === 0,
      "DOCS_TASK",
      `DOCS task holds documentation only: ${round.id}`
    );
    const docsIndex = docsTask
      ? roundTasks.indexOf(docsTask)
      : roundTasks.length;
    roundTasks.forEach((task, index) => {
      const regular = task.kind === "work" || task.kind === "quality";
      ensure(
        !(regular && docsTask && index > docsIndex),
        "DOCS_TASK",
        `Only delivery tasks follow DOCS: ${task.id}`
      );
      ensure(
        !(regular && docsTask) || docsTask.dependencies.includes(task.id),
        "DOCS_TASK",
        `DOCS depends on every task of its round: ${task.id}`
      );
      ensure(
        task.kind !== "delivery" ||
          (docsTask !== undefined && task.dependencies.includes(docsTask.id)),
        "DELIVERY_ORDER",
        `Delivery tasks depend on their round DOCS: ${task.id}`
      );
    });
  }
}

function validateProgress(plan: WorkflowPlan, scope: WorkflowScope): void {
  const running = plan.tasks.filter((task) => task.status === "IN_PROGRESS");
  ensure(
    running.length <= 1 && (running[0]?.id ?? null) === plan.currentTaskId,
    schemaError,
    "currentTaskId must match the only IN_PROGRESS task."
  );
  const allDone =
    plan.tasks.length > 0 && plan.tasks.every((task) => task.status === "DONE");
  ensure(
    allDone === (scope.delivery !== "IN_PROGRESS"),
    schemaError,
    "Delivery state must be IN_PROGRESS exactly while tasks remain."
  );
}

/** Full structural validation of a workflow plan; throws WorkflowError. */
export function validatePlan(plan: WorkflowPlan): WorkflowPlan {
  ensure(
    plan && typeof plan === "object" && plan.schema === PLAN_SCHEMA,
    schemaError,
    "Unsupported workflow plan schema."
  );
  ensure(
    Number.isSafeInteger(plan.revision) && plan.revision >= 1,
    schemaError,
    "revision must be a positive integer."
  );
  text(plan.projectId, "projectId");
  text(plan.projectName, "projectName");
  ensure(
    Array.isArray(plan.rounds) && Array.isArray(plan.tasks),
    schemaError,
    "rounds and tasks must be lists."
  );
  if (plan.lastClosed !== null) {
    identifier(plan.lastClosed.scopeId, "lastClosed.scopeId");
    text(plan.lastClosed.closedAt, "lastClosed.closedAt");
  }
  if (plan.scope === null) {
    ensure(
      plan.rounds.length === 0 &&
        plan.tasks.length === 0 &&
        plan.currentTaskId === null,
      schemaError,
      "A plan without scope has no rounds, tasks or current task."
    );
    return plan;
  }
  validateScope(plan.scope);
  validatePlanExecution(plan);
  validateRounds(plan);
  for (const task of plan.tasks) {
    validateTaskFields(task);
  }
  validateTaskGraph(plan);
  validateServiceTasks(plan);
  validateProgress(plan, plan.scope);
  return plan;
}
