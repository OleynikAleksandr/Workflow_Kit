import { ensure } from "../../workflow-platform/src/workflow-platform-facade.js";
import { type ExecutionInput, normalizeExecution } from "./plan-execution.js";
import { checkScopeInput } from "./plan-input-checks.js";
import type {
  DocumentRef,
  RoundDigest,
  UserDecision,
  WorkflowPlan,
  WorkflowTask,
} from "./plan-model.js";
import {
  arrangeRound,
  normalizeTaskInput,
  type TaskInput,
} from "./plan-service-tasks.js";
import { validateDigest, validatePlan } from "./plan-validation.js";

export interface ScopeInput {
  acceptance: string[];
  approval: string;
  context?: DocumentRef[];
  decisions?: string[];
  execution?: ExecutionInput | null;
  id: string;
  objective: string;
  spec?: string | null;
  tasks: TaskInput[];
}

export interface TransitionContext {
  baselineCommit?: string;
  now: string;
  qualityConfigured: boolean;
}

/** Returns a deep copy with the revision advanced; every transition starts here. */
export function nextRevision(plan: WorkflowPlan): WorkflowPlan {
  const copy = structuredClone(plan);
  copy.revision += 1;
  return copy;
}

export function recomputeDelivery(plan: WorkflowPlan): void {
  if (!plan.scope) {
    return;
  }
  const allDone =
    plan.tasks.length > 0 && plan.tasks.every((task) => task.status === "DONE");
  if (!allDone) {
    plan.scope.delivery = "IN_PROGRESS";
    plan.scope.acceptanceNote = null;
  } else if (plan.scope.delivery === "IN_PROGRESS") {
    plan.scope.delivery = "READY_FOR_ACCEPTANCE";
  }
}

function decision(text: string, now: string): UserDecision {
  return { at: now, text };
}

export function createScope(
  plan: WorkflowPlan,
  input: ScopeInput,
  context: TransitionContext
): WorkflowPlan {
  ensure(
    plan.scope === null,
    "SCOPE_EXISTS",
    "The current scope is still open; close it before creating a new one."
  );
  ensure(
    context.baselineCommit,
    "NO_BASELINE",
    "The repository needs a first commit before a scope can start.",
    {},
    "Finish the kit bootstrap commit first."
  );
  checkScopeInput(input);
  const next = nextRevision(plan);
  const ids = new Set<string>();
  const tasks = input.tasks.map((task, index) =>
    normalizeTaskInput(task, "R1", ids, `tasks[${index}]`)
  );
  const execution = normalizeExecution(input.execution);
  next.scope = {
    acceptance: input.acceptance,
    acceptanceNote: null,
    approval: decision(input.approval, context.now),
    baselineCommit: context.baselineCommit,
    blockedReason: null,
    context: input.context ?? [],
    decisions: (input.decisions ?? []).map((text) =>
      decision(text, context.now)
    ),
    delivery: "IN_PROGRESS",
    ...(execution ? { execution } : {}),
    id: input.id,
    objective: input.objective,
    spec: input.spec ?? null,
    status: "ACTIVE",
  };
  next.rounds = [
    {
      digest: null,
      id: "R1",
      kind: "implementation",
      status: "OPEN",
      title: "Implementation",
    },
  ];
  next.tasks = arrangeRound(next, "R1", tasks, {
    docsFiles: input.spec ? [input.spec] : [],
    qualityConfigured: context.qualityConfigured,
  });
  next.currentTaskId = null;
  return validatePlan(next);
}

export function findTask(plan: WorkflowPlan, taskId: string): WorkflowTask {
  const task = plan.tasks.find((item) => item.id === taskId);
  ensure(task, "UNKNOWN_TASK", `Task not found: ${taskId}`);
  return task;
}

export function nextReadyTask(plan: WorkflowPlan): WorkflowTask | null {
  const current = plan.tasks.find((task) => task.id === plan.currentTaskId);
  if (current) {
    return current;
  }
  const done = new Set(
    plan.tasks.filter((task) => task.status === "DONE").map((task) => task.id)
  );
  return (
    plan.tasks.find(
      (task) =>
        task.status === "TODO" && task.dependencies.every((id) => done.has(id))
    ) ?? null
  );
}

export function startTask(
  plan: WorkflowPlan,
  taskId: string,
  confirmation: string | null
): WorkflowPlan {
  ensure(
    plan.scope?.status === "ACTIVE",
    "SCOPE_NOT_ACTIVE",
    "Implementation needs an ACTIVE scope."
  );
  const task = findTask(plan, taskId);
  if (plan.currentTaskId === taskId) {
    return plan;
  }
  ensure(
    plan.currentTaskId === null,
    "TASK_ALREADY_ACTIVE",
    `Task ${plan.currentTaskId} is in progress; finish it first.`
  );
  ensure(
    task.status === "TODO",
    "TASK_NOT_TODO",
    `Task ${taskId} is already ${task.status}.`
  );
  const pending = task.dependencies.filter(
    (id) => findTask(plan, id).status !== "DONE"
  );
  ensure(
    pending.length === 0,
    "DEPENDENCY_PENDING",
    `Finish the dependencies first: ${pending.join(", ")}`,
    { pending }
  );
  ensure(
    task.kind !== "delivery" || (confirmation ?? "").trim() !== "",
    "DELIVERY_CONFIRMATION",
    'Delivery tasks start only with the user\'s confirmation (`--confirmed "..."`).'
  );
  const next = nextRevision(plan);
  const started = findTask(next, taskId);
  started.status = "IN_PROGRESS";
  if (started.kind === "delivery") {
    started.confirmation = confirmation;
  }
  next.currentTaskId = taskId;
  return validatePlan(next);
}

export function blockScope(plan: WorkflowPlan, reason: string): WorkflowPlan {
  ensure(
    plan.scope?.status === "ACTIVE",
    "SCOPE_NOT_ACTIVE",
    "Only an ACTIVE scope can be blocked."
  );
  ensure(
    typeof reason === "string" && reason.trim() !== "",
    "BLOCK_REASON",
    "Give the reason of the block."
  );
  const next = nextRevision(plan);
  if (next.scope) {
    next.scope.status = "BLOCKED";
    next.scope.blockedReason = reason.trim();
  }
  return validatePlan(next);
}

export function unblockScope(plan: WorkflowPlan): WorkflowPlan {
  ensure(
    plan.scope?.status === "BLOCKED",
    "SCOPE_NOT_BLOCKED",
    "The scope is not blocked."
  );
  const next = nextRevision(plan);
  if (next.scope) {
    next.scope.status = "ACTIVE";
    next.scope.blockedReason = null;
  }
  return validatePlan(next);
}

/** A round closes once all of its tasks are DONE and its digest is recorded. */
function closeFinishedRounds(plan: WorkflowPlan): void {
  for (const round of plan.rounds) {
    const tasks = plan.tasks.filter((task) => task.roundId === round.id);
    if (
      round.status === "OPEN" &&
      round.digest &&
      tasks.every((task) => task.status === "DONE")
    ) {
      round.status = "CLOSED";
    }
  }
}

/** Marks the current task DONE; a DOCS task also closes its round with the digest. */
export function completeTask(
  plan: WorkflowPlan,
  taskId: string,
  digest: RoundDigest | null
): WorkflowPlan {
  ensure(
    plan.currentTaskId === taskId,
    "TASK_NOT_ACTIVE",
    `Start the task first: task:start ${taskId}`
  );
  const next = nextRevision(plan);
  const task = findTask(next, taskId);
  task.status = "DONE";
  next.currentTaskId = null;
  if (task.kind === "docs") {
    validateDigest(digest);
    const round = next.rounds.find((item) => item.id === task.roundId);
    if (round && digest) {
      round.digest = {
        contracts: [...digest.contracts],
        decisions: [...digest.decisions],
        references: [...digest.references],
        result: digest.result,
      };
    }
  }
  closeFinishedRounds(next);
  recomputeDelivery(next);
  return validatePlan(next);
}

/**
 * Marks a TODO `work` or `DOCS` task of an orchestrated scope DONE through
 * its integration commit (spec 7): the `startTask` checks (ACTIVE scope, no
 * task in progress, TODO, dependencies DONE), then `completeTask` (a DOCS
 * task needs the digest), as one revision with `integration` recorded.
 */
export function integrateTask(
  plan: WorkflowPlan,
  taskId: string,
  integration: {
    digest: RoundDigest | null;
    operationId: string;
    sourceCommit: string;
  }
): WorkflowPlan {
  ensure(
    plan.scope?.execution?.strategy === "orchestrated",
    "NOT_ORCHESTRATED",
    "Only a task of an orchestrated scope is integrated."
  );
  const kind = findTask(plan, taskId).kind;
  ensure(
    kind === "work" || kind === "docs",
    "TASK_KIND",
    `${taskId} is a ${kind} task; only work and DOCS tasks are integrated.`
  );
  const next = completeTask(
    startTask(plan, taskId, null),
    taskId,
    integration.digest
  );
  next.revision = plan.revision + 1;
  findTask(next, taskId).integration = {
    operationId: integration.operationId,
    sourceCommit: integration.sourceCommit,
  };
  return validatePlan(next);
}
