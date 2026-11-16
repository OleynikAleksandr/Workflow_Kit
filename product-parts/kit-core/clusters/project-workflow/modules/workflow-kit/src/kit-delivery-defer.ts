// `task:defer-delivery` (M39): the current delivery task whose external
// check failed returns to TODO, so `plan:extend round=new` can put a fixes
// round and its DOCS task before the next attempt. DONE tasks never change.
import type { CommitResult } from "../../workflow-git/src/workflow-git-facade.js";
import { workflowPlanFacade } from "../../workflow-plan/src/workflow-plan-facade.js";
import { ensure } from "../../workflow-platform/src/workflow-platform-facade.js";
import { activeRecords } from "./kit-assignment.js";
import {
  commitPlan,
  ensureNoTransaction,
  ensureRevision,
  type KitContext,
  locked,
  readPlan,
} from "./kit-context.js";
import { executorAssignment } from "./kit-executor.js";

export interface DeferRequest {
  expectedRevision: number;
  outcome: string | null;
  reason: string;
  taskId: string;
}

export interface DeliveryDeferral {
  commit: CommitResult;
  /** The attempt that was deferred and the one the next start begins. */
  deferredIteration: number;
  nextIteration: number;
  revision: number;
  taskId: string;
}

const NOT_ALLOWED = "DELIVERY_DEFER_NOT_ALLOWED";

/**
 * Defers the current delivery attempt as a Kit commit (role `deferral`).
 * Under the project lock: no transaction or integration, the expected
 * revision, main (not an executor worktree), no active assignment, a clean
 * tree apart from Kit-managed files; then the plan transition.
 */
export function deferDelivery(
  context: KitContext,
  request: DeferRequest
): DeliveryDeferral {
  return locked(context, () => {
    ensureNoTransaction(context);
    const current = readPlan(context);
    ensureRevision(current, request.expectedRevision);
    ensure(
      executorAssignment(context) === null,
      NOT_ALLOWED,
      "An executor worktree never defers a delivery; main does.",
      { taskId: request.taskId }
    );
    const active = activeRecords(current, context.root).map(
      (record) => record.id
    );
    ensure(
      active.length === 0,
      NOT_ALLOWED,
      `Assignments are still active: ${active.join(", ")}.`,
      { assignments: active, taskId: request.taskId },
      "Finish or integrate the assignments first."
    );
    const dirty = context.git
      .changes(context.root)
      .all.filter((file) => !context.git.isKitManagedPath(file));
    ensure(
      dirty.length === 0,
      "DIRTY_TREE",
      `Defer the delivery on a clean working tree; not committed: ${dirty.slice(0, 5).join(", ")}.`,
      { paths: dirty },
      "Keep the check results outside git and remove your own temporary files; never touch others' files. Then repeat."
    );
    const before = workflowPlanFacade.task(current, request.taskId);
    const plan = workflowPlanFacade.deferDelivery(current, request.taskId, {
      now: context.now(),
      outcome: request.outcome,
      reason: request.reason,
    });
    const commit = commitPlan(context, plan, {
      files: [],
      message: `chore: defer delivery ${request.taskId} (attempt ${before.iteration})`,
      role: "deferral",
      scopeId: plan.scope?.id ?? null,
      taskId: null,
    });
    return {
      commit,
      deferredIteration: before.iteration,
      nextIteration: before.iteration + 1,
      revision: plan.revision,
      taskId: request.taskId,
    };
  });
}
