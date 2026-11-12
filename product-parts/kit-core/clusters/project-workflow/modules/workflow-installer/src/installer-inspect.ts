import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import type {
  GitIdentity,
  WorkflowGitFacade,
} from "../../workflow-git/src/workflow-git-facade.js";
import { PLAN_PATH } from "../../workflow-plan/src/workflow-plan-facade.js";
import {
  ensure,
  workflowPlatformFacade,
} from "../../workflow-platform/src/workflow-platform-facade.js";
import { workflowQualityFacade } from "../../workflow-quality/src/workflow-quality-facade.js";
import {
  KIT_VERSION,
  type KitManifest,
  MANIFEST_PATH,
  readManaged,
  sha256,
} from "./installer-payload.js";

export type FolderState =
  | "EMPTY"
  | "GIT_NO_KIT"
  | "KIT_DAMAGED"
  | "KIT_OK"
  | "KIT_OUTDATED"
  | "LEGACY_HARNESS_PLAN"
  | "MISSING"
  | "NOT_GIT"
  | "PILOT_KIT";

export type FolderAction =
  | "create"
  | "doctor"
  | "install"
  | "install-migrate"
  | "open"
  | "unsupported"
  | "update";

export interface InspectResult {
  action: FolderAction;
  /** Managed files that differ from the manifest. */
  damaged: string[];
  git: {
    head: string | null;
    identity: GitIdentity | null;
    repository: boolean;
  };
  /** The folder sits inside another repository, not at its top level. */
  nestedIn: string | null;
  path: string;
  stacks: string[];
  state: FolderState;
  transactionPending: boolean;
  version: string | null;
}

const PILOT_MANIFEST = ".harness/kit-manifest.json";
const LEGACY_PLAN_SCHEMA = "harness-ai-plan-v1";
const ACTIONS: Readonly<Record<FolderState, FolderAction>> = {
  EMPTY: "install",
  GIT_NO_KIT: "install",
  KIT_DAMAGED: "doctor",
  KIT_OK: "open",
  KIT_OUTDATED: "update",
  LEGACY_HARNESS_PLAN: "install-migrate",
  MISSING: "create",
  NOT_GIT: "install",
  PILOT_KIT: "unsupported",
};

function file(root: string, relative: string): string {
  return path.join(root, ...relative.split("/"));
}

/** Compares dotted versions; negative when `left` is older. */
export function compareVersions(left: string, right: string): number {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

export function readManifest(root: string): KitManifest | null {
  const text = workflowPlatformFacade.readTextIfExists(
    file(root, MANIFEST_PATH)
  );
  if (text === null) {
    return null;
  }
  try {
    return JSON.parse(text) as KitManifest;
  } catch {
    return { files: [], schema: "harness-workflow-manifest/1", version: "0" };
  }
}

/** Managed files whose managed part no longer matches the manifest hash. */
export function damagedFiles(root: string, manifest: KitManifest): string[] {
  return manifest.files
    .filter((item) => item.sha256 !== null)
    .filter((item) => {
      const current = workflowPlatformFacade.readTextIfExists(
        file(root, item.path)
      );
      const managed = readManaged(item.kind, item.path, current);
      return managed === null || sha256(managed) !== item.sha256;
    })
    .map((item) => item.path);
}

function kitState(
  root: string,
  manifest: KitManifest
): { damaged: string[]; state: FolderState } {
  const damaged = damagedFiles(root, manifest);
  if (compareVersions(manifest.version, KIT_VERSION) < 0) {
    return { damaged, state: "KIT_OUTDATED" };
  }
  return { damaged, state: damaged.length > 0 ? "KIT_DAMAGED" : "KIT_OK" };
}

function classify(
  root: string,
  repository: boolean
): { damaged: string[]; state: FolderState } {
  if (readdirSync(root).length === 0) {
    return { damaged: [], state: "EMPTY" };
  }
  if (existsSync(file(root, PILOT_MANIFEST))) {
    return { damaged: [], state: "PILOT_KIT" };
  }
  const manifest = readManifest(root);
  if (manifest) {
    return kitState(root, manifest);
  }
  if (
    (
      workflowPlatformFacade.readTextIfExists(file(root, PLAN_PATH)) ?? ""
    ).includes(LEGACY_PLAN_SCHEMA)
  ) {
    return { damaged: [], state: "LEGACY_HARNESS_PLAN" };
  }
  return { damaged: [], state: repository ? "GIT_NO_KIT" : "NOT_GIT" };
}

/** `inspect <path>`: classifies a folder without changing anything. */
export function inspectFolder(
  git: WorkflowGitFacade,
  folder: string
): InspectResult {
  const root = path.resolve(folder);
  const base = {
    damaged: [],
    nestedIn: null,
    path: root,
    stacks: [],
    transactionPending: false,
    version: null,
  };
  if (!existsSync(root)) {
    const parent = path.dirname(root);
    return {
      ...base,
      action: "create",
      git: {
        head: null,
        identity: existsSync(parent) ? git.identity(parent) : null,
        repository: false,
      },
      state: "MISSING",
    };
  }
  ensure(
    statSync(root).isDirectory(),
    "NOT_A_DIRECTORY",
    `${root} is not a folder.`
  );
  const inside = git.isRepository(root);
  const top = inside ? git.topLevel(root) : null;
  const repository =
    top !== null &&
    workflowPlatformFacade.samePath(
      realpathSync.native(path.resolve(top)),
      realpathSync.native(root)
    );
  const nestedIn = inside && !repository ? top : null;
  const { damaged, state } = classify(root, repository);
  return {
    action: nestedIn ? "unsupported" : ACTIONS[state],
    damaged,
    git: {
      head: repository ? git.head(root) : null,
      identity: git.identity(root),
      repository,
    },
    nestedIn,
    path: root,
    stacks: workflowQualityFacade.detect(root).map((stack) => stack.id),
    state,
    transactionPending: repository && git.transactions.journal(root) !== null,
    version: readManifest(root)?.version ?? null,
  };
}
