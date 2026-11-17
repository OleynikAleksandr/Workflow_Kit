// Field descriptors of the optional M39 `automation` block of
// scope:create / scope:propose (contract: workflow-plan/automation.md).
import { AUTOMATION_ERROR, CRITERION_KINDS } from "./plan-automation.js";
import { type FieldSpec, field } from "./plan-input-schema-fields.js";

function automationField(
  name: string,
  type: string,
  required: boolean,
  description: string,
  extra: Partial<FieldSpec> = {}
): FieldSpec {
  return field(`automation${name}`, type, required, description, {
    code: AUTOMATION_ERROR,
    ...extra,
  });
}

/** The optional M39 automation block of scope:create / scope:propose. */
export const AUTOMATION_FIELDS: FieldSpec[] = [
  automationField(
    "",
    "object",
    false,
    "How the result is proven and published without the user's buttons (M39); absent on a manual plan."
  ),
  automationField(
    ".acceptance",
    "object[]",
    true,
    "One entry for every index of `acceptance`."
  ),
  automationField(
    ".acceptance[].criterion",
    "integer",
    true,
    "Index of the scope acceptance criterion (0-based).",
    { minimum: 0 }
  ),
  automationField(
    ".acceptance[].kind",
    "string",
    true,
    "automatic: proven by checks and evidence; manual: the user checks it.",
    { enum: CRITERION_KINDS }
  ),
  automationField(
    ".acceptance[].checks",
    "string[]",
    true,
    "Quality check ids whose success proves the criterion (CHECK_UNKNOWN)."
  ),
  automationField(
    ".acceptance[].evidence",
    "string[]",
    true,
    "Canonical paths of result files in the format the specification names."
  ),
  automationField(
    ".delivery",
    "object[]",
    false,
    "Effects of the delivery tasks; default none."
  ),
  automationField(
    ".delivery[].taskId",
    "string",
    true,
    "Id of a delivery task of this scope."
  ),
  automationField(
    ".delivery[].effects",
    "string[]",
    true,
    "Concrete build, install and external effects of the task.",
    { minItems: 1 }
  ),
  automationField(
    ".ci",
    "object|null",
    true,
    "Required remote CI, or null when there is none."
  ),
  automationField(".ci.remote", "string", true, "Git remote of the CI run."),
  automationField(".ci.branch", "string", true, "Branch the CI runs on."),
  automationField(
    ".ci.requiredChecks",
    "string[]",
    true,
    "Job names of the project CI configuration that must pass (CI_CHECK_UNKNOWN).",
    { minItems: 1 }
  ),
  automationField(
    ".ci.exactSha",
    "boolean",
    true,
    "The checks must pass for the exact pushed SHA."
  ),
  automationField(
    ".ci.task",
    "string",
    false,
    "Delivery task that pushes the CI branch itself; the push is allowed once it is started. Without it the CI branch is pushed only after every task is DONE."
  ),
  automationField(
    ".publication",
    "object|null",
    true,
    "Publication after close, or null when the result stays local."
  ),
  automationField(".publication.branch", "string", true, "Local branch."),
  automationField(
    ".publication.upstream",
    "string",
    true,
    "Configured upstream <remote>/<branch>."
  ),
];
