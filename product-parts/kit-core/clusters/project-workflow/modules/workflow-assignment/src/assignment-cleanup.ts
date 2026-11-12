import type { WorkflowGitFacade } from "../../workflow-git/src/workflow-git-facade.js";
import {
  ensure,
  workflowPlatformFacade,
} from "../../workflow-platform/src/workflow-platform-facade.js";
import {
  type AssignmentCleanup,
  type AssignmentRecord,
  writeRecord,
} from "./assignment-records.js";

const WORKTREE_LINE = "worktree ";

/** The worktree paths git has registered for the repository of `root`. */
export function registeredWorktrees(
  git: WorkflowGitFacade,
  root: string
): string[] {
  return git.git
    .text(root, ["worktree", "list", "--porcelain"])
    .split("\n")
    .filter((line) => line.startsWith(WORKTREE_LINE))
    .map((line) => line.slice(WORKTREE_LINE.length));
}

/** Runs one git step; its refusal (stderr or stdout) or null on success. */
export function refusal(
  git: WorkflowGitFacade,
  root: string,
  args: string[]
): string | null {
  const output = git.git.run(root, args, { allowFailure: true });
  if (output.status === 0) {
    return null;
  }
  const text = output.stderr.trim() || output.stdout.trim();
  return `git ${args.join(" ")}: ${text || `exit code ${output.status}`}`;
}

/**
 * The cleanup steps after integration (spec 7): `git worktree remove` without
 * force (ignored files such as node_modules do not block it), `git worktree
 * prune`, then `git branch -d` for the record's branch. The first refusal is
 * the pending reason.
 */
function cleanupSteps(
  git: WorkflowGitFacade,
  root: string,
  record: AssignmentRecord
): string | null {
  const worktree = record.worktree;
  if (
    worktree !== null &&
    registeredWorktrees(git, root).some((item) =>
      workflowPlatformFacade.samePath(item, worktree)
    )
  ) {
    const removed = refusal(git, root, ["worktree", "remove", worktree]);
    if (removed) {
      return removed;
    }
  }
  const pruned = refusal(git, root, ["worktree", "prune"]);
  if (pruned || record.branch === null) {
    return pruned;
  }
  const exists = git.git.succeeds(root, [
    "show-ref",
    "--verify",
    "--quiet",
    `refs/heads/${record.branch}`,
  ]);
  return exists ? refusal(git, root, ["branch", "-d", record.branch]) : null;
}

/**
 * Removes the worktree and the merged branch of an `INTEGRATED` assignment
 * and records `cleanup` in the main record: `DONE`, or `PENDING` with the
 * reason of a refusal (the next `assignment:cleanup` repeats it). A record
 * already `DONE` is returned unchanged.
 */
export function cleanupAssignment(
  git: WorkflowGitFacade,
  root: string,
  record: AssignmentRecord,
  now: string
): AssignmentRecord {
  ensure(
    record.status === "INTEGRATED",
    "ASSIGNMENT_NOT_INTEGRATED",
    `${record.id} is ${record.status}; only an INTEGRATED assignment is cleaned up.`,
    { status: record.status }
  );
  if (record.cleanup?.status === "DONE") {
    return record;
  }
  const reason = cleanupSteps(git, root, record);
  const cleanup: AssignmentCleanup =
    reason === null
      ? { at: now, status: "DONE" }
      : { at: now, reason, status: "PENDING" };
  const updated: AssignmentRecord = { ...record, cleanup, updatedAt: now };
  writeRecord(root, updated);
  return updated;
}
