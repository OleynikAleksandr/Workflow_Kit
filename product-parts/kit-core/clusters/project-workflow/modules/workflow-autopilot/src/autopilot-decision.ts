import type {
  AutopilotDecision,
  AutopilotOrchestration,
  AutopilotProjectStatus,
  AutopilotState,
  AutopilotTurn,
  StopReason,
} from "./autopilot-model.js";

export type {
  AutopilotAssignment,
  AutopilotDecision,
  AutopilotOrchestration,
  AutopilotProjectStatus,
  AutopilotState,
  AutopilotTurn,
  StopReason,
} from "./autopilot-model.js";

export const DEFAULT_MAX_CONTINUES = 40;
const KIT_COMMAND = "scripts/workflow";

const stop = (reason: StopReason, detail: string): AutopilotDecision => ({
  action: "stop",
  detail,
  reason,
});

function continueText(
  task: NonNullable<AutopilotProjectStatus["nextTask"]>
): string {
  if (task.status === "IN_PROGRESS") {
    return `Continue the workflow: task ${task.id} is in progress; implement it and commit with \`${KIT_COMMAND} commit --task ${task.id}\`.`;
  }
  return `Continue the workflow: run \`${KIT_COMMAND} task:start ${task.id}\` if it is not started, then implement it and commit.`;
}

/** Executors are working: the orchestrator has nothing to do until they report. */
const WORKING = new Set(["ASSIGNED", "NEEDS_SETUP", "READY", "RUNNING"]);

/** A stable text of everything the orchestrator acts on. */
function orchestrationKey(orchestration: AutopilotOrchestration): string {
  return JSON.stringify([
    orchestration.assignments
      .map(
        (item) =>
          `${item.id}:${item.status}:${item.sourceCommit ?? ""}:${item.cleanupPending}`
      )
      .sort(),
    orchestration.integration,
    orchestration.readyTasks,
  ]);
}

function integrationText(
  integration: NonNullable<AutopilotOrchestration["integration"]>
): string {
  const id = integration.assignmentId ?? "<assignment>";
  const task = integration.taskId ?? "unknown";
  const next = `\`${KIT_COMMAND} integration:continue --id ${id}\``;
  if (integration.phase === "CONFLICT") {
    return `Continue the orchestration: the integration of task ${task} (assignment ${id}) has merge conflicts; resolve them within the task files, then run ${next}.`;
  }
  if (integration.phase === "CHECKS_FAILED") {
    return `Continue the orchestration: the checks of task ${task} (assignment ${id}) failed on the merged result; fix the cause within the task files, then run ${next}.`;
  }
  return `Continue the orchestration: the integration of task ${task} (assignment ${id}) is unfinished (${integration.phase ?? "unknown phase"}); run ${next}.`;
}

const PAUSED_DETAIL =
  "The workflow is paused; the autopilot waits for the user to continue.";

/**
 * The orchestrator's next step, or null when it has nothing to do now. A
 * pause holds back only the steps that start work: handing out ready tasks
 * and a QUALITY task that has not started.
 */
function orchestratorStep(
  status: AutopilotProjectStatus,
  orchestration: AutopilotOrchestration
): { taskId: string; text: string } | null {
  const paused = status.paused === true;
  const { assignments, integration, readyTasks } = orchestration;
  if (integration) {
    return {
      taskId: integration.taskId ?? "",
      text: integrationText(integration),
    };
  }
  const done = assignments.find(
    (item) => item.status === "READY_FOR_INTEGRATION"
  );
  if (done) {
    return {
      taskId: done.taskId,
      text: `Continue the orchestration: assignment ${done.id} of task ${done.taskId} is READY_FOR_INTEGRATION; verify the executor's commit and run \`${KIT_COMMAND} integration:start --id ${done.id} --source ${done.sourceCommit ?? "<sha>"}\`.`,
    };
  }
  const task = status.nextTask;
  // QUALITY and a started delivery task run in main, by the orchestrator.
  if (
    task &&
    ((task.kind === "quality" && !(paused && task.status === "TODO")) ||
      (task.kind === "delivery" && task.status === "IN_PROGRESS"))
  ) {
    return { taskId: task.id, text: continueText(task) };
  }
  const [first] = readyTasks;
  if (first && !paused) {
    return {
      taskId: first,
      text: `Continue the orchestration: ${readyTasks.length === 1 ? `task ${first} can` : `tasks ${readyTasks.join(", ")} can`} be handed out; for each run \`${KIT_COMMAND} assignment:create --task <ID>\` and start an executor subagent in its own worktree with the brief it prints.`,
    };
  }
  const cleanup = assignments.find((item) => item.cleanupPending);
  if (cleanup) {
    return {
      taskId: cleanup.taskId,
      text: `Continue the orchestration: the cleanup of assignment ${cleanup.id} is pending; run \`${KIT_COMMAND} assignment:cleanup --id ${cleanup.id}\`.`,
    };
  }
  return null;
}

/** The orchestrator of an ACTIVE orchestrated scope (spec 10.3). */
function decideOrchestration(
  state: AutopilotState,
  status: AutopilotProjectStatus,
  turn: AutopilotTurn,
  orchestration: AutopilotOrchestration
): AutopilotDecision {
  const key = orchestrationKey(orchestration);
  const keyed = (decision: AutopilotDecision): AutopilotDecision => ({
    ...decision,
    orchestrationKey: key,
  });
  const step = orchestratorStep(status, orchestration);
  if (!step) {
    if (status.paused) {
      return keyed(stop("paused", PAUSED_DETAIL));
    }
    const working = orchestration.assignments.filter((item) =>
      WORKING.has(item.status)
    );
    if (working.length > 0) {
      return keyed(
        stop(
          "waiting-for-executors",
          `Executors are working on ${working.map((item) => `${item.taskId} (${item.status})`).join(", ")}; the orchestrator waits for their reports.`
        )
      );
    }
    const task = status.nextTask;
    return keyed(
      task?.kind === "delivery" && task.status === "TODO"
        ? stop(
            "delivery-confirmation",
            `Task ${task.id} is a delivery task and needs the user's confirmation.`
          )
        : stop("blocked", "No task can be handed out now.")
    );
  }
  if (
    status.revision === turn.before.revision &&
    status.head === turn.before.head &&
    state.orchestrationKey === key
  ) {
    return keyed(
      stop(
        "no-progress",
        "The turn changed neither the plan, HEAD nor the assignments."
      )
    );
  }
  if (state.continues >= state.maxContinues) {
    return keyed(
      stop(
        "limit",
        `The limit of ${state.maxContinues} consecutive continues is reached.`
      )
    );
  }
  return keyed({ action: "continue", ...step });
}

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
  if (task.kind === "delivery" && task.status === "TODO") {
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
  return { action: "continue", taskId: task.id, text: continueText(task) };
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

/** The user message the host sends: the instruction plus a fresh packet. */
export function autopilotMessage(
  decision: Extract<AutopilotDecision, { action: "continue" }>,
  packet: string | null
): string {
  return packet
    ? `${decision.text}\n\n<workflow-recovery>\n${packet.trimEnd()}\n</workflow-recovery>\n`
    : `${decision.text}\n`;
}
