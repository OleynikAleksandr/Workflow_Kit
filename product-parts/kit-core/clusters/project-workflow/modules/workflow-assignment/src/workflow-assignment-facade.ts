import type { WorkflowGitFacade } from "../../workflow-git/src/workflow-git-facade.js";
import type {
  WorkflowPlan,
  WorkflowTask,
} from "../../workflow-plan/src/workflow-plan-facade.js";
import {
  executorPlan,
  locateWorktree,
  readWorktreeRecord,
  type WorktreeAssignment,
  type WorktreeLocation,
  writeWorktreeRecord,
} from "./assignment-attach.js";
import {
  type AssignmentCancelResult,
  cancelAssignment,
} from "./assignment-cancel.js";
import { cleanupAssignment } from "./assignment-cleanup.js";
import {
  checkExecutorChange,
  type ExecutorChange,
} from "./assignment-guard.js";
import {
  type AssignmentRecord,
  assignmentId,
  configDigest,
  isActiveRecord,
  listRecords,
  type NewAssignment,
  newRecord,
  readRecord,
  recordFile,
  writeRecord,
} from "./assignment-records.js";
import {
  type AssignmentSchedule,
  type ScheduledAssignment,
  scheduleAssignments,
} from "./assignment-schedule.js";
import {
  type AssignmentSetupResult,
  needsSetup,
  setupAssignment,
} from "./assignment-setup.js";

export type {
  WorktreeAssignment,
  WorktreeLocation,
} from "./assignment-attach.js";
export type { AssignmentCancelResult } from "./assignment-cancel.js";
export type { ExecutorChange } from "./assignment-guard.js";
export type {
  AssignmentCleanup,
  AssignmentRecord,
  AssignmentSetup,
  AssignmentStatus,
} from "./assignment-records.js";
export type {
  AssignmentSchedule,
  BlockedTask,
  ScheduleBlockCode,
} from "./assignment-schedule.js";
export type { AssignmentSetupResult } from "./assignment-setup.js";

/** One context document of the brief, already read by the caller. */
export interface BriefDocument {
  /** UTF-8 bytes of `text`. */
  bytes: number;
  /** Set when only this section of the file is included. */
  heading?: string;
  path: string;
  text: string;
}

function attribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}

/** The marked full text of the context documents, after the brief lines. */
function documentBlocks(documents: readonly BriefDocument[]): string[] {
  if (documents.length === 0) {
    return [];
  }
  return [
    "Context documents (full text, do not re-read them):",
    "",
    ...documents.flatMap((item) => [
      `<document path="${attribute(item.path)}"${item.heading ? ` heading="${attribute(item.heading)}"` : ""} bytes="${item.bytes}">`,
      item.text,
      "</document>",
      "",
    ]),
  ];
}

function bullets(items: readonly string[]): string[] {
  return items.length > 0
    ? items.map((item) => `   - ${item}`)
    : ["   - (none)"];
}

/** The ready text of the executor subagent for one assignment. */
function executorBrief(
  plan: WorkflowPlan,
  task: WorkflowTask,
  record: AssignmentRecord,
  documents: readonly BriefDocument[]
): string {
  const commit =
    task.kind === "docs"
      ? `scripts/workflow commit --task ${task.id} --digest <file.json> (the round digest: result, decisions, contracts, references)`
      : `scripts/workflow commit --task ${task.id}`;
  const context = task.context.map((ref) =>
    ref.heading ? `${ref.path} (${ref.heading})` : ref.path
  );
  const lines = [
    `You are the executor of task ${task.id} of scope ${record.scopeId}${plan.projectName ? ` (project ${plan.projectName})` : ""}; assignment ${record.id}.`,
    "Your working directory is your own git worktree. Work only there.",
    "",
    `1. FIRST run in your worktree: scripts/workflow assignment:attach ${record.id}`,
    "   If it reports NEEDS_SETUP, run scripts/workflow assignment:setup",
    "   (installs the dependencies from the lock file in your worktree).",
    `2. Then run: scripts/workflow task:start ${task.id}`,
    "3. Implement the task within its files and acceptance criteria:",
    `   Title: ${task.title}`,
    ...(task.why ? [`   Why: ${task.why}`] : []),
    "   Files:",
    ...bullets(task.files),
    "   Acceptance:",
    ...bullets(task.acceptance),
    ...(context.length > 0 ? ["   Context:", ...bullets(context)] : []),
    "   Change only the listed files or paths nested inside a listed directory;",
    "   anything else fails with ASSIGNMENT_SCOPE (commit a subset with --files).",
    "   Never edit .harness/workflow/**, the launchers scripts/workflow* or the plan",
    "   (ASSIGNMENT_CONTRACT).",
    `4. Commit through the Kit: ${commit}`,
    "   If a check fails, fix the cause and repeat the same command.",
    "5. Reply with the SHA of that commit.",
    "",
    "Rules:",
    "- In your worktree only these Kit commands work: status, validate, recover,",
    "  show-task, task:start, commit, repair, task:block, assignment:status,",
    "  assignment:setup, assignment:attach (retry); anything else fails with",
    "  ASSIGNMENT_READ_ONLY.",
    "- Never push; the orchestrator integrates your commit.",
    "- Never touch the main checkout, the plan or other tasks.",
    "- Do not set the git identity (no git config user.name / user.email).",
    "- Do not create nested executors.",
    "",
    ...documentBlocks(documents),
  ];
  return lines.join("\n");
}

/**
 * Public boundary of the workflow-assignment module: assignment records of
 * the main checkout, the scheduler of orchestrated scopes and the executor
 * brief (sections 5.1, 5.2 and 6 of WorkflowKitExecutionModes.md).
 */
export class WorkflowAssignmentFacade {
  id(scopeId: string, taskId: string, iteration: number): string {
    return assignmentId(scopeId, taskId, iteration);
  }

  recordFile(root: string, id: string): string {
    return recordFile(root, id);
  }

  read(root: string, id: string): AssignmentRecord | null {
    return readRecord(root, id);
  }

  list(root: string): AssignmentRecord[] {
    return listRecords(root);
  }

  write(root: string, record: AssignmentRecord): void {
    writeRecord(root, record);
  }

  create(input: NewAssignment): AssignmentRecord {
    return newRecord(input);
  }

  isActive(record: Pick<AssignmentRecord, "status">): boolean {
    return isActiveRecord(record);
  }

  configDigest(root: string): string | null {
    return configDigest(root);
  }

  schedule(
    plan: WorkflowPlan,
    assignments: readonly ScheduledAssignment[]
  ): AssignmentSchedule {
    return scheduleAssignments(plan, assignments);
  }

  /**
   * The executor brief; `documents` (the task context, or the scope
   * specification) follow the brief lines as marked full text.
   */
  brief(
    plan: WorkflowPlan,
    task: WorkflowTask,
    record: AssignmentRecord,
    documents: readonly BriefDocument[] = []
  ): string {
    return executorBrief(plan, task, record, documents);
  }

  /** The main checkout and branch of a linked executor worktree (spec 5.1). */
  locateWorktree(git: WorkflowGitFacade, root: string): WorktreeLocation {
    return locateWorktree(git, root);
  }

  /** `.harness/workflow/local/assignment.json` of a worktree, or null. */
  worktreeRecord(root: string): WorktreeAssignment | null {
    return readWorktreeRecord(root);
  }

  writeWorktreeRecord(
    root: string,
    record: AssignmentRecord,
    mainRoot: string
  ): WorktreeAssignment {
    return writeWorktreeRecord(root, record, mainRoot);
  }

  /** The one-task plan of the executor worktree, built from the base plan (spec 5.3). */
  executorPlan(
    base: WorkflowPlan,
    record: AssignmentRecord,
    now: string
  ): WorkflowPlan {
    return executorPlan(base, record, now);
  }

  /** Throws ASSIGNMENT_CONTRACT / ASSIGNMENT_SCOPE for a commit that breaks the contract. */
  checkExecutorChange(change: ExecutorChange): void {
    checkExecutorChange(change);
  }

  /** The task's commit checks need dependencies the worktree lacks (spec 5.4). */
  needsSetup(worktree: string, task: WorkflowTask): boolean {
    return needsSetup(worktree, task);
  }

  /** `assignment:setup`: the stack install in the worktree, receipt and READY (spec 5.4). */
  setup(
    mainRoot: string,
    record: AssignmentRecord,
    options: { env: NodeJS.ProcessEnv; now: () => string }
  ): AssignmentSetupResult {
    return setupAssignment(mainRoot, record, options);
  }

  /**
   * Removes the worktree and merged branch of an INTEGRATED record and writes
   * `cleanup` DONE or PENDING; the integration calls it right after
   * INTEGRATED (spec 7).
   */
  cleanup(
    git: WorkflowGitFacade,
    mainRoot: string,
    record: AssignmentRecord,
    now: string
  ): AssignmentRecord {
    return cleanupAssignment(git, mainRoot, record, now);
  }

  /**
   * `assignment:cancel`: a record that is not INTEGRATED is removed with its
   * registered worktree (dirty only with `force`) and its branch; a git
   * refusal keeps the record (ASSIGNMENT_CANCEL_FAILED).
   */
  cancel(
    git: WorkflowGitFacade,
    mainRoot: string,
    record: AssignmentRecord,
    options: { force: boolean }
  ): AssignmentCancelResult {
    return cancelAssignment(git, mainRoot, record, options);
  }
}

export const workflowAssignmentFacade = new WorkflowAssignmentFacade();
