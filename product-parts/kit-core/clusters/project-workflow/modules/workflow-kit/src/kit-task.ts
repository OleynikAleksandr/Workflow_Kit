import type { CommitResult } from "../../workflow-git/src/workflow-git-facade.js";
import {
  isDocumentationPath,
  PLAN_PATH,
  type RoundDigest,
  type WorkflowPlan,
  type WorkflowTask,
  workflowPlanFacade,
} from "../../workflow-plan/src/workflow-plan-facade.js";
import {
  ensure,
  WorkflowError,
  workflowPlatformFacade,
} from "../../workflow-platform/src/workflow-platform-facade.js";
import {
  type StageReport,
  type WorkflowConfig,
  workflowQualityFacade,
} from "../../workflow-quality/src/workflow-quality-facade.js";
import { activeRecords } from "./kit-assignment.js";
import {
  commitPlan,
  ensureNoTransaction,
  type KitContext,
  locked,
  readConfig,
  readPlan,
  savePlan,
} from "./kit-context.js";
import {
  ensureAssignmentReady,
  executorAssignment,
  guardExecutorCommit,
  markAssignment,
} from "./kit-executor.js";
import { ensureNotPaused } from "./kit-pause.js";
import { readStatus, type TaskBrief } from "./kit-status.js";

export interface TaskStart {
  preexisting: string[];
  task: TaskBrief;
  warnings: string[];
}

export interface TaskCommit {
  commit: CommitResult;
  nextTask: TaskBrief | null;
  preexisting: string[] | null;
  prepare: StageReport | null;
}

function briefOf(task: WorkflowTask): TaskBrief {
  const { id, kind, roundId, status, title } = task;
  return { id, kind, roundId, status, title };
}

function hasCommitChecks(config: WorkflowConfig): boolean {
  return config.quality.checks.some(
    (check) => check.stage === "commit" && check.command
  );
}

/**
 * Main checkout of an orchestrated scope (spec 6): work and DOCS run only
 * through assignments; delivery waits for every earlier task and for the
 * last active assignment. QUALITY starts here; sequential scopes are free.
 */
function ensureMainMayStart(
  context: KitContext,
  plan: WorkflowPlan,
  task: WorkflowTask
): void {
  if (workflowPlanFacade.execution(plan).strategy !== "orchestrated") {
    return;
  }
  ensure(
    task.kind !== "work" && task.kind !== "docs",
    "ORCHESTRATED_MAIN_READ_ONLY",
    `${task.id} runs only through an assignment in an orchestrated scope.`,
    {},
    `Run \`scripts/workflow assignment:next\`, then \`scripts/workflow assignment:create --task ${task.id}\`.`
  );
  if (task.kind !== "delivery") {
    return;
  }
  const index = plan.tasks.indexOf(task);
  const pending = plan.tasks
    .filter((item, position) => position < index && item.status !== "DONE")
    .map((item) => item.id);
  const active = activeRecords(plan, context.root).map((record) => record.id);
  ensure(
    pending.length === 0 && active.length === 0,
    "DELIVERY_NOT_READY",
    `${task.id} starts when every earlier task is DONE and no assignment is active.`,
    { active, pending }
  );
}

/** `task:start`: checks, snapshot of earlier changes, IN_PROGRESS. */
export function startTask(
  context: KitContext,
  taskId: string,
  confirmation: string | null
): TaskStart {
  return locked(context, () => {
    ensureNoTransaction(context);
    ensureNotPaused(context);
    const current = readPlan(context);
    const config = readConfig(context);
    const task = workflowPlanFacade.task(current, taskId);
    ensureMainMayStart(context, current, task);
    ensureAssignmentReady(context);
    workflowQualityFacade.selectChecks({
      assigned: task.checks,
      config,
      root: context.root,
      stage: "commit",
    });
    const plan = workflowPlanFacade.startTask(current, taskId, confirmation);
    const baseline = context.git.beginTask(context.root, {
      iteration: task.iteration,
      scopeId: plan.scope?.id ?? "NONE",
      taskId,
    });
    savePlan(context, plan);
    markAssignment(context, "RUNNING");
    const warnings: string[] = [];
    const limit = config.policy.taskFileSoftLimit;
    const functional = task.files.filter((file) => !isDocumentationPath(file));
    if (limit !== null && functional.length > limit) {
      warnings.push(
        `The task lists ${functional.length} functional files (soft limit ${limit}); consider splitting it.`
      );
    }
    return {
      preexisting: baseline.preexisting,
      task: briefOf(workflowPlanFacade.task(plan, taskId)),
      warnings,
    };
  });
}

/** Adds the prepare-stage report to the evidence of a finished commit. */
function storePrepareEvidence(
  context: KitContext,
  sha: string,
  prepare: StageReport
): void {
  const stored = workflowQualityFacade.readEvidence(context.root, sha);
  const evidence = {
    commit: sha,
    reports: [prepare, ...(stored?.reports ?? [])],
    transaction: stored?.transaction ?? null,
  };
  const text = `${JSON.stringify(evidence, null, 2)}\n`;
  for (const name of [`${sha}.json`, "last.json"]) {
    workflowPlatformFacade.writeFileAtomic(
      context.git.localPath(context.root, "verification", name),
      text
    );
  }
}

function runPrepare(
  context: KitContext,
  config: WorkflowConfig,
  task: WorkflowTask,
  files: string[]
): StageReport | null {
  if (!config.quality.checks.some((check) => check.stage === "prepare")) {
    return null;
  }
  const report = workflowQualityFacade.runStage({
    assigned: task.checks,
    config,
    env: context.env,
    files,
    // Staging will skip these paths: fixers never get the copies on disk.
    removed: context.git.absentPaths(context.root, files),
    root: context.root,
    stage: "prepare",
  });
  if (!report.ok) {
    throw new WorkflowError(
      "CHECK_FAILED",
      "A prepare check failed; nothing was committed.",
      { report },
      "Fix the reported problem and repeat the same command."
    );
  }
  return report;
}

/** `commit --task`: one task, one transactional commit. */
export function commitTask(
  context: KitContext,
  taskId: string,
  options: { digest?: RoundDigest | null; files?: string[] } = {}
): TaskCommit {
  return locked(context, () => {
    ensureNoTransaction(context);
    const current = readPlan(context);
    const config = readConfig(context);
    const task = workflowPlanFacade.task(current, taskId);
    ensure(
      task.status === "IN_PROGRESS",
      "TASK_NOT_ACTIVE",
      `Start the task first: task:start ${taskId}`
    );
    ensure(
      task.kind !== "quality",
      "USE_QUALITY_APPLY",
      "The QUALITY task is completed by `quality:apply`."
    );
    ensure(
      task.kind !== "docs" || Boolean(options.digest),
      "ROUND_DIGEST_REQUIRED",
      `${taskId} closes its round: pass the round digest with --digest <file.json>.`
    );
    const identity = {
      iteration: task.iteration,
      scopeId: current.scope?.id ?? "NONE",
      taskId,
    };
    const selection = context.git.selectTaskFiles(
      context.root,
      identity,
      options.files
    );
    const functional = selection.selected.filter(
      (file) => !isDocumentationPath(file)
    );
    ensure(
      functional.length === 0 || hasCommitChecks(config),
      "NOT_CONFIGURED",
      "Functional files need at least one commit-stage check in the quality profile.",
      { files: functional },
      "Configure the profile with `quality:apply`."
    );
    const withFiles = structuredClone(current);
    const own = workflowPlanFacade.task(withFiles, taskId);
    own.files = [...new Set([...own.files, ...selection.selected])];
    const plan = workflowPlanFacade.completeTask(
      withFiles,
      taskId,
      options.digest ?? null
    );
    guardExecutorCommit(
      context,
      [...selection.selected, PLAN_PATH],
      workflowPlanFacade.render(plan)
    );
    const prepare = runPrepare(context, config, task, selection.selected);
    const commit = commitPlan(context, plan, {
      assignmentId: executorAssignment(context)?.id ?? null,
      checks: task.checks,
      excluded: selection.excluded,
      files: selection.selected,
      iteration: task.iteration,
      message: task.commitMessage,
      role: task.kind === "docs" ? "docs" : "implementation",
      scopeId: current.scope?.id ?? null,
      taskId,
    });
    if (prepare) {
      storePrepareEvidence(context, commit.sha, prepare);
    }
    markAssignment(context, "READY_FOR_INTEGRATION", commit.sha);
    return {
      commit,
      nextTask: readStatus(context).nextTask,
      preexisting: selection.preexisting,
      prepare,
    };
  });
}

/** `docs:commit`: documentation outside a task, with no scope or between tasks. */
export function commitDocs(
  context: KitContext,
  files: string[],
  message = "docs: update documentation"
): CommitResult {
  return locked(context, () => {
    ensureNoTransaction(context);
    const plan = readPlan(context);
    ensure(
      plan.currentTaskId === null,
      "TASK_IN_PROGRESS",
      `Task ${plan.currentTaskId} is in progress; its documents go into its commit.`
    );
    const paths = files.map((file) =>
      workflowPlatformFacade.normalizeRelative(file)
    );
    const code = paths.filter((file) => !isDocumentationPath(file));
    ensure(
      paths.length > 0 && code.length === 0,
      "DOCS_ONLY",
      "docs:commit takes documentation only: Markdown files and .harness/product-tree/**.",
      { paths: code }
    );
    return commitPlan(context, plan, {
      files: paths,
      message,
      role: "docs",
      scopeId: plan.scope?.id ?? null,
      taskId: null,
    });
  });
}
