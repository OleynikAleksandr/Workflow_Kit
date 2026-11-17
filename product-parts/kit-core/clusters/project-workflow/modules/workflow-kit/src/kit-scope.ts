import { workflowExecutionModeFacade } from "../../workflow-execution-mode/src/workflow-execution-mode-facade.js";
import {
  type UserDecision,
  type WorkflowPlanFacade,
  type WorkflowTask,
  workflowPlanFacade,
} from "../../workflow-plan/src/workflow-plan-facade.js";
import { ensure } from "../../workflow-platform/src/workflow-platform-facade.js";
import { workflowQualityFacade } from "../../workflow-quality/src/workflow-quality-facade.js";
import {
  commitPlan,
  ensureNoIntegration,
  ensureNoTransaction,
  ensureRevision,
  type KitContext,
  locked,
  readConfig,
  readPlan,
  savePlan,
  withDecision,
} from "./kit-context.js";
import {
  changedContextTasks,
  ensureContextBudget,
} from "./kit-context-budget.js";
import {
  decisionsMode,
  ensureNoExternalCommits,
  registerDecision,
} from "./kit-decisions.js";
import {
  change,
  ensureInputChecks,
  type PlanChange,
  transition,
} from "./kit-scope-create.js";

export type {
  PlanChange,
  ScopeChoiceResult,
  ScopeInput,
  ScopeProposalResult,
} from "./kit-scope-create.js";
export {
  chooseScope,
  createScope,
  proposeScope,
} from "./kit-scope-create.js";

export type ExtendInput = Parameters<WorkflowPlanFacade["extend"]>[1];
export type CarryoverInput = Parameters<WorkflowPlanFacade["carryover"]>[1];

/** Task fields `task:update` may change. */
export type TaskPatch = Partial<
  Pick<
    WorkflowTask,
    | "acceptance"
    | "checks"
    | "commitMessage"
    | "context"
    | "dependencies"
    | "docsWaiver"
    | "files"
    | "title"
    | "why"
  >
>;

const PATCH_FIELDS = new Set<string>([
  "acceptance",
  "checks",
  "commitMessage",
  "context",
  "dependencies",
  "docsWaiver",
  "files",
  "title",
  "why",
]);
const IN_PROGRESS_FIELDS = new Set<string>([
  "acceptance",
  "checks",
  "docsWaiver",
  "files",
]);

/** `plan:extend`: adds tasks to the open round or a new round. */
export function extendScope(
  context: KitContext,
  input: ExtendInput,
  expectedRevision?: number
): PlanChange & { deferredDocsTaskId: string | null; roundId: string } {
  return locked(context, () => {
    ensureNoTransaction(context);
    const current = readPlan(context);
    ensureRevision(current, expectedRevision);
    const result = workflowPlanFacade.extend(
      current,
      input,
      transition(context)
    );
    ensureInputChecks(context, input.tasks);
    ensureContextBudget(
      context,
      result.plan,
      changedContextTasks(current, result.plan)
    );
    const commit = commitPlan(context, result.plan, {
      files: [],
      message: `docs: extend scope ${current.scope?.id ?? "NONE"} (${result.roundId})`,
      role: "scope-plan",
      scopeId: current.scope?.id ?? null,
      taskId: null,
    });
    return {
      ...change(result.plan, commit),
      deferredDocsTaskId: result.deferredDocsTaskId,
      roundId: result.roundId,
    };
  });
}

/** `task:update`: edits a task that is not done. */
export function updateTask(
  context: KitContext,
  taskId: string,
  patch: TaskPatch,
  expectedRevision?: number
): PlanChange {
  return locked(context, () => {
    ensureNoTransaction(context);
    const current = readPlan(context);
    ensureRevision(current, expectedRevision);
    const original = workflowPlanFacade.task(current, taskId);
    const fields = Object.keys(patch);
    ensure(
      fields.length > 0 && fields.every((field) => PATCH_FIELDS.has(field)),
      "TASK_PATCH",
      `task:update changes only: ${[...PATCH_FIELDS].join(", ")}.`
    );
    ensure(
      original.status === "TODO" ||
        (original.status === "IN_PROGRESS" &&
          fields.every((field) => IN_PROGRESS_FIELDS.has(field))),
      "TASK_PATCH",
      original.status === "DONE"
        ? "A DONE task never changes; extend the plan with a fix task."
        : `A task in progress changes only: ${[...IN_PROGRESS_FIELDS].join(", ")}.`
    );
    const plan = structuredClone(current);
    plan.revision += 1;
    Object.assign(
      workflowPlanFacade.task(plan, taskId),
      structuredClone(patch)
    );
    workflowPlanFacade.validate(plan);
    if (patch.checks !== undefined) {
      workflowQualityFacade.ensurePlannedChecks(readConfig(context), [
        { checks: patch.checks, field: "checks", taskId },
      ]);
    }
    ensureContextBudget(context, plan, [workflowPlanFacade.task(plan, taskId)]);
    const commit = commitPlan(context, plan, {
      files: [],
      message: `docs: update task ${taskId}`,
      role: "scope-plan",
      scopeId: plan.scope?.id ?? null,
      taskId: null,
    });
    return change(plan, commit);
  });
}

/** `accept`: records the user's acceptance; the scope stays open. */
export function acceptScope(
  context: KitContext,
  note: string,
  decision: UserDecision | null = null
): PlanChange {
  return locked(context, () => {
    ensureNoTransaction(context);
    const current = readPlan(context);
    ensureNoExternalCommits(context, current);
    const plan = withDecision(
      workflowPlanFacade.accept(current, note, context.now()),
      decision
    );
    const commit = commitPlan(context, plan, {
      files: [],
      message: `chore: accept scope ${plan.scope?.id ?? "NONE"}`,
      role: "acceptance",
      scopeId: plan.scope?.id ?? null,
      taskId: null,
    });
    return change(plan, commit);
  });
}

/** Paths the `close` refusal names; the full list goes into `details.paths`. */
const NAMED_PATHS = 5;

function namedPaths(paths: readonly string[]): string {
  const named = paths.slice(0, NAMED_PATHS).join(", ");
  const more = paths.length - NAMED_PATHS;
  return more > 0 ? `${named} (and ${more} more)` : named;
}

/** DIRTY_TREE when files outside Kit-managed paths are not committed. */
export function ensureCleanTree(context: KitContext): void {
  const dirty = context.git
    .changes(context.root)
    .all.filter((file) => !context.git.isKitManagedPath(file));
  ensure(
    dirty.length === 0,
    "DIRTY_TREE",
    `Close the scope on a clean working tree; not committed: ${namedPaths(dirty)}.`,
    { paths: dirty },
    "Delete temporary files or commit documents with `scripts/workflow docs:commit --files <paths>`, then repeat close."
  );
}

/** `close`: only from ACCEPTED, on a clean tree, by a direct user command. */
export function closeScope(
  context: KitContext,
  scopeId: string,
  note: string,
  decision: UserDecision | null = null
): PlanChange {
  return locked(context, () => {
    ensureNoTransaction(context);
    ensureCleanTree(context);
    const current = readPlan(context);
    ensureNoExternalCommits(context, current);
    const plan = workflowPlanFacade.close(current, scopeId, note, context.now());
    if (decision && plan.lastClosed) {
      plan.lastClosed.decision = { ...decision };
    }
    const commit = commitPlan(context, plan, {
      files: [],
      message: `chore: close scope ${scopeId}`,
      role: "close",
      scopeId,
      taskId: null,
    });
    workflowExecutionModeFacade.clear(context.root);
    return change(plan, commit);
  });
}

/** `carryover`: moves unfinished tasks into a new scope. */
export function carryoverScope(
  context: KitContext,
  input: CarryoverInput
): PlanChange {
  return locked(context, () => {
    ensureNoTransaction(context);
    const plan = workflowPlanFacade.carryover(
      readPlan(context),
      input,
      transition(context)
    );
    const commit = commitPlan(context, plan, {
      files: [],
      message: `chore: carry over into scope ${input.id}`,
      role: "carryover",
      scopeId: input.id,
      taskId: null,
    });
    return change(plan, commit);
  });
}

/** `task:block` / `task:unblock`: the next Kit commit records the state. */
export function setBlocked(
  context: KitContext,
  reason: string | null,
  decision: UserDecision | null = null
): PlanChange {
  return locked(context, () => {
    ensureNoIntegration(context);
    const current = readPlan(context);
    const plan = withDecision(
      reason === null
        ? workflowPlanFacade.unblock(current)
        : workflowPlanFacade.block(current, reason),
      decision
    );
    savePlan(context, plan);
    // The `host` mode: the request to remove the block is registered at
    // once, so the card needs no command of the agent (M40).
    if (reason !== null && decisionsMode(context) === "host") {
      registerDecision(context, { kind: "unblock" });
    }
    return change(plan, null);
  });
}
