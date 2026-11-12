import { realpathSync } from "node:fs";
import path from "node:path";
import {
  type WorkflowGitFacade,
  workflowGitFacade,
} from "../../workflow-git/src/workflow-git-facade.js";
import {
  PLAN_SCHEMA,
  type WorkflowPlan,
  workflowPlanFacade,
} from "../../workflow-plan/src/workflow-plan-facade.js";
import {
  ensure,
  WorkflowError,
  workflowPlatformFacade,
} from "../../workflow-platform/src/workflow-platform-facade.js";
import type { AssignmentRecord } from "./assignment-records.js";

const WORKTREE_RECORD_VERSION = 1;
const WORKTREE_RECORD = "assignment.json";

/** `.harness/workflow/local/assignment.json` of an executor worktree. */
export interface WorktreeAssignment {
  baseCommit: string;
  id: string;
  /** Real absolute path of the main checkout that holds the assignment record. */
  mainRoot: string;
  scopeId: string;
  taskId: string;
  version: typeof WORKTREE_RECORD_VERSION;
}

/** Where an executor worktree lives relative to its main checkout. */
export interface WorktreeLocation {
  branch: string | null;
  mainRoot: string;
  worktree: string;
}

/** Scope id of the one-task plan of an executor worktree. */
function executorScopeId(id: string): string {
  return `assignment-${id}`;
}

function real(value: string): string {
  return realpathSync(value);
}

function revParse(git: WorkflowGitFacade, root: string, flag: string): string {
  return git.git.text(root, ["rev-parse", "--path-format=absolute", flag]);
}

/**
 * Finds the main checkout of a linked worktree through the common git
 * directory. A bare or unusual layout is refused (`ASSIGNMENT_LAYOUT`), the
 * main checkout itself is not an executor worktree (`ASSIGNMENT_WORKTREE`).
 */
export function locateWorktree(
  git: WorkflowGitFacade,
  root: string
): WorktreeLocation {
  ensure(
    git.isRepository(root),
    "ASSIGNMENT_WORKTREE",
    "assignment:attach runs inside the executor's git worktree."
  );
  const bare = git.git.text(root, ["rev-parse", "--is-bare-repository"]);
  const commonDir = real(revParse(git, root, "--git-common-dir"));
  ensure(
    bare !== "true" && path.basename(commonDir) === ".git",
    "ASSIGNMENT_LAYOUT",
    `The repository layout is not supported: the common git directory ${commonDir} is not the .git folder of a main checkout.`,
    { commonDir },
    "Use a normal (non-bare) repository whose worktrees are created with `git worktree add`."
  );
  const mainRoot = path.dirname(commonDir);
  const worktree = real(git.topLevel(root));
  const gitDir = real(revParse(git, root, "--git-dir"));
  ensure(
    gitDir !== commonDir && worktree !== mainRoot,
    "ASSIGNMENT_WORKTREE",
    "This is the main checkout; assignment:attach runs in the executor's linked worktree.",
    { mainRoot },
    "Start the executor subagent with isolation worktree and run the command there."
  );
  const branch = git.git
    .run(root, ["symbolic-ref", "-q", "--short", "HEAD"], {
      allowFailure: true,
    })
    .stdout.trim();
  return { branch: branch === "" ? null : branch, mainRoot, worktree };
}

function worktreeRecordFile(root: string): string {
  return workflowGitFacade.localPath(root, WORKTREE_RECORD);
}

function isWorktreeRecord(value: unknown): value is WorktreeAssignment {
  const record = value as WorktreeAssignment | null;
  return (
    record !== null &&
    typeof record === "object" &&
    record.version === WORKTREE_RECORD_VERSION &&
    typeof record.id === "string" &&
    typeof record.mainRoot === "string" &&
    typeof record.scopeId === "string" &&
    typeof record.taskId === "string" &&
    typeof record.baseCommit === "string"
  );
}

/** The executor record of a worktree, or null outside an executor worktree. */
export function readWorktreeRecord(root: string): WorktreeAssignment | null {
  const file = worktreeRecordFile(root);
  const text = workflowPlatformFacade.readTextIfExists(file);
  if (text === null) {
    return null;
  }
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  if (!isWorktreeRecord(parsed)) {
    throw new WorkflowError(
      "ASSIGNMENT_RECORD",
      "The executor record of this worktree is unreadable.",
      { file },
      "Inspect the record file; the Kit does not guess its state."
    );
  }
  return parsed;
}

export function writeWorktreeRecord(
  root: string,
  record: AssignmentRecord,
  mainRoot: string
): WorktreeAssignment {
  const value: WorktreeAssignment = {
    baseCommit: record.baseCommit,
    id: record.id,
    mainRoot,
    scopeId: record.scopeId,
    taskId: record.taskId,
    version: WORKTREE_RECORD_VERSION,
  };
  workflowPlatformFacade.writeFileAtomic(
    worktreeRecordFile(root),
    `${JSON.stringify(value, null, 2)}\n`
  );
  return value;
}

/**
 * The one-task plan of an executor worktree (spec 5.3), built from the plan of
 * the base commit: scope `assignment-<id>`, a copy of the assigned task
 * without dependencies, strategy `sequential`, objective and acceptance from
 * the task.
 */
export function executorPlan(
  base: WorkflowPlan,
  record: AssignmentRecord,
  now: string
): WorkflowPlan {
  ensure(
    base.scope?.id === record.scopeId,
    "ASSIGNMENT_BASE",
    `The plan of the base commit has no scope ${record.scopeId}.`
  );
  const task = workflowPlanFacade.task(base, record.taskId);
  ensure(
    task.status === "TODO" && task.iteration === record.iteration,
    "ASSIGNMENT_BASE",
    `${task.id} is ${task.status} (iteration ${task.iteration}) in the base plan; the assignment expects TODO, iteration ${record.iteration}.`
  );
  const round = base.rounds.find((item) => item.id === task.roundId);
  ensure(round, "ASSIGNMENT_BASE", `The round of ${task.id} is missing.`);
  const copy = structuredClone(task);
  copy.dependencies = [];
  copy.fixes = null;
  return workflowPlanFacade.validate({
    currentTaskId: null,
    lastClosed: null,
    projectId: base.projectId,
    projectName: base.projectName,
    revision: base.revision + 1,
    rounds: [
      {
        digest: null,
        id: round.id,
        kind: round.kind,
        status: "OPEN",
        title: round.title,
      },
    ],
    schema: PLAN_SCHEMA,
    scope: {
      acceptance: [...task.acceptance],
      acceptanceNote: null,
      approval: {
        at: now,
        text: `Assignment ${record.id}: task ${task.id} of scope ${record.scopeId}`,
      },
      baselineCommit: record.baseCommit,
      blockedReason: null,
      context: structuredClone(task.context),
      decisions: [],
      delivery: "IN_PROGRESS",
      execution: { maxWorkers: 1, ownerSession: null, strategy: "sequential" },
      id: executorScopeId(record.id),
      objective: task.why ? `${task.title}: ${task.why}` : task.title,
      spec: base.scope.spec,
      status: "ACTIVE",
    },
    tasks: [copy],
  });
}
