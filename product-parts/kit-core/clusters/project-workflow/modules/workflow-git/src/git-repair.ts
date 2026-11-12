import { readFileSync } from "node:fs";
import path from "node:path";
import { workflowPlanFacade } from "../../workflow-plan/src/workflow-plan-facade.js";
import {
  ensure,
  workflowPlatformFacade,
} from "../../workflow-platform/src/workflow-platform-facade.js";
import { readJournal, sha256 } from "./git-journal.js";
import type { GitRunner } from "./git-runner.js";
import {
  type CommitResult,
  commitCandidate,
  confirmedCommit,
  discardPreparation,
  finishConfirmed,
  rollbackTransaction,
} from "./git-transaction.js";

export type RepairKind =
  | "defer-docs"
  | "finish-commit"
  | "none"
  | "projection"
  | "retry-commit";

export interface RepairPlan {
  kind: RepairKind;
  message: string;
  repairId: string;
}

export interface RepairOutcome {
  commit: CommitResult | null;
  kind: RepairKind | "cancel";
  message: string;
}

const MESSAGES: Record<RepairKind, string> = {
  "defer-docs":
    "Move the in-progress DOCS task back to TODO until the added work is done; files are kept.",
  "finish-commit": "The commit exists; finish the transaction bookkeeping.",
  none: "No damage found.",
  projection: "Rebuild the readable part of the plan from its JSON state.",
  "retry-commit": "Repeat the prepared commit transaction; edits are kept.",
};

function head(git: GitRunner, root: string): string {
  return git
    .run(root, ["rev-parse", "--verify", "-q", "HEAD"], { allowFailure: true })
    .stdout.trim();
}

function planText(root: string, planPath: string): string {
  return (
    workflowPlatformFacade.readTextIfExists(
      path.join(root, ...planPath.split("/"))
    ) ?? ""
  );
}

function detect(git: GitRunner, root: string, planPath: string): RepairKind {
  const journal = readJournal(root);
  if (journal) {
    return confirmedCommit(git, root, journal)
      ? "finish-commit"
      : "retry-commit";
  }
  const text = planText(root, planPath);
  if (!workflowPlanFacade.isPlanDocument(text)) {
    return "none";
  }
  const plan = workflowPlanFacade.parse(text, { projection: false });
  if (workflowPlanFacade.render(plan) !== text.replaceAll("\r\n", "\n")) {
    return "projection";
  }
  const current = plan.tasks.find((task) => task.id === plan.currentTaskId);
  const waiting =
    current?.kind === "docs" &&
    current.dependencies.some(
      (id) => plan.tasks.find((task) => task.id === id)?.status !== "DONE"
    );
  return waiting ? "defer-docs" : "none";
}

/** Dry run: what repair would do, with an id that pins the observed state. */
export function planRepair(
  git: GitRunner,
  root: string,
  planPath: string
): RepairPlan {
  const kind = detect(git, root, planPath);
  const journal = readJournal(root);
  const repairId = sha256(
    JSON.stringify([
      kind,
      head(git, root),
      sha256(planText(root, planPath)),
      journal?.id ?? null,
    ])
  ).slice(0, 24);
  return { kind, message: MESSAGES[kind], repairId };
}

function retry(git: GitRunner, root: string, repairId: string): CommitResult {
  const journal = readJournal(root);
  ensure(journal, "NO_TRANSACTION", "There is no transaction to retry.");
  ensure(
    rollbackTransaction(git, root, journal),
    "REPAIR_MANUAL",
    "HEAD, plan or index changed after preparation; the prepared commit cannot be repeated.",
    {},
    `Cancel the preparation with \`scripts/workflow repair --cancel ${repairId}\` (working-tree edits are kept), then repeat the commit command.`
  );
  return commitCandidate(
    git,
    root,
    {
      assignmentId: journal.assignmentId ?? null,
      checks: journal.checks,
      excluded: journal.excluded,
      files: journal.selected.filter((file) => file !== journal.planPath),
      iteration: journal.iteration,
      message: journal.message,
      planPath: journal.planPath,
      planText: journal.candidatePlan,
      role: journal.role,
      scopeId: journal.scopeId,
      sourceCommit: journal.sourceCommit ?? null,
      taskId: journal.taskId,
    },
    journal.id
  );
}

export function applyRepair(
  git: GitRunner,
  root: string,
  planPath: string,
  repairId: string
): RepairOutcome {
  const planned = planRepair(git, root, planPath);
  ensure(
    planned.repairId === repairId,
    "REPAIR_CHANGED",
    "The project changed; run `repair` again for a fresh id."
  );
  if (planned.kind === "finish-commit") {
    return {
      commit: finishConfirmed(git, root),
      kind: planned.kind,
      message: planned.message,
    };
  }
  if (planned.kind === "retry-commit") {
    return {
      commit: retry(git, root, repairId),
      kind: planned.kind,
      message: planned.message,
    };
  }
  const text = readFileSync(path.join(root, ...planPath.split("/")), "utf8");
  const plan = workflowPlanFacade.parse(text, { projection: false });
  if (planned.kind === "projection") {
    workflowPlanFacade.write(root, plan);
  } else if (planned.kind === "defer-docs") {
    workflowPlanFacade.write(root, workflowPlanFacade.deferDocs(plan));
  }
  return { commit: null, kind: planned.kind, message: planned.message };
}

export function cancelRepair(
  git: GitRunner,
  root: string,
  planPath: string,
  repairId: string
): RepairOutcome {
  const planned = planRepair(git, root, planPath);
  ensure(
    planned.repairId === repairId,
    "REPAIR_CHANGED",
    "The project changed; run `repair` again for a fresh id."
  );
  ensure(
    planned.kind === "retry-commit",
    "NO_PREPARATION",
    "Only an unconfirmed commit preparation can be cancelled."
  );
  const journal = readJournal(root);
  ensure(journal, "NO_PREPARATION", "There is no preparation to cancel.");
  if (rollbackTransaction(git, root, journal)) {
    return {
      commit: null,
      kind: "cancel",
      message: "Preparation cancelled; edits are kept and the task stays open.",
    };
  }
  // The index or plan changed after the preparation. With HEAD unchanged the
  // state before the preparation is restored; working-tree files stay.
  const now = head(git, root) || null;
  ensure(
    now === journal.beforeHead,
    "REPAIR_MANUAL",
    `HEAD moved from ${journal.beforeHead ?? "no commit"} to ${now ?? "no commit"} after the preparation; the Kit does not undo commits.`,
    { beforeHead: journal.beforeHead, head: now },
    journal.beforeHead
      ? `Ask the user. To cancel the preparation, return HEAD with \`git reset --soft ${journal.beforeHead}\` (every change stays in the working tree) and run \`scripts/workflow repair\` again.`
      : "Ask the user how to resolve it; the Kit cannot restore a repository that had no commit."
  );
  discardPreparation(git, root, journal);
  return {
    commit: null,
    kind: "cancel",
    message:
      "Preparation cancelled: the index and plan were restored from before the preparation; working-tree files are kept and the task stays open.",
  };
}
