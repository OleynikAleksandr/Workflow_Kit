import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { CommitJournal } from "../../workflow-git/src/workflow-git-facade.js";
import { workflowIntegrationFacade } from "../../workflow-integration/src/workflow-integration-facade.js";
import {
  type WorkflowPlan,
  type WorkflowTask,
  workflowPlanFacade,
} from "../../workflow-plan/src/workflow-plan-facade.js";
import {
  type CheckDefinition,
  type StageReport,
  workflowQualityFacade,
} from "../../workflow-quality/src/workflow-quality-facade.js";
import type { KitContext } from "./kit-context.js";
import { executorAssignment, guardExecutorCandidate } from "./kit-executor.js";
import { parsePushRefs, pushRefusal } from "./kit-push.js";

export type GitHookName =
  | "commit-msg"
  | "post-commit"
  | "pre-commit"
  | "pre-push";

export const GIT_HOOKS: readonly GitHookName[] = [
  "pre-commit",
  "commit-msg",
  "post-commit",
  "pre-push",
];

export interface HookResult {
  code: string | null;
  exitCode: number;
  message: string;
}

const MANAGED_HINT =
  "Commit through the Workflow Kit: `scripts/workflow commit --task <ID>` or `scripts/workflow docs:commit`.";
const OUTPUT_TAIL = 1500;

const pass = (message = ""): HookResult => ({
  code: null,
  exitCode: 0,
  message,
});
const fail = (code: string, message: string): HookResult => ({
  code,
  exitCode: 1,
  message: `${code}: ${message}`,
});

function fingerprints(root: string, files: string[]): string {
  return files
    .map((file) => {
      const absolute = path.join(root, ...file.split("/"));
      const digest = existsSync(absolute)
        ? createHash("sha256").update(readFileSync(absolute)).digest("hex")
        : "deleted";
      return `${file}:${digest}`;
    })
    .join("\n");
}

function failedSummary(report: StageReport): string {
  return report.results
    .filter((item) => item.status !== "passed" && item.status !== "skipped")
    .map(
      (item) =>
        `- ${item.id} ${item.status}${item.reason ? ` (${item.reason})` : ""}\n${item.output.slice(-OUTPUT_TAIL)}`
    )
    .join("\n");
}

/** The journal's task in its candidate plan, or null. */
function candidateTask(journal: CommitJournal): WorkflowTask | null {
  if (!journal.taskId) {
    return null;
  }
  try {
    const plan = workflowPlanFacade.parse(journal.candidatePlan, {
      projection: false,
    });
    return plan.tasks.find((task) => task.id === journal.taskId) ?? null;
  } catch {
    return null;
  }
}

/**
 * Commit-stage checks of the task run for `implementation` and for the
 * integration of a work task; service commits, DOCS and QUALITY run only the
 * documentation builtins.
 */
function isServiceCommit(
  journal: CommitJournal,
  task: WorkflowTask | null
): boolean {
  if (journal.role === "integration") {
    return task?.kind !== "work";
  }
  return journal.role !== "implementation";
}

function preCommit(context: KitContext): HookResult {
  const { git, root } = context;
  const journal = git.transactions.journal(root);
  if (!journal || journal.phase !== "PREPARED") {
    return fail("MANAGED_COMMIT_REQUIRED", MANAGED_HINT);
  }
  const treeBefore = git.git.text(root, ["write-tree"]);
  if (treeBefore !== journal.candidateTree) {
    return fail(
      "MANAGED_COMMIT_REQUIRED",
      "The index differs from the prepared candidate of the transaction."
    );
  }
  // A merge in progress is committed only by the integration of its source.
  if ((journal.sourceCommit ?? null) !== git.mergeHead(root)) {
    return fail(
      "MANAGED_COMMIT_REQUIRED",
      journal.sourceCommit
        ? "The integration commit needs the merge of its source in progress."
        : "A merge is in progress; only `scripts/workflow integration:continue` commits it."
    );
  }
  guardExecutorCandidate(context, journal);
  const task = candidateTask(journal);
  const before = fingerprints(root, journal.selected);
  const config = workflowQualityFacade.readConfig(root);
  const request = {
    config,
    docsWaiver: task?.docsWaiver ?? null,
    env: context.env,
    files: journal.selected,
    // The index equals the candidate: paths outside it are not committed.
    removed: git.absentPaths(root, journal.selected),
    root,
  };
  const report = workflowQualityFacade.runStage({
    ...request,
    assigned: journal.checks,
    service: isServiceCommit(journal, task),
    stage: "commit",
  });
  const delivery = report.ok
    ? deliveryChecks(journal, task, config.quality.checks)
    : [];
  // M41: the delivery checks a delivery task names join the evidence of its commit.
  const deliveryReport =
    delivery.length > 0
      ? workflowQualityFacade.runStage({
          ...request,
          only: delivery,
          stage: "delivery",
        })
      : null;
  const reports = deliveryReport ? [report, deliveryReport] : [report];
  workflowQualityFacade.recordEvidence(root, journal.id, reports);
  if (
    git.git.text(root, ["write-tree"]) !== journal.candidateTree ||
    fingerprints(root, journal.selected) !== before
  ) {
    return fail(
      "CHECK_MODIFIED_CANDIDATE",
      "A commit-stage check changed the candidate files; commit checks may only read. Move fixers to the prepare stage."
    );
  }
  if (!report.ok) {
    return fail(
      "CHECK_FAILED",
      `Commit checks failed:\n${failedSummary(report)}`
    );
  }
  if (deliveryReport && !deliveryReport.ok) {
    return fail(
      "CHECK_FAILED",
      `Delivery checks of the task failed:\n${failedSummary(deliveryReport)}`
    );
  }
  const results = reports.flatMap((item) => item.results);
  return pass(
    `Workflow checks passed: ${results.map((item) => `${item.id} ${item.status}`).join(", ") || "none"}.`
  );
}

/**
 * Delivery-stage checks the delivery task names in `checks` (spec M41 2.1):
 * they run once its commit checks passed. Required delivery checks the task
 * does not name are not run.
 */
function deliveryChecks(
  journal: CommitJournal,
  task: WorkflowTask | null,
  checks: readonly CheckDefinition[]
): string[] {
  if (journal.role !== "implementation" || task?.kind !== "delivery") {
    return [];
  }
  const assigned = journal.checks;
  return checks
    .filter((check) => check.stage === "delivery" && assigned.includes(check.id))
    .map((check) => check.id);
}

function commitMessage(context: KitContext, args: string[]): HookResult {
  const journal = context.git.transactions.journal(context.root);
  const file = args[0] ? path.resolve(context.root, args[0]) : "";
  const message = file && existsSync(file) ? readFileSync(file, "utf8") : "";
  if (!(journal && message.includes(`Workflow-Transaction: ${journal.id}`))) {
    return fail("MANAGED_COMMIT_REQUIRED", MANAGED_HINT);
  }
  return pass();
}

/** The last round with finished work must have its DOCS task done. */
function pendingDocs(plan: WorkflowPlan | null): string | null {
  if (!plan) {
    return null;
  }
  const rounds = plan.rounds.filter((round) =>
    plan.tasks.some(
      (task) =>
        task.roundId === round.id &&
        task.kind !== "docs" &&
        task.status === "DONE"
    )
  );
  const last = rounds.at(-1);
  if (!last || last.kind === "legacy") {
    return null;
  }
  const docs = plan.tasks.find(
    (task) => task.roundId === last.id && task.kind === "docs"
  );
  return docs && docs.status !== "DONE" ? docs.id : null;
}

function prePush(context: KitContext, stdin: string): HookResult {
  const executor = executorAssignment(context);
  if (executor) {
    return fail(
      "ASSIGNMENT_READ_ONLY",
      `The executor worktree of ${executor.id} never pushes; report the commit SHA to the orchestrator.`
    );
  }
  if (context.git.transactions.journal(context.root)) {
    return fail(
      "TRANSACTION_PENDING",
      "A commit transaction is unfinished; run `scripts/workflow repair`."
    );
  }
  if (workflowIntegrationFacade.isActive(context.root)) {
    return fail(
      "INTEGRATION_ACTIVE",
      "An integration is unfinished; run `scripts/workflow integration:continue --id <assignment>`."
    );
  }
  const plan = workflowPlanFacade.read(context.root);
  const refused = pushRefusal(context, plan, parsePushRefs(stdin));
  if (refused) {
    return fail(refused.code, refused.message);
  }
  const docs = pendingDocs(plan);
  if (docs) {
    return fail(
      "DOCS_PENDING",
      `Finish ${docs} (documentation and round digest) before pushing.`
    );
  }
  const report = workflowQualityFacade.runStage({
    config: workflowQualityFacade.readConfig(context.root),
    env: context.env,
    root: context.root,
    stage: "push",
  });
  if (!report.ok) {
    return fail(
      "CHECK_FAILED",
      `Push checks failed:\n${failedSummary(report)}`
    );
  }
  return pass(
    `Workflow push checks passed: ${report.results.map((item) => item.id).join(", ") || "none"}.`
  );
}

/**
 * `git-hook <name>`: the managed git hooks of an installed project. `stdin`
 * is the hook's input (the pushed refs of `pre-push`).
 */
export function runGitHook(
  context: KitContext,
  name: string,
  args: string[],
  stdin = ""
): HookResult {
  try {
    switch (name) {
      case "pre-commit":
        return preCommit(context);
      case "commit-msg":
        return commitMessage(context, args);
      case "post-commit":
        return pass();
      case "pre-push":
        return prePush(context, stdin);
      default:
        return fail("UNKNOWN_HOOK", `Unknown git hook: ${name}`);
    }
  } catch (error) {
    const { code, message } = error as { code?: string; message: string };
    return fail(code ?? "HOOK_ERROR", message);
  }
}
