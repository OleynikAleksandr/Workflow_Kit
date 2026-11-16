// Kit-level checks of the M39 automation block of a scope input: quality
// check ids of the acceptance entries and the CI jobs of the project.
import type { AutomationInput } from "../../workflow-plan/src/workflow-plan-facade.js";
import { ensure } from "../../workflow-platform/src/workflow-platform-facade.js";
import { workflowQualityFacade } from "../../workflow-quality/src/workflow-quality-facade.js";
import { ciCheckNames } from "./kit-ci-config.js";
import { type KitContext, readConfig } from "./kit-context.js";

/**
 * CHECK_UNKNOWN for an acceptance entry naming an unknown quality check;
 * CI_CHECK_UNKNOWN for a required CI check that no job of
 * `.github/workflows/*.yml` reports. The structure is checked by the plan.
 */
export function ensureAutomationInput(
  context: KitContext,
  automation: AutomationInput | null | undefined
): void {
  if (!automation || typeof automation !== "object") {
    return;
  }
  const entries = Array.isArray(automation.acceptance)
    ? automation.acceptance
    : [];
  workflowQualityFacade.ensurePlannedChecks(
    readConfig(context),
    entries.map((entry, index) => ({
      checks: Array.isArray(entry?.checks) ? entry.checks : [],
      field: `automation.acceptance[${index}].checks`,
      taskId: null,
    }))
  );
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
