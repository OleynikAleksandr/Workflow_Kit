import { existsSync, statSync } from "node:fs";
import path from "node:path";
import {
  ensure,
  workflowPlatformFacade,
} from "../../workflow-platform/src/workflow-platform-facade.js";
import { BUILTIN_CHECKS, DOCUMENTATION_BUILTINS } from "./quality-builtins.js";
import {
  type BuiltinCheck,
  builtinCheck,
  CHECK_ID_PATTERN,
  type CheckDefinition,
  type CheckStage,
  type WorkflowConfig,
} from "./quality-config.js";
import { matchesAny } from "./quality-globs.js";

export type CheckStatus = "error" | "failed" | "passed" | "skipped" | "timeout";

export interface CheckResult {
  command: string;
  durationMs: number;
  evidence: string | null;
  exitCode: number | null;
  id: string;
  output: string;
  reason: string | null;
  role: CheckDefinition["role"];
  stage: CheckStage;
  status: CheckStatus;
}

export interface StageReport {
  finishedAt: string;
  ok: boolean;
  results: CheckResult[];
  stage: CheckStage;
  startedAt: string;
}

export interface StageRequest {
  /** Check ids assigned by the task (`task.checks`). */
  assigned?: string[];
  config: WorkflowConfig;
  docsWaiver?: string | null;
  env?: NodeJS.ProcessEnv;
  /** Candidate files; when absent, `appliesTo` filters are not applied. */
  files?: string[];
  /** Runs exactly these checks, whatever their stage. */
  only?: string[];
  /**
   * Candidate paths the commit removes (`absentPaths` of workflow-git): the
   * content builtins and `{files}` skip them; `appliesTo` still sees them.
   */
  removed?: string[];
  root: string;
  /** Service commits run only the documentation builtins. */
  service?: boolean;
  stage: CheckStage;
}

const OUTPUT_TAIL = 4000;
const FILES_ARGUMENT = "{files}";
/** Kit guards that run even when a profile written before them omits them. */
const IMPLICIT_BUILTINS: readonly BuiltinCheck[] = ["kit:conflict-markers"];

function tail(text: string): string {
  return text.length > OUTPUT_TAIL ? `…${text.slice(-OUTPUT_TAIL)}` : text;
}

/** The configured checks plus the implicit Kit guards the profile lacks. */
function effectiveChecks(config: WorkflowConfig): CheckDefinition[] {
  const listed = config.quality.checks;
  const missing = IMPLICIT_BUILTINS.filter(
    (id) => !listed.some((check) => check.id === id || check.builtin === id)
  );
  return [...listed, ...missing.map(builtinCheck)];
}

function unknownChecks(checks: CheckDefinition[], ids: string[]): void {
  const known = new Set(checks.map((check) => check.id));
  const unknown = ids.filter((id) => !known.has(id));
  ensure(
    unknown.length === 0,
    "CHECK_UNKNOWN",
    `Unknown checks: ${unknown.join(", ")}`,
    { checks: unknown },
    "Task checks must be ids from `scripts/workflow quality:status`; fix the task with `scripts/workflow task:update <ID> --input <patch.json>`."
  );
}

/** The `checks` of one planned task and the input path that holds them. */
export interface PlannedChecks {
  checks: readonly string[];
  /** Input path, for example `tasks[1].checks` or `checks` of a patch. */
  field: string;
  taskId: string | null;
}

const BUILTIN_PREFIX = "kit:";

/**
 * Ids a planned task may name in `checks`. A CONFIGURED profile knows its
 * checks plus the implicit Kit guards (`known` is exact). Before QUALITY
 * only the Kit builtins are known; other ids of the check id form are
 * accepted as checks QUALITY will define (`open`), and task:start verifies
 * them against the profile.
 */
function plannedCheckRule(config: WorkflowConfig): {
  known: string[];
  open: boolean;
} {
  if (config.quality.status === "CONFIGURED") {
    return {
      known: effectiveChecks(config).map((check) => check.id),
      open: false,
    };
  }
  return { known: Object.keys(BUILTIN_CHECKS).sort(), open: true };
}

/** The planned check ids the profile cannot run (see `plannedCheckRule`). */
export function unknownPlannedChecks(
  config: WorkflowConfig,
  ids: readonly string[]
): string[] {
  const { known, open } = plannedCheckRule(config);
  return ids.filter((id) => {
    if (known.includes(id)) {
      return false;
    }
    return !(
      open &&
      CHECK_ID_PATTERN.test(id) &&
      !id.startsWith(BUILTIN_PREFIX)
    );
  });
}

/**
 * CHECK_UNKNOWN for the first planned task whose `checks` holds an id the
 * profile cannot run: `checks` are quality check ids, never manual checks.
 */
export function ensurePlannedChecks(
  config: WorkflowConfig,
  tasks: readonly PlannedChecks[]
): void {
  const { known, open } = plannedCheckRule(config);
  for (const task of tasks) {
    const unknown = unknownPlannedChecks(config, task.checks);
    ensure(
      unknown.length === 0,
      "CHECK_UNKNOWN",
      `${task.field}${task.taskId ? ` of ${task.taskId}` : ""} names unknown quality checks: ${unknown.join(", ")}. \`checks\` holds ids of quality checks ${
        open
          ? "(a Kit builtin kit:* or an id without spaces that QUALITY will define)"
          : "of the profile"
      }; manual checks belong in acceptance.`,
      { checks: unknown, field: task.field, known, taskId: task.taskId },
      "Use check ids from `scripts/workflow quality:status` or leave `checks` empty, and write manual checks into `acceptance`."
    );
  }
}

/** Checks a stage runs, in configuration order. */
export function selectChecks(request: StageRequest): CheckDefinition[] {
  const { stage } = request;
  const checks = effectiveChecks(request.config);
  if (request.only) {
    unknownChecks(checks, request.only);
    return checks.filter((check) => request.only?.includes(check.id));
  }
  if (request.service) {
    return stage === "commit"
      ? checks.filter(
          (check) => check.builtin && DOCUMENTATION_BUILTINS.has(check.builtin)
        )
      : [];
  }
  const assigned = request.assigned ?? [];
  unknownChecks(checks, assigned);
  return checks.filter(
    (check) =>
      check.stage === stage && (check.required || assigned.includes(check.id))
  );
}

function result(
  check: CheckDefinition,
  fields: Partial<CheckResult> & Pick<CheckResult, "status">
): CheckResult {
  return {
    command:
      check.builtin ??
      [check.command?.executable ?? "", ...(check.command?.args ?? [])].join(
        " "
      ),
    durationMs: 0,
    evidence: check.evidence ?? null,
    exitCode: null,
    id: check.id,
    output: "",
    reason: null,
    role: check.role,
    stage: check.stage,
    ...fields,
  };
}

function isExistingFile(root: string, file: string): boolean {
  const target = path.join(root, ...file.split("/"));
  return existsSync(target) && statSync(target).isFile();
}

function runCommand(
  check: CheckDefinition,
  request: StageRequest,
  files: string[] | undefined
): CheckResult {
  const command = check.command;
  if (!command) {
    return result(check, {
      reason: "The check has no command.",
      status: "error",
    });
  }
  const usesFiles = command.args.includes(FILES_ARGUMENT);
  const removed = new Set(request.removed ?? []);
  const existing = (files ?? []).filter(
    (file) => !removed.has(file) && isExistingFile(request.root, file)
  );
  if (usesFiles && existing.length === 0) {
    return result(check, {
      reason: "No existing files to pass.",
      status: "skipped",
    });
  }
  const args = command.args.flatMap((arg) =>
    arg === FILES_ARGUMENT ? existing : [arg]
  );
  const hasDirectory =
    command.executable.includes("/") || command.executable.includes("\\");
  const executable =
    hasDirectory && !path.isAbsolute(command.executable)
      ? workflowPlatformFacade.resolveInside(request.root, command.executable)
      : command.executable;
  const cwd = command.cwd
    ? workflowPlatformFacade.resolveInside(request.root, command.cwd)
    : request.root;
  const started = Date.now();
  const outcome = workflowPlatformFacade.run({
    args,
    cwd,
    env: request.env ?? process.env,
    executable,
    timeoutMs: check.timeoutMs,
  });
  const output = tail(`${outcome.stdout}${outcome.stderr}`);
  const durationMs = Date.now() - started;
  if (outcome.timedOut) {
    return result(check, {
      durationMs,
      output,
      reason: `Timed out after ${check.timeoutMs} ms.`,
      status: "timeout",
    });
  }
  if (outcome.status === null) {
    return result(check, {
      durationMs,
      output,
      reason: outcome.errorMessage ?? `${command.executable} did not start.`,
      status: "error",
    });
  }
  return result(check, {
    durationMs,
    exitCode: outcome.status,
    output,
    status: outcome.status === 0 ? "passed" : "failed",
  });
}

function runOne(check: CheckDefinition, request: StageRequest): CheckResult {
  const filtered =
    request.files && check.appliesTo
      ? request.files.filter((file) => matchesAny(check.appliesTo ?? [], file))
      : request.files;
  if (request.files && check.appliesTo && filtered?.length === 0) {
    return result(check, {
      reason: "No candidate file matches appliesTo.",
      status: "skipped",
    });
  }
  if (check.builtin) {
    const started = Date.now();
    const outcome = BUILTIN_CHECKS[check.builtin]({
      config: request.config,
      docsWaiver: request.docsWaiver ?? null,
      files: filtered ?? [],
      removed: new Set(request.removed ?? []),
      root: request.root,
    });
    return result(check, {
      durationMs: Date.now() - started,
      output: tail(outcome.output),
      status: outcome.passed ? "passed" : "failed",
    });
  }
  return runCommand(check, request, filtered);
}

/** Runs the checks of one stage without a shell and reports every result. */
export function runStage(request: StageRequest): StageReport {
  const startedAt = new Date().toISOString();
  const results = selectChecks(request).map((check) => runOne(check, request));
  return {
    finishedAt: new Date().toISOString(),
    ok: results.every(
      (item) => item.status === "passed" || item.status === "skipped"
    ),
    results,
    stage: request.stage,
    startedAt,
  };
}
