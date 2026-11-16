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
  workflowPlanFacade,
} from "../../workflow-plan/src/workflow-plan-facade.js";
import { activeRecords } from "./kit-assignment.js";
import type { KitContext } from "./kit-context.js";
import { HOST_PROTOCOL } from "./kit-host-auth.js";
import { type KitStatus, readStatus } from "./kit-status.js";

/** What this Kit supports of spec M39; `complete` arrives with T004. */
export interface AutopilotCapability {
  authorization: boolean;
  automation: boolean;
  complete: boolean;
  hostProtocol: string;
}

/** One acceptance criterion of the automation block and its evidence state. */
export interface CriterionState {
  checks: string[];
  criterion: number;
  evidence: string[];
  /** Evidence files not tracked at HEAD. */
  evidenceMissing: string[];
  kind: "automatic" | "manual";
}

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
  complete: false,
  hostProtocol: HOST_PROTOCOL,
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

function acceptanceOf(
  context: KitContext,
  status: KitStatus
): CriterionState[] | null {
  const automation = status.scope?.automation;
  if (!automation) {
    return null;
  }
  return automation.acceptance.map((entry) => ({
    checks: [...entry.checks],
    criterion: entry.criterion,
    evidence: [...entry.evidence],
    evidenceMissing: entry.evidence.filter(
      (file) =>
        status.head === null ||
        context.git.show(context.root, status.head, file) === null
    ),
    kind: entry.kind,
  }));
}

/** The status shape the autopilot decision reads. */
export function autopilotStatus(context: KitContext): KitAutopilotStatus {
  const status = readStatus(context);
  const plan = workflowPlanFacade.read(context.root);
  return {
    acceptance: acceptanceOf(context, status),
    authorization: structuredClone(plan?.scope?.authorization ?? null),
    blockedReason: status.scope?.blockedReason ?? null,
    capability: { ...AUTOPILOT_CAPABILITY },
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
