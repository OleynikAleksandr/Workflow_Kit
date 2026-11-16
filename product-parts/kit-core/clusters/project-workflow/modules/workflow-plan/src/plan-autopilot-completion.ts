// Acceptance and close by an authorized autopilot run (M39), and the
// validation of the stored authorization records.
import { ensure } from "../../workflow-platform/src/workflow-platform-facade.js";
import { liveGrant } from "./plan-authorization.js";
import type { WorkflowPlan } from "./plan-model.js";
import { acceptScope, closeScope } from "./plan-scope-completion.js";

/** One automatic criterion and what proved it. */
export interface CriterionEvidence {
  /** Quality check ids with the commit whose verification record passed them. */
  checks: { commit: string; id: string }[];
  criterion: number;
  /** Result files tracked at `head`. */
  evidence: string[];
}

/** `scope.acceptanceEvidence`: an acceptance recorded by an autopilot run. */
export interface AcceptanceEvidence {
  at: string;
  authorizationRevision: number;
  ci: { checks: string[]; sha: string } | null;
  criteria: CriterionEvidence[];
  head: string;
  runId: string;
  source: "autopilot";
}

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const SCHEMA = "PLAN_SCHEMA";

/** Records the acceptance of the run; the evidence is verified by the Kit. */
export function acceptByAutopilot(
  plan: WorkflowPlan,
  evidence: Omit<AcceptanceEvidence, "at" | "authorizationRevision" | "source">,
  now: string
): WorkflowPlan {
  const grant = liveGrant(plan, evidence.runId);
  ensure(
    grant.accept,
    "AUTOPILOT_MANUAL_REQUIRED",
    `Run ${grant.runId} may not accept the result; the user accepts it.`,
    { runId: grant.runId },
    "Ask the user to check the result and accept it."
  );
  const automation = plan.scope?.automation;
  const manual = (automation?.acceptance ?? []).filter(
    (entry) => entry.kind === "manual"
  );
  ensure(
    manual.length === 0,
    "AUTOPILOT_MANUAL_REQUIRED",
    "A manual acceptance criterion is never accepted automatically.",
    { manual: manual.map((entry) => entry.criterion) }
  );
  const note = `Accepted automatically by autopilot run ${grant.runId} under the user's advance instruction (authorization ${grant.revision}, ${grant.source}, ${grant.at}): ${grant.note} | evidence at ${evidence.head}`;
  const accepted = acceptScope(plan, note, now);
  (accepted.scope as NonNullable<WorkflowPlan["scope"]>).acceptanceEvidence = {
    ...structuredClone(evidence),
    at: now,
    authorizationRevision: grant.revision,
    source: "autopilot",
  };
  return validateAutopilotRecords(accepted);
}

/** Closes an ACCEPTED scope for the run; the closed reference keeps the run and the final commit. */
export function closeByAutopilot(
  plan: WorkflowPlan,
  request: { head: string; runId: string; scopeId: string },
  now: string
): WorkflowPlan {
  const grant = liveGrant(plan, request.runId);
  ensure(
    grant.close,
    "AUTOPILOT_UNAUTHORIZED",
    `Run ${grant.runId} may not close the scope.`,
    { runId: grant.runId },
    "Ask the user for a direct command to close the scope."
  );
  ensure(
    SHA_PATTERN.test(request.head),
    "AUTOPILOT_EVIDENCE_REQUIRED",
    "Closing records the final commit."
  );
  const closed = closeScope(
    plan,
    request.scopeId,
    `Closed by autopilot run ${grant.runId} under the user's advance instruction: ${grant.note}`,
    now
  );
  closed.lastClosed = {
    autopilotRun: grant.runId,
    closedAt: now,
    finalCommit: request.head,
    scopeId: request.scopeId,
  };
  return validateAutopilotRecords(closed);
}

function shape(ok: boolean, field: string, message: string): void {
  ensure(ok, SCHEMA, message, { field });
}

function validateGrant(plan: WorkflowPlan): void {
  const grant = plan.scope?.authorization;
  if (grant === undefined) {
    return;
  }
  const field = "scope.authorization";
  shape(
    grant !== null && typeof grant === "object",
    field,
    "scope.authorization must be an object."
  );
  shape(
    typeof grant.runId === "string" &&
      grant.runId !== "" &&
      typeof grant.ownerSession === "string" &&
      typeof grant.note === "string" &&
      typeof grant.source === "string" &&
      typeof grant.at === "string" &&
      typeof grant.proposalDigest === "string",
    field,
    "scope.authorization names the run, owner, source, note, time and proposal digest."
  );
  shape(
    (grant.mode === "after-start" || grant.mode === "full") &&
      (grant.acceptancePolicy === "automatic" ||
        grant.acceptancePolicy === "manual") &&
      typeof grant.accept === "boolean" &&
      typeof grant.close === "boolean" &&
      Number.isSafeInteger(grant.revision) &&
      grant.revision >= 1 &&
      Array.isArray(grant.delivery),
    field,
    "scope.authorization has a mode, policies and a revision."
  );
  const kinds = new Map(plan.tasks.map((task) => [task.id, task.kind]));
  shape(
    grant.delivery.every((entry) => kinds.get(entry?.taskId) === "delivery"),
    `${field}.delivery`,
    "An authorized delivery entry names a delivery task of the scope."
  );
  const revoked = grant.revoked;
  shape(
    revoked === null ||
      (typeof revoked === "object" &&
        (revoked.reason === "settings-off" || revoked.reason === "user-stop") &&
        revoked.resumable === (revoked.reason === "settings-off") &&
        typeof revoked.at === "string" &&
        typeof revoked.note === "string"),
    `${field}.revoked`,
    "A revocation has a reason, a time, a note and resumable only for settings-off."
  );
}

function validateEvidence(plan: WorkflowPlan): void {
  const evidence = plan.scope?.acceptanceEvidence;
  if (evidence === undefined) {
    return;
  }
  const field = "scope.acceptanceEvidence";
  shape(
    evidence !== null &&
      typeof evidence === "object" &&
      plan.scope?.delivery === "ACCEPTED",
    field,
    "acceptanceEvidence belongs to an ACCEPTED scope."
  );
  shape(
    evidence.source === "autopilot" &&
      typeof evidence.runId === "string" &&
      SHA_PATTERN.test(evidence.head) &&
      Array.isArray(evidence.criteria) &&
      Number.isSafeInteger(evidence.authorizationRevision),
    field,
    "acceptanceEvidence names the run, the head and the criteria."
  );
}

/** Validates the authorization, the acceptance evidence and the closed reference. */
export function validateAutopilotRecords(plan: WorkflowPlan): WorkflowPlan {
  validateGrant(plan);
  validateEvidence(plan);
  const closed = plan.lastClosed;
  if (closed && (closed.autopilotRun !== undefined || closed.finalCommit !== undefined)) {
    shape(
      typeof closed.autopilotRun === "string" &&
        closed.autopilotRun !== "" &&
        typeof closed.finalCommit === "string" &&
        SHA_PATTERN.test(closed.finalCommit),
      "lastClosed",
      "A scope closed by a run records the run and the final commit."
    );
  }
  return plan;
}
