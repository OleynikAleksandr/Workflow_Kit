import { rmSync } from "node:fs";
import {
  type WorkflowGitFacade,
  workflowGitFacade,
} from "../../workflow-git/src/workflow-git-facade.js";
import {
  WorkflowError,
  workflowPlatformFacade,
} from "../../workflow-platform/src/workflow-platform-facade.js";

/**
 * Phases of an integration (spec 7). PREPARED → MERGING → CONFLICT or
 * CHECKING → CHECKS_FAILED; the journal is removed when the integration is
 * done or aborted. UNKNOWN: the state cannot be proven; never retried.
 */
export type IntegrationPhase =
  | "CHECKING"
  | "CHECKS_FAILED"
  | "CONFLICT"
  | "MERGING"
  | "PREPARED"
  | "UNKNOWN";

/** `.harness/workflow/local/integration.json` of the main checkout. */
export interface IntegrationJournal {
  assignmentId: string;
  /** The last failure output (merge or checks), or null. */
  error: string | null;
  /** HEAD of main before the merge: the first parent of the integration commit. */
  mainHead: string;
  /** Id of the operation; the transaction id of the integration commit. */
  operationId: string;
  phase: IntegrationPhase;
  /** The proven executor source: the second parent. */
  source: string;
  startedAt: string;
  taskId: string;
}

const JOURNAL_FILE = "integration.json";
const PHASES = new Set<string>([
  "CHECKING",
  "CHECKS_FAILED",
  "CONFLICT",
  "MERGING",
  "PREPARED",
  "UNKNOWN",
]);

/** Absolute path of the integration journal of a checkout. */
export function journalFile(root: string): string {
  return workflowGitFacade.localPath(root, JOURNAL_FILE);
}

function isJournal(value: unknown): value is IntegrationJournal {
  const journal = value as IntegrationJournal | null;
  return (
    journal !== null &&
    typeof journal === "object" &&
    [
      journal.assignmentId,
      journal.mainHead,
      journal.operationId,
      journal.source,
      journal.taskId,
    ].every((field) => typeof field === "string" && field !== "") &&
    PHASES.has(journal.phase)
  );
}

/** The stored journal, or null; an unreadable journal fails (never guessed). */
export function readJournal(root: string): IntegrationJournal | null {
  const file = journalFile(root);
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
  if (!isJournal(parsed)) {
    throw new WorkflowError(
      "INTEGRATION_UNKNOWN",
      "The integration journal is unreadable.",
      { file },
      "Inspect main (`git status`) and the journal; the Kit does not guess the state."
    );
  }
  return parsed;
}

export function saveJournal(root: string, journal: IntegrationJournal): void {
  workflowPlatformFacade.writeFileAtomic(
    journalFile(root),
    `${JSON.stringify(journal, null, 2)}\n`
  );
}

export function removeJournal(root: string): void {
  rmSync(journalFile(root), { force: true });
}

/** `integration:status`: the journal and the merge state of main. */
export interface IntegrationState {
  conflicts: string[];
  journal: IntegrationJournal | null;
  mergeHead: string | null;
  status: IntegrationPhase | "IDLE";
}

/** `integration:status`: IDLE, or the journal phase with conflicts and MERGE_HEAD. */
export function integrationState(
  git: WorkflowGitFacade,
  root: string
): IntegrationState {
  const journal = readJournal(root);
  const mergeHead = git.mergeHead(root);
  return {
    conflicts: mergeHead ? git.conflicts(root) : [],
    journal,
    mergeHead,
    status: journal?.phase ?? "IDLE",
  };
}
