import { ensure } from "../../workflow-platform/src/workflow-platform-facade.js";
import { scopeExecution } from "./plan-execution.js";
import type { WorkflowPlan } from "./plan-model.js";
import { nextRevision } from "./plan-transitions.js";
import { validatePlan } from "./plan-validation.js";

/** The result of a plan owner move. */
export interface OwnerMove {
  changed: boolean;
  plan: WorkflowPlan;
  previous: string | null;
}

/**
 * Moves the owner session of the open scope before its work starts (spec
 * M31 3.1). The same owner leaves the plan as it is; a started task refuses
 * with OWNER_BUSY. Open assignments are checked by the caller.
 */
export function moveOwner(
  plan: WorkflowPlan,
  session: string,
  note: string,
  now: string
): OwnerMove {
  const scope = plan.scope;
  ensure(scope, "NO_SCOPE", "There is no active scope to move.");
  const owner = typeof session === "string" ? session.trim() : "";
  const words = typeof note === "string" ? note.trim() : "";
  ensure(owner !== "", "USAGE", "--session is required.");
  ensure(words !== "", "USAGE", "--note is required.");
  const previous = scopeExecution(scope).ownerSession;
  if (previous === owner) {
    return { changed: false, plan, previous };
  }
  const started = plan.tasks.filter((task) => task.status === "IN_PROGRESS");
  ensure(
    started.length === 0 && plan.currentTaskId === null,
    "OWNER_BUSY",
    "The plan has started work; the owner changes only before it.",
    { tasks: started.map((task) => task.id) },
    "Continue the plan in its owner session."
  );
  const next = nextRevision(plan);
  if (next.scope) {
    next.scope.execution = { ...scopeExecution(next.scope), ownerSession: owner };
    next.scope.decisions.push({
      at: now,
      text: `Owner session moved from ${previous ?? "none"} to ${owner}: ${words}`,
    });
  }
  return { changed: true, plan: validatePlan(next), previous };
}
