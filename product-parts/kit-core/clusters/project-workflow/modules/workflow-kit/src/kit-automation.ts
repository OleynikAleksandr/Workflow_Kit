// Kit-level checks of the M39 automation block of a scope input: quality
// check ids of the acceptance entries and the CI jobs of the project.
import type { AutomationInput } from "../../workflow-plan/src/workflow-plan-facade.js";
import { ensure } from "../../workflow-platform/src/workflow-platform-facade.js";
import {
  type RecordingTask,
  type UnrecordedReason,
  workflowQualityFacade,
} from "../../workflow-quality/src/workflow-quality-facade.js";
import { ciCheckNames } from "./kit-ci-config.js";
import { type KitContext, readConfig } from "./kit-context.js";

const UNRECORDED_TEXT: Record<UnrecordedReason, string> = {
  "applies-to":
    "its appliesTo matches none of the files of the tasks that run it, so the runner skips it",
  "delivery-unassigned":
    "it is a delivery check that no delivery task of the scope names in its checks",
  "not-assigned": "no task of the scope runs it: it is neither required nor assigned",
  "stage-push":
    "it runs at push, and the push report never reaches the evidence of a commit",
};

/**
 * CHECK_UNKNOWN for an acceptance entry naming an unknown quality check;
 * AUTOMATION_CHECK_UNRECORDED (spec M41 2.1) for a check no unfinished task
 * of the scope can record, once the profile is CONFIGURED (before QUALITY the
 * stage of a future check is unknown); CI_CHECK_UNKNOWN for a required CI
 * check that no job of `.github/workflows/*.yml` reports. The structure is
 * checked by the plan.
 */
export function ensureAutomationInput(
  context: KitContext,
  automation: AutomationInput | null | undefined,
  tasks: readonly (RecordingTask & { status?: string })[] = []
): void {
  if (!automation || typeof automation !== "object") {
    return;
  }
  const entries = Array.isArray(automation.acceptance)
    ? automation.acceptance
    : [];
  const config = readConfig(context);
  const planned = entries.map((entry, index) => ({
    checks: Array.isArray(entry?.checks) ? entry.checks : [],
    field: `automation.acceptance[${index}].checks`,
    taskId: null,
  }));
  workflowQualityFacade.ensurePlannedChecks(config, planned);
  if (config.quality.status === "CONFIGURED") {
    const open = tasks.filter((task) => task.status !== "DONE");
    for (const entry of planned) {
      const [first] = workflowQualityFacade.unrecordedChecks(
        config,
        entry.checks,
        open
      );
      ensure(
        first === undefined,
        "AUTOMATION_CHECK_UNRECORDED",
        first
          ? `${entry.field} names ${first.check} (stage ${first.stage}), which no task of the scope can record: ${UNRECORDED_TEXT[first.reason]}.`
          : "",
        first ? { ...first, field: entry.field } : {},
        "Name commit or prepare checks, assign the delivery check to a delivery task (tasks[].checks), or match its appliesTo with the task files."
      );
    }
  }
  const required = automation.ci?.requiredChecks;
  if (!Array.isArray(required) || required.length === 0) {
    return;
  }
  const known = ciCheckNames(context.root);
  const unknown = required.filter((name) => !known?.includes(name));
  ensure(
    unknown.length === 0,
    "CI_CHECK_UNKNOWN",
    known === null
      ? "The project has no CI configuration (.github/workflows/*.yml) for automation.ci."
      : `automation.ci.requiredChecks names checks the project CI does not report: ${unknown.join(", ")}.`,
    { field: "automation.ci.requiredChecks", known: known ?? [], unknown },
    "Name job ids or job names of the project CI (a matrix job reports each matrix name), or set automation.ci to null."
  );
}
