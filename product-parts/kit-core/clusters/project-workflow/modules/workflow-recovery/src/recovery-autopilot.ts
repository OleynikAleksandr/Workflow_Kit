// The `next` texts under an autopilot grant (spec M39): a transition the run
// already authorized is not asked again, while the agent never performs the
// host-only steps itself (grant, revoke, automatic accept and close,
// publication). Without a live grant every text keeps its manual barrier.
// In the `host` decisions mode (M40) no text gives the agent a manual form
// of a user decision: it names the decision and where the user takes it.
import {
  type AutopilotGrant,
  type WorkflowPlan,
  type WorkflowTask,
  workflowPlanFacade,
} from "../../workflow-plan/src/workflow-plan-facade.js";
import { KIT_COMMAND } from "./recovery-model.js";

const TIDY = `first tidy the paths outside commits (see changes) — delete your temporary files, commit documents with \`${KIT_COMMAND} docs:commit\`; the next step needs a clean tree`;

/** The live grant of the scope, or null (none, revoked, or the reviewed plan changed). */
export function liveRun(plan: WorkflowPlan): AutopilotGrant | null {
  const grant = plan.scope?.authorization;
  if (!grant) {
    return null;
  }
  try {
    return workflowPlanFacade.grant(plan, grant.runId);
  } catch {
    return null;
  }
}

function granted(grant: AutopilotGrant, taskId: string): boolean {
  return grant.delivery.some((entry) => entry.taskId === taskId);
}

const DECIDE = "never pass the user's words yourself";

/** The `host` mode texts of a TODO delivery task. */
function hostDeliveryStep(grant: AutopilotGrant | null, task: WorkflowTask): string {
  return grant && granted(grant, task.id)
    ? `Next task ${task.id} is delivery, covered by autopilot run ${grant.runId}: \`${KIT_COMMAND} task:start ${task.id}\` without flags (Workflow Kit records the confirmation of the run itself). Do not ask the user again; perform only the reviewed effects of the task.`
    : `Next task ${task.id} is delivery: starting it is the user's decision. Tell the user that the delivery waits for the confirmation in the Workflow Kit panel and end the turn; Workflow Kit starts the task after the confirmation and tells you. If the user confirmed in this chat, run \`wfk decision confirm-delivery --task ${task.id}\`; ${DECIDE}.`;
}

/** The `host` mode texts of READY_FOR_ACCEPTANCE and ACCEPTED. */
function hostCompletionStep(plan: WorkflowPlan, untidy: boolean): string {
  const grant = liveRun(plan);
  const tidy = untidy ? `${TIDY}. Then ` : "";
  if (plan.scope?.delivery === "READY_FOR_ACCEPTANCE") {
    if (grant?.accept) {
      return `Scope is READY_FOR_ACCEPTANCE: ${tidy}end the turn. Autopilot run ${grant.runId} accepts the result automatically from the recorded evidence and closes the scope; the Workflow Kit app runs these steps. Never accept or close the scope yourself.`;
    }
    const after = grant
      ? ` The result has manual criteria; after the acceptance autopilot run ${grant.runId} closes and publishes the scope.`
      : "";
    return `Scope is READY_FOR_ACCEPTANCE: ${tidy}report the result and end the turn. Acceptance is the user's decision: the user accepts in the Workflow Kit panel or reports defects.${after} If the user accepts in this chat, run \`wfk decision accept\`; ${DECIDE}.`;
  }
  if (grant?.close) {
    return `Scope is ACCEPTED: ${tidy}end the turn. Autopilot run ${grant.runId} closes the scope and then publishes it; the Workflow Kit app runs these steps. Never close the scope or push yourself.`;
  }
  const clean = untidy
    ? " Closing needs a clean tree: tidy the paths outside commits (see changes)."
    : "";
  return `Scope is ACCEPTED: closing it is the user's separate decision in the Workflow Kit panel. If the user tells you in this chat to close the plan, run \`wfk decision close\`; ${DECIDE}.${clean}`;
}

/** BLOCKED: who removes the block. */
export function blockedStep(reason: string | null, host: boolean): string {
  const why = reason ?? "no reason recorded";
  return host
    ? `BLOCKED: ${why}. Only discuss and diagnose. Removing the block is the user's decision: it waits on a card in the Workflow Kit panel. If the user decides in this chat, run \`wfk decision unblock\`; ${DECIDE}.`
    : `BLOCKED: ${why}. Resolve it with the user, then unblock.`;
}

/** A TODO delivery task: the run's advance confirmation or the user's. */
export function deliveryStep(
  plan: WorkflowPlan,
  task: WorkflowTask,
  host = false
): string {
  const grant = liveRun(plan);
  if (host) {
    return hostDeliveryStep(grant, task);
  }
  return grant && granted(grant, task.id)
    ? `Next task ${task.id} is delivery, confirmed in advance by autopilot run ${grant.runId}: \`${KIT_COMMAND} task:start ${task.id} --autopilot-run ${grant.runId}\`. Do not ask the user again; perform only the reviewed effects of the task.`
    : `Next task ${task.id} is delivery: ask the user to confirm it, then \`${KIT_COMMAND} task:start ${task.id} --confirmed "<user confirmation>"\`.`;
}

/** READY_FOR_ACCEPTANCE and ACCEPTED: who takes the next step. */
export function completionStep(
  plan: WorkflowPlan,
  untidy: boolean,
  host = false
): string {
  if (host) {
    return hostCompletionStep(plan, untidy);
  }
  const grant = liveRun(plan);
  const scope = plan.scope;
  const tidy = untidy ? `${TIDY}. Then ` : "";
  if (scope?.delivery === "READY_FOR_ACCEPTANCE") {
    if (grant?.accept) {
      return `Scope is READY_FOR_ACCEPTANCE: ${tidy}end the turn. Autopilot run ${grant.runId} accepts the result automatically from the recorded evidence and closes the scope; the Workflow Kit app runs these steps. Never run \`accept\` or \`close\` yourself.`;
    }
    if (grant) {
      return `Scope is READY_FOR_ACCEPTANCE: ${tidy}ask the user to accept the result (it has manual criteria) or report defects. After the user's \`accept\`, autopilot run ${grant.runId} closes and publishes the scope.`;
    }
    return untidy
      ? `Scope is READY_FOR_ACCEPTANCE: ${TIDY.replace("the next step needs a clean tree", "`close` needs a clean tree")}. Then ask the user to accept the result or report defects.`
      : "Scope is READY_FOR_ACCEPTANCE: ask the user to accept the result or report defects.";
  }
  if (grant?.close) {
    return `Scope is ACCEPTED: ${tidy}end the turn. Autopilot run ${grant.runId} closes the scope and then publishes it; the Workflow Kit app runs these steps. Never run \`close\` or \`git push\` yourself.`;
  }
  return untidy
    ? "Scope is ACCEPTED: the user decides when to close it. `close` needs a clean tree: tidy the paths outside commits (see changes)."
    : "Scope is ACCEPTED: the user decides when to close it.";
}

/** After a close by an autopilot run the publication still follows. */
export function closedByRunStep(plan: WorkflowPlan): string | null {
  const closed = plan.lastClosed;
  if (!closed?.autopilotRun || plan.scope) {
    return null;
  }
  return `Scope ${closed.scopeId} was closed by autopilot run ${closed.autopilotRun}; the Workflow Kit app publishes it to the reviewed upstream. Do not push yourself. Start new work only when the user gives a new task.`;
}

/** The rule line under `next` while a run is live: ending the turn hands control to Kit. */
export function runRule(plan: WorkflowPlan, host = false): string | null {
  const grant = liveRun(plan);
  if (grant && host) {
    return `Autopilot run ${grant.runId} (${grant.mode}): report the result of the turn briefly and end it; the Workflow Kit app continues the run — do not ask whether to continue. Only the app grants and revokes the run, accepts, closes and publishes; never run \`autopilot:*\` and never accept or close the scope yourself.`;
  }
  return grant
    ? `Autopilot run ${grant.runId} (${grant.mode}): report the result of the turn briefly and end it; the Workflow Kit app continues the run — do not ask whether to continue. Only the app grants, revokes, accepts and closes automatically and publishes; never run \`autopilot:*\`, \`accept --autopilot-run\` or \`close --autopilot-run\`.`
    : null;
}
