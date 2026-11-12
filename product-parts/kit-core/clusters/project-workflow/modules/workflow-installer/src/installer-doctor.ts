import path from "node:path";
import type {
  GitIdentity,
  WorkflowGitFacade,
} from "../../workflow-git/src/workflow-git-facade.js";
import {
  type WorkflowPlatform,
  type WorkflowPlatformFacade,
  workflowPlatformFacade,
} from "../../workflow-platform/src/workflow-platform-facade.js";
import { workflowQualityFacade } from "../../workflow-quality/src/workflow-quality-facade.js";
import {
  check,
  type DoctorCheck,
  hooksCheck,
  manifestChecks,
  planChecks,
} from "./installer-doctor-checks.js";
import {
  type InstallOptions,
  type InstallOutcome,
  installKit,
} from "./installer-install.js";

export type { DoctorCheck, DoctorStatus } from "./installer-doctor-checks.js";

type RuntimeProbe = Parameters<WorkflowPlatformFacade["resolveRuntime"]>[2];

export interface DoctorReport {
  checks: DoctorCheck[];
  fix: InstallOutcome | null;
  /** The global identity the fix copied into the repository config. */
  identityFix: GitIdentity | null;
  ok: boolean;
  root: string;
}

export interface DoctorOptions {
  env?: NodeJS.ProcessEnv;
  /** Safe fixes: rewrite managed files, hooks and modes (a kit-update commit). */
  fix?: Pick<InstallOptions, "bundle" | "runtime"> | null;
  probe?: RuntimeProbe;
  /** OS whose rules apply (default: this process); win32 has no executable bits. */
  platform?: WorkflowPlatform;
}

/** The real global identity, or null when it is missing, a placeholder or invalid. */
function realGlobalIdentity(
  git: WorkflowGitFacade,
  root: string
): GitIdentity | null {
  const global = git.readIdentity(root, "global");
  return global && git.isUsableIdentity(global) ? global : null;
}

/** Kit commits sign with the repository-local identity only. */
function identityCheck(git: WorkflowGitFacade, root: string): DoctorCheck {
  const local = git.readIdentity(root, "local");
  if (local && git.isUsableIdentity(local)) {
    return check(
      "git-identity",
      "ok",
      `${local.name} <${local.email}> (repository config).`
    );
  }
  const problem = local
    ? `The repository git identity ${local.name} <${local.email}> is a placeholder or invalid.`
    : "The repository config has no git identity.";
  const global = realGlobalIdentity(git, root);
  return global
    ? check(
        "git-identity",
        "fail",
        problem,
        true,
        `Run \`scripts/workflow doctor --fix\` to copy ${global.name} <${global.email}> from the global config.`
      )
    : check("git-identity", "fail", problem, false, git.identityFix);
}

function environmentChecks(
  git: WorkflowGitFacade,
  root: string,
  options: DoctorOptions
): DoctorCheck[] {
  const runtime = workflowPlatformFacade.resolveRuntime(
    root,
    options.env ?? process.env,
    options.probe
  );
  const drift = workflowQualityFacade.drift(root);
  return [
    runtime
      ? check(
          "runtime",
          "ok",
          `${runtime.mode} ${runtime.version} (${runtime.source}).`
        )
      : check(
          "runtime",
          "fail",
          "No Node.js 22+ runtime for the launchers.",
          false,
          "Install Node.js 22 or newer, or open the project in Harness AI."
        ),
    identityCheck(git, root),
    drift.status === "drift"
      ? check(
          "quality-drift",
          "warn",
          `Quality profile drift: new ${drift.added.join(", ") || "none"}, missing ${drift.missing.join(", ") || "none"}.`,
          false,
          "Extend the plan with a QUALITY task."
        )
      : check(
          "quality-drift",
          "ok",
          drift.status === "discovery"
            ? "Quality profile not configured yet."
            : "Quality profile matches the stacks."
        ),
  ];
}

/** Path segments and prefixes the documents scan skips. */
const SKIPPED_SEGMENTS = new Set([".git", "node_modules"]);
const SKIPPED_PREFIXES = [".harness/workflow/", ".harness/plans/archive/"];

/** Tracked and untracked-not-ignored Markdown files of the project. */
function projectMarkdown(git: WorkflowGitFacade, root: string): string[] {
  const output = git.git.run(
    root,
    [
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      "*.md",
      "*.markdown",
    ],
    { allowFailure: true }
  );
  if (output.status !== 0) {
    return [];
  }
  const files = output.stdout
    .split("\0")
    .filter(
      (item) =>
        item !== "" &&
        !item.split("/").some((segment) => SKIPPED_SEGMENTS.has(segment)) &&
        !SKIPPED_PREFIXES.some((prefix) => item.startsWith(prefix))
    );
  return [...new Set(files)].sort((left, right) => (left < right ? -1 : 1));
}

/** Every project document must fit `budget.documentBytes` (one Read). */
function documentSizeCheck(git: WorkflowGitFacade, root: string): DoctorCheck {
  const config = workflowQualityFacade.readConfig(root);
  const limit = config.budget.documentBytes;
  const over = workflowQualityFacade.oversizedDocuments(
    root,
    projectMarkdown(git, root),
    config
  );
  return over.length === 0
    ? check("doc-size", "ok", `Markdown documents fit ${limit} bytes.`)
    : check(
        "doc-size",
        "warn",
        `Documents over ${limit} bytes cannot be read in one Read: ${over
          .map((item) => `${item.path} (${item.bytes} bytes)`)
          .join(", ")}.`,
        false,
        "Split each listed document into smaller documents."
      );
}

function inspectProject(
  git: WorkflowGitFacade,
  root: string,
  options: DoctorOptions
): DoctorCheck[] {
  return [
    ...manifestChecks(root, options.platform ?? workflowPlatformFacade.platform),
    hooksCheck(git, root),
    ...planChecks(git, root),
    ...environmentChecks(git, root, options),
    documentSizeCheck(git, root),
  ];
}

/** `doctor [--fix]`: project health; `fix` repairs only fixable findings. */
export function runDoctor(
  git: WorkflowGitFacade,
  folder: string,
  options: DoctorOptions = {}
): DoctorReport {
  const root = path.resolve(folder);
  let checks = inspectProject(git, root, options);
  let fix: InstallOutcome | null = null;
  let identityFix: GitIdentity | null = null;
  if (options.fix) {
    const fixable = checks.filter(
      (item) => item.status === "fail" && item.fixable
    );
    if (fixable.some((item) => item.id === "git-identity")) {
      identityFix = realGlobalIdentity(git, root);
      if (identityFix) {
        git.writeLocalIdentity(root, identityFix);
      }
    }
    // The update commits, so it needs a real repository identity first.
    if (
      fixable.some((item) => item.id !== "git-identity") &&
      identityCheck(git, root).status === "ok"
    ) {
      fix = installKit(git, root, {
        ...options.fix,
        update: true,
        ...(options.platform ? { platform: options.platform } : {}),
      });
    }
    if (fix || identityFix) {
      checks = inspectProject(git, root, options);
    }
  }
  return {
    checks,
    fix,
    identityFix,
    ok: checks.every((item) => item.status !== "fail"),
    root,
  };
}
