import {
  type AssignmentRecord,
  type AssignmentSetupResult,
  type AssignmentStatus,
  type WorktreeAssignment,
  workflowAssignmentFacade,
} from "../../workflow-assignment/src/workflow-assignment-facade.js";
import type { CommitJournal } from "../../workflow-git/src/workflow-git-facade.js";
import {
  PLAN_PATH,
  type TaskKind,
  type TaskStatus,
  workflowPlanFacade,
} from "../../workflow-plan/src/workflow-plan-facade.js";
import {
  ensure,
  workflowPlatformFacade,
} from "../../workflow-platform/src/workflow-platform-facade.js";
import {
  commitPlan,
  ensureNoTransaction,
  type KitContext,
  locked,
  readPlan,
  requireHead,
} from "./kit-context.js";

/** `assignment:attach`: the updated main record and the executor record. */
export interface AssignmentAttached {
  assignment: AssignmentRecord;
  /** false when the worktree was already attached (retry). */
  attached: boolean;
  /** The `assignment-plan` commit; null on a retry of a finished attach. */
  planCommit: string | null;
  worktree: WorktreeAssignment;
}

/** `assignment:status`: the assignment of this worktree and its task. */
export interface AssignmentState {
  assignment: AssignmentRecord | null;
  head: string | null;
  scopeId: string | null;
  task: {
    files: string[];
    id: string;
    kind: TaskKind;
    status: TaskStatus;
    title: string;
  } | null;
  worktree: WorktreeAssignment;
}

/** The executor record of this checkout, or null outside an executor worktree. */
export function executorAssignment(
  context: KitContext
): WorktreeAssignment | null {
  return workflowAssignmentFacade.worktreeRecord(context.root);
}

/** HEAD is the `assignment-plan` commit of this assignment right on its base. */
function isPlanCommit(
  context: KitContext,
  head: string,
  record: AssignmentRecord
): boolean {
  const history = context.git.history(context.root, record.baseCommit, head);
  const [commit] = history;
  return (
    history.length === 1 &&
    commit?.parents[0] === record.baseCommit &&
    commit.trailers["Workflow-Role"]?.[0] === "assignment-plan" &&
    commit.trailers["Workflow-Assignment"]?.[0] === record.id
  );
}

function commitExecutorPlan(
  context: KitContext,
  record: AssignmentRecord
): string {
  const text = context.git.show(context.root, record.baseCommit, PLAN_PATH);
  ensure(
    text,
    "ASSIGNMENT_BASE",
    `The base commit ${record.baseCommit} has no plan.`
  );
  const plan = workflowAssignmentFacade.executorPlan(
    workflowPlanFacade.parse(text),
    record,
    context.now()
  );
  return commitPlan(context, plan, {
    assignmentId: record.id,
    files: [],
    iteration: record.iteration,
    message: `docs: plan assignment ${record.id}`,
    role: "assignment-plan",
    scopeId: plan.scope?.id ?? null,
    taskId: record.taskId,
  }).sha;
}

/**
 * `assignment:attach <id>` in the executor worktree (spec 5.1, 5.3): verifies
 * the linked worktree, base and clean tree, commits the executor plan and
 * records the worktree in both places. A repeated call continues or returns
 * the finished attachment.
 */
export function attachAssignment(
  context: KitContext,
  id: string
): AssignmentAttached {
  return locked(context, () => {
    const location = workflowAssignmentFacade.locateWorktree(
      context.git,
      context.root
    );
    const record = workflowAssignmentFacade.read(location.mainRoot, id);
    ensure(
      record,
      "ASSIGNMENT_UNKNOWN",
      `The main checkout ${location.mainRoot} has no assignment ${id}.`,
      { mainRoot: location.mainRoot },
      "Run the exact attach command of your brief."
    );
    const own = executorAssignment(context);
    ensure(
      own === null || own.id === id,
      "ASSIGNMENT_ATTACHED",
      `This worktree is already attached to ${own?.id}.`,
      { id: own?.id }
    );
    const here =
      record.worktree !== null &&
      workflowPlatformFacade.samePath(record.worktree, location.worktree);
    ensure(
      record.worktree === null || here,
      "ASSIGNMENT_ATTACHED",
      `${id} is attached to another worktree: ${record.worktree}.`,
      { worktree: record.worktree }
    );
    if (own && here) {
      return {
        assignment: record,
        attached: false,
        planCommit: null,
        worktree: own,
      };
    }
    ensure(
      record.status === "ASSIGNED" || here,
      "ASSIGNMENT_STATUS",
      `${id} is ${record.status}; only an ASSIGNED assignment is attached.`,
      { status: record.status }
    );
    ensureNoTransaction(context);
    const dirty = context.git.changes(context.root).all;
    ensure(
      dirty.length === 0,
      "ASSIGNMENT_DIRTY",
      "The executor worktree must be clean before attaching.",
      { paths: dirty },
      "Remove the changes, then repeat the attach command."
    );
    const head = requireHead(context);
    let planCommit = head;
    if (head === record.baseCommit) {
      planCommit = commitExecutorPlan(context, record);
    } else {
      ensure(
        isPlanCommit(context, head, record),
        "ASSIGNMENT_BASE",
        `HEAD ${head} is not the base ${record.baseCommit} of ${id}.`,
        { base: record.baseCommit, head },
        "The worktree must start at the main HEAD the assignment was created on."
      );
    }
    const task = workflowPlanFacade.task(readPlan(context), record.taskId);
    const updated: AssignmentRecord = {
      ...record,
      branch: location.branch,
      status: workflowAssignmentFacade.needsSetup(context.root, task)
        ? "NEEDS_SETUP"
        : "READY",
      updatedAt: context.now(),
      worktree: location.worktree,
    };
    workflowAssignmentFacade.write(location.mainRoot, updated);
    return {
      assignment: updated,
      attached: true,
      planCommit,
      worktree: workflowAssignmentFacade.writeWorktreeRecord(
        context.root,
        updated,
        location.mainRoot
      ),
    };
  });
}

/** `assignment:status` in an executor worktree. */
export function assignmentStatus(context: KitContext): AssignmentState {
  const own = executorAssignment(context);
  ensure(
    own,
    "ASSIGNMENT_NOT_ATTACHED",
    "This checkout is not an attached executor worktree.",
    {},
    "In main run `scripts/workflow assignment:next`; an executor runs `scripts/workflow assignment:attach <id>` first."
  );
  const plan = readPlan(context);
  const task = plan.tasks.find((item) => item.id === own.taskId);
  return {
    assignment: workflowAssignmentFacade.read(own.mainRoot, own.id),
    head: context.git.head(context.root),
    scopeId: plan.scope?.id ?? null,
    task: task
      ? {
          files: task.files,
          id: task.id,
          kind: task.kind,
          status: task.status,
          title: task.title,
        }
      : null,
    worktree: own,
  };
}

/**
 * `assignment:setup [--id]` (spec 5.4): in an executor worktree for its own
 * assignment, in main for `--id`. The install runs without the Kit lock: it
 * may outlast the lock's stale limit and touches no plan or git state.
 */
export function setupAssignment(
  context: KitContext,
  id?: string
): AssignmentSetupResult {
  const own = executorAssignment(context);
  ensure(
    own === null || id === undefined || id === own.id,
    "ASSIGNMENT_READ_ONLY",
    `This worktree sets up only its own assignment ${own?.id}.`,
    { id: own?.id }
  );
  const target = own?.id ?? id;
  ensure(
    target,
    "USAGE",
    "--id is required outside an executor worktree.",
    {},
    "Run scripts/workflow assignment:setup --id <id> in main, or without --id in the executor worktree."
  );
  const mainRoot = own?.mainRoot ?? context.root;
  const record = workflowAssignmentFacade.read(mainRoot, target);
  ensure(
    record,
    "ASSIGNMENT_UNKNOWN",
    `The main checkout ${mainRoot} has no assignment ${target}.`,
    { mainRoot }
  );
  return workflowAssignmentFacade.setup(mainRoot, record, {
    env: context.env,
    now: context.now,
  });
}

/** `task:start` in an executor worktree waits for `assignment:setup`. */
export function ensureAssignmentReady(context: KitContext): void {
  const own = executorAssignment(context);
  const record = own && workflowAssignmentFacade.read(own.mainRoot, own.id);
  ensure(
    record?.status !== "NEEDS_SETUP",
    "ASSIGNMENT_NEEDS_SETUP",
    `The worktree of ${own?.id} lacks the dependencies its checks need.`,
    { id: own?.id },
    "Run scripts/workflow assignment:setup, then repeat task:start."
  );
}

/** Updates the main record of this executor worktree; a no-op elsewhere. */
export function markAssignment(
  context: KitContext,
  status: AssignmentStatus,
  sourceCommit?: string
): void {
  const own = executorAssignment(context);
  const record = own && workflowAssignmentFacade.read(own.mainRoot, own.id);
  if (!(own && record)) {
    return;
  }
  workflowAssignmentFacade.write(own.mainRoot, {
    ...record,
    sourceCommit: sourceCommit ?? record.sourceCommit,
    status,
    updatedAt: context.now(),
  });
}

/** Contract guard of a commit candidate in an executor worktree (spec 5.3). */
export function guardExecutorCommit(
  context: KitContext,
  paths: string[],
  candidatePlan: string
): void {
  if (!executorAssignment(context)) {
    return;
  }
  workflowAssignmentFacade.checkExecutorChange({
    candidatePlan,
    headPlan: context.git.show(context.root, "HEAD", PLAN_PATH),
    paths,
    planPath: PLAN_PATH,
  });
}

/** The guard on the staged candidate of a prepared transaction (pre-commit). */
export function guardExecutorCandidate(
  context: KitContext,
  journal: CommitJournal
): void {
  if (!executorAssignment(context)) {
    return;
  }
  const paths = context.git.git
    .run(context.root, [
      "diff",
      "--cached",
      "--name-only",
      "--no-renames",
      "-z",
      "HEAD",
    ])
    .stdout.split("\u0000")
    .filter(Boolean);
  guardExecutorCommit(context, paths, journal.candidatePlan);
}
