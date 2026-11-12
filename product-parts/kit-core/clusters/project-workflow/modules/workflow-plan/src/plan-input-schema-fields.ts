// Field descriptors shared by the plan command inputs: the descriptor
// types, the task and document fields and the task rules.
import { ID_PATTERN } from "./plan-field-checks.js";
import { INPUT_TASK_KINDS } from "./plan-input-checks.js";

/**
 * One field of a command input. `name` is a dotted path from the input
 * root; `[]` marks every entry of a list (`tasks[].files`). `code` is the
 * refusal when the field is missing, has the wrong type or breaks `enum` /
 * `pattern`; `limitCode` is the refusal of a size or number limit when it
 * differs from `code`.
 */
export interface FieldSpec {
  code: string;
  description: string;
  enum?: readonly string[];
  limitCode?: string;
  maxBytes?: number;
  maxItems?: number;
  maximum?: number;
  minItems?: number;
  minimum?: number;
  minLength?: number;
  name: string;
  pattern?: string;
  required: boolean;
  type: string;
}

/**
 * Descriptor of the JSON input of one Kit command. Field-level rules are
 * in `fields`; cross-field and plan-state rules stay in the validators and
 * are listed in `rules`. `example` passes the real validator.
 */
export interface InputSchema {
  command: string;
  description: string;
  example: Record<string, unknown>;
  fields: FieldSpec[];
  rules: string[];
}

const SCHEMA = "PLAN_SCHEMA";

export function field(
  name: string,
  type: string,
  required: boolean,
  description: string,
  extra: Partial<FieldSpec> = {}
): FieldSpec {
  return { code: SCHEMA, description, name, required, type, ...extra };
}

export function documentFields(prefix: string): FieldSpec[] {
  return [
    field(`${prefix}`, "object[]", false, "Documents the agent reads."),
    field(
      `${prefix}[].path`,
      "string",
      true,
      "Canonical project-relative path, unique in the list."
    ),
    field(
      `${prefix}[].required`,
      "boolean",
      true,
      "Whether the document is mandatory reading."
    ),
    field(
      `${prefix}[].heading`,
      "string",
      false,
      "Section heading to read instead of the whole document."
    ),
  ];
}

export function taskFields(prefix: string): FieldSpec[] {
  return [
    field(prefix, "object[]", true, "Tasks in execution order.", {
      minItems: 1,
    }),
    field(
      `${prefix}[].id`,
      "string",
      false,
      "Task id, unique in the plan; defaults to T001, T002, ...",
      { pattern: ID_PATTERN.source }
    ),
    field(`${prefix}[].title`, "string", true, "Short task title."),
    field(
      `${prefix}[].commitMessage`,
      "string",
      true,
      "One-line commit message of the task."
    ),
    field(
      `${prefix}[].acceptance`,
      "string[]",
      true,
      "Acceptance criteria: unique non-empty strings.",
      { minItems: 1 }
    ),
    field(
      `${prefix}[].why`,
      "string",
      false,
      "Why the task exists; defaults to the title."
    ),
    field(
      `${prefix}[].kind`,
      "string",
      false,
      "work (default) or delivery; Kit adds the quality and docs tasks.",
      { enum: INPUT_TASK_KINDS }
    ),
    field(
      `${prefix}[].files`,
      "string[]",
      false,
      "Canonical project-relative files or directories the task may change."
    ),
    field(
      `${prefix}[].dependencies`,
      "string[]",
      false,
      "Ids of earlier tasks that must be DONE first."
    ),
    field(`${prefix}[].checks`, "string[]", false, CHECKS_DESCRIPTION),
    ...documentFields(`${prefix}[].context`),
    field(
      `${prefix}[].docsWaiver`,
      "string|null",
      false,
      "Reason the task changes code without its contract document."
    ),
    field(
      `${prefix}[].fixes`,
      "string|null",
      false,
      "Id of the earlier task this task fixes."
    ),
    field(
      `${prefix}[].parallelSafe`,
      "boolean",
      false,
      "The work task may run in parallel; it then lists concrete files only."
    ),
  ];
}

export const CHECKS_DESCRIPTION =
  "Ids of quality checks (quality.checks of .harness/workflow/config.json, Kit builtins kit:*) the task runs besides the required ones, e.g. an optional delivery check; never manual checks (those go into acceptance).";
export const CHECKS_RULE =
  "checks are quality check ids (CHECK_UNKNOWN): with the profile CONFIGURED each id is one of its checks (scripts/workflow quality:status); before QUALITY an id without spaces (^[A-Za-z0-9][A-Za-z0-9._:-]*$, a kit: id must be a Kit builtin) that task:start then finds in the profile. Only new tasks and changed checks are checked.";

export const TASK_RULES = [
  CHECKS_RULE,
  "dependencies and fixes point only to earlier tasks (TASK_ORDER, PLAN_SCHEMA).",
  "parallelSafe applies to work tasks only (PARALLEL_KIND) that list concrete paths: no glob, no `.`, no trailing `/` (PARALLEL_FILES).",
  "A QUALITY task is added before the first task with functional files while the quality profile is not CONFIGURED; the round DOCS task and the order of delivery tasks are computed by Kit.",
];
