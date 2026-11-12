import { randomUUID } from "node:crypto";
import { workflowAssignmentFacade } from "../../workflow-assignment/src/workflow-assignment-facade.js";
import type { WorkflowGitFacade } from "../../workflow-git/src/workflow-git-facade.js";
import {
  PLAN_PATH,
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
  type IntegrationJournal,
  readJournal,
  removeJournal,
  saveJournal,
} from "./integration-journal.js";
import {
  candidatePlan,
  commit,
  continueHint,
  finish,
  type IntegrationOutcome,
  merge,
  outcome,
  UNKNOWN_HINT,
  unknown,
} from "./integration-phases.js";
import { proveSource } from "./integration-proof.js";

export type { IntegrationOutcome };

/** A path is in scope when it equals or is nested (by segment) in a task file. */
function inTaskScope(files: readonly string[], file: string): boolean {
  return files.some((entry) => file === entry || file.startsWith(`${entry}/`));
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

/** The plan of main at the journal's HEAD: the base of the plan candidate. */
function mainPlan(
  git: WorkflowGitFacade,
  root: string,
  journal: IntegrationJournal
): { plan: WorkflowPlan; task: WorkflowTask; text: string } {
  const text = git.show(root, journal.mainHead, PLAN_PATH);
  ensure(text !== null, "NOT_INSTALLED", `${PLAN_PATH} is missing in main.`);
  const plan = workflowPlanFacade.parse(text);
  return { plan, task: workflowPlanFacade.task(plan, journal.taskId), text };
}

/** HEAD is the commit of this integration: parents main HEAD and source, its transaction. */
function isIntegrationCommit(
  git: WorkflowGitFacade,
  root: string,
  journal: IntegrationJournal,
  head: string
): boolean {
  const commit = git
    .history(root, journal.mainHead, head)
    .find((item) => item.sha === head);
  return (
    commit !== undefined &&
    commit.parents.join(" ") === `${journal.mainHead} ${journal.source}` &&
    commit.trailers["Workflow-Role"]?.join() === "integration" &&
    commit.trailers["Workflow-Transaction"]?.join() === journal.operationId
  );
}

/**
 * Drives an integration from its journal to the end (spec 7). Reconciles a
 * crash first: a pending transaction of this integration is finished or
 * rolled back, and a HEAD that already is the integration commit completes
 * without a second merge. Never resets.
 */
function resume(
  git: WorkflowGitFacade,
  root: string,
  stored: IntegrationJournal,
  now: () => string
): IntegrationOutcome {
  let journal = stored;
  const transaction = git.transactions.journal(root);
  if (transaction) {
    ensure(
      transaction.role === "integration" &&
        transaction.id === journal.operationId,
      "TRANSACTION_PENDING",
      "A commit transaction outside this integration is unfinished.",
      {},
      "Run `scripts/workflow repair`."
    );
    if (git.transactions.confirmed(root, transaction)) {
      const finished = git.transactions.finish(root);
      return finish(git, root, journal, finished?.sha ?? "", now);
    }
    if (!git.transactions.cancel(root)) {
      unknown(
        root,
        journal,
        "The prepared integration commit changed concurrently."
      );
    }
  }
  const head = git.head(root);
  if (head !== journal.mainHead) {
    if (head && isIntegrationCommit(git, root, journal, head)) {
      return finish(git, root, journal, head, now);
    }
    unknown(
      root,
      journal,
      `Main moved to ${head ?? "nothing"} outside the integration of ${journal.mainHead}.`
    );
  }
  if (journal.phase === "UNKNOWN") {
    throw new WorkflowError(
      "INTEGRATION_UNKNOWN",
      "The integration state could not be proven earlier; it is not retried.",
      { error: journal.error, operationId: journal.operationId },
      UNKNOWN_HINT
    );
  }
  if (journal.phase === "PREPARED") {
    journal = merge(git, root, journal);
  }
  if (git.mergeHead(root) !== journal.source) {
    unknown(root, journal, `No merge of ${journal.source} is in progress.`);
  }
  // The executor plan is discarded: main's plan is the base of the candidate.
  const { plan, task, text } = mainPlan(git, root, journal);
  workflowPlatformFacade.writeFileAtomic(
    workflowPlanFacade.planFile(root),
    text
  );
  git.git.run(root, ["add", "--", PLAN_PATH]);
  const conflicts = git.conflicts(root);
  if (conflicts.length > 0) {
    saveJournal(root, { ...journal, phase: "CONFLICT" });
    return outcome(journal, { conflicts, status: "CONFLICT" });
  }
  const changed = git.changes(root).all.filter((file) => file !== PLAN_PATH);
  const outside = changed.filter((file) => !inTaskScope(task.files, file));
  if (outside.length > 0) {
    git.git.run(root, ["merge", "--abort"]);
    removeJournal(root);
    throw new WorkflowError(
      "INTEGRATION_SCOPE",
      `The merged result changes files outside ${task.id}: ${outside.join(", ")}. The merge was aborted.`,
      { paths: outside },
      `Keep the integration inside the files of ${task.id}, then run scripts/workflow integration:start --id ${journal.assignmentId} --source ${journal.source}.`
    );
  }
  const sha = commit(git, root, journal, plan, changed);
  return finish(git, root, journal, sha, now);
}

/** Preconditions of a new integration in main (spec 7). */
function ensureCanIntegrate(
  git: WorkflowGitFacade,
  root: string,
  plan: WorkflowPlan | null
): void {
  ensure(
    plan,
    "NOT_INSTALLED",
    `${PLAN_PATH} does not exist; install the Workflow Kit first.`
  );
  ensure(
    plan.scope !== null &&
      workflowPlanFacade.execution(plan).strategy === "orchestrated",
    "NOT_ORCHESTRATED",
    "Integration exists only in an orchestrated scope."
  );
  ensure(
    plan.scope.status === "ACTIVE",
    "SCOPE_NOT_ACTIVE",
    `The scope is ${plan.scope.status}.`
  );
  ensure(
    git.transactions.journal(root) === null,
    "TRANSACTION_PENDING",
    "A commit transaction is unfinished.",
    {},
    "Run `scripts/workflow repair`."
  );
  const dirty = git.changes(root).all;
  ensure(
    dirty.length === 0 && git.mergeHead(root) === null,
    "INTEGRATION_DIRTY",
    "Integrate into a clean main: commit or remove the changes first (untracked files too).",
    { paths: dirty }
  );
}

/**
 * `integration:start --id <assignment> --source <sha>` in main. A retry of
 * the same assignment and source continues the journal; another integration
 * is INTEGRATION_ACTIVE.
 */
export function startIntegration(
  git: WorkflowGitFacade,
  root: string,
  request: { assignmentId: string; now: () => string; source: string }
): IntegrationOutcome {
  const active = readJournal(root);
  if (active) {
    ensure(
      active.assignmentId === request.assignmentId &&
        resolveCommit(git, root, request.source) === active.source,
      "INTEGRATION_ACTIVE",
      `The integration of ${active.assignmentId} is unfinished.`,
      { assignmentId: active.assignmentId, phase: active.phase },
      continueHint(active.assignmentId)
    );
    return resume(git, root, active, request.now);
  }
  const plan = workflowPlanFacade.read(root);
  ensureCanIntegrate(git, root, plan);
  const record = workflowAssignmentFacade.read(root, request.assignmentId);
  ensure(
    record,
    "ASSIGNMENT_UNKNOWN",
    `The main checkout has no assignment ${request.assignmentId}.`
  );
  const proof = proveSource(git, root, record, request.source);
  const journal: IntegrationJournal = {
    assignmentId: record.id,
    error: null,
    mainHead: git.head(root) ?? "",
    operationId: randomUUID(),
    phase: "PREPARED",
    source: proof.sourceCommit,
    startedAt: request.now(),
    taskId: record.taskId,
  };
  // The plan transition is checked before anything is written.
  candidatePlan(git, root, plan as WorkflowPlan, journal);
  saveJournal(root, journal);
  return resume(git, root, journal, request.now);
}

/** `integration:continue --id <assignment>`: finishes the unfinished integration. */
export function continueIntegration(
  git: WorkflowGitFacade,
  root: string,
  request: { assignmentId: string; now: () => string }
): IntegrationOutcome {
  const journal = readJournal(root);
  ensure(
    journal,
    "NO_INTEGRATION",
    "No integration is unfinished.",
    {},
    "Start one with scripts/workflow integration:start --id <assignment> --source <sha>."
  );
  ensure(
    journal.assignmentId === request.assignmentId,
    "INTEGRATION_ACTIVE",
    `The unfinished integration belongs to ${journal.assignmentId}.`,
    { assignmentId: journal.assignmentId, phase: journal.phase },
    continueHint(journal.assignmentId)
  );
  return resume(git, root, journal, request.now);
}
