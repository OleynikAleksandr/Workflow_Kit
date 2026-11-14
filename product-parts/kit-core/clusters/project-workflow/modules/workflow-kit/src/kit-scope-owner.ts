import {
  type WorkflowExecution,
  workflowPlanFacade,
} from "../../workflow-plan/src/workflow-plan-facade.js";
import { ensure } from "../../workflow-platform/src/workflow-platform-facade.js";
import { activeRecords } from "./kit-assignment.js";
import {
  ensureNoTransaction,
  type KitContext,
  locked,
  readPlan,
  savePlan,
} from "./kit-context.js";

/** The answer of `scope:owner`. */
export interface ScopeOwnerResult {
  changed: boolean;
  execution: WorkflowExecution;
  previous: string | null;
  revision: number;
}

/**
 * `scope:owner`: moves the owner session of the open scope before its work
 * starts (spec M31 3.1). The plan is saved like `task:block`: the next Kit
 * commit records it.
 */
export function moveScopeOwner(
  context: KitContext,
  request: { note: string; session: string }
): ScopeOwnerResult {
  return locked(context, () => {
    ensureNoTransaction(context);
    const current = readPlan(context);
    const open = current.scope ? activeRecords(current, context.root) : [];
    ensure(
      open.length === 0,
      "OWNER_BUSY",
      "The plan has started work; the owner changes only before it.",
      { assignments: open.map((record) => record.id) },
      "Continue the plan in its owner session."
    );
    const move = workflowPlanFacade.moveOwner(
      current,
      request.session,
      request.note,
      context.now()
    );
    if (move.changed) {
      savePlan(context, move.plan);
    }
    return {
      changed: move.changed,
      execution: workflowPlanFacade.execution(move.plan),
      previous: move.previous,
      revision: move.plan.revision,
    };
  });
}
