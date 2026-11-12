import {
  type AssignmentRecord,
  workflowAssignmentFacade,
} from "../../workflow-assignment/src/workflow-assignment-facade.js";
import type { WorkflowGitFacade } from "../../workflow-git/src/workflow-git-facade.js";
import {
  PLAN_PATH,
  type RoundDigest,
  type WorkflowPlan,
  workflowPlanFacade,
} from "../../workflow-plan/src/workflow-plan-facade.js";
import {
  ensure,
  WorkflowError,
} from "../../workflow-platform/src/workflow-platform-facade.js";
import {
  type IntegrationJournal,
  removeJournal,
  saveJournal,
} from "./integration-journal.js";

// The phases of one integration that write: the merge, the commit
// transaction with its plan candidate, and the completion of the record.

/** The result of `integration:start` / `integration:continue`. */
export interface IntegrationOutcome {
  /** The main record after integration (with its cleanup), else null. */
  assignment: AssignmentRecord | null;
  assignmentId: string;
  /** Unresolved conflicts of a CONFLICT result. */
  conflicts: string[];
  integrationCommit: string | null;
  mainHead: string;
  operationId: string;
  source: string;
  status: "CONFLICT" | "INTEGRATED";
  taskId: string;
}

const MERGE_TIMEOUT_MS = 10 * 60 * 1000;
const ERROR_TAIL = 4000;
export const UNKNOWN_HINT =
  "Inspect main with `git status` and `git log -1`; abort a merge in progress with `git merge --abort`, then remove .harness/workflow/local/integration.json and start the integration again.";

export const continueHint = (id: string): string =>
  `scripts/workflow integration:continue --id ${id}`;

export function outcome(
  journal: IntegrationJournal,
  fields: Partial<IntegrationOutcome> & Pick<IntegrationOutcome, "status">
): IntegrationOutcome {
  return {
    assignment: null,
    assignmentId: journal.assignmentId,
    conflicts: [],
    integrationCommit: null,
    mainHead: journal.mainHead,
    operationId: journal.operationId,
    source: journal.source,
    taskId: journal.taskId,
    ...fields,
  };
}

/** Records UNKNOWN and throws: the state cannot be proven, nothing is retried. */
export function unknown(
  root: string,
  journal: IntegrationJournal,
  message: string,
  error: string | null = null
): never {
  saveJournal(root, { ...journal, error, phase: "UNKNOWN" });
  throw new WorkflowError(
    "INTEGRATION_UNKNOWN",
    message,
    { error, operationId: journal.operationId },
    UNKNOWN_HINT
  );
}

/**
 * Main's plan with the task DONE through this integration (`operationId`,
 * `sourceCommit`). A DOCS task takes the round digest its executor recorded
 * in the source plan; the executor plan itself is discarded.
 */
export function candidatePlan(
  git: WorkflowGitFacade,
  root: string,
  plan: WorkflowPlan,
  journal: IntegrationJournal
): WorkflowPlan {
  const task = workflowPlanFacade.task(plan, journal.taskId);
  let digest: RoundDigest | null = null;
  if (task.kind === "docs") {
    const text = git.show(root, journal.source, PLAN_PATH);
    const source = text
      ? workflowPlanFacade.parse(text, { projection: false })
      : null;
    digest =
      source?.rounds.find((round) => round.id === task.roundId)?.digest ?? null;
  }
  return workflowPlanFacade.integrateTask(plan, task.id, {
    digest,
    operationId: journal.operationId,
    sourceCommit: journal.source,
  });
}

/**
 * After the integration commit: the record becomes INTEGRATED with the
 * commit, the executor worktree and branch are cleaned up (a refusal or
 * failure is `cleanup: PENDING`, the integration still succeeds), and the
 * journal is removed.
 */
export function finish(
  git: WorkflowGitFacade,
  root: string,
  journal: IntegrationJournal,
  sha: string,
  now: () => string
): IntegrationOutcome {
  const record = workflowAssignmentFacade.read(root, journal.assignmentId);
  ensure(
    record,
    "ASSIGNMENT_UNKNOWN",
    `The main checkout has no assignment ${journal.assignmentId}.`
  );
  let updated: AssignmentRecord =
    record.status === "INTEGRATED" && record.integrationCommit === sha
      ? record
      : {
          ...record,
          integrationCommit: sha,
          status: "INTEGRATED",
          updatedAt: now(),
        };
  workflowAssignmentFacade.write(root, updated);
  try {
    updated = workflowAssignmentFacade.cleanup(git, root, updated, now());
  } catch (error) {
    updated = {
      ...updated,
      cleanup: {
        at: now(),
        reason: (error as Error).message,
        status: "PENDING",
      },
    };
    workflowAssignmentFacade.write(root, updated);
  }
  removeJournal(root);
  return outcome(journal, {
    assignment: updated,
    integrationCommit: sha,
    status: "INTEGRATED",
  });
}

/** Phase PREPARED: `git merge --no-commit --no-ff <source>`; no MERGE_HEAD is UNKNOWN. */
export function merge(
  git: WorkflowGitFacade,
  root: string,
  journal: IntegrationJournal
): IntegrationJournal {
  const dirty = git.changes(root).all;
  ensure(
    dirty.length === 0 && git.mergeHead(root) === null,
    "INTEGRATION_DIRTY",
    "Main has changes; the integration merges only into a clean main.",
    { paths: dirty }
  );
  const merging: IntegrationJournal = { ...journal, phase: "MERGING" };
  saveJournal(root, merging);
  const output = git.git.run(
    root,
    ["merge", "--no-commit", "--no-ff", "-q", journal.source],
    { allowFailure: true, timeoutMs: MERGE_TIMEOUT_MS }
  );
  if (git.mergeHead(root) !== journal.source) {
    unknown(
      root,
      merging,
      `git merge of ${journal.source} left no merge state; it is never retried automatically.`,
      `${output.stderr}${output.stdout}`.slice(-ERROR_TAIL)
    );
  }
  return merging;
}

/** Runs the commit transaction; failed checks keep the merge state (CHECKS_FAILED). */
export function commit(
  git: WorkflowGitFacade,
  root: string,
  journal: IntegrationJournal,
  plan: WorkflowPlan,
  files: string[]
): string {
  const candidate = candidatePlan(git, root, plan, journal);
  const task = workflowPlanFacade.task(plan, journal.taskId);
  const checking: IntegrationJournal = {
    ...journal,
    error: null,
    phase: "CHECKING",
  };
  saveJournal(root, checking);
  try {
    return git.transactions.commit(root, {
      assignmentId: journal.assignmentId,
      checks: task.checks,
      files,
      iteration: task.iteration,
      message: `merge: ${task.title}`,
      planPath: PLAN_PATH,
      planText: workflowPlanFacade.render(candidate),
      role: "integration",
      scopeId: plan.scope?.id ?? null,
      sourceCommit: journal.source,
      taskId: task.id,
      transactionId: journal.operationId,
    }).sha;
  } catch (error) {
    if (!(error instanceof WorkflowError && error.code === "COMMIT_FAILED")) {
      throw error;
    }
    const output = String(error.details.output ?? error.message);
    saveJournal(root, {
      ...checking,
      error: output.slice(-ERROR_TAIL),
      phase: "CHECKS_FAILED",
    });
    throw new WorkflowError(
      "INTEGRATION_CHECKS_FAILED",
      `The checks of ${task.id} failed on the merged result; the merge and your fixes are kept.`,
      { output, phase: "CHECKS_FAILED" },
      `Fix the files of ${task.id} in main, then run ${continueHint(journal.assignmentId)}.`
    );
  }
}
