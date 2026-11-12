import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import type { WorkflowTask } from "../../workflow-plan/src/workflow-plan-facade.js";
import {
  ensure,
  WorkflowError,
  workflowPlatformFacade,
} from "../../workflow-platform/src/workflow-platform-facade.js";
import {
  type WorkflowConfig,
  workflowQualityFacade,
} from "../../workflow-quality/src/workflow-quality-facade.js";
import {
  type AssignmentRecord,
  type AssignmentSetup,
  readRecord,
  writeRecord,
} from "./assignment-records.js";

/** `assignment:setup`: the updated main record and the command output. */
export interface AssignmentSetupResult {
  assignment: AssignmentRecord;
  /** Last characters of the command output; empty when nothing ran. */
  output: string;
  /** false when the profile stacks need no dependencies in this worktree. */
  ran: boolean;
}

interface StackSetup {
  args: string[];
  executable: string;
  locks: string[];
}

/** Frozen-lock installs of the node package managers (spec 5.4). */
const NODE_SETUP: Readonly<Record<string, StackSetup>> = {
  bun: {
    args: ["install", "--frozen-lockfile"],
    executable: "bun",
    locks: ["bun.lock", "bun.lockb"],
  },
  npm: {
    args: ["ci"],
    executable: "npm",
    locks: ["package-lock.json", "npm-shrinkwrap.json"],
  },
  pnpm: {
    args: ["install", "--frozen-lockfile"],
    executable: "pnpm",
    locks: ["pnpm-lock.yaml"],
  },
  yarn: {
    args: ["install", "--frozen-lockfile"],
    executable: "yarn",
    locks: ["yarn.lock"],
  },
};
const DEPENDENCY_FIELDS = ["dependencies", "devDependencies"] as const;
const DEPENDENCY_DIRECTORY = "node_modules";
const SETUP_TIMEOUT_MS = 15 * 60 * 1000;
const OUTPUT_TAIL = 4000;
const SETUP_STATUSES = new Set(["NEEDS_SETUP", "READY", "RUNNING"]);

function tail(text: string): string {
  return text.length > OUTPUT_TAIL ? `…${text.slice(-OUTPUT_TAIL)}` : text;
}

function hasEntry(file: string): boolean {
  try {
    lstatSync(file);
    return true;
  } catch {
    return false;
  }
}

/** package.json of the worktree root declares dependencies or devDependencies. */
function declaresDependencies(worktree: string): boolean {
  const text = workflowPlatformFacade.readTextIfExists(
    path.join(worktree, "package.json")
  );
  if (text === null) {
    return false;
  }
  try {
    const manifest = JSON.parse(text) as Record<string, unknown>;
    return DEPENDENCY_FIELDS.some((field) => {
      const value = manifest[field];
      return (
        value !== null &&
        typeof value === "object" &&
        Object.keys(value).length > 0
      );
    });
  } catch {
    return false;
  }
}

/**
 * The install of the profile's node stack for this worktree, or null when the
 * profile has no node stack or the manifest declares no dependencies. The
 * package manager is the profile's node one, else the one whose lock file
 * exists, else npm.
 */
function stackSetup(
  worktree: string,
  config: WorkflowConfig
): StackSetup | null {
  if (
    !(config.quality.stacks.includes("node") && declaresDependencies(worktree))
  ) {
    return null;
  }
  const configured = NODE_SETUP[config.quality.packageManager ?? ""];
  if (configured) {
    return configured;
  }
  return (
    Object.values(NODE_SETUP).find((setup) =>
      setup.locks.some((lock) => existsSync(path.join(worktree, lock)))
    ) ?? (NODE_SETUP.npm as StackSetup)
  );
}

/**
 * True when the commit-stage checks of the task run commands and the profile
 * stack needs dependencies the worktree lacks (no `node_modules` entry). A
 * DOCS task commits as a service commit (documentation builtins only), so it
 * never needs setup.
 */
export function needsSetup(worktree: string, task: WorkflowTask): boolean {
  const config = workflowQualityFacade.readConfig(worktree);
  const checks = workflowQualityFacade.selectChecks({
    assigned: task.checks,
    config,
    root: worktree,
    service: task.kind === "docs",
    stage: "commit",
  });
  return (
    checks.some((check) => check.command !== undefined) &&
    stackSetup(worktree, config) !== null &&
    !hasEntry(path.join(worktree, DEPENDENCY_DIRECTORY))
  );
}

function lockFile(worktree: string, setup: StackSetup): string {
  const lock = setup.locks.find((name) =>
    existsSync(path.join(worktree, name))
  );
  ensure(
    lock,
    "SETUP_LOCK_REQUIRED",
    `${setup.executable} needs a lock file (${setup.locks.join(" or ")}) in the worktree to install the exact dependencies.`,
    { locks: setup.locks, worktree },
    "Commit the lock file in main, then create the assignment again."
  );
  return path.join(worktree, lock);
}

function ensureNotLinked(worktree: string): void {
  const dependencies = path.join(worktree, DEPENDENCY_DIRECTORY);
  let linked = false;
  try {
    linked = lstatSync(dependencies).isSymbolicLink();
  } catch {
    linked = false;
  }
  ensure(
    !linked,
    "SETUP_LINKED_DEPENDENCIES",
    `${dependencies} is a link; the install would change the dependencies it points to.`,
    { path: dependencies },
    "Remove the link, then repeat assignment:setup."
  );
}

function runInstall(
  worktree: string,
  setup: StackSetup,
  env: NodeJS.ProcessEnv
): string {
  const command = [setup.executable, ...setup.args].join(" ");
  const outcome = workflowPlatformFacade.run({
    args: setup.args,
    cwd: worktree,
    env,
    executable: setup.executable,
    timeoutMs: SETUP_TIMEOUT_MS,
  });
  const output = tail(`${outcome.stdout}${outcome.stderr}`);
  if (outcome.status !== 0 || outcome.timedOut) {
    throw new WorkflowError(
      "SETUP_FAILED",
      `${command} failed in ${worktree}: ${
        outcome.timedOut
          ? `timed out after ${SETUP_TIMEOUT_MS} ms`
          : (outcome.errorMessage ?? `exit code ${String(outcome.status)}`)
      }.`,
      { command, exitCode: outcome.status, output },
      "Fix the cause shown in the output, then repeat assignment:setup."
    );
  }
  return output;
}

/**
 * `assignment:setup` (spec 5.4): runs the stack install in the assignment's
 * worktree (never touching main's dependencies), then writes the receipt and
 * moves `NEEDS_SETUP` to `READY` in the main record. A failure leaves the
 * record unchanged.
 */
export function setupAssignment(
  mainRoot: string,
  record: AssignmentRecord,
  options: { env: NodeJS.ProcessEnv; now: () => string }
): AssignmentSetupResult {
  ensure(
    record.worktree !== null && SETUP_STATUSES.has(record.status),
    "ASSIGNMENT_STATUS",
    `${record.id} is ${record.status}; setup runs for an attached assignment before its result is ready.`,
    { status: record.status }
  );
  const worktree = record.worktree;
  ensure(
    existsSync(worktree),
    "ASSIGNMENT_WORKTREE",
    `The worktree ${worktree} of ${record.id} does not exist.`,
    { worktree }
  );
  const setup = stackSetup(
    worktree,
    workflowQualityFacade.readConfig(worktree)
  );
  let receipt: AssignmentSetup | null = null;
  let output = "";
  if (setup) {
    const lock = lockFile(worktree, setup);
    ensureNotLinked(worktree);
    const lockHash = createHash("sha256")
      .update(readFileSync(lock))
      .digest("hex");
    output = runInstall(worktree, setup, options.env);
    receipt = {
      at: options.now(),
      command: [setup.executable, ...setup.args].join(" "),
      lockHash,
    };
  }
  // The install may take minutes: apply the transition to the current record.
  const current = readRecord(mainRoot, record.id) ?? record;
  const updated: AssignmentRecord = {
    ...current,
    setup: receipt ?? current.setup ?? null,
    status: current.status === "NEEDS_SETUP" ? "READY" : current.status,
    updatedAt: options.now(),
  };
  writeRecord(mainRoot, updated);
  return { assignment: updated, output, ran: setup !== null };
}
