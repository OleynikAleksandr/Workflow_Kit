import { randomUUID } from "node:crypto";
import type { WorkflowPlan } from "../../workflow-plan/src/workflow-plan-facade.js";
import {
  type WorkflowError,
  type WorkflowPlatformFacade,
  workflowPlatformFacade,
} from "../../workflow-platform/src/workflow-platform-facade.js";
import {
  type CommitRecord,
  readChanges,
  readCommitPaths,
  readDiffPaths,
  readHistory,
  type WorkingTreeChanges,
} from "./git-history.js";
import {
  type GitIdentity,
  IDENTITY_FIX_COMMANDS,
  type IdentityScope,
  identityRequiredError,
  isPlaceholderIdentity,
  isUsableIdentity,
  type ResolvedIdentity,
  readScopedIdentity,
  resolveIdentity,
  writeGlobalIdentity,
  writeLocalIdentity,
} from "./git-identity.js";
import { type CommitJournal, localPath, readJournal } from "./git-journal.js";
import { resolveTaskReferences, type TaskReference } from "./git-references.js";
import {
  applyRepair,
  cancelRepair,
  planRepair,
  type RepairOutcome,
  type RepairPlan,
} from "./git-repair.js";
import { GitRunner } from "./git-runner.js";
import {
  type FileSelection,
  isKitManagedPath,
  isPrivatePath,
  recordBaseline,
  selectTaskFiles,
  type TaskBaseline,
  type TaskIdentity,
} from "./git-task-files.js";
import {
  absentPaths,
  type CommitRequest,
  type CommitResult,
  commitCandidate,
  confirmedCommit,
  finishConfirmed,
  mergeHead,
  rollbackTransaction,
} from "./git-transaction.js";

export type { CommitRecord, WorkingTreeChanges } from "./git-history.js";
export type {
  GitIdentity,
  IdentityScope,
  ResolvedIdentity,
} from "./git-identity.js";
export type { CommitJournal, CommitRole } from "./git-journal.js";
export { LOCAL_DIR } from "./git-journal.js";
export type { TaskReference } from "./git-references.js";
export type { RepairKind, RepairOutcome, RepairPlan } from "./git-repair.js";
export type { GitOptions, GitOutput } from "./git-runner.js";
export type {
  FileSelection,
  TaskBaseline,
  TaskIdentity,
} from "./git-task-files.js";
export type { CommitRequest, CommitResult } from "./git-transaction.js";

/**
 * Public boundary of the workflow-git module: git queries, the transactional
 * task commit, commit reference resolution and repair.
 */
export class WorkflowGitFacade {
  /** The fix text of identity refusals: the two `git config --global` commands. */
  readonly identityFix = IDENTITY_FIX_COMMANDS;
  readonly git: GitRunner;
  readonly platform: WorkflowPlatformFacade;

  constructor(
    platform: WorkflowPlatformFacade = workflowPlatformFacade,
    env: NodeJS.ProcessEnv = process.env
  ) {
    this.platform = platform;
    this.git = new GitRunner(platform, env);
  }

  isRepository(path: string): boolean {
    return this.git.succeeds(path, ["rev-parse", "--is-inside-work-tree"]);
  }

  topLevel(path: string): string {
    return this.git.text(path, ["rev-parse", "--show-toplevel"]);
  }

  init(root: string, branch = "main"): void {
    this.git.run(root, ["init", "-q", `--initial-branch=${branch}`]);
  }

  /** Full HEAD SHA, or null in a repository without commits. */
  head(root: string): string | null {
    const output = this.git.run(root, ["rev-parse", "--verify", "-q", "HEAD"], {
      allowFailure: true,
    });
    return output.status === 0 ? output.stdout.trim() : null;
  }

  identity(root: string): GitIdentity | null {
    const name = this.git
      .run(root, ["config", "user.name"], { allowFailure: true })
      .stdout.trim();
    const email = this.git
      .run(root, ["config", "user.email"], { allowFailure: true })
      .stdout.trim();
    return name && email ? { email, name } : null;
  }

  /** Identity from one config file only (`local` or `global`); null when incomplete. */
  readIdentity(root: string, scope: IdentityScope): GitIdentity | null {
    return readScopedIdentity(this.git, root, scope);
  }

  /** Local identity, else global; unusable ones are skipped. */
  resolveIdentity(root: string): ResolvedIdentity | null {
    return resolveIdentity(this.git, root);
  }

  isPlaceholderIdentity(identity: GitIdentity): boolean {
    return isPlaceholderIdentity(identity);
  }

  /** True when the identity is neither invalid nor a placeholder. */
  isUsableIdentity(identity: GitIdentity): boolean {
    return isUsableIdentity(identity);
  }

  /** The GIT_IDENTITY_REQUIRED refusal (message once, fix in nextAction). */
  identityRequired(configured: boolean, suffix = ""): WorkflowError {
    return identityRequiredError(configured, suffix);
  }

  /** Writes a validated identity to the repository-local config (GIT_IDENTITY_INVALID / GIT_IDENTITY_PLACEHOLDER otherwise). */
  writeLocalIdentity(root: string, identity: GitIdentity): void {
    writeLocalIdentity(this.git, root, identity);
  }

  /** `identity:set --global`: validates and writes `user.name` / `user.email` to the global config; returns the trimmed identity. */
  writeGlobalIdentity(cwd: string, identity: GitIdentity): GitIdentity {
    return writeGlobalIdentity(this.git, cwd, identity);
  }

  changes(root: string): WorkingTreeChanges {
    return readChanges(this.git, root);
  }

  history(root: string, from: string | null, tip = "HEAD"): CommitRecord[] {
    return readHistory(this.git, root, from, tip);
  }

  commitPaths(root: string, sha: string): string[] {
    return readCommitPaths(this.git, root, sha);
  }

  /** Paths that differ between two commits (renames as delete plus add), sorted. */
  diffPaths(root: string, from: string, to: string): string[] {
    return readDiffPaths(this.git, root, from, to);
  }

  isAncestor(root: string, ancestor: string, descendant: string): boolean {
    return this.git.succeeds(root, [
      "merge-base",
      "--is-ancestor",
      ancestor,
      descendant,
    ]);
  }

  /** File content at a revision (`:path` reads the index); null when absent. */
  show(root: string, revision: string, path: string): string | null {
    const output = this.git.run(root, ["show", `${revision}:${path}`], {
      allowFailure: true,
    });
    return output.status === 0 ? output.stdout : null;
  }

  config(root: string, key: string): string | null {
    const value = this.git
      .run(root, ["config", "--get", key], { allowFailure: true })
      .stdout.trim();
    return value === "" ? null : value;
  }

  setConfig(root: string, key: string, value: string): void {
    this.git.run(root, ["config", key, value]);
  }

  localPath(root: string, ...parts: string[]): string {
    return localPath(root, ...parts);
  }

  isKitManagedPath(file: string): boolean {
    return isKitManagedPath(file);
  }

  isPrivatePath(file: string): boolean {
    return isPrivatePath(file);
  }

  /** Snapshot of the edits that existed when a task started. */
  beginTask(root: string, identity: TaskIdentity): TaskBaseline {
    return recordBaseline(root, identity, this.changes(root).all);
  }

  selectTaskFiles(
    root: string,
    identity: TaskIdentity,
    explicit?: string[]
  ): FileSelection {
    return selectTaskFiles(root, identity, this.changes(root).all, explicit);
  }

  /** Journaled commit transaction (see module.md). */
  get transactions(): TransactionApi {
    return {
      cancel: (root) => {
        const journal = readJournal(root);
        return journal ? rollbackTransaction(this.git, root, journal) : false;
      },
      commit: (root, request) =>
        commitCandidate(
          this.git,
          root,
          request,
          request.transactionId ?? randomUUID()
        ),
      confirmed: (root, journal) => confirmedCommit(this.git, root, journal),
      finish: (root) => finishConfirmed(this.git, root),
      journal: (root) => readJournal(root),
    };
  }

  /**
   * Paths of `files` the commit candidate will not contain: outside the
   * index and missing on disk or ignored by git (the paths `stage` skips).
   */
  absentPaths(root: string, files: string[]): string[] {
    const absent = absentPaths(this.git, root, files);
    return files.filter((file) => absent.has(file));
  }

  /** The commit being merged (`MERGE_HEAD`), or null without a merge in progress. */
  mergeHead(root: string): string | null {
    return mergeHead(this.git, root);
  }

  /** Paths with unresolved merge conflicts, sorted. */
  conflicts(root: string): string[] {
    return this.git
      .run(root, ["diff", "--name-only", "-z", "--diff-filter=U"])
      .stdout.split("\u0000")
      .filter(Boolean)
      .sort();
  }

  /** Maps each task to its commit; throws when plan and history disagree. */
  resolveReferences(
    root: string,
    plan: WorkflowPlan,
    planPath: string
  ): Map<string, TaskReference> {
    return resolveTaskReferences(
      this.git,
      root,
      plan,
      planPath,
      readJournal(root)
    );
  }

  planRepair(root: string, planPath: string): RepairPlan {
    return planRepair(this.git, root, planPath);
  }

  applyRepair(root: string, planPath: string, repairId: string): RepairOutcome {
    return applyRepair(this.git, root, planPath, repairId);
  }

  cancelRepair(
    root: string,
    planPath: string,
    repairId: string
  ): RepairOutcome {
    return cancelRepair(this.git, root, planPath, repairId);
  }

  /** Absolute path of a path inside the git directory (e.g. `hooks`, `index`). */
  gitPath(root: string, name: string): string {
    const value = this.git.text(root, [
      "rev-parse",
      "--path-format=absolute",
      "--git-path",
      name,
    ]);
    return value;
  }
}

export interface TransactionApi {
  cancel(root: string): boolean;
  commit(root: string, request: CommitRequest): CommitResult;
  confirmed(root: string, journal: CommitJournal): string | null;
  finish(root: string): CommitResult | null;
  journal(root: string): CommitJournal | null;
}

export const workflowGitFacade = new WorkflowGitFacade();
