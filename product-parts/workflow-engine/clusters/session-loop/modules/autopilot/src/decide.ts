// Autopilot decision ported from Harness (core-runtime/project-workflow/workflow-autopilot,
// autopilot-decision.ts): whether the host sends the next turn after a turn ended, from the
// Kit `autopilot:status`. Pure; the texts to the agent stay in English like in Harness.
import type { AutopilotDecision, AutopilotProjectStatus, AutopilotState, AutopilotTurn } from './decide-model.ts';
import { KIT_COMMAND, PAUSED_DETAIL, continueText, decideOrchestration, grantedDelivery, liveGrant, stop } from './decide-orchestration.ts';

export type {
  AutopilotAssignment,
  AutopilotAuthority,
  AutopilotDecision,
  AutopilotOrchestration,
  AutopilotProjectStatus,
  AutopilotState,
  AutopilotTurn,
  StopReason,
} from './decide-model.ts';

export const DEFAULT_MAX_CONTINUES = 40;

/** The stops shared by both strategies, or null when the scope can go on. */
function commonStop(
  state: AutopilotState,
  status: AutopilotProjectStatus,
  turn: AutopilotTurn
): AutopilotDecision | null {
  if (!state.enabled) {
    return stop("disabled", "Autopilot is off for this session.");
  }
  if (turn.outcome !== "completed") {
    return stop(
      "turn-error",
      turn.outcome === "cancelled"
        ? "The turn was cancelled."
        : "The turn ended with a provider error."
    );
  }
  if (turn.userMessage) {
    return stop(
      "user-message",
      "The user wrote a message; the autopilot yields the turn."
    );
  }
  // Sequential: the task in progress finishes, the next one does not start.
  if (
    status.paused &&
    !status.orchestration &&
    status.nextTask?.status !== "IN_PROGRESS"
  ) {
    return stop("paused", PAUSED_DETAIL);
  }
  if (status.proposalPending) {
    return stop(
      "waiting-for-mode-choice",
      "The plan proposal waits for the user's execution mode choice."
    );
  }
  if (status.scope === "NONE") {
    return stop("no-scope", "There is no active scope.");
  }
  if (status.scope === "BLOCKED") {
    return stop("blocked", status.blockedReason ?? "The scope is blocked.");
  }
  if (status.transactionPending) {
    return stop(
      "transaction-pending",
      `A commit transaction or check failed; run \`${KIT_COMMAND} repair\` or fix the check.`
    );
  }
  const grant = liveGrant(status);
  if (status.delivery === "READY_FOR_ACCEPTANCE" && grant?.accept) {
    return stop(
      "host-transition",
      `Autopilot run ${grant.runId} accepts the result automatically from the evidence; the host runs the acceptance.`
    );
  }
  if (status.delivery === "ACCEPTED" && grant?.close) {
    return stop(
      "host-transition",
      `Autopilot run ${grant.runId} closes the scope; the host runs the close and the publication.`
    );
  }
  if (
    status.delivery === "READY_FOR_ACCEPTANCE" ||
    status.delivery === "ACCEPTED"
  ) {
    return stop(
      "ready-for-acceptance",
      status.delivery === "ACCEPTED"
        ? "The result is accepted; the user decides when to close the scope."
        : "All tasks are done; the user accepts the result."
    );
  }
  return null;
}

/**
 * Decides whether the host sends the next turn. Pure: the same inputs give
 * the same decision. Checks run from the most to the least specific reason.
 */
export function decideAutopilot(
  state: AutopilotState,
  status: AutopilotProjectStatus,
  turn: AutopilotTurn
): AutopilotDecision {
  const stopped = commonStop(state, status, turn);
  if (stopped) {
    return stopped;
  }
  if (status.orchestration) {
    return decideOrchestration(state, status, turn, status.orchestration);
  }
  const task = status.nextTask;
  if (!task) {
    return stop("blocked", "No task is ready to start.");
  }
  const granted =
    task.kind === "delivery" && task.status === "TODO"
      ? grantedDelivery(status, task)
      : null;
  if (task.kind === "delivery" && task.status === "TODO" && !granted) {
    return stop(
      "delivery-confirmation",
      `Task ${task.id} is a delivery task and needs the user's confirmation.`
    );
  }
  if (
    status.revision === turn.before.revision &&
    status.head === turn.before.head
  ) {
    return stop("no-progress", "The turn changed neither the plan nor HEAD.");
  }
  if (state.continues >= state.maxContinues) {
    return stop(
      "limit",
      `The limit of ${state.maxContinues} consecutive continues is reached.`
    );
  }
  return granted ?? { action: "continue", taskId: task.id, text: continueText(task) };
}

/**
 * State after a decision: a continue counts, a user message resets; the
 * orchestration key of the decision is kept for the next progress check.
 */
export function nextAutopilotState(
  state: AutopilotState,
  decision: AutopilotDecision
): AutopilotState {
  const orchestrationKey = decision.orchestrationKey ?? null;
  if (decision.action === "continue") {
    return { ...state, continues: state.continues + 1, orchestrationKey };
  }
  return decision.reason === "user-message"
    ? { ...state, continues: 0, orchestrationKey }
    : { ...state, orchestrationKey };
}
