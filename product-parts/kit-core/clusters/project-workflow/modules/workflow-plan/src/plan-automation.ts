// The optional automation block of a scope (M39): how every scope
// acceptance criterion is proven, the delivery effects the plan foresees,
// the required remote CI and the publication target. Structural checks
// only; quality check ids and the CI configuration are checked by the Kit.
import {
  ensure,
  workflowPlatformFacade,
} from "../../workflow-platform/src/workflow-platform-facade.js";
import type { TaskKind, WorkflowPlan } from "./plan-model.js";

export type CriterionKind = "automatic" | "manual";

/** How one scope acceptance criterion (by index) is proven. */
export interface AcceptanceAutomation {
  /** Ids of quality checks whose success proves the criterion. */
  checks: string[];
  /** Index into `scope.acceptance`. */
  criterion: number;
  /** Canonical project-relative paths of result files. */
  evidence: string[];
  kind: CriterionKind;
}

/** The concrete build/install and external effects of one delivery task. */
export interface DeliveryAutomation {
  effects: string[];
  taskId: string;
}

/** The required remote CI of the scope result. */
export interface CiPolicy {
  branch: string;
  exactSha: boolean;
  remote: string;
  requiredChecks: string[];
  /** The delivery task that pushes the CI branch (M40); absent: the host pushes after all tasks. */
  task?: string;
}

/** The configured publication target after the scope is closed. */
export interface PublicationPolicy {
  branch: string;
  upstream: string;
}

export interface ScopeAutomation {
  acceptance: AcceptanceAutomation[];
  ci: CiPolicy | null;
  delivery: DeliveryAutomation[];
  publication: PublicationPolicy | null;
}

/** The input form: `delivery` may be omitted (no delivery effects). */
export interface AutomationInput {
  acceptance: AcceptanceAutomation[];
  ci: CiPolicy | null;
  delivery?: DeliveryAutomation[];
  publication: PublicationPolicy | null;
}

export const AUTOMATION_ERROR = "PLAN_AUTOMATION";
export const CRITERION_KINDS: readonly CriterionKind[] = [
  "automatic",
  "manual",
];
const KINDS = new Set<string>(CRITERION_KINDS);
const AUTOMATION_KEYS = new Set(["acceptance", "ci", "delivery", "publication"]);
const ACCEPTANCE_KEYS = new Set(["checks", "criterion", "evidence", "kind"]);
const DELIVERY_KEYS = new Set(["effects", "taskId"]);
const CI_KEYS = new Set(["branch", "exactSha", "remote", "requiredChecks", "task"]);
const PUBLICATION_KEYS = new Set(["branch", "upstream"]);
// A git ref name without spaces, control characters, `..`, `~^:?*[\` or a leading `-`.
const REF_PATTERN = /^(?!-)(?!.*\.\.)(?!.*\/\/)(?!.*\/$)[^\s~^:?*[\\\p{Cc}]+$/u;

interface AutomationScope {
  acceptance: readonly string[];
  tasks: readonly { id: string; kind: TaskKind }[];
}

function object(value: unknown, field: string, keys: Set<string>): void {
  ensure(
    value !== null && typeof value === "object" && !Array.isArray(value),
    AUTOMATION_ERROR,
    `${field} must be an object.`,
    { field }
  );
  const unknown = Object.keys(value as object).filter((key) => !keys.has(key));
  ensure(
    unknown.length === 0,
    AUTOMATION_ERROR,
    `${field} has unknown fields: ${unknown.join(", ")}.`,
    { field, unknown }
  );
}

function text(value: unknown, field: string): string {
  ensure(
    typeof value === "string" && value.trim() !== "",
    AUTOMATION_ERROR,
    `${field} must be a non-empty string.`,
    { field }
  );
  return value as string;
}

function ref(value: unknown, field: string): void {
  ensure(
    typeof value === "string" && REF_PATTERN.test(value),
    AUTOMATION_ERROR,
    `${field} must be a git name without spaces.`,
    { field }
  );
}

function textList(value: unknown, field: string, nonEmpty: boolean): string[] {
  ensure(
    Array.isArray(value) &&
      value.every((item) => typeof item === "string" && item.trim() !== ""),
    AUTOMATION_ERROR,
    `${field} must be a list of non-empty strings.`,
    { field }
  );
  const list = value as string[];
  ensure(
    !nonEmpty || list.length > 0,
    AUTOMATION_ERROR,
    `${field} must not be empty.`,
    { field }
  );
  ensure(
    new Set(list).size === list.length,
    AUTOMATION_ERROR,
    `${field} has duplicates.`,
    { field }
  );
  return list;
}

function acceptanceEntry(
  entry: AcceptanceAutomation,
  field: string,
  count: number
): void {
  object(entry, field, ACCEPTANCE_KEYS);
  ensure(
    Number.isSafeInteger(entry.criterion) &&
      entry.criterion >= 0 &&
      entry.criterion < count,
    AUTOMATION_ERROR,
    `${field}.criterion must be the index of a scope acceptance criterion (0 to ${count - 1}).`,
    { field: `${field}.criterion` }
  );
  ensure(
    KINDS.has(entry.kind),
    AUTOMATION_ERROR,
    `${field}.kind must be automatic or manual.`,
    { field: `${field}.kind` }
  );
  const checks = textList(entry.checks, `${field}.checks`, false);
  const evidence = textList(entry.evidence, `${field}.evidence`, false);
  for (const path of evidence) {
    ensure(
      workflowPlatformFacade.normalizeRelative(path) === path,
      AUTOMATION_ERROR,
      `Evidence path is not canonical in ${field}.evidence: ${path}`,
      { field: `${field}.evidence`, path }
    );
  }
  ensure(
    entry.kind === "manual" || checks.length + evidence.length > 0,
    AUTOMATION_ERROR,
    `An automatic criterion names its checks or evidence files: ${field}.`,
    { field },
    "Name quality check ids in `checks` and result files in `evidence`, or mark the criterion manual."
  );
}

function validateAcceptance(
  value: unknown,
  scope: AutomationScope,
  prefix: string
): void {
  const field = `${prefix}.acceptance`;
  ensure(Array.isArray(value), AUTOMATION_ERROR, `${field} must be a list.`, {
    field,
  });
  const entries = value as AcceptanceAutomation[];
  const seen = new Set<number>();
  for (const [index, entry] of entries.entries()) {
    acceptanceEntry(entry, `${field}[${index}]`, scope.acceptance.length);
    ensure(
      !seen.has(entry.criterion),
      AUTOMATION_ERROR,
      `Criterion ${entry.criterion} is described twice in ${field}.`,
      { criterion: entry.criterion, field: `${field}[${index}].criterion` }
    );
    seen.add(entry.criterion);
  }
  const missing = scope.acceptance
    .map((_, index) => index)
    .filter((index) => !seen.has(index));
  ensure(
    missing.length === 0,
    AUTOMATION_ERROR,
    `${field} must describe every scope acceptance criterion; missing: ${missing.join(", ")}.`,
    { field, missing }
  );
}

function validateDelivery(
  value: unknown,
  scope: AutomationScope,
  prefix: string
): void {
  const field = `${prefix}.delivery`;
  ensure(Array.isArray(value), AUTOMATION_ERROR, `${field} must be a list.`, {
    field,
  });
  const kinds = new Map(scope.tasks.map((task) => [task.id, task.kind]));
  const seen = new Set<string>();
  for (const [index, entry] of (value as DeliveryAutomation[]).entries()) {
    const item = `${field}[${index}]`;
    object(entry, item, DELIVERY_KEYS);
    const taskId = text(entry.taskId, `${item}.taskId`);
    ensure(
      kinds.get(taskId) === "delivery",
      AUTOMATION_ERROR,
      `${item}.taskId must name a delivery task of the scope: ${taskId}`,
      { field: `${item}.taskId`, taskId }
    );
    ensure(
      !seen.has(taskId),
      AUTOMATION_ERROR,
      `Delivery task ${taskId} is described twice in ${field}.`,
      { field: `${item}.taskId`, taskId }
    );
    seen.add(taskId);
    textList(entry.effects, `${item}.effects`, true);
  }
}

function validateCi(value: unknown, scope: AutomationScope, prefix: string): void {
  const field = `${prefix}.ci`;
  if (value === null) {
    return;
  }
  object(value, field, CI_KEYS);
  const ci = value as CiPolicy;
  ref(ci.remote, `${field}.remote`);
  ref(ci.branch, `${field}.branch`);
  textList(ci.requiredChecks, `${field}.requiredChecks`, true);
  ensure(
    typeof ci.exactSha === "boolean",
    AUTOMATION_ERROR,
    `${field}.exactSha must be boolean.`,
    { field: `${field}.exactSha` }
  );
  ensure(
    ci.task === undefined ||
      scope.tasks.some((task) => task.id === ci.task && task.kind === "delivery"),
    AUTOMATION_ERROR,
    `${field}.task must name a delivery task of the scope: ${String(ci.task)}`,
    { field: `${field}.task` }
  );
}

function validatePublication(value: unknown, prefix: string): void {
  const field = `${prefix}.publication`;
  if (value === null) {
    return;
  }
  object(value, field, PUBLICATION_KEYS);
  const publication = value as PublicationPolicy;
  ref(publication.branch, `${field}.branch`);
  ref(publication.upstream, `${field}.upstream`);
  ensure(
    publication.upstream.includes("/"),
    AUTOMATION_ERROR,
    `${field}.upstream is <remote>/<branch>.`,
    { field: `${field}.upstream` }
  );
}

/**
 * Validates an automation block against the scope criteria and tasks.
 * Every refusal is PLAN_AUTOMATION with `details.field`
 * (`automation.acceptance[1].kind`).
 */
export function validateAutomation(
  automation: unknown,
  scope: AutomationScope,
  prefix = "automation"
): void {
  object(automation, prefix, AUTOMATION_KEYS);
  const block = automation as ScopeAutomation;
  for (const key of ["acceptance", "ci", "publication"] as const) {
    ensure(
      key in block,
      AUTOMATION_ERROR,
      `${prefix}.${key} is required${key === "acceptance" ? "" : " (null when there is none)"}.`,
      { field: `${prefix}.${key}` }
    );
  }
  validateAcceptance(block.acceptance, scope, prefix);
  validateDelivery(block.delivery, scope, prefix);
  validateCi(block.ci, scope, prefix);
  validatePublication(block.publication, prefix);
}

/**
 * Validates the input block (refusals name the input entries) and returns
 * the stored form: acceptance in criterion order, `delivery` filled.
 */
export function normalizeAutomation(
  input: AutomationInput | null | undefined,
  scope: AutomationScope
): ScopeAutomation | undefined {
  if (input === undefined || input === null) {
    return;
  }
  object(input, "automation", AUTOMATION_KEYS);
  const copy = structuredClone(input);
  const block = { ...copy, delivery: copy.delivery ?? [] };
  validateAutomation(block, scope);
  return {
    acceptance: [...block.acceptance].sort(
      (left, right) => left.criterion - right.criterion
    ),
    ci: block.ci,
    delivery: block.delivery,
    publication: block.publication,
  };
}

const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;

/**
 * Validates `scope.automation` and `scope.proposal` of a stored plan; an
 * absent block is a legacy plan.
 */
export function validatePlanAutomation(plan: WorkflowPlan): void {
  const scope = plan.scope;
  if (!scope) {
    return;
  }
  if (scope.proposal !== undefined) {
    ensure(
      scope.proposal !== null &&
        typeof scope.proposal === "object" &&
        DIGEST_PATTERN.test(scope.proposal.digest) &&
        Number.isSafeInteger(scope.proposal.generation) &&
        scope.proposal.generation >= 1,
      "PLAN_SCHEMA",
      "scope.proposal is {digest: sha256 hex, generation: positive integer}.",
      { field: "scope.proposal" }
    );
  }
  if (scope.automation === undefined) {
    return;
  }
  validateAutomation(scope.automation, {
    acceptance: scope.acceptance,
    tasks: plan.tasks,
  });
}

/** The automation summary lines of recovery and text answers. */
export function automationSummary(automation: ScopeAutomation): string[] {
  const automatic = automation.acceptance.filter(
    (entry) => entry.kind === "automatic"
  ).length;
  const manual = automation.acceptance.length - automatic;
  const ci = automation.ci
    ? `${automation.ci.remote} ${automation.ci.branch}, checks ${automation.ci.requiredChecks.join(", ")}${automation.ci.exactSha ? ", exact SHA" : ""}${automation.ci.task ? `, pushed by ${automation.ci.task}` : ""}`
    : "none";
  const publication = automation.publication
    ? `${automation.publication.branch} → ${automation.publication.upstream}`
    : "none";
  const delivery =
    automation.delivery.length === 0
      ? "none"
      : automation.delivery
          .map((entry) => `${entry.taskId} (${entry.effects.join("; ")})`)
          .join(", ");
  return [
    `acceptance: ${automatic} automatic, ${manual} manual${manual > 0 ? ` (manual: ${automation.acceptance
      .filter((entry) => entry.kind === "manual")
      .map((entry) => entry.criterion + 1)
      .join(", ")})` : ""}`,
    `delivery effects: ${delivery}`,
    `ci: ${ci}`,
    `publication: ${publication}`,
  ];
}
