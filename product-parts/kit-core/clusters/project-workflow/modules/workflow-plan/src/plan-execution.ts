import { ensure } from "../../workflow-platform/src/workflow-platform-facade.js";
import type {
  ExecutionStrategy,
  WorkflowExecution,
  WorkflowPlan,
  WorkflowScope,
  WorkflowTask,
} from "./plan-model.js";

/** Execution block accepted by scope:create; absent means `sequential`. */
export interface ExecutionInput {
  maxWorkers?: number;
  ownerSession?: string | null;
  strategy: ExecutionStrategy;
}

export const DEFAULT_MAX_WORKERS = 3;
export const MAX_WORKERS_LIMIT = 16;
export const EXECUTION_STRATEGIES: readonly ExecutionStrategy[] = [
  "sequential",
  "orchestrated",
];
const STRATEGIES = new Set<string>(EXECUTION_STRATEGIES);
const GLOB_PATTERN = /[*?[\]{}]/u;

const SEQUENTIAL: WorkflowExecution = {
  maxWorkers: DEFAULT_MAX_WORKERS,
  ownerSession: null,
  strategy: "sequential",
};

/** Builds the stored execution block from input, filling the defaults. */
export function normalizeExecution(
  input: ExecutionInput | null | undefined
): WorkflowExecution | undefined {
  if (input === undefined || input === null) {
    return;
  }
  ensure(
    typeof input === "object" && !Array.isArray(input),
    "PLAN_EXECUTION",
    "execution must be an object with a strategy.",
    { field: "execution" }
  );
  return {
    maxWorkers: input.maxWorkers ?? DEFAULT_MAX_WORKERS,
    ownerSession: input.ownerSession ?? null,
    strategy: input.strategy,
  };
}

/** The effective execution of a scope; a scope without the block is sequential. */
export function scopeExecution(
  scope: Pick<WorkflowScope, "execution"> | null
): WorkflowExecution {
  return structuredClone(scope?.execution ?? SEQUENTIAL);
}

function validateExecution(execution: WorkflowExecution | undefined): void {
  if (execution === undefined) {
    return;
  }
  ensure(
    execution !== null && typeof execution === "object",
    "PLAN_EXECUTION",
    "scope.execution must be an object.",
    { field: "execution" }
  );
  ensure(
    STRATEGIES.has(execution.strategy),
    "PLAN_EXECUTION",
    "execution.strategy must be sequential or orchestrated.",
    { field: "execution.strategy" }
  );
  ensure(
    Number.isSafeInteger(execution.maxWorkers) &&
      execution.maxWorkers >= 1 &&
      execution.maxWorkers <= MAX_WORKERS_LIMIT,
    "PLAN_EXECUTION",
    `execution.maxWorkers must be an integer from 1 to ${MAX_WORKERS_LIMIT}.`,
    { field: "execution.maxWorkers" }
  );
  ensure(
    execution.ownerSession === null ||
      (typeof execution.ownerSession === "string" &&
        execution.ownerSession.trim() !== ""),
    "PLAN_EXECUTION",
    "execution.ownerSession must be a non-empty string or null.",
    { field: "execution.ownerSession" }
  );
}

/** A concrete path names one file or directory: no glob, not `.`, no trailing `/`. */
function isConcretePath(file: unknown): boolean {
  return (
    typeof file === "string" &&
    file.trim() !== "" &&
    file !== "." &&
    !file.endsWith("/") &&
    !GLOB_PATTERN.test(file)
  );
}

function validateParallelLabel(task: WorkflowTask): void {
  if (task.parallelSafe === undefined) {
    return;
  }
  ensure(
    typeof task.parallelSafe === "boolean",
    "PLAN_SCHEMA",
    `parallelSafe must be boolean: ${task.id}`,
    { field: `tasks.${task.id}.parallelSafe` }
  );
  if (!task.parallelSafe) {
    return;
  }
  ensure(
    task.kind === "work",
    "PARALLEL_KIND",
    `Only work tasks may be parallelSafe: ${task.id}`,
    { field: `tasks.${task.id}.parallelSafe` }
  );
  const files: unknown[] = Array.isArray(task.files) ? task.files : [];
  const vague = files.filter((file) => !isConcretePath(file));
  ensure(
    files.length > 0 && vague.length === 0,
    "PARALLEL_FILES",
    `A parallelSafe task lists concrete paths only (no glob, no \`.\`, no trailing \`/\`): ${task.id}`,
    { field: `tasks.${task.id}.files`, paths: vague, taskId: task.id },
    "Name every file of the task or set parallelSafe to false."
  );
}

/**
 * Validates the execution block of the scope and the parallel labels of the
 * tasks. Runs before the generic path checks so vague paths of a
 * parallelSafe task report PARALLEL_FILES.
 */
export function validatePlanExecution(plan: WorkflowPlan): void {
  validateExecution(plan.scope?.execution);
  for (const task of plan.tasks) {
    validateParallelLabel(task);
  }
}

function ancestors(
  byId: Map<string, WorkflowTask>,
  taskId: string
): Set<string> {
  const seen = new Set<string>();
  const pending = [...(byId.get(taskId)?.dependencies ?? [])];
  while (pending.length > 0) {
    const id = pending.pop() as string;
    if (!seen.has(id)) {
      seen.add(id);
      pending.push(...(byId.get(id)?.dependencies ?? []));
    }
  }
  return seen;
}

function pathsOverlap(first: string, second: string): boolean {
  return (
    first === second ||
    first.startsWith(`${second}/`) ||
    second.startsWith(`${first}/`)
  );
}

function compatible(
  byId: Map<string, WorkflowTask>,
  first: WorkflowTask,
  second: WorkflowTask
): boolean {
  return (
    first.id !== second.id &&
    first.kind === "work" &&
    second.kind === "work" &&
    first.parallelSafe === true &&
    second.parallelSafe === true &&
    !ancestors(byId, first.id).has(second.id) &&
    !ancestors(byId, second.id).has(first.id) &&
    !first.files.some((file) =>
      second.files.some((other) => pathsOverlap(file, other))
    )
  );
}

/**
 * Two tasks are compatible when both are parallelSafe work tasks, neither
 * depends on the other even transitively, and no path of one equals or is
 * nested in a path of the other.
 */
export function compatibleTasks(
  plan: Pick<WorkflowPlan, "tasks">,
  firstId: string,
  secondId: string
): boolean {
  const byId = new Map(plan.tasks.map((task) => [task.id, task]));
  const first = byId.get(firstId);
  const second = byId.get(secondId);
  return Boolean(first && second && compatible(byId, first, second));
}

/** True when at least one pair of tasks of the plan is compatible. */
export function hasParallelWork(plan: Pick<WorkflowPlan, "tasks">): boolean {
  const byId = new Map(plan.tasks.map((task) => [task.id, task]));
  const labelled = plan.tasks.filter(
    (task) => task.kind === "work" && task.parallelSafe === true
  );
  return labelled.some((first, index) =>
    labelled.slice(index + 1).some((second) => compatible(byId, first, second))
  );
}
