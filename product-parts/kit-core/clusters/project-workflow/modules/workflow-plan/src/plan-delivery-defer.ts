// Returning a started delivery task to TODO (M39 `task:defer-delivery`): a
// delivery whose external check failed (for example a red CI) goes behind a
// new fixes round. DONE tasks and their commits never change.
import { ensure } from "../../workflow-platform/src/workflow-platform-facade.js";
import type { WorkflowPlan } from "./plan-model.js";
import { nextRevision } from "./plan-transitions.js";
import { validatePlan } from "./plan-validation.js";

/** One deferred attempt of a delivery task. */
export interface TaskDeferral {
  at: string;
  /** The confirmation the attempt started with; it is not reused. */
  confirmation: string | null;
  /** The attempt (task iteration) that was deferred. */
  iteration: number;
  /** The result of the external operation, when the caller names it. */
  outcome: string | null;
  reason: string;
}

const REASON_MIN = 10;
const NOT_ALLOWED = "DELIVERY_DEFER_NOT_ALLOWED";

/**
 * The current IN_PROGRESS delivery task returns to TODO as a new attempt
 * (iteration + 1) without its confirmation; the attempt is recorded in
 * `deferrals`. Anything else is DELIVERY_DEFER_NOT_ALLOWED.
 */
export function deferDeliveryTask(
  plan: WorkflowPlan,
  taskId: string,
  request: { now: string; outcome?: string | null; reason: string }
): WorkflowPlan {
  ensure(
    typeof request.reason === "string" &&
      request.reason.trim().length >= REASON_MIN,
    "USAGE",
    `--reason names the failure and where it is seen (at least ${REASON_MIN} characters).`
  );
  const task = plan.tasks.find((item) => item.id === taskId);
  const allowed =
    plan.scope?.status === "ACTIVE" &&
    task?.kind === "delivery" &&
    task.status === "IN_PROGRESS" &&
    plan.currentTaskId === taskId;
  ensure(
    allowed,
    NOT_ALLOWED,
    `Only the current IN_PROGRESS delivery task of an ACTIVE scope can be deferred: ${taskId}.`,
    {
      currentTaskId: plan.currentTaskId,
      kind: task?.kind ?? null,
      scope: plan.scope?.status ?? "NONE",
      status: task?.status ?? null,
      taskId,
    },
    "A DONE task never changes; a defect after it becomes a new fixes round with plan:extend."
  );
  const next = nextRevision(plan);
  const deferred = next.tasks.find((item) => item.id === taskId);
  if (deferred) {
    deferred.deferrals = [
      ...(deferred.deferrals ?? []),
      {
        at: request.now,
        confirmation: deferred.confirmation,
        iteration: deferred.iteration,
        outcome: request.outcome?.trim() || null,
        reason: request.reason.trim(),
      },
    ];
    deferred.status = "TODO";
    deferred.confirmation = null;
    deferred.iteration += 1;
  }
  next.currentTaskId = null;
  return validatePlan(next);
}

/** `deferrals` belong to delivery tasks and name their earlier attempts. */
export function validateDeferrals(plan: WorkflowPlan): void {
  for (const task of plan.tasks) {
    if (task.deferrals === undefined) {
      continue;
    }
    const field = `tasks.${task.id}.deferrals`;
    ensure(
      task.kind === "delivery" &&
        Array.isArray(task.deferrals) &&
        task.deferrals.every(
          (entry) =>
            entry !== null &&
            typeof entry === "object" &&
            typeof entry.at === "string" &&
            typeof entry.reason === "string" &&
            entry.reason.trim() !== "" &&
            Number.isSafeInteger(entry.iteration) &&
            entry.iteration >= 1 &&
            entry.iteration < task.iteration &&
            (entry.outcome === null || typeof entry.outcome === "string") &&
            (entry.confirmation === null ||
              typeof entry.confirmation === "string")
        ),
      "PLAN_SCHEMA",
      `Deferred attempts belong to a delivery task and precede its iteration: ${task.id}`,
      { field }
    );
  }
}
