import {
  type AssignmentCleanup,
  type AssignmentStatus,
  workflowAssignmentFacade,
} from "../../workflow-assignment/src/workflow-assignment-facade.js";
import {
  type ExecutionModeOption,
  workflowExecutionModeFacade,
} from "../../workflow-execution-mode/src/workflow-execution-mode-facade.js";
import {
  type ExecutionStrategy,
  PLAN_PATH,
  type ScopeAutomation,
  type ScopeProposalRef,
  type WorkflowPlan,
  type WorkflowTask,
  workflowPlanFacade,
} from "../../workflow-plan/src/workflow-plan-facade.js";
import { workflowPlatformFacade } from "../../workflow-platform/src/workflow-platform-facade.js";
import {
  type DriftReport,
  workflowQualityFacade,
} from "../../workflow-quality/src/workflow-quality-facade.js";
import type { TransactionSummary } from "../../workflow-recovery/src/workflow-recovery-facade.js";
import { INTEGRATION_FILE } from "./kit-assignment.js";
import type { KitContext } from "./kit-context.js";
import { type DecisionView, pendingDecisions } from "./kit-decisions.js";
import { executorAssignment } from "./kit-executor.js";
import { readPause } from "./kit-pause.js";

export interface TaskBrief {
  id: string;
  kind: WorkflowTask["kind"];
  roundId: string;
  status: WorkflowTask["status"];
  title: string;
}

/** One task of the plan, in plan order (spec 10.1). */
export interface StatusTask extends TaskBrief {
  dependencies: string[];
  parallelSafe: boolean;
}

/** One assignment record of the current scope in the main checkout. */
export interface StatusAssignment {
  branch: string | null;
  cleanup: AssignmentCleanup | null;
  id: string;
  integrationCommit: string | null;
  sourceCommit: string | null;
  status: AssignmentStatus;
  taskId: string;
  worktree: string | null;
}

/**
 * The integration journal `.harness/workflow/local/integration.json`; a
 * field the journal does not hold as a string is `null`.
 */
export interface StatusIntegration {
  assignmentId: string | null;
  phase: string | null;
  taskId: string | null;
}

export interface KitStatus {
  /** Assignments of the current scope (main checkout only; empty elsewhere). */
  assignments: StatusAssignment[];
  changes: string[];
  currentTask: TaskBrief | null;
  /**
   * Pending user decisions of a `decisions: host` project (M40), each
   * recomputed from the current state; empty in the `agent` mode.
   */
  decisions: DecisionView[];
  /** Who records user decisions: `host` (only the app) or `agent` (Kit 2.3 forms). */
  decisionsMode: "agent" | "host";
  /** The scope execution block; null without a scope. */
  execution: {
    maxWorkers: number;
    ownerSession: string | null;
    strategy: ExecutionStrategy;
  } | null;
  /** The assignment of this checkout when it is an executor worktree. */
  executor: { assignmentId: string; taskId: string } | null;
  head: string | null;
  installed: boolean;
  /** The unfinished integration of the main checkout, or null. */
  integration: StatusIntegration | null;
  nextTask: TaskBrief | null;
  /** The user's pause (`pause:set`) of this checkout. */
  paused: boolean;
  progress: { done: number; total: number };
  project: { id: string; name: string } | null;
  quality: { drift: DriftReport; stacks: string[]; status: string };
  revision: number;
  rounds: { id: string; kind: string; status: string }[];
  scope: {
    /** The M39 automation block; null on a legacy (manual) plan. */
    automation: ScopeAutomation | null;
    blockedReason: string | null;
    delivery: string;
    id: string;
    objective: string;
    /** The reviewed proposal the scope was chosen from; null otherwise. */
    proposal: ScopeProposalRef | null;
    status: string;
  } | null;
  /** The stored scope proposal (mode choice), without the plan input. */
  scopeProposal: {
    generation: number;
    hasParallelWork: boolean;
    options: ExecutionModeOption[];
    recommended: ExecutionStrategy;
    refining: boolean;
  } | null;
  /** Every task of the plan in plan order. */
  tasks: StatusTask[];
  transaction: TransactionSummary | null;
}

export interface ValidationReport {
  errors: { code: string; message: string }[];
  ok: boolean;
}

function brief(task: WorkflowTask | null | undefined): TaskBrief | null {
  return task
    ? {
        id: task.id,
        kind: task.kind,
        roundId: task.roundId,
        status: task.status,
        title: task.title,
      }
    : null;
}

function statusTask(task: WorkflowTask): StatusTask {
  return {
    dependencies: [...task.dependencies],
    id: task.id,
    kind: task.kind,
    parallelSafe: task.parallelSafe === true,
    roundId: task.roundId,
    status: task.status,
    title: task.title,
  };
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Reads the integration journal defensively: its writer owns the format. */
function integrationOf(context: KitContext): StatusIntegration | null {
  const text = workflowPlatformFacade.readTextIfExists(
    context.git.localPath(context.root, INTEGRATION_FILE)
  );
  if (text === null) {
    return null;
  }
  let journal: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(text);
    journal =
      parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : {};
  } catch {
    // An unreadable journal still blocks writes; its fields stay unknown.
  }
  return {
    assignmentId: textOrNull(journal.assignmentId),
    phase: textOrNull(journal.phase),
    taskId: textOrNull(journal.taskId),
  };
}

function assignmentsOf(
  context: KitContext,
  plan: WorkflowPlan | null
): StatusAssignment[] {
  const scopeId = plan?.scope?.id;
  if (!scopeId) {
    return [];
  }
  return workflowAssignmentFacade
    .list(context.root)
    .filter((record) => record.scopeId === scopeId)
    .map((record) => ({
      branch: record.branch,
      cleanup: record.cleanup,
      id: record.id,
      integrationCommit: record.integrationCommit,
      sourceCommit: record.sourceCommit,
      status: record.status,
      taskId: record.taskId,
      worktree: record.worktree,
    }));
}

function proposalOf(context: KitContext): KitStatus["scopeProposal"] {
  const proposal = workflowExecutionModeFacade.readProposal(context.root);
  return proposal
    ? {
        generation: proposal.generation,
        hasParallelWork: proposal.hasParallelWork,
        options: [...proposal.options],
        recommended: proposal.recommended,
        refining: proposal.refining,
      }
    : null;
}

function transactionOf(context: KitContext): TransactionSummary | null {
  const journal = context.git.transactions.journal(context.root);
  return journal
    ? {
        error: journal.error,
        id: journal.id,
        phase: journal.phase,
        role: journal.role,
        taskId: journal.taskId,
      }
    : null;
}

/** Project status for the CLI, Core and the interface. */
export function readStatus(context: KitContext): KitStatus {
  const plan = workflowPlanFacade.read(context.root);
  const config = workflowQualityFacade.readConfig(context.root);
  const repository = context.git.isRepository(context.root);
  const changes = repository
    ? context.git
        .changes(context.root)
        .all.filter((file) => !context.git.isKitManagedPath(file))
    : [];
  const tasks = plan?.tasks ?? [];
  const own = executorAssignment(context);
  return {
    assignments: own ? [] : assignmentsOf(context, plan),
    changes,
    currentTask: brief(tasks.find((task) => task.id === plan?.currentTaskId)),
    decisions: plan ? pendingDecisions(context) : [],
    decisionsMode: config.decisions === "host" ? "host" : "agent",
    execution: plan?.scope ? workflowPlanFacade.execution(plan) : null,
    executor: own ? { assignmentId: own.id, taskId: own.taskId } : null,
    head: repository ? context.git.head(context.root) : null,
    installed: plan !== null,
    integration: own ? null : integrationOf(context),
    nextTask: plan ? brief(workflowPlanFacade.nextTask(plan)) : null,
    paused: readPause(context).paused,
    progress: {
      done: tasks.filter((task) => task.status === "DONE").length,
      total: tasks.length,
    },
    project: plan ? { id: plan.projectId, name: plan.projectName } : null,
    quality: {
      drift: workflowQualityFacade.drift(context.root, config),
      stacks: config.quality.stacks,
      status: config.quality.status,
    },
    revision: plan?.revision ?? 0,
    rounds: (plan?.rounds ?? []).map(({ id, kind, status }) => ({
      id,
      kind,
      status,
    })),
    scope: plan?.scope
      ? {
          automation: structuredClone(plan.scope.automation ?? null),
          blockedReason: plan.scope.blockedReason,
          delivery: plan.scope.delivery,
          id: plan.scope.id,
          objective: plan.scope.objective,
          proposal: structuredClone(plan.scope.proposal ?? null),
          status: plan.scope.status,
        }
      : null,
    scopeProposal: proposalOf(context),
    tasks: tasks.map(statusTask),
    transaction: repository ? transactionOf(context) : null,
  };
}

function collect(
  errors: ValidationReport["errors"],
  action: () => void
): boolean {
  try {
    action();
    return true;
  } catch (error) {
    const { code, message } = error as { code?: string; message: string };
    errors.push({ code: code ?? "ERROR", message });
    return false;
  }
}

/** `validate`: plan document, plan rules and the task-to-commit mapping. */
export function validateProject(context: KitContext): ValidationReport {
  const errors: ValidationReport["errors"] = [];
  let plan = null as ReturnType<typeof workflowPlanFacade.read>;
  collect(errors, () => {
    plan = workflowPlanFacade.read(context.root);
  });
  collect(errors, () => workflowQualityFacade.readConfig(context.root));
  if (plan) {
    const current = plan;
    collect(errors, () =>
      context.git.resolveReferences(context.root, current, PLAN_PATH)
    );
  } else if (errors.length === 0) {
    errors.push({
      code: "NOT_INSTALLED",
      message: `${PLAN_PATH} does not exist.`,
    });
  }
  return { errors, ok: errors.length === 0 };
}
