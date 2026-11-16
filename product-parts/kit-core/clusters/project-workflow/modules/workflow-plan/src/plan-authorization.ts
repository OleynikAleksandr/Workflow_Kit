// The autopilot authorization of a scope (M39): what one run of the
// Workflow Kit app may do without the user's buttons. Pure transitions;
// who may call them (the host, through its IPC ticket) is checked by the Kit.
import { ensure } from "../../workflow-platform/src/workflow-platform-facade.js";
import type {
  CiPolicy,
  DeliveryAutomation,
  PublicationPolicy,
  ScopeAutomation,
} from "./plan-automation.js";
import { checkAuthorizeInput } from "./plan-authorization-input.js";
import type { WorkflowPlan, WorkflowScope } from "./plan-model.js";

export type AutopilotMode = "after-start" | "full";
export type AcceptancePolicy = "automatic" | "manual";
export type RevokeReason = "settings-off" | "user-stop";

export interface AutopilotRevocation {
  at: string;
  note: string;
  reason: RevokeReason;
  /** true only for settings-off: the user may resume the same run. */
  resumable: boolean;
}

/** `scope.authorization`: the current grant of one run. */
export interface AutopilotGrant {
  accept: boolean;
  acceptancePolicy: AcceptancePolicy;
  at: string;
  ci: CiPolicy | null;
  close: boolean;
  /** Snapshot of the granted delivery tasks and their effects. */
  delivery: DeliveryAutomation[];
  mode: AutopilotMode;
  /** The user's command and what it entrusts in advance. */
  note: string;
  ownerSession: string;
  proposalDigest: string;
  publication: PublicationPolicy | null;
  /** 1 for a new run; every accepted re-authorization adds one. */
  revision: number;
  revoked: AutopilotRevocation | null;
  runId: string;
  source: string;
}

/** The `autopilot:authorize --input` body. */
export interface AuthorizeInput {
  accept: boolean;
  acceptancePolicy: AcceptancePolicy;
  ci: CiPolicy | null;
  close: boolean;
  deliveryTaskIds: string[];
  mode: AutopilotMode;
  note: string;
  ownerSession: string;
  proposalDigest: string;
  publication: PublicationPolicy | null;
  runId: string;
  scopeId: string;
  source: string;
}

export interface RevokeInput {
  note: string;
  reason: RevokeReason;
  runId: string;
}

export interface GrantChange {
  changed: boolean;
  grant: AutopilotGrant;
  plan: WorkflowPlan;
}

export const RESUME_SOURCE = "panel-resume";
const REASONS = new Set<string>(["settings-off", "user-stop"]);

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item as Record<string, unknown>).sort(([a], [b]) =>
            a.localeCompare(b)
          )
        )
      : item
  );
}

function same(left: unknown, right: unknown): boolean {
  return canonical(left ?? null) === canonical(right ?? null);
}

function activeScope(plan: WorkflowPlan): WorkflowScope {
  ensure(
    plan.scope !== null && plan.scope.status === "ACTIVE",
    "AUTOPILOT_SCOPE_MISMATCH",
    "Autopilot authority applies only to an active scope.",
    { scope: plan.scope?.id ?? null, status: plan.scope?.status ?? "NONE" },
    "Resolve the blocked or missing scope first."
  );
  return plan.scope;
}

function automationOf(scope: WorkflowScope): ScopeAutomation {
  ensure(
    scope.automation !== undefined,
    "AUTOPILOT_UNAUTHORIZED",
    "The plan has no automation block; it keeps the manual delivery, acceptance, close and publication.",
    { scopeId: scope.id },
    "Continue with the user's confirmations; an automated run needs a plan with automation."
  );
  return scope.automation;
}

/** The grant boundaries of the input, checked against the reviewed plan. */
function grantOf(
  plan: WorkflowPlan,
  input: AuthorizeInput,
  now: string
): AutopilotGrant {
  const scope = activeScope(plan);
  const automation = automationOf(scope);
  checkAuthorizeInput(input, automation);
  ensure(
    input.scopeId === scope.id &&
      (scope.execution?.ownerSession ?? null) === input.ownerSession,
    "AUTOPILOT_SCOPE_MISMATCH",
    "The authorization names another scope or owner session.",
    {
      ownerSession: scope.execution?.ownerSession ?? null,
      scopeId: scope.id,
    }
  );
  ensure(
    scope.proposal?.digest === input.proposalDigest &&
      same(input.ci, automation.ci) &&
      same(input.publication, automation.publication),
    "AUTOPILOT_PLAN_CHANGED",
    "The reviewed proposal digest, CI policy or publication target differs from the plan.",
    { proposalDigest: scope.proposal?.digest ?? null },
    "Authorize the plan as it was reviewed and chosen; a changed plan needs a new review."
  );
  const effects = new Map(
    automation.delivery.map((entry) => [entry.taskId, entry])
  );
  const unknown = input.deliveryTaskIds.filter(
    (id) =>
      !effects.has(id) ||
      plan.tasks.find((task) => task.id === id)?.kind !== "delivery"
  );
  ensure(
    unknown.length === 0,
    "AUTOPILOT_SCOPE_MISMATCH",
    `Delivery tasks without reviewed effects cannot be authorized: ${unknown.join(", ")}.`,
    { unknown }
  );
  return {
    accept: input.accept,
    acceptancePolicy: input.acceptancePolicy,
    at: now,
    ci: structuredClone(automation.ci),
    close: input.close,
    delivery: input.deliveryTaskIds.map((id) =>
      structuredClone(effects.get(id) as DeliveryAutomation)
    ),
    mode: input.mode,
    note: input.note.trim(),
    ownerSession: input.ownerSession,
    proposalDigest: input.proposalDigest,
    publication: structuredClone(automation.publication),
    revision: 1,
    revoked: null,
    runId: input.runId,
    source: input.source.trim(),
  };
}

function boundaries(grant: AutopilotGrant): unknown {
  return {
    accept: grant.accept,
    acceptancePolicy: grant.acceptancePolicy,
    close: grant.close,
    delivery: grant.delivery,
    mode: grant.mode,
  };
}

function withGrant(plan: WorkflowPlan, grant: AutopilotGrant): WorkflowPlan {
  const next = structuredClone(plan);
  next.revision += 1;
  (next.scope as WorkflowScope).authorization = grant;
  return next;
}

/**
 * `autopilot:authorize`: a new run, a resume after settings-off (source
 * panel-resume, the same boundaries) or a checked change of the delivery
 * tasks of the same run. The same boundaries again change nothing.
 */
export function authorizeScope(
  plan: WorkflowPlan,
  input: AuthorizeInput,
  now: string
): GrantChange {
  const grant = grantOf(plan, input, now);
  const current = plan.scope?.authorization;
  if (!current || current.runId !== grant.runId) {
    ensure(
      !current || current.revoked !== null,
      "AUTOPILOT_UNAUTHORIZED",
      `Run ${current?.runId ?? ""} still holds the scope; stop it before another run.`,
      { runId: current?.runId ?? null }
    );
    ensure(
      grant.source !== RESUME_SOURCE,
      "AUTOPILOT_UNAUTHORIZED",
      "A resume continues an existing run.",
      { runId: grant.runId }
    );
    return { changed: true, grant, plan: withGrant(plan, grant) };
  }
  ensure(
    current.revoked?.reason !== "user-stop",
    "AUTOPILOT_REVOKED",
    `Run ${current.runId} was stopped by the user and never resumes.`,
    { reason: "user-stop", runId: current.runId },
    "Start a new run with a new user command."
  );
  const unchanged = same(boundaries(current), boundaries(grant));
  if (current.revoked) {
    ensure(
      grant.source === RESUME_SOURCE && unchanged,
      "AUTOPILOT_REVOKED",
      `Run ${current.runId} is paused by the setting; only a resume with the same boundaries continues it.`,
      { reason: current.revoked.reason, runId: current.runId }
    );
  } else if (unchanged) {
    return { changed: false, grant: current, plan };
  }
  ensure(
    grant.mode === current.mode &&
      (current.accept || !grant.accept) &&
      (current.close || !grant.close),
    "AUTOPILOT_UNAUTHORIZED",
    "The same run cannot widen its mode, acceptance or close authority.",
    { runId: current.runId }
  );
  const next = { ...grant, revision: current.revision + 1 };
  return { changed: true, grant: next, plan: withGrant(plan, next) };
}

/** `autopilot:revoke`: settings-off pauses (resumable), user-stop ends the run. */
export function revokeScope(
  plan: WorkflowPlan,
  input: RevokeInput,
  now: string
): GrantChange {
  ensure(
    REASONS.has(input?.reason),
    "USAGE",
    "--reason is settings-off or user-stop."
  );
  ensure(
    typeof input.note === "string" && input.note.trim() !== "",
    "USAGE",
    "--note records why the run stops."
  );
  const current = plan.scope?.authorization;
  ensure(
    current !== undefined && current.runId === input.runId,
    "AUTOPILOT_SCOPE_MISMATCH",
    `Run ${input.runId} holds no authorization of the current scope.`,
    { runId: current?.runId ?? null }
  );
  const final = current.revoked?.reason === "user-stop";
  if (final || current.revoked?.reason === input.reason) {
    return { changed: false, grant: current, plan };
  }
  const grant: AutopilotGrant = {
    ...current,
    revoked: {
      at: now,
      note: input.note.trim(),
      reason: input.reason,
      resumable: input.reason === "settings-off",
    },
  };
  return { changed: true, grant, plan: withGrant(plan, grant) };
}

/**
 * The live grant of `runId`: AUTOPILOT_UNAUTHORIZED without one,
 * AUTOPILOT_REVOKED after revoke, AUTOPILOT_PLAN_CHANGED when the reviewed
 * proposal, the CI policy or the publication target no longer match.
 */
export function liveGrant(plan: WorkflowPlan, runId: string): AutopilotGrant {
  const scope = activeScope(plan);
  const grant = scope.authorization;
  ensure(
    grant !== undefined && grant.runId === runId,
    "AUTOPILOT_UNAUTHORIZED",
    `Run ${runId} has no authorization for scope ${scope.id}.`,
    { runId, scopeId: scope.id },
    "Ask the user for the step, or let the Workflow Kit app authorize the run."
  );
  ensure(
    grant.revoked === null,
    "AUTOPILOT_REVOKED",
    `Run ${runId} was stopped (${grant.revoked?.reason}).`,
    { reason: grant.revoked?.reason ?? null, runId }
  );
  const automation = automationOf(scope);
  ensure(
    scope.proposal?.digest === grant.proposalDigest &&
      same(grant.ci, automation.ci) &&
      same(grant.publication, automation.publication),
    "AUTOPILOT_PLAN_CHANGED",
    "The plan no longer matches the authorized proposal.",
    { runId }
  );
  return grant;
}

/** The confirmation a delivery task records when the grant starts it. */
export function deliveryConfirmation(
  plan: WorkflowPlan,
  runId: string,
  taskId: string
): string {
  const grant = liveGrant(plan, runId);
  const granted = grant.delivery.find((entry) => entry.taskId === taskId);
  ensure(
    granted !== undefined,
    "AUTOPILOT_UNAUTHORIZED",
    `Run ${runId} is not authorized to start delivery task ${taskId}.`,
    { runId, taskId, tasks: grant.delivery.map((entry) => entry.taskId) },
    "Ask the user to confirm the delivery task."
  );
  const reviewed = plan.scope?.automation?.delivery.find(
    (entry) => entry.taskId === taskId
  );
  ensure(
    same(reviewed, granted),
    "AUTOPILOT_PLAN_CHANGED",
    `The effects of ${taskId} differ from the authorized ones.`,
    { runId, taskId }
  );
  return `Autopilot run ${runId} (authorization ${grant.revision}, ${grant.source}, ${grant.at}): ${grant.note} | effects: ${granted.effects.join("; ")}`;
}

/** The summary line of recovery. */
export function authorizationSummary(grant: AutopilotGrant): string {
  const delivery =
    grant.delivery.map((entry) => entry.taskId).join(", ") || "none";
  const publication = grant.publication
    ? `${grant.publication.branch} → ${grant.publication.upstream}`
    : "none";
  const revoked = grant.revoked
    ? `; revoked: ${grant.revoked.reason}${grant.revoked.resumable ? " (resumable)" : " (final)"}`
    : "";
  return `run ${grant.runId} (${grant.mode}, authorization ${grant.revision}, ${grant.source}): delivery ${delivery}; accept ${grant.accept ? "automatic" : "by the user"}; close ${grant.close ? "yes" : "no"}; publication ${publication}${revoked}`;
}
