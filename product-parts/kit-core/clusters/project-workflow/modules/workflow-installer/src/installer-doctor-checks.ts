import { accessSync, constants, existsSync } from "node:fs";
import path from "node:path";
import type { WorkflowGitFacade } from "../../workflow-git/src/workflow-git-facade.js";
import {
  PLAN_PATH,
  workflowPlanFacade,
} from "../../workflow-plan/src/workflow-plan-facade.js";
import {
  type WorkflowPlatform,
  workflowPlatformFacade,
} from "../../workflow-platform/src/workflow-platform-facade.js";
import {
  compareVersions,
  damagedFiles,
  readManifest,
} from "./installer-inspect.js";
import {
  KIT_VERSION,
  MANAGED_GIT_HOOKS,
  OWN_HOOKS_DIR,
} from "./installer-payload.js";
import { extractSection } from "./installer-sections.js";

// The installation checks of `doctor`: the manifest and managed files, the
// executable modes, the git hooks, the plan and the commit transaction.

export type DoctorStatus = "fail" | "ok" | "warn";

export interface DoctorCheck {
  fixable: boolean;
  id: string;
  message: string;
  nextAction: string | null;
  status: DoctorStatus;
}

const UPDATE = "Run `scripts/workflow doctor --fix` (or `install --update`).";

export const check = (
  id: string,
  status: DoctorStatus,
  message: string,
  fixable = false,
  nextAction: string | null = null
): DoctorCheck => ({
  fixable,
  id,
  message,
  nextAction,
  status,
});

function file(root: string, relative: string): string {
  return path.join(root, ...relative.split("/"));
}

export function manifestChecks(
  root: string,
  platform: WorkflowPlatform
): DoctorCheck[] {
  const manifest = readManifest(root);
  if (!manifest) {
    return [
      check(
        "manifest",
        "fail",
        "The Workflow Kit manifest is missing.",
        false,
        "Install the Kit: `scripts/workflow install`."
      ),
    ];
  }
  const checks = [
    compareVersions(manifest.version, KIT_VERSION) < 0
      ? check(
          "manifest",
          "fail",
          `Kit ${manifest.version} is older than ${KIT_VERSION}.`,
          true,
          UPDATE
        )
      : check("manifest", "ok", `Kit ${manifest.version}.`),
  ];
  const damaged = damagedFiles(root, manifest);
  checks.push(
    damaged.length === 0
      ? check(
          "managed-files",
          "ok",
          "Managed files and sections match the manifest."
        )
      : check(
          "managed-files",
          "fail",
          `Changed or missing managed parts: ${damaged.join(", ")}.`,
          true,
          UPDATE
        )
  );
  if (platform !== "win32") {
    const blocked = manifest.files
      .filter((item) => item.executable && existsSync(file(root, item.path)))
      .filter((item) => {
        try {
          accessSync(file(root, item.path), constants.X_OK);
          return false;
        } catch {
          return true;
        }
      })
      .map((item) => item.path);
    checks.push(
      blocked.length === 0
        ? check("executable", "ok", "Launchers and hooks are executable.")
        : check(
            "executable",
            "fail",
            `Not executable: ${blocked.join(", ")}.`,
            true,
            UPDATE
          )
    );
  }
  return checks;
}

export function hooksCheck(git: WorkflowGitFacade, root: string): DoctorCheck {
  const hooksPath = git.git
    .run(root, ["config", "--local", "--get", "core.hooksPath"], {
      allowFailure: true,
    })
    .stdout.trim();
  if (hooksPath === "") {
    return check(
      "git-hooks",
      "fail",
      "core.hooksPath is not set, so Kit hooks do not run.",
      true,
      UPDATE
    );
  }
  const missing = MANAGED_GIT_HOOKS.filter((name) => {
    const text = workflowPlatformFacade.readTextIfExists(
      path.resolve(root, hooksPath, name)
    );
    return text === null || extractSection(text, "hash") === null;
  });
  return missing.length === 0
    ? check(
        "git-hooks",
        "ok",
        `Kit hooks run from ${hooksPath === OWN_HOOKS_DIR ? OWN_HOOKS_DIR : hooksPath}.`
      )
    : check(
        "git-hooks",
        "fail",
        `Hooks without the Kit section in ${hooksPath}: ${missing.join(", ")}.`,
        true,
        UPDATE
      );
}

export function planChecks(git: WorkflowGitFacade, root: string): DoctorCheck[] {
  const checks: DoctorCheck[] = [];
  try {
    const plan = workflowPlanFacade.read(root);
    if (!plan) {
      return [
        check(
          "plan",
          "fail",
          `${PLAN_PATH} is missing.`,
          false,
          "Run `scripts/workflow install --update`."
        ),
      ];
    }
    git.resolveReferences(root, plan, PLAN_PATH);
    checks.push(
      check("plan", "ok", `Plan revision ${plan.revision} matches the history.`)
    );
  } catch (error) {
    const { code, message } = error as { code?: string; message: string };
    checks.push(
      check(
        "plan",
        "fail",
        `${code ?? "ERROR"}: ${message}`,
        false,
        "Run `scripts/workflow repair`."
      )
    );
  }
  checks.push(
    git.transactions.journal(root)
      ? check(
          "transaction",
          "fail",
          "A commit transaction is unfinished.",
          false,
          "Run `scripts/workflow repair`."
        )
      : check("transaction", "ok", "No unfinished transaction.")
  );
  return checks;
}
