// Which task of a plan can record a passed result of a quality check in the
// evidence of its commit (spec M41 2.1). The selection is the runner's own
// (`selectChecks`): the commit stage of a task (service commits run only the
// documentation builtins), the prepare stage stored after the task commit and
// the delivery checks a delivery task names. The push report never reaches
// the evidence of a commit, and a check whose `appliesTo` matches none of the
// task files is skipped, which is no record either.
import type { CheckDefinition, CheckStage, WorkflowConfig } from "./quality-config.js";
import { matchesAny } from "./quality-globs.js";
import { effectiveChecks, selectChecks } from "./quality-runner.js";

/** A task as the recording rule reads it (a plan task fits). */
export interface RecordingTask {
  checks: readonly string[];
  files: readonly string[];
  kind: string;
}

export type UnrecordedReason =
  | "applies-to"
  | "delivery-unassigned"
  | "not-assigned"
  | "stage-push";

/** A check of a list that no task can record, and why. */
export interface UnrecordedCheck {
  check: string;
  reason: UnrecordedReason;
  stage: CheckStage;
}

/** Task kinds whose commits are service commits (documentation builtins only). */
const SERVICE_KINDS = new Set(["docs", "quality"]);
const WILDCARD_PATTERN = /[*{]/u;
const TRAILING_SLASH_PATTERN = /\/+$/u;

/** Whether the runner would run `check` for one of the stages `task` records. */
function selectedBy(
  config: WorkflowConfig,
  known: ReadonlySet<string>,
  check: CheckDefinition,
  task: RecordingTask
): boolean {
  const assigned = task.checks.filter((id) => known.has(id));
  const picks = (stage: CheckStage, service: boolean): boolean =>
    selectChecks({ assigned, config, root: "", service, stage }).some(
      (item) => item.id === check.id
    );
  switch (check.stage) {
    case "commit":
      return picks("commit", SERVICE_KINDS.has(task.kind));
    case "prepare":
      // QUALITY commits through quality:apply, which runs no prepare stage.
      return task.kind !== "quality" && picks("prepare", false);
    case "delivery":
      return task.kind === "delivery" && assigned.includes(check.id);
    default:
      return false;
  }
}

/** The literal start of a glob: the part before its first wildcard. */
function literalRoot(glob: string): string {
  const index = glob.search(WILDCARD_PATTERN);
  return index < 0 ? glob : glob.slice(0, index);
}

/**
 * Whether `appliesTo` of the check can match a candidate file of the task:
 * no globs or no task files; a task path the glob matches; a task directory
 * that holds the literal start of a glob, or lies under it.
 */
export function appliesToTask(
  check: Pick<CheckDefinition, "appliesTo">,
  files: readonly string[]
): boolean {
  const globs = check.appliesTo ?? [];
  if (globs.length === 0 || files.length === 0) {
    return true;
  }
  return files.some((file) => {
    const entry = file.replace(TRAILING_SLASH_PATTERN, "");
    if (matchesAny(globs, entry)) {
      return true;
    }
    return globs.some((glob) => {
      const start = literalRoot(glob);
      return start.startsWith(`${entry}/`) || `${entry}/`.startsWith(start);
    });
  });
}

/** Whether `task` can record a passed result of the check `id`. */
export function canRecord(
  config: WorkflowConfig,
  id: string,
  task: RecordingTask
): boolean {
  const checks = effectiveChecks(config);
  const check = checks.find((item) => item.id === id);
  if (!check) {
    return false;
  }
  const known = new Set(checks.map((item) => item.id));
  return (
    selectedBy(config, known, check, task) && appliesToTask(check, task.files)
  );
}

/**
 * Checks of `ids` that no task of `tasks` can record, with the reason; ids
 * the profile does not know are left out (CHECK_UNKNOWN names them).
 */
export function unrecordedChecks(
  config: WorkflowConfig,
  ids: readonly string[],
  tasks: readonly RecordingTask[]
): UnrecordedCheck[] {
  const checks = effectiveChecks(config);
  const known = new Set(checks.map((item) => item.id));
  const missing: UnrecordedCheck[] = [];
  for (const id of new Set(ids)) {
    const check = checks.find((item) => item.id === id);
    if (!check) {
      continue;
    }
    const selecting = tasks.filter((task) =>
      selectedBy(config, known, check, task)
    );
    if (selecting.some((task) => appliesToTask(check, task.files))) {
      continue;
    }
    let reason: UnrecordedReason = "not-assigned";
    if (check.stage === "push") {
      reason = "stage-push";
    } else if (selecting.length > 0) {
      reason = "applies-to";
    } else if (check.stage === "delivery") {
      reason = "delivery-unassigned";
    }
    missing.push({ check: id, reason, stage: check.stage });
  }
  return missing;
}
