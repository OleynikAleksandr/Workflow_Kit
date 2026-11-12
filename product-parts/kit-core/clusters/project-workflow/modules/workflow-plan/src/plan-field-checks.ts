import {
  ensure,
  workflowPlatformFacade,
} from "../../workflow-platform/src/workflow-platform-facade.js";
import type { DocumentRef, UserDecision } from "./plan-model.js";

/**
 * Field checks shared by plan validation and the input checks. Every
 * refusal is `PLAN_SCHEMA` and names the field in `details.field`.
 */
export const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
export const schemaError = "PLAN_SCHEMA";

export function text(value: unknown, field: string): void {
  ensure(
    typeof value === "string" && value.trim() !== "",
    schemaError,
    `Field must be a non-empty string: ${field}`,
    { field }
  );
}

export function textList(
  value: unknown,
  field: string,
  { nonEmpty = false } = {}
): void {
  ensure(
    Array.isArray(value) &&
      value.every((item) => typeof item === "string" && item.trim() !== ""),
    schemaError,
    `Field must be a list of non-empty strings: ${field}`,
    { field }
  );
  ensure(
    !nonEmpty || (value as string[]).length > 0,
    schemaError,
    `List must not be empty: ${field}`,
    { field }
  );
  ensure(
    new Set(value as string[]).size === (value as string[]).length,
    schemaError,
    `List has duplicates: ${field}`,
    { field }
  );
}

export function identifier(value: unknown, field: string): void {
  ensure(
    typeof value === "string" && ID_PATTERN.test(value),
    schemaError,
    `Invalid identifier in ${field}: ${String(value)}`,
    { field }
  );
}

export function decision(
  value: UserDecision | null | undefined,
  field: string
): void {
  ensure(
    value && typeof value === "object",
    schemaError,
    `Missing decision: ${field}`,
    { field }
  );
  text(value.text, `${field}.text`);
  text(value.at, `${field}.at`);
}

export function relativePaths(values: string[], field: string): void {
  textList(values, field);
  for (const value of values) {
    ensure(
      workflowPlatformFacade.normalizeRelative(value) === value,
      schemaError,
      `Path is not canonical in ${field}: ${value}`,
      { field, path: value }
    );
  }
}

/** Document references; a refusal names the entry, e.g. `context[0].path`. */
export function documents(values: DocumentRef[], field: string): void {
  ensure(Array.isArray(values), schemaError, `Field must be a list: ${field}`, {
    field,
  });
  for (const [index, doc] of values.entries()) {
    const entry = `${field}[${index}]`;
    ensure(
      doc && typeof doc === "object",
      schemaError,
      `Document reference must be an object: ${entry}`,
      { field: entry }
    );
    text(doc.path, `${entry}.path`);
    ensure(
      typeof doc.required === "boolean",
      schemaError,
      `required must be boolean in ${entry}`,
      { field: `${entry}.required` }
    );
    ensure(
      doc.heading === undefined ||
        (typeof doc.heading === "string" && doc.heading.trim() !== ""),
      schemaError,
      `heading must be text in ${entry}`,
      { field: `${entry}.heading` }
    );
  }
  relativePaths(
    values.map((doc) => doc.path),
    `${field}.path`
  );
}

export function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}
