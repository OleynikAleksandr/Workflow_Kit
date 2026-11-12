import {
  type WorkflowPlan,
  type WorkflowTask,
  workflowPlanFacade,
} from "../../workflow-plan/src/workflow-plan-facade.js";
import {
  ensure,
  WorkflowError,
} from "../../workflow-platform/src/workflow-platform-facade.js";

/** Launchers of the Kit; an executor never changes them. */
const LAUNCHERS = new Set([
  "scripts/workflow",
  "scripts/workflow.cmd",
  "scripts/workflow.ps1",
]);
/** Kit configuration and plans; the plan file itself is checked separately. */
const CONTRACT_PREFIXES = [".harness/workflow/", ".harness/plans/"];

/** One commit of an executor worktree, compared with its committed plan. */
export interface ExecutorChange {
  /** Plan text of the candidate commit. */
  candidatePlan: string;
  /** Plan text at HEAD of the worktree (the committed executor plan). */
  headPlan: string | null;
  /** Every path the commit changes, the plan included. */
  paths: readonly string[];
  planPath: string;
}

/** A path is in scope when it equals or is nested (by segment) in a task file entry. */
function inTaskScope(files: readonly string[], file: string): boolean {
  return files.some((entry) => file === entry || file.startsWith(`${entry}/`));
}

function parse(text: string | null): WorkflowPlan | null {
  if (text === null) {
    return null;
  }
  try {
    return workflowPlanFacade.parse(text);
  } catch {
    return null;
  }
}

function contractError(message: string, paths: string[]): WorkflowError {
  return new WorkflowError(
    "ASSIGNMENT_CONTRACT",
    message,
    { paths },
    "Revert these changes; the executor contract (plan, Kit configuration, launchers) is fixed by the assignment."
  );
}

/**
 * The plan the Kit's own transitions make from the committed executor plan:
 * the single task started, its files extended and completed (with the round
 * digest of a DOCS task). Null when the candidate cannot be such a plan.
 */
function kitTransition(
  head: WorkflowPlan,
  candidate: WorkflowPlan,
  task: WorkflowTask
): WorkflowPlan | null {
  const own = candidate.tasks.find((item) => item.id === task.id);
  if (
    candidate.tasks.length !== 1 ||
    !own ||
    own.files.length < task.files.length ||
    task.files.some((file, index) => own.files[index] !== file)
  ) {
    return null;
  }
  try {
    const started = structuredClone(
      workflowPlanFacade.startTask(head, task.id, task.confirmation)
    );
    workflowPlanFacade.task(started, task.id).files = [...own.files];
    const digest =
      candidate.rounds.find((round) => round.id === task.roundId)?.digest ??
      null;
    return workflowPlanFacade.completeTask(started, task.id, digest);
  } catch {
    return null;
  }
}

/**
 * Refuses a commit of an executor worktree that breaks the assignment
 * contract (spec 5.3), in this order: Kit configuration, launchers and other
 * plans (`ASSIGNMENT_CONTRACT`), paths outside the task files
 * (`ASSIGNMENT_SCOPE`), and a plan other than the Kit's own transitions of
 * the single task (`ASSIGNMENT_CONTRACT`).
 */
export function checkExecutorChange(change: ExecutorChange): void {
  const head = parse(change.headPlan);
  const task = head?.tasks.length === 1 ? head.tasks[0] : undefined;
  if (!(head && task)) {
    throw contractError("HEAD has no executor plan with one task.", [
      change.planPath,
    ]);
  }
  const files = change.paths.filter((file) => file !== change.planPath);
  const contract = files.filter(
    (file) =>
      LAUNCHERS.has(file) ||
      CONTRACT_PREFIXES.some((prefix) => file.startsWith(prefix))
  );
  if (contract.length > 0) {
    throw contractError(
      `An executor never changes the Kit configuration, the launchers or the plans: ${contract.join(", ")}.`,
      contract
    );
  }
  const outside = files.filter((file) => !inTaskScope(task.files, file));
  ensure(
    outside.length === 0,
    "ASSIGNMENT_SCOPE",
    `These paths are outside the files of ${task.id}: ${outside.join(", ")}.`,
    { files: task.files, paths: outside },
    `Change only the files of ${task.id} or paths nested in them; commit a subset with \`scripts/workflow commit --task ${task.id} --files <json|a,b>\`.`
  );
  if (change.paths.includes(change.planPath)) {
    const candidate = parse(change.candidatePlan);
    const expected = candidate && kitTransition(head, candidate, task);
    const added = candidate
      ? (candidate.tasks[0]?.files ?? []).slice(task.files.length)
      : [];
    if (
      !(candidate && expected) ||
      workflowPlanFacade.render(expected) !==
        workflowPlanFacade.render(candidate) ||
      added.some((file) => !inTaskScope(task.files, file))
    ) {
      throw contractError(
        `The plan may change only through the Kit's own transitions of ${task.id}.`,
        [change.planPath]
      );
    }
  }
}
