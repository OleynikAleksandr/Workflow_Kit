// Field checks of the `autopilot:authorize` input (M39) before the grant is
// compared with the reviewed plan.
import { ensure } from "../../workflow-platform/src/workflow-platform-facade.js";
import type { AuthorizeInput } from "./plan-authorization.js";
import type { ScopeAutomation } from "./plan-automation.js";

const NOTE_MIN = 10;
const MODES = new Set<string>(["after-start", "full"]);
const POLICIES = new Set<string>(["automatic", "manual"]);
const RUN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function manualCriteria(automation: ScopeAutomation): number[] {
  return automation.acceptance
    .filter((entry) => entry.kind === "manual")
    .map((entry) => entry.criterion);
}

/**
 * PLAN_SCHEMA for a malformed field; AUTOPILOT_MANUAL_REQUIRED when a
 * manual criterion meets accept=true, a policy other than manual or full mode.
 */
export function checkAuthorizeInput(input: AuthorizeInput, automation: ScopeAutomation): void {
  ensure(
    input !== null && typeof input === "object",
    "PLAN_SCHEMA",
    "The authorization input is a JSON object.",
    { field: "(root)" }
  );
  ensure(
    typeof input.runId === "string" && RUN_PATTERN.test(input.runId),
    "PLAN_SCHEMA",
    "runId is an identifier.",
    { field: "runId" }
  );
  for (const key of ["scopeId", "ownerSession", "source", "proposalDigest"]) {
    const value = (input as unknown as Record<string, unknown>)[key];
    ensure(
      typeof value === "string" && value.trim() !== "",
      "PLAN_SCHEMA",
      `${key} must be a non-empty string.`,
      { field: key }
    );
  }
  ensure(
    typeof input.note === "string" && input.note.trim().length >= NOTE_MIN,
    "PLAN_SCHEMA",
    "note records the user's command and what it entrusts (at least 10 characters).",
    { field: "note" }
  );
  ensure(MODES.has(input.mode), "PLAN_SCHEMA", "mode is after-start or full.", {
    field: "mode",
  });
  ensure(
    POLICIES.has(input.acceptancePolicy),
    "PLAN_SCHEMA",
    "acceptancePolicy is automatic or manual.",
    { field: "acceptancePolicy" }
  );
  for (const key of ["accept", "close"] as const) {
    ensure(
      typeof input[key] === "boolean",
      "PLAN_SCHEMA",
      `${key} must be boolean.`,
      { field: key }
    );
  }
  ensure(
    Array.isArray(input.deliveryTaskIds) &&
      input.deliveryTaskIds.every((id) => typeof id === "string") &&
      new Set(input.deliveryTaskIds).size === input.deliveryTaskIds.length,
    "PLAN_SCHEMA",
    "deliveryTaskIds is a list of unique task ids.",
    { field: "deliveryTaskIds" }
  );
  const manual = manualCriteria(automation);
  ensure(
    manual.length === 0 ||
      (!input.accept &&
        input.acceptancePolicy === "manual" &&
        input.mode !== "full"),
    "AUTOPILOT_MANUAL_REQUIRED",
    `Acceptance criteria ${manual.map((index) => index + 1).join(", ")} need the user's manual check; the run stops at acceptance.`,
    { manual },
    "Grant accept=false with acceptancePolicy manual (after-start), or automate the criteria in a reviewed plan."
  );
  ensure(
    manual.length > 0 || input.acceptancePolicy === "automatic",
    "PLAN_SCHEMA",
    "Every criterion is automatic; acceptancePolicy is automatic.",
    { field: "acceptancePolicy" }
  );
}

