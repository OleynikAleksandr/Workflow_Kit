import { existsSync } from "node:fs";
import type { WorkflowGitFacade } from "../../workflow-git/src/workflow-git-facade.js";
import {
  ensure,
  WorkflowError,
  workflowPlatformFacade,
} from "../../workflow-platform/src/workflow-platform-facade.js";
import { refusal, registeredWorktrees } from "./assignment-cleanup.js";
import { type AssignmentRecord, removeRecord } from "./assignment-records.js";

/** What `assignment:cancel` removed (spec KitFixes-2026-11-05 §3). */
export interface AssignmentCancelResult {
  /** The record as it was before the cancel. */
  assignment: AssignmentRecord;
  /** The deleted branch, or null when the record had none or it was gone. */
  branch: string | null;
  /** The last commit of the deleted branch: `git branch <name> <sha>` restores it. */
  branchTip: string | null;
  /** The removed worktree, or null when git had none registered. */
  worktree: string | null;
}

/** The registered worktree path of the record, or null. */
function registeredWorktree(
  git: WorkflowGitFacade,
  root: string,
  record: AssignmentRecord
): string | null {
  const worktree = record.worktree;
  if (worktree === null) {
    return null;
  }
  return (
    registeredWorktrees(git, root).find((item) =>
      workflowPlatformFacade.samePath(item, worktree)
    ) ?? null
  );
}

function failed(record: AssignmentRecord, reason: string): never {
  throw new WorkflowError(
    "ASSIGNMENT_CANCEL_FAILED",
    `${record.id} was not cancelled: ${reason}`,
    { id: record.id, reason },
    `Resolve the reason, then repeat scripts/workflow assignment:cancel --id ${record.id}; the record is kept.`
  );
}

/**
 * Cancels an assignment that is not INTEGRATED: removes its registered
 * worktree (a dirty one only with `force`), prunes, deletes its branch even
 * with commits that were never integrated, and removes the record last, so
 * a git refusal keeps the record and the cancel can be repeated. The plan
 * of main is not touched: the task stays TODO.
 */
export function cancelAssignment(
  git: WorkflowGitFacade,
  root: string,
  record: AssignmentRecord,
  options: { force: boolean }
): AssignmentCancelResult {
  ensure(
    record.status !== "INTEGRATED",
    "ASSIGNMENT_INTEGRATED",
    `${record.id} is INTEGRATED; its task is done and only its cleanup remains.`,
    { id: record.id, status: record.status },
    `Run scripts/workflow assignment:cleanup --id ${record.id}.`
  );
  const worktree = registeredWorktree(git, root, record);
  const present = worktree !== null && existsSync(worktree);
  if (present && !options.force) {
    const dirty = git.changes(worktree).all;
    ensure(
      dirty.length === 0,
      "ASSIGNMENT_DIRTY",
      `The worktree ${worktree} of ${record.id} has uncommitted changes.`,
      { id: record.id, paths: dirty, worktree },
      `Commit or remove them, or drop them with scripts/workflow assignment:cancel --id ${record.id} --force.`
    );
  }
  if (present) {
    const force = options.force ? ["-f", "-f"] : [];
    const removed = refusal(git, root, [
      "worktree",
      "remove",
      ...force,
      worktree,
    ]);
    if (removed) {
      failed(record, removed);
    }
  }
  const pruned = refusal(git, root, ["worktree", "prune"]);
  if (pruned) {
    failed(record, pruned);
  }
  let branchTip: string | null = null;
  if (record.branch !== null) {
    const tip = git.git.run(
      root,
      ["rev-parse", "--verify", "-q", `refs/heads/${record.branch}`],
      { allowFailure: true }
    );
    if (tip.status === 0) {
      const deleted = refusal(git, root, ["branch", "-D", record.branch]);
      if (deleted) {
        failed(record, deleted);
      }
      branchTip = tip.stdout.trim();
    }
  }
  removeRecord(root, record.id);
  return {
    assignment: record,
    branch: branchTip === null ? null : record.branch,
    branchTip,
    worktree,
  };
}
