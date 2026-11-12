import type {
  CommitRequest,
  CommitResult,
  WorkflowGitFacade,
} from "../../workflow-git/src/workflow-git-facade.js";
import { workflowIntegrationFacade } from "../../workflow-integration/src/workflow-integration-facade.js";
import {
  PLAN_PATH,
  type WorkflowPlan,
  workflowPlanFacade,
} from "../../workflow-plan/src/workflow-plan-facade.js";
import {
  ensure,
  workflowPlatformFacade,
} from "../../workflow-platform/src/workflow-platform-facade.js";
import {
  type WorkflowConfig,
  workflowQualityFacade,
} from "../../workflow-quality/src/workflow-quality-facade.js";

/** Shared state of one Kit operation on one project. */
export interface KitContext {
  env: NodeJS.ProcessEnv;
  git: WorkflowGitFacade;
  now: () => string;
  root: string;
}

export function readPlan(context: KitContext): WorkflowPlan {
  const plan = workflowPlanFacade.read(context.root);
  ensure(
    plan,
    "NOT_INSTALLED",
    `${PLAN_PATH} does not exist; install the Workflow Kit first.`,
    {},
    "Run `scripts/workflow install` or open the project in Harness AI."
  );
  return plan;
}

export function readConfig(context: KitContext): WorkflowConfig {
  return workflowQualityFacade.readConfig(context.root);
}

export function requireHead(context: KitContext): string {
  const head = context.git.head(context.root);
  ensure(head, "NO_COMMITS", "The repository has no commits yet.");
  return head;
}

/** INTEGRATION_ACTIVE while `.harness/workflow/local/integration.json` exists. */
export function ensureNoIntegration(context: KitContext): void {
  ensure(
    !workflowIntegrationFacade.isActive(context.root),
    "INTEGRATION_ACTIVE",
    "An integration is unfinished; other Kit writes wait until it completes.",
    {},
    "Run `scripts/workflow integration:status`, then `scripts/workflow integration:continue --id <assignment>`."
  );
}

/** The shared busy check of Kit writes: no commit transaction, no integration. */
export function ensureNoTransaction(context: KitContext): void {
  ensure(
    context.git.transactions.journal(context.root) === null,
    "TRANSACTION_PENDING",
    "A commit transaction is unfinished.",
    {},
    "Run `scripts/workflow repair`."
  );
  ensureNoIntegration(context);
}

export function ensureRevision(
  plan: WorkflowPlan,
  expected: number | undefined
): void {
  ensure(
    expected === undefined || plan.revision === expected,
    "REVISION_MISMATCH",
    `The plan is at revision ${plan.revision}, not ${String(expected)}; read the status again.`,
    { revision: plan.revision }
  );
}

/** Runs a mutating operation under the project lock. */
export function locked<T>(context: KitContext, fn: () => T): T {
  return workflowPlatformFacade.withLock(
    context.git.localPath(context.root, "kit.lock"),
    fn
  );
}

/** Commits the plan (and files) through a Kit transaction. */
export function commitPlan(
  context: KitContext,
  plan: WorkflowPlan,
  request: Omit<CommitRequest, "planPath" | "planText">
): CommitResult {
  ensureNoTransaction(context);
  return context.git.transactions.commit(context.root, {
    ...request,
    planPath: PLAN_PATH,
    planText: workflowPlanFacade.render(plan),
  });
}

/** Writes a plan state change that the next Kit commit records. */
export function savePlan(context: KitContext, plan: WorkflowPlan): void {
  workflowPlanFacade.write(context.root, plan);
}

export function changedDocuments(
  context: KitContext,
  paths: (string | null | undefined)[]
): string[] {
  const changed = new Set(context.git.changes(context.root).all);
  return [
    ...new Set(paths.filter((item): item is string => Boolean(item))),
  ].filter((item) => changed.has(item));
}
