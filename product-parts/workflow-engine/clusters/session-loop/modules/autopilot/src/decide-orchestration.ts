// The orchestrated branch of the autopilot decision (spec 10.3), split from decide.ts (M39 T005)
// with the helpers both branches share.
import type { AutopilotDecision, AutopilotOrchestration, AutopilotProjectStatus, AutopilotState, AutopilotTurn, StopReason } from './decide-model.ts';

export const KIT_COMMAND = "scripts/workflow";

export const stop = (reason: StopReason, detail: string): AutopilotDecision => ({
  action: "stop",
  detail,
  reason,
});

export function continueText(
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

export const PAUSED_DETAIL =
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
export function decideOrchestration(
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
