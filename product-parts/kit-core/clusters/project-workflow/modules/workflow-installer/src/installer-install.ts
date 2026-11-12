import { chmodSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import type {
  CommitResult,
  GitIdentity,
  WorkflowGitFacade,
} from "../../workflow-git/src/workflow-git-facade.js";
import {
  PLAN_PATH,
  workflowPlanFacade,
} from "../../workflow-plan/src/workflow-plan-facade.js";
import {
  ensure,
  RUNTIME_FILE,
  WorkflowError,
  type WorkflowPlatform,
  workflowPlatformFacade,
} from "../../workflow-platform/src/workflow-platform-facade.js";
import {
  type WorkflowConfig,
  workflowQualityFacade,
} from "../../workflow-quality/src/workflow-quality-facade.js";
import { type FolderState, inspectFolder } from "./installer-inspect.js";
import {
  buildManifest,
  buildPayload,
  KIT_VERSION,
  MANIFEST_PATH,
  OWN_HOOKS_DIR,
  type PayloadEntry,
  renderManifest,
} from "./installer-payload.js";

export interface InstallOptions {
  /** Text of the Kit bundle copied into the project. */
  bundle: string;
  /** Host marker written to `config.host`; an existing marker is kept. */
  host?: "harness" | null;
  name?: string;
  /** Runtime recorded for the launchers (Electron inside Harness). */
  runtime?: { executable: string; mode: "electron" | "node" } | null;
  update?: boolean;
  /** OS whose rules apply (default: this process); win32 has no executable bits. */
  platform?: WorkflowPlatform;
}

export interface InstallOutcome {
  commit: CommitResult | null;
  /** Changes that existed before and stay out of the commit. */
  excluded: string[];
  hooksPath: string;
  migrationRequired: boolean;
  previousState: FolderState;
  root: string;
  version: string;
  written: string[];
}

const KIT_STATES = new Set<FolderState>([
  "KIT_DAMAGED",
  "KIT_OK",
  "KIT_OUTDATED",
]);
const SLUG_DROP = /[^a-z0-9]+/gu;
const SLUG_TRIM = /^-+|-+$/gu;

export function projectSlug(name: string): string {
  return (
    name.toLowerCase().replace(SLUG_DROP, "-").replace(SLUG_TRIM, "") ||
    "project"
  );
}

function file(root: string, relative: string): string {
  return path.join(root, ...relative.split("/"));
}

/** Local `core.hooksPath` relative to the root, or null when unset. */
function localHooksPath(git: WorkflowGitFacade, root: string): string | null {
  const value = git.git
    .run(root, ["config", "--local", "--get", "core.hooksPath"], {
      allowFailure: true,
    })
    .stdout.trim();
  if (value === "") {
    return null;
  }
  let relative: string;
  try {
    relative = workflowPlatformFacade.relativeFromRoot(
      root,
      path.resolve(root, value)
    );
  } catch {
    throw new WorkflowError(
      "HOOKS_PATH_OUTSIDE",
      `core.hooksPath points outside the project: ${value}`
    );
  }
  return relative === OWN_HOOKS_DIR ? null : relative;
}

function writeIfChanged(
  root: string,
  relative: string,
  next: string,
  executable: boolean,
  platform: WorkflowPlatform = workflowPlatformFacade.platform
): boolean {
  const target = file(root, relative);
  const changed = workflowPlatformFacade.readTextIfExists(target) !== next;
  if (changed) {
    workflowPlatformFacade.writeFileAtomic(target, next);
  }
  if (executable && platform !== "win32") {
    chmodSync(target, 0o755);
  }
  return changed;
}

function checkPreconditions(
  state: FolderState,
  update: boolean,
  nestedIn: string | null,
  pending: boolean
): void {
  ensure(
    !nestedIn,
    "NESTED_REPOSITORY",
    `The folder is inside the repository ${nestedIn}; choose its top level or another folder.`
  );
  ensure(
    state !== "PILOT_KIT",
    "PILOT_KIT_UNSUPPORTED",
    "This project uses Workflow Pilot (Kit 1.x), which Harness does not support."
  );
  ensure(
    !pending,
    "TRANSACTION_PENDING",
    "A Kit commit transaction is unfinished.",
    {},
    "Run `scripts/workflow repair`."
  );
  if (update) {
    ensure(
      KIT_STATES.has(state),
      "NOT_INSTALLED",
      "The Workflow Kit is not installed here; install it first."
    );
  } else {
    ensure(
      !KIT_STATES.has(state),
      "ALREADY_INSTALLED",
      "The Workflow Kit is already installed.",
      {},
      "Use `install --update` or `doctor --fix`."
    );
  }
}

function writePayload(
  root: string,
  entries: PayloadEntry[],
  platform: WorkflowPlatform
): string[] {
  const written: string[] = [];
  for (const entry of entries) {
    const current = workflowPlatformFacade.readTextIfExists(
      file(root, entry.path)
    );
    if (
      writeIfChanged(
        root,
        entry.path,
        entry.render(current),
        entry.executable,
        platform
      )
    ) {
      written.push(entry.path);
    }
  }
  return written;
}

/**
 * Writes the default configuration when it is absent, or only the host
 * marker into an existing one; returns true when the file changed.
 */
function writeConfig(root: string, host: InstallOptions["host"]): boolean {
  const exists =
    workflowPlatformFacade.readTextIfExists(
      workflowQualityFacade.configFile(root)
    ) !== null;
  const config: WorkflowConfig & { host?: string } = exists
    ? workflowQualityFacade.readConfig(root)
    : workflowQualityFacade.defaultConfig();
  if (exists && (!host || config.host === host)) {
    return false;
  }
  workflowQualityFacade.writeConfig(root, host ? { ...config, host } : config);
  return true;
}

/** Writes configuration, manifest and runtime; returns the written paths. */
function writeState(
  root: string,
  entries: PayloadEntry[],
  options: InstallOptions
): string[] {
  const written: string[] = [];
  if (writeConfig(root, options.host)) {
    written.push(workflowQualityFacade.configPath);
  }
  if (
    writeIfChanged(
      root,
      MANIFEST_PATH,
      renderManifest(buildManifest(entries)),
      false
    )
  ) {
    written.push(MANIFEST_PATH);
  }
  const runtime = options.runtime;
  if (runtime) {
    workflowPlatformFacade.writeFileAtomic(
      file(root, RUNTIME_FILE),
      workflowPlatformFacade.formatRuntimeFile(runtime.executable, runtime.mode)
    );
  }
  return written;
}

/**
 * The identity the bootstrap commit will be signed with: the real local one
 * of an existing repository, else the real global one (placeholders and
 * invalid ones are skipped). Fails with GIT_IDENTITY_REQUIRED before
 * anything is written.
 */
function requireInstallIdentity(
  git: WorkflowGitFacade,
  root: string,
  repository: boolean
): GitIdentity {
  const local = repository ? git.readIdentity(root, "local") : null;
  if (local && git.isUsableIdentity(local)) {
    return local;
  }
  // The global config does not depend on the directory; a new folder may not exist yet.
  const global = git.readIdentity(
    existsSync(root) ? root : process.cwd(),
    "global"
  );
  if (global && git.isUsableIdentity(global)) {
    return global;
  }
  throw git.identityRequired(Boolean(local || global), " Nothing was written.");
}

function scopeOf(planText: string, legacy: boolean): string | null {
  if (legacy) {
    return null;
  }
  try {
    return workflowPlanFacade.parse(planText).scope?.id ?? null;
  } catch {
    return null;
  }
}

function commitInstall(
  git: WorkflowGitFacade,
  root: string,
  files: string[],
  planText: string,
  update: boolean,
  scopeId: string | null
): CommitResult | null {
  try {
    return git.transactions.commit(root, {
      files,
      message: update
        ? `chore: update workflow kit to ${KIT_VERSION}`
        : `chore: install workflow kit ${KIT_VERSION}`,
      planPath: PLAN_PATH,
      planText,
      role: update ? "kit-update" : "bootstrap",
      scopeId,
      taskId: null,
    });
  } catch (error) {
    if (error instanceof WorkflowError && error.code === "NOTHING_TO_COMMIT") {
      return null;
    }
    throw error;
  }
}

/** `install <path> [--update]`: writes the Kit and commits it through a transaction. */
export function installKit(
  git: WorkflowGitFacade,
  folder: string,
  options: InstallOptions
): InstallOutcome {
  const inspected = inspectFolder(git, folder);
  const root = inspected.path;
  const update = options.update === true;
  checkPreconditions(
    inspected.state,
    update,
    inspected.nestedIn,
    inspected.transactionPending
  );
  ensure(
    options.host === undefined ||
      options.host === null ||
      options.host === "harness",
    "USAGE",
    "--host is harness."
  );
  const identity = requireInstallIdentity(git, root, inspected.git.repository);
  mkdirSync(root, { recursive: true });
  if (!inspected.git.repository) {
    git.init(root);
  }
  // Every worktree reads the repository config, so all agents sign alike.
  const local = git.readIdentity(root, "local");
  if (!(local && git.isUsableIdentity(local))) {
    git.writeLocalIdentity(root, identity);
  }
  const hooksPath = localHooksPath(git, root);
  const before = new Set(git.changes(root).all);
  const name = options.name?.trim() || path.basename(root);
  const entries = buildPayload({
    bundle: options.bundle,
    hooksPath,
    projectName: name,
  });
  const written = [
    ...writePayload(
      root,
      entries,
      options.platform ?? workflowPlatformFacade.platform
    ),
    ...writeState(root, entries, options),
  ];
  const migrationRequired = inspected.state === "LEGACY_HARNESS_PLAN";
  const existingPlan = workflowPlatformFacade.readTextIfExists(
    file(root, PLAN_PATH)
  );
  const planText =
    existingPlan ??
    workflowPlanFacade.render(
      workflowPlanFacade.createEmpty(projectSlug(name), name)
    );
  if (hooksPath === null) {
    git.setConfig(root, "core.hooksPath", OWN_HOOKS_DIR);
  }
  const commit = commitInstall(
    git,
    root,
    written,
    planText,
    update,
    scopeOf(planText, migrationRequired || existingPlan === null)
  );
  return {
    commit,
    excluded: [...before].filter((item) => !written.includes(item)).sort(),
    hooksPath: hooksPath ?? OWN_HOOKS_DIR,
    migrationRequired,
    previousState: inspected.state,
    root,
    version: KIT_VERSION,
    written,
  };
}
