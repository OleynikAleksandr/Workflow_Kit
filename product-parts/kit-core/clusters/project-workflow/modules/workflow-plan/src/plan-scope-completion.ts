// Scope completion transitions: acceptance, closing and carryover.
import { ensure } from "../../workflow-platform/src/workflow-platform-facade.js";
import { checkCarryoverInput } from "./plan-input-checks.js";
import { emptyPlan, type WorkflowPlan } from "./plan-model.js";
import { arrangeRound } from "./plan-service-tasks.js";
import { nextRevision, type TransitionContext } from "./plan-transitions.js";
import { validatePlan } from "./plan-validation.js";

export interface CarryoverInput {
  approval: string;
  id: string;
  objective?: string;
}

export function acceptScope(
  plan: WorkflowPlan,
  note: string,
  now: string
): WorkflowPlan {
  ensure(
    plan.scope?.delivery === "READY_FOR_ACCEPTANCE",
    "NOT_READY",
    "Acceptance needs every task DONE (READY_FOR_ACCEPTANCE)."
  );
  ensure(
    typeof note === "string" && note.trim().length >= 3,
    "ACCEPTANCE_NOTE",
    "Record the user's acceptance words in --note."
  );
  const next = nextRevision(plan);
  if (next.scope) {
    next.scope.delivery = "ACCEPTED";
    next.scope.acceptanceNote = { at: now, text: note.trim() };
  }
  return validatePlan(next);
}

export function closeScope(
  plan: WorkflowPlan,
  scopeId: string,
  note: string,
  now: string
): WorkflowPlan {
  ensure(
    plan.scope && plan.scope.id === scopeId,
    "SCOPE_ID",
    "Pass the exact id of the scope to close (--scope)."
  );
  ensure(
    plan.scope.delivery === "ACCEPTED",
    "NOT_ACCEPTED",
    "Only an ACCEPTED scope closes; record acceptance first."
  );
  ensure(
    typeof note === "string" && note.trim().length >= 10,
    "USER_CLOSE_REQUIRED",
    "Closing needs the user's direct command in --note; acceptance alone is not one."
  );
  const closed = emptyPlan(plan.projectId, plan.projectName);
  closed.revision = plan.revision + 1;
  closed.lastClosed = { closedAt: now, scopeId };
  return validatePlan(closed);
}

/** Closes the current scope and opens a new one with every unfinished task. */
export function carryoverScope(
  plan: WorkflowPlan,
  input: CarryoverInput,
  context: TransitionContext
): WorkflowPlan {
  const scope = plan.scope;
  ensure(scope, "NO_SCOPE", "There is no scope to carry over.");
  checkCarryoverInput(input);
  ensure(
    context.baselineCommit,
    "NO_BASELINE",
    "carryover needs the current HEAD."
  );
  const done = new Set(
    plan.tasks.filter((task) => task.status === "DONE").map((task) => task.id)
  );
  const unfinished = plan.tasks.filter(
    (task) => task.status !== "DONE" && task.kind !== "docs"
  );
  ensure(
    unfinished.length > 0,
    "NOTHING_TO_CARRY",
    "Every task is DONE; accept and close the scope instead."
  );
  const next = nextRevision(plan);
  const tasks = unfinished.map((task) => ({
    ...structuredClone(task),
    confirmation: null,
    dependencies: task.dependencies.filter(
      (id) => !done.has(id) && unfinished.some((item) => item.id === id)
    ),
    fixes: unfinished.some((item) => item.id === task.fixes)
      ? task.fixes
      : null,
    roundId: "R1",
    status: "TODO" as const,
  }));
  next.lastClosed = { closedAt: context.now, scopeId: scope.id };
  next.scope = {
    ...structuredClone(scope),
    acceptanceNote: null,
    approval: { at: context.now, text: input.approval.trim() },
    baselineCommit: context.baselineCommit,
    blockedReason: null,
    decisions: [
      {
        at: context.now,
        text: `Carried over unfinished tasks from scope ${scope.id}.`,
      },
    ],
    delivery: "IN_PROGRESS",
    id: input.id,
    objective: input.objective ?? scope.objective,
    status: "ACTIVE",
  };
  next.rounds = [
    {
      digest: null,
      id: "R1",
      kind: "implementation",
      status: "OPEN",
      title: "Carried over",
    },
  ];
  next.tasks = [];
  next.currentTaskId = null;
  next.tasks = arrangeRound(
    next,
    "R1",
    tasks.filter((task) => task.kind !== "quality"),
    {
      docsFiles: scope.spec ? [scope.spec] : [],
      qualityConfigured: context.qualityConfigured,
    }
  );
  return validatePlan(next);
}
