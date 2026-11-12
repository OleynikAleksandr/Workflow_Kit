import {
  type WorkflowPlan,
  type WorkflowTask,
  workflowPlanFacade,
} from "../../workflow-plan/src/workflow-plan-facade.js";
import { type AssignmentRecord, isActiveRecord } from "./assignment-records.js";

/** Why a candidate task cannot be handed out now. */
export type ScheduleBlockCode =
  | "ASSIGNMENT_BARRIER"
  | "ASSIGNMENT_CAPACITY"
  | "ASSIGNMENT_CONFLICT"
  | "DEPENDENCY_PENDING";

export interface BlockedTask {
  /** Task ids the candidate waits for. */
  blockedBy: string[];
  code: ScheduleBlockCode;
  message: string;
  taskId: string;
}

/** Why nothing is scheduled at all; null for an active orchestrated scope. */
export type ScheduleIdleCode = "NOT_ORCHESTRATED" | "SCOPE_NOT_ACTIVE";

export interface AssignmentSchedule {
  /** Task ids of the active assignments of the scope, oldest first. */
  active: string[];
  blocked: BlockedTask[];
  idle: ScheduleIdleCode | null;
  maxWorkers: number;
  orchestrated: boolean;
  /** Candidates that may all be handed out now, in plan order. */
  ready: string[];
}

export type ScheduledAssignment = Pick<
  AssignmentRecord,
  "scopeId" | "status" | "taskId"
>;

const ASSIGNABLE_KINDS = new Set(["docs", "work"]);

function pendingPrerequisites(
  plan: WorkflowPlan,
  task: WorkflowTask
): string[] {
  const status = new Map(plan.tasks.map((item) => [item.id, item.status]));
  const pending = task.dependencies.filter((id) => status.get(id) !== "DONE");
  if (task.kind === "docs") {
    // DOCS closes its round: every work task of the round must be DONE.
    for (const item of plan.tasks) {
      if (
        item.kind === "work" &&
        item.roundId === task.roundId &&
        item.status !== "DONE"
      ) {
        pending.push(item.id);
      }
    }
  }
  return [...new Set(pending)];
}

function blocked(
  task: WorkflowTask,
  code: ScheduleBlockCode,
  blockedBy: string[],
  message: string
): BlockedTask {
  return { blockedBy: [...new Set(blockedBy)], code, message, taskId: task.id };
}

function verdict(
  plan: WorkflowPlan,
  index: number,
  taken: string[],
  maxWorkers: number
): BlockedTask | null {
  const task = plan.tasks[index] as WorkflowTask;
  const pending = pendingPrerequisites(plan, task);
  if (pending.length > 0) {
    return blocked(
      task,
      "DEPENDENCY_PENDING",
      pending,
      `${task.id} waits for unfinished prerequisites: ${pending.join(", ")}.`
    );
  }
  const earlier = plan.tasks
    .slice(0, index)
    .filter((item) => item.status !== "DONE");
  if (task.parallelSafe === true) {
    const byId = new Map(plan.tasks.map((item) => [item.id, item]));
    const sequential = [
      ...earlier.filter((item) => item.parallelSafe !== true),
      ...taken
        .map((id) => byId.get(id))
        .filter(
          (item): item is WorkflowTask =>
            item !== undefined && item.parallelSafe !== true
        ),
    ];
    if (sequential.length > 0) {
      return blocked(
        task,
        "ASSIGNMENT_BARRIER",
        sequential.map((item) => item.id),
        `${task.id} may not overtake an unfinished task that is not parallelSafe.`
      );
    }
    const conflicts = taken.filter(
      (id) => !workflowPlanFacade.compatibleTasks(plan, task.id, id)
    );
    if (conflicts.length > 0) {
      return blocked(
        task,
        "ASSIGNMENT_CONFLICT",
        conflicts,
        `${task.id} is not compatible with the assigned ${conflicts.join(", ")} (paths or dependencies).`
      );
    }
  } else if (earlier.length > 0 || taken.length > 0) {
    return blocked(
      task,
      "ASSIGNMENT_BARRIER",
      [...earlier.map((item) => item.id), ...taken],
      `${task.id} is not parallelSafe: every earlier task must be DONE and no assignment may be active.`
    );
  }
  if (taken.length >= maxWorkers) {
    return blocked(
      task,
      "ASSIGNMENT_CAPACITY",
      taken,
      `All ${maxWorkers} workers are taken.`
    );
  }
  return null;
}

/**
 * Which tasks of an orchestrated scope can be handed out now (spec 5.1, 6).
 * Candidates are TODO `work` and `DOCS` tasks without an active assignment,
 * visited in plan order; each ready candidate counts as taken for the later
 * ones, so the whole `ready` list may be assigned together.
 */
export function scheduleAssignments(
  plan: WorkflowPlan,
  assignments: readonly ScheduledAssignment[]
): AssignmentSchedule {
  const execution = workflowPlanFacade.execution(plan);
  const scope = plan.scope;
  const orchestrated = scope !== null && execution.strategy === "orchestrated";
  const active = scope
    ? [
        ...new Set(
          assignments
            .filter((item) => item.scopeId === scope.id && isActiveRecord(item))
            .map((item) => item.taskId)
        ),
      ]
    : [];
  const schedule: AssignmentSchedule = {
    active,
    blocked: [],
    idle: null,
    maxWorkers: execution.maxWorkers,
    orchestrated,
    ready: [],
  };
  if (!orchestrated) {
    return { ...schedule, idle: "NOT_ORCHESTRATED" };
  }
  if (scope.status !== "ACTIVE") {
    return { ...schedule, idle: "SCOPE_NOT_ACTIVE" };
  }
  const taken = [...active];
  plan.tasks.forEach((task, index) => {
    if (
      task.status !== "TODO" ||
      !ASSIGNABLE_KINDS.has(task.kind) ||
      active.includes(task.id)
    ) {
      return;
    }
    const reason = verdict(plan, index, taken, execution.maxWorkers);
    if (reason) {
      schedule.blocked.push(reason);
    } else {
      schedule.ready.push(task.id);
      taken.push(task.id);
    }
  });
  return schedule;
}
