// Autopilot authority operations of the Kit (M39): authorize, revoke, and
// the acceptance and close of an authorized run. The CLI runs them only
// after the host verified its ticket (kit-host-auth.ts); here they check the
// plan, the evidence and the revision under the project lock.
import { workflowExecutionModeFacade } from "../../workflow-execution-mode/src/workflow-execution-mode-facade.js";
import type { CommitResult } from "../../workflow-git/src/workflow-git-facade.js";
import {
  type AuthorizeInput,
  type AutopilotGrant,
  type CriterionEvidence,
  isDocumentationPath,
  PLAN_PATH,
  type RevokeInput,
  type WorkflowPlan,
  workflowPlanFacade,
} from "../../workflow-plan/src/workflow-plan-facade.js";
import { ensure } from "../../workflow-platform/src/workflow-platform-facade.js";
import { workflowQualityFacade } from "../../workflow-quality/src/workflow-quality-facade.js";
import {
  commitPlan,
  ensureNoTransaction,
  ensureRevision,
  type KitContext,
  locked,
  readPlan,
  savePlan,
} from "./kit-context.js";
import { ensureCleanTree } from "./kit-scope.js";
import { change, type PlanChange } from "./kit-scope-create.js";

/** The `accept --autopilot-run --input` body the host gathers. */
export interface AcceptanceInput {
  ci: { checks: string[]; sha: string } | null;
  criteria: CriterionEvidence[];
  head: string;
}

export interface GrantResult {
  changed: boolean;
  /** null when nothing changed or a task in progress keeps the plan for its commit. */
  commit: CommitResult | null;
  grant: AutopilotGrant;
  revision: number;
}

const SHA_PATTERN = /^[0-9a-f]{40}$/u;

/**
 * A grant change is a Kit commit (role `authorization`); while a task is in
 * progress the plan is saved and the task commit records it, like
 * `task:block`, so the task baseline stays intact.
 */
function recordGrant(
  context: KitContext,
  plan: WorkflowPlan,
  message: string
): CommitResult | null {
  if (plan.currentTaskId !== null) {
    savePlan(context, plan);
    return null;
  }
  return commitPlan(context, plan, {
    files: [],
    message,
    role: "authorization",
    scopeId: plan.scope?.id ?? null,
    taskId: null,
  });
}

/** `autopilot:authorize --input --expected-revision` (host only). */
export function authorizeRun(
  context: KitContext,
  input: AuthorizeInput,
  expectedRevision: number
): GrantResult {
  return locked(context, () => {
    ensureNoTransaction(context);
    const current = readPlan(context);
    ensureRevision(current, expectedRevision);
    const result = workflowPlanFacade.authorize(current, input, context.now());
    const commit = result.changed
      ? recordGrant(
          context,
          result.plan,
          `chore: authorize autopilot run ${result.grant.runId}`
        )
      : null;
    return {
      changed: result.changed,
      commit,
      grant: result.grant,
      revision: result.plan.revision,
    };
  });
}

/** `autopilot:revoke --run --reason --note --expected-revision` (host only). */
export function revokeRun(
  context: KitContext,
  input: RevokeInput,
  expectedRevision: number
): GrantResult {
  return locked(context, () => {
    ensureNoTransaction(context);
    const current = readPlan(context);
    ensureRevision(current, expectedRevision);
    const result = workflowPlanFacade.revoke(current, input, context.now());
    const commit = result.changed
      ? recordGrant(
          context,
          result.plan,
          `chore: revoke autopilot run ${input.runId} (${input.reason})`
        )
      : null;
    return {
      changed: result.changed,
      commit,
      grant: result.grant,
      revision: result.plan.revision,
    };
  });
}

function evidenceError(
  message: string,
  details: Record<string, unknown>
): never {
  ensure(
    false,
    "AUTOPILOT_EVIDENCE_REQUIRED",
    message,
    details,
    "Gather the evidence of the current HEAD again."
  );
  throw new Error(message);
}

function passedAt(
  context: KitContext,
  commit: string,
  id: string,
  head: string
): boolean {
  if (
    !SHA_PATTERN.test(commit) ||
    !context.git.isAncestor(context.root, commit, head)
  ) {
    return false;
  }
  const record = workflowQualityFacade.readEvidence(context.root, commit);
  return (record?.reports ?? []).some((report) =>
    report.results.some((result) => result.id === id && result.status === "passed")
  );
}

/** Only documentation and the plan changed between `from` and `head`. */
function documentationOnly(context: KitContext, from: string, head: string): boolean {
  return context.git
    .diffPaths(context.root, from, head)
    .every((file) => file === PLAN_PATH || isDocumentationPath(file));
}

/**
 * The criteria evidence against the plan and the Kit's own records: every
 * check of an automatic criterion passed in the verification record of a
 * commit on the history of HEAD, every evidence file is tracked at HEAD,
 * and the required CI checks passed for a commit of HEAD's history after
 * which only documentation changed.
 */
function verifiedEvidence(
  context: KitContext,
  plan: WorkflowPlan,
  input: AcceptanceInput,
  head: string
): AcceptanceInput {
  const automation = plan.scope?.automation;
  ensure(
    automation !== undefined,
    "AUTOPILOT_UNAUTHORIZED",
    "The plan has no automation block; the user accepts the result."
  );
  if (!input || typeof input !== "object" || input.head !== head) {
    evidenceError("The evidence was gathered for another HEAD.", {
      head,
      input: input?.head ?? null,
    });
  }
  const given = new Map(
    (Array.isArray(input.criteria) ? input.criteria : []).map((entry) => [
      entry?.criterion,
      entry,
    ])
  );
  const criteria: CriterionEvidence[] = [];
  for (const entry of automation.acceptance) {
    if (entry.kind !== "automatic") {
      continue;
    }
    const proof = given.get(entry.criterion);
    const checks = entry.checks.map((id) => {
      const passed = (proof?.checks ?? []).find(
        (item) => item?.id === id && passedAt(context, item.commit, id, head)
      );
      if (!passed) {
        evidenceError(`Criterion ${entry.criterion + 1}: check ${id} has no passed record on the history of HEAD.`, {
          check: id,
          criterion: entry.criterion,
        });
      }
      return { commit: passed.commit, id };
    });
    const missing = entry.evidence.filter(
      (file) =>
        !(proof?.evidence ?? []).includes(file) ||
        context.git.show(context.root, head, file) === null
    );
    if (missing.length > 0) {
      evidenceError(`Criterion ${entry.criterion + 1}: evidence files are not committed: ${missing.join(", ")}.`, {
        criterion: entry.criterion,
        missing,
      });
    }
    criteria.push({ checks, criterion: entry.criterion, evidence: [...entry.evidence] });
  }
  let ci: AcceptanceInput["ci"] = null;
  if (automation.ci) {
    const result = input.ci;
    const absent = automation.ci.requiredChecks.filter(
      (name) => !(result?.checks ?? []).includes(name)
    );
    const fresh =
      result !== null &&
      result !== undefined &&
      SHA_PATTERN.test(result.sha) &&
      context.git.isAncestor(context.root, result.sha, head) &&
      (!automation.ci.exactSha || documentationOnly(context, result.sha, head));
    if (absent.length > 0 || !fresh) {
      evidenceError("The required CI checks did not pass for the current result.", {
        absent,
        sha: result?.sha ?? null,
      });
    }
    ci = { checks: [...automation.ci.requiredChecks], sha: (result as { sha: string }).sha };
  }
  return { ci, criteria, head };
}

/** `accept --autopilot-run --input --expected-revision` (host only). */
export function acceptRun(
  context: KitContext,
  runId: string,
  input: AcceptanceInput,
  expectedRevision: number
): PlanChange {
  return locked(context, () => {
    ensureNoTransaction(context);
    const current = readPlan(context);
    ensureRevision(current, expectedRevision);
    workflowPlanFacade.grant(current, runId);
    const head = context.git.head(context.root) ?? "";
    const evidence = verifiedEvidence(context, current, input, head);
    const plan = workflowPlanFacade.acceptByAutopilot(
      current,
      { ...evidence, runId },
      context.now()
    );
    const commit = commitPlan(context, plan, {
      files: [],
      message: `chore: accept scope ${plan.scope?.id ?? "NONE"} (autopilot run ${runId})`,
      role: "acceptance",
      scopeId: plan.scope?.id ?? null,
      taskId: null,
    });
    return change(plan, commit);
  });
}

/** `close --scope --autopilot-run --expected-revision` (host only). */
export function closeRun(
  context: KitContext,
  scopeId: string,
  runId: string,
  expectedRevision: number
): PlanChange {
  return locked(context, () => {
    ensureNoTransaction(context);
    ensureCleanTree(context);
    const current = readPlan(context);
    ensureRevision(current, expectedRevision);
    const plan = workflowPlanFacade.closeByAutopilot(
      current,
      { head: context.git.head(context.root) ?? "", runId, scopeId },
      context.now()
    );
    const commit = commitPlan(context, plan, {
      files: [],
      message: `chore: close scope ${scopeId} (autopilot run ${runId})`,
      role: "close",
      scopeId,
      taskId: null,
    });
    workflowExecutionModeFacade.clear(context.root);
    return change(plan, commit);
  });
}
