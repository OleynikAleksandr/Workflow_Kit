// Applying a user decision (M40): the host passes the id of a registered
// request with its ticket; Kit recomputes the request, refuses a stale one
// and performs the operation with the decision in the plan history. A
// decision applies at most once: a repeat returns the stored result.
import {
  type DecisionSource,
  type UserDecision,
  workflowPlanFacade,
} from "../../workflow-plan/src/workflow-plan-facade.js";
import { ensure } from "../../workflow-platform/src/workflow-platform-facade.js";
import { ensureRevision, type KitContext, readPlan } from "./kit-context.js";
import {
  type DecisionRequest,
  markRequest,
  readRegistry,
  reproduced,
} from "./kit-decisions.js";
import { adoptCommits } from "./kit-external.js";
import { hostDigest } from "./kit-host-auth.js";
import { applyQuality } from "./kit-quality.js";
import { acceptScope, closeScope, setBlocked } from "./kit-scope.js";
import { chooseScope } from "./kit-scope-create.js";
import { startTask } from "./kit-task.js";

export interface DecisionMeta {
  expectedRevision: number;
  /** The user's words (a message), the button label or the run's note. */
  note: string;
  source: DecisionSource;
}

export interface DecisionOutcome {
  already: boolean;
  decisionId: string;
  kind: string;
  result: unknown;
}

const SOURCES = new Set(["button", "grant", "message"]);
const MIN_NOTE = 10;

/** The registered request `id`: DECISION_UNKNOWN without one. */
export function requestOf(context: KitContext, id: string): DecisionRequest {
  const request = readRegistry(context).requests.find((item) => item.id === id);
  ensure(
    request !== undefined,
    "DECISION_UNKNOWN",
    `There is no decision request ${id}.`,
    { decisionId: id },
    "Read `scripts/workflow status` for the pending decisions."
  );
  return request;
}

/** True when the plan history already holds decision `id`. */
function recorded(context: KitContext, id: string): boolean {
  const plan = workflowPlanFacade.read(context.root);
  return (
    plan?.lastClosed?.decision?.decisionId === id ||
    (plan?.scope?.decisions ?? []).some((item) => item.decisionId === id)
  );
}

/** A note long enough for every operation, with the user's text first. */
function noteOf(request: DecisionRequest, meta: DecisionMeta): string {
  const text = meta.note.trim();
  const label = `decision ${request.id}, ${meta.source.kind}`;
  return text.length >= MIN_NOTE ? text : `${text} (${label})`;
}

function perform(
  context: KitContext,
  request: DecisionRequest,
  record: UserDecision,
  note: string
): unknown {
  const choice = request.choice;
  switch (choice.kind) {
    case "accept":
      return acceptScope(context, note, record);
    case "close":
      return closeScope(context, choice.scopeId, note, record);
    case "unblock":
      return setBlocked(context, null, record);
    case "adopt-commits":
      // The exact list the card showed; a new commit made the request stale.
      return adoptCommits(
        context,
        (request.params.commits ?? []) as string[],
        note,
        record
      );
    case "confirm-delivery":
      return record.source?.kind === "grant"
        ? startTask(
            context,
            choice.taskId,
            null,
            record.source.runId ?? null,
            record
          )
        : startTask(context, choice.taskId, note, null, record);
    case "choose":
      return chooseScope(
        context,
        {
          expectedDigest: request.proposal?.digest ?? null,
          generation: choice.generation,
          note,
          option: choice.option,
          session: choice.session,
        },
        record
      );
    default:
      // The stored input, not a file the agent may have edited since.
      return applyQuality(context, { ...choice.input, approval: note }, record);
  }
}

/**
 * A `grant` source: the advance instruction of a run decides only the mode
 * choice (no scope yet; the host checks its run) and the delivery tasks the
 * live grant covers (M39 refusals). Acceptance and close of a run keep
 * `--autopilot-run` with its evidence; nothing else is covered.
 */
function grantSource(
  context: KitContext,
  request: DecisionRequest,
  source: DecisionSource
): DecisionSource {
  if (source.kind !== "grant") {
    return source;
  }
  const runId = source.runId ?? "";
  ensure(
    runId !== "",
    "USAGE",
    "A grant decision names its run (--autopilot-run)."
  );
  if (request.choice.kind === "choose") {
    return { ...source, authorization: null };
  }
  ensure(
    request.choice.kind === "confirm-delivery",
    "AUTOPILOT_UNAUTHORIZED",
    `The authorization of run ${runId} does not cover the decision ${request.kind}.`,
    { kind: request.kind, runId },
    "This decision is the user's: the panel button or the user's message records it."
  );
  const plan = readPlan(context);
  workflowPlanFacade.deliveryConfirmation(plan, runId, request.choice.taskId);
  return {
    ...source,
    authorization: hostDigest(plan.scope?.authorization ?? null),
  };
}

/**
 * Applies request `id`. DECISION_STALE when the current state no longer
 * gives the same digest (the request turns stale); `already: true` for a
 * decision the registry or the plan history holds as applied. A run source
 * needs the live grant of that run once the scope exists.
 */
export function applyDecision(
  context: KitContext,
  id: string,
  meta: DecisionMeta
): DecisionOutcome {
  ensure(
    SOURCES.has(meta.source?.kind) && meta.note.trim() !== "",
    "USAGE",
    "A decision needs --source button|message|grant and a non-empty --note."
  );
  const request = requestOf(context, id);
  const done = (result: unknown, already: boolean): DecisionOutcome => ({
    already,
    decisionId: id,
    kind: request.kind,
    result,
  });
  if (request.state === "applied") {
    return done(request.applied?.result ?? null, true);
  }
  if (recorded(context, id)) {
    // The operation finished but its registry mark was lost: no second write.
    markRequest(context, id, (item) => {
      item.state = "applied";
      item.applied = { at: context.now(), result: null };
    });
    return done(null, true);
  }
  const stale = (): never => {
    markRequest(context, id, (item) => {
      item.state = "stale";
    });
    ensure(
      false,
      "DECISION_STALE",
      `Decision request ${id} no longer matches the project state; nothing was applied.`,
      { decisionId: id, kind: request.kind },
      "Read `scripts/workflow status`: a new request replaces it when the decision is still needed."
    );
    throw new Error("unreachable");
  };
  if (request.state !== "pending") {
    return stale();
  }
  if (reproduced(context, request) === null) {
    return stale();
  }
  ensureRevision(readPlan(context), meta.expectedRevision);
  const source = grantSource(context, request, meta.source);
  const record: UserDecision = {
    at: context.now(),
    decisionId: id,
    kind: request.kind,
    source,
    text: `${request.kind}: ${meta.note.trim()}`,
  };
  const result = perform(context, request, record, noteOf(request, meta));
  markRequest(context, id, (item) => {
    item.state = "applied";
    item.applied = { at: context.now(), result };
  });
  return done(result, false);
}
