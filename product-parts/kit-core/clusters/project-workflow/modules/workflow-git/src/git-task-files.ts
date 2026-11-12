import { existsSync, lstatSync, readFileSync, readlinkSync } from "node:fs";
import path from "node:path";
import {
  ensure,
  workflowPlatformFacade,
} from "../../workflow-platform/src/workflow-platform-facade.js";
import { localPath, sha256 } from "./git-journal.js";

export interface TaskIdentity {
  iteration: number;
  scopeId: string;
  taskId: string;
}

export interface TaskBaseline extends TaskIdentity {
  fingerprints: Record<string, string>;
  preexisting: string[];
}

export interface FileSelection {
  excluded: string[];
  preexisting: string[] | null;
  selected: string[];
}

const PRIVATE_PATTERNS = [
  /(?:^|\/)\.env(?:\.[^/]*)?$/u,
  /\.(?:pem|key|p12|pfx)$/iu,
  /(?:^|\/)id_(?:rsa|ed25519|ecdsa)(?:\.pub)?$/u,
  /(?:^|\/)\.npmrc$/u,
];
const KIT_MANAGED_PREFIXES = [
  ".harness/workflow/",
  ".harness/plans/",
  ".harness/runtime/",
];

export function isPrivatePath(file: string): boolean {
  return PRIVATE_PATTERNS.some((pattern) => pattern.test(file));
}

export function isKitManagedPath(file: string): boolean {
  return KIT_MANAGED_PREFIXES.some((prefix) => file.startsWith(prefix));
}

function baselineFile(root: string, identity: TaskIdentity): string {
  const key = sha256(
    JSON.stringify([identity.scopeId, identity.taskId, identity.iteration])
  ).slice(0, 24);
  return localPath(root, "task-files", `${key}.json`);
}

function fingerprint(root: string, file: string): string {
  const absolute = path.join(root, ...file.split("/"));
  const stat = lstatSync(absolute, { throwIfNoEntry: false });
  if (!stat) {
    return "deleted";
  }
  if (stat.isSymbolicLink()) {
    return `link:${readlinkSync(absolute)}`;
  }
  return stat.isDirectory() ? "directory" : sha256(readFileSync(absolute));
}

/** Records the changes that already existed when the task started. */
export function recordBaseline(
  root: string,
  identity: TaskIdentity,
  changed: string[]
): TaskBaseline {
  const preexisting = changed.filter((file) => !isKitManagedPath(file));
  const baseline: TaskBaseline = {
    ...identity,
    fingerprints: Object.fromEntries(
      preexisting.map((file) => [file, fingerprint(root, file)])
    ),
    preexisting,
  };
  workflowPlatformFacade.writeFileAtomic(
    baselineFile(root, identity),
    `${JSON.stringify(baseline, null, 2)}\n`
  );
  return baseline;
}

function readBaseline(
  root: string,
  identity: TaskIdentity
): TaskBaseline | null {
  const file = baselineFile(root, identity);
  return existsSync(file)
    ? (JSON.parse(readFileSync(file, "utf8")) as TaskBaseline)
    : null;
}

/**
 * Chooses the files of a task commit: explicit files when given, otherwise
 * everything changed since task:start. Kit state and private files are never
 * chosen implicitly; everything else that changed is reported as excluded.
 */
export function selectTaskFiles(
  root: string,
  identity: TaskIdentity,
  changed: string[],
  explicit?: string[]
): FileSelection {
  const baseline = readBaseline(root, identity);
  let selected: string[];
  if (explicit) {
    selected = [
      ...new Set(
        explicit.map((file) => workflowPlatformFacade.normalizeRelative(file))
      ),
    ];
    for (const file of selected) {
      ensure(
        !isKitManagedPath(file),
        "MANAGED_FILE",
        `Workflow Kit state changes only through its commands: ${file}`,
        { path: file }
      );
    }
  } else {
    ensure(
      baseline,
      "TASK_FILES_UNKNOWN",
      "There is no task:start snapshot; list the files with --files.",
      {},
      `commit --task ${identity.taskId} --files '["path/to/file"]'`
    );
    const mixed = baseline.preexisting.filter(
      (file) =>
        changed.includes(file) &&
        baseline.fingerprints[file] !== fingerprint(root, file)
    );
    ensure(
      mixed.length === 0,
      "EXISTING_EDITS_CHANGED",
      "Files that had edits before the task changed again; choose the files explicitly with --files.",
      { paths: mixed }
    );
    selected = changed.filter(
      (file) =>
        !(
          baseline.preexisting.includes(file) ||
          isKitManagedPath(file) ||
          isPrivatePath(file)
        )
    );
  }
  const actual = selected.filter((file) => changed.includes(file)).sort();
  return {
    excluded: changed.filter(
      (file) => !(actual.includes(file) || isKitManagedPath(file))
    ),
    preexisting: baseline?.preexisting ?? null,
    selected: actual,
  };
}
