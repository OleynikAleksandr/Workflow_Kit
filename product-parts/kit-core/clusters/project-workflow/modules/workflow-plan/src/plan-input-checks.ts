import { ensure } from "../../workflow-platform/src/workflow-platform-facade.js";
import {
  documents,
  identifier,
  schemaError,
  text,
  textList,
} from "./plan-field-checks.js";
import type { RoundKind, TaskKind } from "./plan-model.js";

/**
 * Checks of the command inputs (`scope:create`, `plan:extend`,
 * `carryover`) that run before normalization, so a refusal names the
 * input field (`objective`, `tasks[1].title`). The plan validation runs
 * afterwards on the normalized plan.
 */
export const APPROVAL_MIN_LENGTH = 10;
export const INPUT_TASK_KINDS: readonly TaskKind[] = ["work", "delivery"];
export const EXTEND_ROUNDS = ["current", "new"] as const;
export const EXTEND_ROUND_KINDS: readonly Exclude<RoundKind, "legacy">[] = [
  "fixes",
  "implementation",
];

interface ScopeFields {
  acceptance?: unknown;
  approval?: unknown;
  context?: unknown;
  decisions?: unknown;
  id?: unknown;
  objective?: unknown;
  spec?: unknown;
  tasks?: unknown;
}

function approval(value: unknown, message: string): void {
  ensure(
    typeof value === "string" && value.trim().length >= APPROVAL_MIN_LENGTH,
    "SCOPE_APPROVAL",
    message,
    { field: "approval" }
  );
}

function tasksList(value: unknown, message: string): void {
  ensure(Array.isArray(value) && value.length > 0, schemaError, message, {
    field: "tasks",
  });
}

/** The `scope:create` / `scope:propose` body; task entries are checked on normalization. */
export function checkScopeInput(input: ScopeFields): void {
  ensure(
    input && typeof input === "object",
    schemaError,
    "The scope input must be a JSON object.",
    { field: "(root)" }
  );
  tasksList(input.tasks, "A scope needs at least one task.");
  approval(
    input.approval,
    `Record the user-approved scope content in \`approval\` (at least ${APPROVAL_MIN_LENGTH} characters).`
  );
  ensure(
    (input.tasks as unknown[]).length === 1 ||
      (typeof input.spec === "string" && input.spec !== ""),
    "SPEC_REQUIRED",
    "A scope with several tasks needs a specification document in `spec`.",
    { field: "spec" }
  );
  identifier(input.id, "id");
  text(input.objective, "objective");
  textList(input.acceptance, "acceptance", { nonEmpty: true });
  ensure(
    input.decisions === undefined ||
      (Array.isArray(input.decisions) &&
        input.decisions.every(
          (item) => typeof item === "string" && item.trim() !== ""
        )),
    schemaError,
    "Field must be a list of non-empty strings: decisions",
    { field: "decisions" }
  );
  if (input.context !== undefined) {
    documents(input.context as never, "context");
  }
}

/** One task entry of `scope:create` or `plan:extend`; `field` is its input path. */
export function checkTaskInput(
  input: {
    acceptance?: unknown;
    checks?: unknown;
    commitMessage?: unknown;
    context?: unknown;
    dependencies?: unknown;
    id?: unknown;
    kind?: unknown;
    title?: unknown;
  },
  field: string
): void {
  ensure(
    input && typeof input === "object",
    schemaError,
    "Each task must be an object.",
    { field }
  );
  ensure(
    input.kind === undefined ||
      INPUT_TASK_KINDS.includes(input.kind as TaskKind),
    schemaError,
    "Task kind in input must be work or delivery; Kit adds quality and docs tasks.",
    { field: `${field}.kind` }
  );
  if (input.id !== undefined) {
    identifier(input.id, `${field}.id`);
  }
  text(input.title, `${field}.title`);
  text(input.commitMessage, `${field}.commitMessage`);
  textList(input.acceptance, `${field}.acceptance`, { nonEmpty: true });
  // `files` stay with the plan validation: PARALLEL_FILES must win there.
  for (const key of ["dependencies", "checks"] as const) {
    if (input[key] !== undefined) {
      textList(input[key], `${field}.${key}`);
    }
  }
  if (input.context !== undefined) {
    documents(input.context as never, `${field}.context`);
  }
}

/** The `plan:extend` body without its task entries. */
export function checkExtendInput(input: {
  kind?: unknown;
  round?: unknown;
  tasks?: unknown;
  title?: unknown;
}): void {
  ensure(
    input && typeof input === "object",
    schemaError,
    "The plan:extend input must be a JSON object.",
    { field: "(root)" }
  );
  tasksList(input.tasks, "plan:extend needs at least one task.");
  ensure(
    input.round === undefined ||
      (EXTEND_ROUNDS as readonly unknown[]).includes(input.round),
    schemaError,
    "round must be current or new.",
    { field: "round" }
  );
  ensure(
    input.kind === undefined ||
      (EXTEND_ROUND_KINDS as readonly unknown[]).includes(input.kind),
    schemaError,
    "kind must be fixes or implementation.",
    { field: "kind" }
  );
  if (input.title !== undefined) {
    text(input.title, "title");
  }
}

/** The `carryover` body. */
export function checkCarryoverInput(input: {
  approval?: unknown;
  id?: unknown;
  objective?: unknown;
}): void {
  ensure(
    input && typeof input === "object",
    schemaError,
    "The carryover input must be a JSON object.",
    { field: "(root)" }
  );
  approval(
    input.approval,
    "carryover needs the user's direct instruction in `approval`."
  );
  identifier(input.id, "id");
  if (input.objective !== undefined) {
    text(input.objective, "objective");
  }
}
