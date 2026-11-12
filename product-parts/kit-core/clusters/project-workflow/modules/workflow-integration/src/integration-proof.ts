import type { AssignmentRecord } from "../../workflow-assignment/src/workflow-assignment-facade.js";
import type {
  CommitRecord,
  WorkflowGitFacade,
} from "../../workflow-git/src/workflow-git-facade.js";
import {
  PLAN_PATH,
  type WorkflowPlan,
  type WorkflowTask,
  workflowPlanFacade,
} from "../../workflow-plan/src/workflow-plan-facade.js";
import {
  ensure,
  WorkflowError,
} from "../../workflow-platform/src/workflow-platform-facade.js";
import {
  type CheckStatus,
  type StageReport,
  workflowQualityFacade,
} from "../../workflow-quality/src/workflow-quality-facade.js";

/** One check of the executor receipt. */
export interface ProvenCheck {
  id: string;
  stage: string;
  status: CheckStatus;
}

/** What the Kit proved about an executor source before integrating it. */
export interface IntegrationProof {
  assignmentId: string;
  baseCommit: string;
  /** Paths changed in `base..source`, the plan file included, sorted. */
  changedFiles: string[];
  /** Every check of the receipt of the last executor task commit. */
  checks: ProvenCheck[];
  sourceCommit: string;
  sourceTree: string;
  taskId: string;
}

/** Launchers of the Kit; an executor source never changes them. */
const LAUNCHERS = new Set([
  "scripts/workflow",
  "scripts/workflow.cmd",
  "scripts/workflow.ps1",
]);
const PLAN_ROLE = "assignment-plan";
const RESULT_OK = new Set<CheckStatus>(["passed", "skipped"]);
const HISTORY_HINT =
  "Integrate only the commit the executor reported: its worktree history must be the assignment plan commit followed by its task commits.";

function single(commit: CommitRecord, key: string): string | null {
  const values = commit.trailers[key] ?? [];
  return values.length === 1 ? (values[0] ?? null) : null;
}

function historyError(
  message: string,
  details: Record<string, unknown>
): WorkflowError {
  return new WorkflowError(
    "INTEGRATION_HISTORY",
    message,
    details,
    HISTORY_HINT
  );
}

function resolveCommit(
  git: WorkflowGitFacade,
  root: string,
  revision: string
): string | null {
  const output = git.git.run(
    root,
    ["rev-parse", "--verify", "-q", `${revision}^{commit}`],
    { allowFailure: true }
  );
  return output.status === 0 ? output.stdout.trim() : null;
}

/** The record is ready, the source is its reported commit and the worktree is clean. */
function checkSource(
  git: WorkflowGitFacade,
  mainRoot: string,
  assignment: AssignmentRecord,
  sourceSha: string
): { source: string; worktree: string } {
  const worktree = assignment.worktree;
  ensure(
    assignment.status === "READY_FOR_INTEGRATION" &&
      worktree !== null &&
      assignment.sourceCommit !== null,
    "INTEGRATION_NOT_READY",
    `Assignment ${assignment.id} is ${assignment.status}, not READY_FOR_INTEGRATION.`,
    { id: assignment.id, status: assignment.status }
  );
  const source = resolveCommit(git, mainRoot, sourceSha);
  ensure(
    source !== null && source === assignment.sourceCommit,
    "INTEGRATION_SOURCE",
    `${sourceSha} is not the source commit ${assignment.sourceCommit} of assignment ${assignment.id}.`,
    { expected: assignment.sourceCommit, source: source ?? sourceSha }
  );
  ensure(
    git.head(worktree) === source,
    "INTEGRATION_SOURCE",
    `The executor worktree ${worktree} is not at the source commit ${source}.`,
    { head: git.head(worktree), source, worktree }
  );
  const changes = git.changes(worktree).all;
  ensure(
    changes.length === 0,
    "INTEGRATION_DIRTY",
    `The executor worktree ${worktree} has uncommitted changes.`,
    { paths: changes, worktree }
  );
  return { source, worktree };
}

function basePlan(
  git: WorkflowGitFacade,
  mainRoot: string,
  baseCommit: string
): WorkflowPlan {
  const text = git.show(mainRoot, baseCommit, PLAN_PATH);
  ensure(
    text !== null,
    "INTEGRATION_CONTRACT",
    `The base commit ${baseCommit} has no plan.`
  );
  return workflowPlanFacade.parse(text);
}

function findTask(plan: WorkflowPlan, taskId: string): WorkflowTask | null {
  return plan.tasks.find((task) => task.id === taskId) ?? null;
}

/** The role the executor task commit has: `docs` for a DOCS task. */
function taskRole(task: WorkflowTask): string {
  return task.kind === "docs" ? "docs" : "implementation";
}

/**
 * `base..source` is exactly the assignment plan commit (only the plan file)
 * followed by one or more task commits, each with one parent continuing the
 * chain and the trailers of the assignment.
 */
function checkHistory(
  git: WorkflowGitFacade,
  mainRoot: string,
  assignment: AssignmentRecord,
  task: WorkflowTask,
  source: string
): CommitRecord {
  const commits = git.history(mainRoot, assignment.baseCommit, source);
  const scopeId = `assignment-${assignment.id}`;
  const role = taskRole(task);
  let parent = assignment.baseCommit;
  commits.forEach((commit, index) => {
    const expectedRole = index === 0 ? PLAN_ROLE : role;
    const wrong = [
      ["parents", commit.parents.join(" "), parent],
      ["Workflow-Role", single(commit, "Workflow-Role"), expectedRole],
      ["Workflow-Scope", single(commit, "Workflow-Scope"), scopeId],
      ["Workflow-Task", single(commit, "Workflow-Task"), task.id],
      [
        "Workflow-Assignment",
        single(commit, "Workflow-Assignment"),
        assignment.id,
      ],
      [
        "Workflow-Iteration",
        single(commit, "Workflow-Iteration"),
        String(assignment.iteration),
      ],
    ].filter(([, actual, expected]) => actual !== expected);
    if (wrong.length > 0) {
      throw historyError(
        `Commit ${commit.sha} is not the ${expectedRole} commit of assignment ${assignment.id}.`,
        {
          mismatches: wrong.map(([field, actual, expected]) => ({
            actual,
            expected,
            field,
          })),
          sha: commit.sha,
        }
      );
    }
    parent = commit.sha;
  });
  const [planCommit] = commits;
  const last = commits.at(-1);
  if (!(planCommit && last && commits.length > 1 && last.sha === source)) {
    throw historyError(
      `${assignment.baseCommit}..${source} must hold the assignment plan commit and at least one ${role} commit.`,
      { commits: commits.map((commit) => commit.sha) }
    );
  }
  const planPaths = git.commitPaths(mainRoot, planCommit.sha);
  if (planPaths.length !== 1 || planPaths[0] !== PLAN_PATH) {
    throw historyError(
      `The assignment plan commit ${planCommit.sha} must change only ${PLAN_PATH}.`,
      { paths: planPaths, sha: planCommit.sha }
    );
  }
  return last;
}

/** The diff `base..source` holds no Kit-managed or launcher file except the plan. */
function checkDiff(
  git: WorkflowGitFacade,
  mainRoot: string,
  baseCommit: string,
  source: string
): string[] {
  const changed = git.diffPaths(mainRoot, baseCommit, source);
  const managed = changed.filter(
    (file) =>
      file !== PLAN_PATH && (git.isKitManagedPath(file) || LAUNCHERS.has(file))
  );
  if (managed.length > 0) {
    throw historyError(
      `The executor source changes Workflow Kit files: ${managed.join(", ")}.`,
      { paths: managed }
    );
  }
  return changed;
}

function readReceipt(
  worktree: string,
  sha: string
): { commit?: string; reports: StageReport[]; transaction: string } | null {
  try {
    return workflowQualityFacade.readEvidence(worktree, sha);
  } catch {
    return null;
  }
}

/**
 * The receipt of the last task commit exists in the executor worktree, names
 * that commit and its transaction, holds every check the commit stage runs
 * for the task, and no check failed; assigned checks must have passed.
 */
function checkReceipt(
  worktree: string,
  task: WorkflowTask,
  last: CommitRecord
): ProvenCheck[] {
  const receipt = readReceipt(worktree, last.sha);
  const unchecked = (message: string, details: Record<string, unknown>) =>
    new WorkflowError(
      "INTEGRATION_UNCHECKED",
      message,
      { sha: last.sha, ...details },
      "The executor repeats `scripts/workflow commit --task <ID>` in its worktree so the checks run on its commit."
    );
  if (
    !(receipt && Array.isArray(receipt.reports)) ||
    receipt.commit !== last.sha ||
    receipt.transaction !== single(last, "Workflow-Transaction")
  ) {
    throw unchecked(`No check receipt refers to commit ${last.sha}.`, {});
  }
  const checks = receipt.reports.flatMap((report) =>
    (report.results ?? []).map((result) => ({
      id: result.id,
      stage: result.stage,
      status: result.status,
    }))
  );
  const expected = workflowQualityFacade.selectChecks({
    assigned: task.checks,
    config: workflowQualityFacade.readConfig(worktree),
    root: worktree,
    service: taskRole(task) !== "implementation",
    stage: "commit",
  });
  const status = (id: string) =>
    checks.find((check) => check.id === id && check.stage === "commit")?.status;
  const bad = [
    ...checks.filter((check) => !RESULT_OK.has(check.status)).map((c) => c.id),
    ...expected
      .filter((check) =>
        task.checks.includes(check.id)
          ? status(check.id) !== "passed"
          : !RESULT_OK.has(status(check.id) ?? "error")
      )
      .map((check) => check.id),
  ];
  if (bad.length > 0) {
    throw unchecked(
      `Checks of commit ${last.sha} did not pass: ${[...new Set(bad)].join(", ")}.`,
      { checks: [...new Set(bad)] }
    );
  }
  return checks;
}

/** The task contract of the base plan is the task of main's current plan. */
function checkContract(
  mainRoot: string,
  assignment: AssignmentRecord,
  base: WorkflowTask
): void {
  const current = workflowPlanFacade.read(mainRoot);
  const task = current ? findTask(current, assignment.taskId) : null;
  const contract = (item: WorkflowTask) =>
    JSON.stringify({
      acceptance: item.acceptance,
      files: item.files,
      kind: item.kind,
      title: item.title,
    });
  ensure(
    current?.scope?.id === assignment.scopeId &&
      task !== null &&
      contract(task) === contract(base),
    "INTEGRATION_CONTRACT",
    `The contract of task ${assignment.taskId} in main differs from its base commit ${assignment.baseCommit}.`,
    { scopeId: current?.scope?.id ?? null, taskId: assignment.taskId },
    "Create a new assignment for the changed task."
  );
}

/**
 * Proves an executor source before integration (spec section 7): the ready
 * record and clean worktree, the exact executor history, no Kit files in the
 * diff, a passed check receipt of the last task commit and an unchanged task
 * contract. Throws the first failure.
 */
export function proveSource(
  git: WorkflowGitFacade,
  mainRoot: string,
  assignment: AssignmentRecord,
  sourceSha: string
): IntegrationProof {
  const { source, worktree } = checkSource(
    git,
    mainRoot,
    assignment,
    sourceSha
  );
  const baseTask = findTask(
    basePlan(git, mainRoot, assignment.baseCommit),
    assignment.taskId
  );
  ensure(
    baseTask !== null,
    "INTEGRATION_CONTRACT",
    `The base plan has no task ${assignment.taskId}.`,
    { taskId: assignment.taskId }
  );
  const last = checkHistory(git, mainRoot, assignment, baseTask, source);
  const changedFiles = checkDiff(git, mainRoot, assignment.baseCommit, source);
  const checks = checkReceipt(worktree, baseTask, last);
  checkContract(mainRoot, assignment, baseTask);
  return {
    assignmentId: assignment.id,
    baseCommit: assignment.baseCommit,
    changedFiles,
    checks,
    sourceCommit: source,
    sourceTree: git.git.text(mainRoot, ["rev-parse", `${source}^{tree}`]),
    taskId: assignment.taskId,
  };
}
