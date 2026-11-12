import { createHash } from "node:crypto";
import { readdirSync, rmSync } from "node:fs";
import { workflowGitFacade } from "../../workflow-git/src/workflow-git-facade.js";
import {
  ensure,
  WorkflowError,
  workflowPlatformFacade,
} from "../../workflow-platform/src/workflow-platform-facade.js";
import { workflowQualityFacade } from "../../workflow-quality/src/workflow-quality-facade.js";

const RECORD_VERSION = 1;

/** Lifecycle of an assignment (spec 5.2). */
export type AssignmentStatus =
  | "ASSIGNED"
  | "INTEGRATED"
  | "NEEDS_SETUP"
  | "READY"
  | "READY_FOR_INTEGRATION"
  | "RUNNING";

/** The receipt of a finished `assignment:setup` (spec 5.4). */
export interface AssignmentSetup {
  at: string;
  /** The command line that ran, for example `npm ci`. */
  command: string;
  /** sha256 (hex) of the lock file the command installed from. */
  lockHash: string;
}

/** Worktree and branch removal after integration (spec 7). */
export type AssignmentCleanup =
  | { at: string; status: "DONE" }
  | { at: string; reason: string; status: "PENDING" };

/** `.harness/workflow/local/assignments/<id>.json` in the main checkout. */
export interface AssignmentRecord {
  /** Base commit of the executor worktree: main HEAD at creation. */
  baseCommit: string;
  branch: string | null;
  cleanup: AssignmentCleanup | null;
  /** sha256 of `.harness/workflow/config.json` at creation; null without the file. */
  configDigest: string | null;
  createdAt: string;
  id: string;
  integrationCommit: string | null;
  iteration: number;
  scopeId: string;
  /** The receipt of `assignment:setup`; null until it ran. */
  setup: AssignmentSetup | null;
  sourceCommit: string | null;
  status: AssignmentStatus;
  taskId: string;
  updatedAt: string;
  version: typeof RECORD_VERSION;
  worktree: string | null;
}

export interface NewAssignment {
  baseCommit: string;
  configDigest: string | null;
  iteration: number;
  now: string;
  scopeId: string;
  taskId: string;
}

const RECORDS_DIR = "assignments";
const RECORD_SUFFIX = ".json";
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const UNSAFE_ID_CHARACTERS = /[^A-Za-z0-9._-]/gu;
const STATUSES = new Set<string>([
  "ASSIGNED",
  "INTEGRATED",
  "NEEDS_SETUP",
  "READY",
  "READY_FOR_INTEGRATION",
  "RUNNING",
]);

/** Stable readable id: `<scopeId>-<taskId>-<iteration>` with unsafe characters as `-`. */
export function assignmentId(
  scopeId: string,
  taskId: string,
  iteration: number
): string {
  return `${scopeId}-${taskId}-${iteration}`.replace(UNSAFE_ID_CHARACTERS, "-");
}

function ensureId(id: string): void {
  ensure(
    typeof id === "string" && ID_PATTERN.test(id),
    "ASSIGNMENT_ID",
    `Invalid assignment id: ${String(id)}`
  );
}

function recordsDirectory(root: string): string {
  return workflowGitFacade.localPath(root, RECORDS_DIR);
}

export function recordFile(root: string, id: string): string {
  ensureId(id);
  return workflowGitFacade.localPath(
    root,
    RECORDS_DIR,
    `${id}${RECORD_SUFFIX}`
  );
}

function isRecord(value: unknown, id: string): value is AssignmentRecord {
  const record = value as AssignmentRecord | null;
  return (
    record !== null &&
    typeof record === "object" &&
    record.version === RECORD_VERSION &&
    record.id === id &&
    typeof record.scopeId === "string" &&
    typeof record.taskId === "string" &&
    Number.isSafeInteger(record.iteration) &&
    typeof record.baseCommit === "string" &&
    STATUSES.has(record.status)
  );
}

/** The stored record, or null when the file is missing; an unreadable record fails. */
export function readRecord(root: string, id: string): AssignmentRecord | null {
  const file = recordFile(root, id);
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
  if (!isRecord(parsed, id)) {
    throw new WorkflowError(
      "ASSIGNMENT_RECORD",
      `The assignment record ${id} is unreadable.`,
      { file },
      "Inspect the record file; the Kit does not guess its state."
    );
  }
  return parsed;
}

/** Every record, oldest first (createdAt, then id). */
export function listRecords(root: string): AssignmentRecord[] {
  let names: string[] = [];
  try {
    names = readdirSync(recordsDirectory(root));
  } catch {
    return [];
  }
  return names
    .filter((name) => name.endsWith(RECORD_SUFFIX))
    .map((name) => name.slice(0, -RECORD_SUFFIX.length))
    .filter((id) => ID_PATTERN.test(id))
    .map((id) => readRecord(root, id) as AssignmentRecord)
    .sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.id.localeCompare(right.id)
    );
}

/** Atomic two-space JSON write. */
export function writeRecord(root: string, record: AssignmentRecord): void {
  workflowPlatformFacade.writeFileAtomic(
    recordFile(root, record.id),
    `${JSON.stringify(record, null, 2)}\n`
  );
}

/** Removes the record file; a missing file is not an error. */
export function removeRecord(root: string, id: string): void {
  rmSync(recordFile(root, id), { force: true });
}

/** A record that still occupies its task and a worker: not yet integrated. */
export function isActiveRecord(
  record: Pick<AssignmentRecord, "status">
): boolean {
  return record.status !== "INTEGRATED";
}

/** A new `ASSIGNED` record; nothing about the worktree is known yet. */
export function newRecord(input: NewAssignment): AssignmentRecord {
  return {
    baseCommit: input.baseCommit,
    branch: null,
    cleanup: null,
    configDigest: input.configDigest,
    createdAt: input.now,
    id: assignmentId(input.scopeId, input.taskId, input.iteration),
    integrationCommit: null,
    iteration: input.iteration,
    scopeId: input.scopeId,
    setup: null,
    sourceCommit: null,
    status: "ASSIGNED",
    taskId: input.taskId,
    updatedAt: input.now,
    version: RECORD_VERSION,
    worktree: null,
  };
}

/** sha256 (hex) of the Kit configuration file, or null when it is absent. */
export function configDigest(root: string): string | null {
  const text = workflowPlatformFacade.readTextIfExists(
    workflowQualityFacade.configFile(root)
  );
  return text === null ? null : createHash("sha256").update(text).digest("hex");
}
