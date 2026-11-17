// `autopilot:status`: the decision input of the host autopilot, plus the
// M39 facts the host reads through the public CLI only: the capability, the
// reviewed proposal, the authorization of the run and the acceptance state.
import { workflowAssignmentFacade } from "../../workflow-assignment/src/workflow-assignment-facade.js";
import type {
  AutopilotOrchestration,
  AutopilotProjectStatus,
} from "../../workflow-autopilot/src/workflow-autopilot-facade.js";
import {
  type AutopilotGrant,
  type ScopeProposalRef,
  type WorkflowPlan,
  workflowPlanFacade,
} from "../../workflow-plan/src/workflow-plan-facade.js";
import { workflowQualityFacade } from "../../workflow-quality/src/workflow-quality-facade.js";
import { activeRecords } from "./kit-assignment.js";
import type { KitContext } from "./kit-context.js";
import { HOST_PROTOCOL } from "./kit-host-auth.js";
import { type KitStatus, readStatus } from "./kit-status.js";

/**
 * What this Kit supports of spec M39, by feature rather than by version
 * number: the automation block, the host-only grant, the deferral of a
 * started delivery and the agent instructions and recovery texts that know
 * the grant. `complete` is true when all of them are present (Kit 2.3.3).
 */
export interface AutopilotCapability {
  authorization: boolean;
  automation: boolean;
  complete: boolean;
  deferDelivery: boolean;
  hostProtocol: string;
  instructions: boolean;
}

/** One acceptance criterion of the automation block and its evidence state. */
export interface CriterionState {
  checks: string[];
  criterion: number;
  evidence: string[];
  /** Evidence files not tracked at HEAD. */
  evidenceMissing: string[];
  /** Checks without a passed record on the history of HEAD (Kit 2.4.5, spec M41). */
  checksPending: string[];
  /** Of `checksPending`, those no unfinished task of the scope can record. */
  checksUnreachable: string[];
  kind: "automatic" | "manual";
}

/** Kit commits of HEAD the host offers as evidence (its own window, newest first). */
const EVIDENCE_WINDOW = 200;

/** The autopilot decision input plus the user's pause and the M39 facts. */
export type KitAutopilotStatus = AutopilotProjectStatus & {
  /** null without an automation block (a legacy plan). */
  acceptance: CriterionState[] | null;
  authorization: AutopilotGrant | null;
  capability: AutopilotCapability;
  paused: boolean;
  proposal: ScopeProposalRef | null;
};

export const AUTOPILOT_CAPABILITY: AutopilotCapability = {
  authorization: true,
  automation: true,
  complete: true,
  deferDelivery: true,
  hostProtocol: HOST_PROTOCOL,
  instructions: true,
};

/**
 * What the orchestrator of an orchestrated scope may act on (spec 10.3):
 * the active and pending-cleanup assignments, the integration and the tasks
 * the scheduler hands out now. Null in a sequential scope and outside main.
 */
function orchestrationOf(
  context: KitContext,
  status: KitStatus
): AutopilotOrchestration | null {
  if (status.execution?.strategy !== "orchestrated" || status.executor) {
    return null;
  }
  const plan = workflowPlanFacade.read(context.root);
  if (!plan) {
    return null;
  }
  const schedule = workflowAssignmentFacade.schedule(
    plan,
    activeRecords(plan, context.root)
  );
  return {
    assignments: status.assignments
      .filter(
        (item) =>
          item.status !== "INTEGRATED" || item.cleanup?.status === "PENDING"
      )
      .map(({ id, sourceCommit, status: state, taskId }) => ({
        cleanupPending: state === "INTEGRATED",
        id,
        sourceCommit,
        status: state,
        taskId,
      })),
    integration: status.integration,
    readyTasks: schedule.ready,
  };
}

/**
 * Check ids with a passed record in the evidence of a Kit commit of HEAD's
 * history: the newest Kit commits the host offers to `accept`, as
 * `verifiedEvidence` reads them (any stage).
 */
function passedChecks(context: KitContext, head: string | null): Set<string> {
  const passed = new Set<string>();
  if (head === null) {
    return passed;
  }
  const commits = context.git
    .history(context.root, null, head)
    .reverse()
    .filter((commit) => (commit.trailers["Workflow-Transaction"] ?? []).length > 0)
    .slice(0, EVIDENCE_WINDOW);
  for (const commit of commits) {
    const record = workflowQualityFacade.readEvidence(context.root, commit.sha);
    for (const report of record?.reports ?? []) {
      for (const result of report.results) {
        if (result.status === "passed") {
          passed.add(result.id);
        }
      }
    }
  }
  return passed;
}

function acceptanceOf(
  context: KitContext,
  status: KitStatus,
  plan: WorkflowPlan | null
): CriterionState[] | null {
  const automation = status.scope?.automation;
  if (!automation) {
    return null;
  }
  const named = automation.acceptance.some((entry) => entry.checks.length > 0);
  const passed = named ? passedChecks(context, status.head) : new Set<string>();
  const config = workflowQualityFacade.readConfig(context.root);
  const open = (plan?.tasks ?? []).filter((task) => task.status !== "DONE");
  return automation.acceptance.map((entry) => {
    const pending = entry.checks.filter((id) => !passed.has(id));
    const unreachable = new Set(
      workflowQualityFacade
        .unrecordedChecks(config, pending, open)
        .map((item) => item.check)
    );
    return {
      checks: [...entry.checks],
      checksPending: pending,
      checksUnreachable: pending.filter((id) => unreachable.has(id)),
      criterion: entry.criterion,
      evidence: [...entry.evidence],
      evidenceMissing: entry.evidence.filter(
        (file) =>
          status.head === null ||
          context.git.show(context.root, status.head, file) === null
      ),
      kind: entry.kind,
    };
  });
}

/** The status shape the autopilot decision reads. */
export function autopilotStatus(context: KitContext): KitAutopilotStatus {
  const status = readStatus(context);
  const plan = workflowPlanFacade.read(context.root);
  return {
    acceptance: acceptanceOf(context, status, plan),
    authorization: structuredClone(plan?.scope?.authorization ?? null),
    blockedReason: status.scope?.blockedReason ?? null,
    capability: { ...AUTOPILOT_CAPABILITY },
    decisionsMode: status.decisionsMode,
    delivery: (status.scope?.delivery ??
      null) as AutopilotProjectStatus["delivery"],
    head: status.head,
    nextTask: status.nextTask,
    orchestration: orchestrationOf(context, status),
    paused: status.paused,
    proposal: status.scope?.proposal ?? null,
    proposalPending:
      status.scopeProposal !== null && !status.scopeProposal.refining,
    revision: status.revision,
    scope: (status.scope?.status ?? "NONE") as AutopilotProjectStatus["scope"],
    transactionPending: status.transaction !== null,
  };
}
