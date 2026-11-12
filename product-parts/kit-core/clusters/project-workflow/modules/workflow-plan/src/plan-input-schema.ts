import {
  DEFAULT_MAX_WORKERS,
  EXECUTION_STRATEGIES,
  MAX_WORKERS_LIMIT,
} from "./plan-execution.js";
import { ID_PATTERN } from "./plan-field-checks.js";
import {
  APPROVAL_MIN_LENGTH,
  EXTEND_ROUND_KINDS,
  EXTEND_ROUNDS,
} from "./plan-input-checks.js";
import {
  CHECKS_DESCRIPTION,
  CHECKS_RULE,
  documentFields,
  type FieldSpec,
  field,
  type InputSchema,
  TASK_RULES,
  taskFields,
} from "./plan-input-schema-fields.js";
import {
  DIGEST_ITEM_MAX_BYTES,
  DIGEST_MAX_ITEMS,
  DIGEST_RESULT_MAX_BYTES,
} from "./plan-model.js";

export type { FieldSpec, InputSchema } from "./plan-input-schema-fields.js";

const EXECUTION = "PLAN_EXECUTION";

/** Task fields `task:update` may change; a task in progress only the second list. */
const TASK_PATCH_FIELDS = [
  "acceptance",
  "checks",
  "commitMessage",
  "context",
  "dependencies",
  "docsWaiver",
  "files",
  "title",
  "why",
] as const;
const IN_PROGRESS_PATCH_FIELDS = [
  "acceptance",
  "checks",
  "docsWaiver",
  "files",
];

const SCOPE_FIELDS: FieldSpec[] = [
  field("id", "string", true, "Scope id.", { pattern: ID_PATTERN.source }),
  field("objective", "string", true, "What the scope delivers."),
  field(
    "acceptance",
    "string[]",
    true,
    "Scope acceptance criteria: unique non-empty strings.",
    { minItems: 1 }
  ),
  {
    code: "SCOPE_APPROVAL",
    description:
      "The user's agreement with the scope content, in the user's words (trimmed length).",
    minLength: APPROVAL_MIN_LENGTH,
    name: "approval",
    required: true,
    type: "string",
  },
  {
    code: "SPEC_REQUIRED",
    description:
      "Canonical path of the specification; required when the scope has several tasks.",
    name: "spec",
    required: false,
    type: "string|null",
  },
  ...documentFields("context"),
  field("decisions", "string[]", false, "User decisions to record."),
  {
    code: EXECUTION,
    description:
      "Execution block; absent means sequential. scope:propose replaces the strategy with the user's choice.",
    name: "execution",
    required: false,
    type: "object",
  },
  {
    code: EXECUTION,
    description: "sequential or orchestrated.",
    enum: EXECUTION_STRATEGIES,
    name: "execution.strategy",
    required: true,
    type: "string",
  },
  {
    code: EXECUTION,
    description: `Parallel executors of an orchestrated scope; default ${DEFAULT_MAX_WORKERS}.`,
    maximum: MAX_WORKERS_LIMIT,
    minimum: 1,
    name: "execution.maxWorkers",
    required: false,
    type: "integer",
  },
  {
    code: EXECUTION,
    description: "Session that owns the orchestration, or null.",
    name: "execution.ownerSession",
    required: false,
    type: "string|null",
  },
  ...taskFields("tasks"),
];

const SCOPE_RULES = [
  "A scope is created only when no scope is open (SCOPE_EXISTS) and the repository has a commit (NO_BASELINE).",
  "A scope with several tasks needs `spec` (SPEC_REQUIRED).",
  ...TASK_RULES,
];

const TASK_EXAMPLE = {
  acceptance: ["The list shows a hint when it is empty"],
  commitMessage: "feat: show a hint for the empty list",
  context: [{ heading: "2. Empty list", path: "docs/spec.md", required: true }],
  files: ["src/list.ts"],
  id: "T001",
  title: "Empty list hint",
  why: "Users do not understand an empty screen",
};

const SCOPE_EXAMPLE = {
  acceptance: ["An empty list explains what to do"],
  approval: "User: implement the empty list hint from docs/spec.md",
  context: [{ path: "docs/spec.md", required: true }],
  decisions: ["The hint text comes from the specification"],
  id: "empty-list-hint",
  objective: "Explain the empty list to the user",
  spec: "docs/spec.md",
  tasks: [
    TASK_EXAMPLE,
    {
      acceptance: ["The packaged app shows the hint"],
      commitMessage: "chore: package the app",
      dependencies: ["T001"],
      id: "T002",
      kind: "delivery",
      title: "Package the app",
    },
  ],
};

function scopeSchema(command: string, description: string): InputSchema {
  const propose = command === "scope:propose";
  return {
    command,
    description,
    example: propose
      ? {
          ...SCOPE_EXAMPLE,
          execution: { maxWorkers: 2, strategy: "sequential" },
        }
      : { ...SCOPE_EXAMPLE, execution: { strategy: "sequential" } },
    fields: SCOPE_FIELDS,
    rules: propose
      ? [
          'Run `scope:propose --input <file.json> --recommended sequential|orchestrated --reason "<why>"`; the user chooses the mode on the card.',
          ...SCOPE_RULES,
        ]
      : [
          "A Harness-hosted project (config host `harness`) uses scope:propose instead (EXECUTION_MODE_REQUIRED).",
          ...SCOPE_RULES,
        ],
  };
}

const EXTEND_SCHEMA: InputSchema = {
  command: "plan:extend",
  description:
    "Tasks added to the open round or to a new round: `plan:extend --input <file.json> [--expected-revision N]`.",
  example: {
    round: "current",
    tasks: [{ ...TASK_EXAMPLE, fixes: null, id: "T003" }],
  },
  fields: [
    field(
      "round",
      "string",
      false,
      "current (default while the round DOCS is not done) or new.",
      { enum: EXTEND_ROUNDS }
    ),
    field("kind", "string", false, "Kind of a new round; default fixes.", {
      enum: EXTEND_ROUND_KINDS,
    }),
    field("title", "string", false, "Title of a new round; default Fixes."),
    ...taskFields("tasks"),
    field(
      "tasks[].before",
      "string",
      false,
      "Id of a not-started task of the current round to insert before; it then depends on the new task."
    ),
  ],
  rules: [
    "DONE tasks never change; a defect becomes a new task that names the original in `fixes`.",
    "A closed round or a round whose DOCS is done gets a new round; a new round needs the old one to have only TODO delivery tasks left (ROUND_OPEN).",
    "`before` applies only to the current round and to a TODO task (TASK_STARTED, UNKNOWN_TASK).",
    "`--expected-revision N` refuses a stale plan (REVISION_MISMATCH).",
    "A READY_FOR_ACCEPTANCE or ACCEPTED scope returns to IN_PROGRESS.",
    ...TASK_RULES,
  ],
};

const PATCH_SCHEMA: InputSchema = {
  command: "task:update",
  description:
    "Patch of a task that is not DONE: `task:update <ID> --input <patch.json> [--expected-revision N]`.",
  example: {
    acceptance: [
      "The list shows a hint when it is empty",
      "The hint is localized",
    ],
    files: ["src/list.ts", "src/list-hint.ts"],
  },
  fields: [
    field(
      "acceptance",
      "string[]",
      false,
      "Acceptance criteria: unique non-empty strings.",
      { minItems: 1 }
    ),
    field("checks", "string[]", false, CHECKS_DESCRIPTION),
    field("commitMessage", "string", false, "One-line commit message."),
    field(
      "context",
      "object[]",
      false,
      "Documents: {path, required, heading?}."
    ),
    field("dependencies", "string[]", false, "Ids of earlier tasks."),
    field("docsWaiver", "string|null", false, "Docs contract waiver."),
    field("files", "string[]", false, "Canonical project-relative paths."),
    field("title", "string", false, "Short task title."),
    field("why", "string", false, "Why the task exists."),
  ],
  rules: [
    `Only these fields change (TASK_PATCH): ${TASK_PATCH_FIELDS.join(", ")}.`,
    `A task IN_PROGRESS changes only ${IN_PROGRESS_PATCH_FIELDS.join(", ")}; a DONE task never changes (TASK_PATCH).`,
    "The patched plan is validated as a whole; refusals name the plan field `tasks.<ID>.<field>`.",
    CHECKS_RULE,
    "`--expected-revision N` refuses a stale plan (REVISION_MISMATCH).",
  ],
};

const CARRYOVER_SCHEMA: InputSchema = {
  command: "carryover",
  description:
    "Closes the current scope and opens a new one with every unfinished task: `carryover --input <file.json>`.",
  example: {
    approval: "User: continue the unfinished tasks in a new scope",
    id: "empty-list-hint-2",
    objective: "Finish the empty list hint",
  },
  fields: [
    field("id", "string", true, "Id of the new scope.", {
      pattern: ID_PATTERN.source,
    }),
    {
      code: "SCOPE_APPROVAL",
      description: "The user's direct instruction (trimmed length).",
      minLength: APPROVAL_MIN_LENGTH,
      name: "approval",
      required: true,
      type: "string",
    },
    field(
      "objective",
      "string",
      false,
      "Objective of the new scope; defaults to the old one."
    ),
  ],
  rules: [
    "Needs an open scope (NO_SCOPE) with at least one unfinished task (NOTHING_TO_CARRY).",
    "Unfinished non-DOCS tasks move to round R1 as TODO; QUALITY and DOCS are rebuilt.",
  ],
};

function digestList(name: string, description: string): FieldSpec[] {
  return [
    field(name, "string[]", true, description, {
      limitCode: "ROUND_DIGEST_TOO_LARGE",
      maxItems: DIGEST_MAX_ITEMS,
    }),
    field(`${name}[]`, "string", false, "One item (UTF-8 bytes).", {
      limitCode: "ROUND_DIGEST_TOO_LARGE",
      maxBytes: DIGEST_ITEM_MAX_BYTES,
    }),
  ];
}

const DIGEST_SCHEMA: InputSchema = {
  command: "digest",
  description:
    "Round digest of the DOCS task: `commit --task DOCS-<round> --digest <file.json>`.",
  example: {
    contracts: ["list facade: emptyHint(locale) returns the hint text"],
    decisions: ["The hint text comes from the specification"],
    references: ["docs/spec.md"],
    result: "The empty list shows a localized hint.",
  },
  fields: [
    field("result", "string", true, "What the round delivered (UTF-8 bytes).", {
      limitCode: "ROUND_DIGEST_TOO_LARGE",
      maxBytes: DIGEST_RESULT_MAX_BYTES,
    }),
    ...digestList("decisions", "Decisions taken in the round."),
    ...digestList("contracts", "Contracts the round created or changed."),
    ...digestList("references", "Documents to read for the round."),
  ],
  rules: [
    "Only the DOCS task of a round takes --digest; without it the commit is refused (ROUND_DIGEST_REQUIRED).",
    "Every list is present (it may be empty) and holds unique non-empty strings.",
  ],
};

const SCHEMAS: InputSchema[] = [
  scopeSchema(
    "scope:create",
    "The agreed scope: `scope:create --input <file.json>`."
  ),
  scopeSchema(
    "scope:propose",
    "The scope body proposed for the user's choice of execution mode; the same body as scope:create."
  ),
  EXTEND_SCHEMA,
  PATCH_SCHEMA,
  CARRYOVER_SCHEMA,
  DIGEST_SCHEMA,
];

/** Commands whose JSON input the workflow-plan module describes. */
export function planInputSchemaCommands(): string[] {
  return SCHEMAS.map((schema) => schema.command);
}

/** A copy of the input descriptor of `command`, or null when it has none. */
export function planInputSchema(command: string): InputSchema | null {
  const schema = SCHEMAS.find((item) => item.command === command);
  return schema ? structuredClone(schema) : null;
}
