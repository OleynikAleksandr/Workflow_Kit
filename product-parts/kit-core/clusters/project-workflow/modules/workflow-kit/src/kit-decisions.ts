// User decisions of a project in the `host` decisions mode (M40): the typed
// request Kit registers when a decision command comes without a host ticket,
// its recomputation from the current state and the local registry. The
// request names exactly what the user allows; the host applies it with a
// ticket bound to its id and digest (kit-decision-apply.ts).
import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  type ExecutionModeOption,
  workflowExecutionModeFacade,
} from "../../workflow-execution-mode/src/workflow-execution-mode-facade.js";
import { workflowPlanFacade } from "../../workflow-plan/src/workflow-plan-facade.js";
import {
  ensure,
  WorkflowError,
  workflowPlatformFacade,
} from "../../workflow-platform/src/workflow-platform-facade.js";
import type { ProfileInput } from "../../workflow-quality/src/workflow-quality-facade.js";
import { type KitContext, locked, readConfig, readPlan } from "./kit-context.js";
import { hostDigest } from "./kit-host-auth.js";

export type DecisionKind =
  | "accept"
  | "adopt-commits"
  | "approve-install"
  | "choose"
  | "close"
  | "confirm-delivery"
  | "unblock";

/** What the caller chose; the rest of a request Kit reads from its state. */
export type DecisionChoice =
  | { kind: "accept" }
  | { input: ProfileInput; kind: "approve-install" }
  | {
      /** The digest the user saw (`scope:proposal --digest`), when given. */
      expectedDigest?: string | null;
      generation: number;
      kind: "choose";
      option: ExecutionModeOption;
      session: string;
    }
  | { kind: "close"; scopeId: string }
  | { kind: "confirm-delivery"; taskId: string }
  | { kind: "unblock" };

/** The part of a request its digest covers. */
export interface DecisionSubject {
  kind: DecisionKind;
  params: Record<string, unknown>;
  proposal: { digest: string; generation: number } | null;
  scopeId: string | null;
  taskId: string | null;
}

export interface DecisionRequest extends DecisionSubject {
  /** When and how the host applied it; absent while pending. */
  applied?: { at: string; result: unknown };
  /** The stored choice the request is recomputed from. */
  choice: DecisionChoice;
  createdAt: string;
  id: string;
  inputDigest: string;
  /** Plan revision when the request was registered. */
  revision: number;
  state: "applied" | "pending" | "stale";
}

/** A pending request as `status` and the refusal show it (no stored input). */
export type DecisionView = Omit<DecisionRequest, "applied" | "choice">;

interface Registry {
  requests: DecisionRequest[];
  version: 1;
}

const FILE = "decisions.json";
/** Applied and stale records kept for idempotent repeats. */
const KEPT = 50;

/** `host` when the project lets only the app record user decisions. */
export function decisionsMode(context: KitContext): "agent" | "host" {
  return readConfig(context).decisions === "host" ? "host" : "agent";
}

export function readRegistry(context: KitContext): Registry {
  const text = workflowPlatformFacade.readTextIfExists(
    context.git.localPath(context.root, FILE)
  );
  if (text === null) {
    return { requests: [], version: 1 };
  }
  try {
    const parsed = JSON.parse(text) as Registry;
    return Array.isArray(parsed.requests)
      ? { requests: parsed.requests, version: 1 }
      : { requests: [], version: 1 };
  } catch {
    return { requests: [], version: 1 };
  }
}

export function writeRegistry(context: KitContext, registry: Registry): void {
  const file = context.git.localPath(context.root, FILE);
  const open = registry.requests.filter((item) => item.state === "pending");
  const closed = registry.requests
    .filter((item) => item.state !== "pending")
    .slice(-KEPT);
  mkdirSync(path.dirname(file), { recursive: true });
  workflowPlatformFacade.writeFileAtomic(
    file,
    `${JSON.stringify({ requests: [...closed, ...open], version: 1 }, null, 2)}\n`
  );
}

function head(context: KitContext): string {
  return context.git.head(context.root) ?? "";
}

/** Install commands exactly as the card shows them. */
function installs(input: ProfileInput): { args: string[]; executable: string }[] {
  const commands: unknown = input.install ?? [];
  ensure(
    Array.isArray(commands),
    "QUALITY_INPUT",
    "install must be a list of commands.",
    { field: "install" }
  );
  return (commands as { args?: unknown; executable?: unknown }[]).map(
    (command) => ({
      args: Array.isArray(command?.args) ? command.args.map(String) : [],
      executable: String(command?.executable ?? ""),
    })
  );
}

/**
 * The subject of `choice` in the current state. Preconditions fail with the
 * errors of the operation itself (NOT_READY, PROPOSAL_CHANGED, ...), so a
 * request exists only for a decision that can be applied now.
 */
export function subjectOf(
  context: KitContext,
  choice: DecisionChoice
): DecisionSubject {
  const now = context.now();
  if (choice.kind === "choose") {
    const proposal = workflowExecutionModeFacade.verifyChoice(context.root, {
      generation: choice.generation,
      note: "decision request",
      now,
      option: choice.option,
      session: choice.session,
    });
    const digest = workflowExecutionModeFacade.proposalDigest(
      context.root,
      proposal
    ).proposalDigest;
    const expected = choice.expectedDigest ?? null;
    ensure(
      expected === null || expected === digest,
      "PROPOSAL_CHANGED",
      "The proposal or its documents changed after the reviewed digest.",
      { current: digest, expected, generation: proposal.generation },
      "Read `scope:proposal --digest`, review the current proposal again and choose with its digest."
    );
    return {
      kind: "choose",
      params: { option: choice.option, session: choice.session.trim() },
      proposal: { digest, generation: proposal.generation },
      scopeId: null,
      taskId: null,
    };
  }
  const plan = readPlan(context);
  const scopeId = plan.scope?.id ?? null;
  if (choice.kind === "approve-install") {
    const { approval: _approval, ...profile } = choice.input;
    return {
      kind: "approve-install",
      params: {
        configDigest: hostDigest(readConfig(context).quality),
        install: installs(choice.input),
        profileDigest: hostDigest(profile),
      },
      proposal: null,
      scopeId,
      taskId: plan.currentTaskId,
    };
  }
  if (choice.kind === "accept") {
    workflowPlanFacade.accept(plan, "decision request", now);
    return {
      kind: "accept",
      params: { head: head(context), result: plan.scope?.delivery ?? null },
      proposal: null,
      scopeId,
      taskId: null,
    };
  }
  if (choice.kind === "close") {
    workflowPlanFacade.close(plan, choice.scopeId, "decision request", now);
    return {
      kind: "close",
      params: { head: head(context) },
      proposal: null,
      scopeId,
      taskId: null,
    };
  }
  if (choice.kind === "unblock") {
    workflowPlanFacade.unblock(plan);
    return {
      kind: "unblock",
      params: { reasonDigest: hostDigest(plan.scope?.blockedReason ?? null) },
      proposal: null,
      scopeId,
      taskId: plan.currentTaskId,
    };
  }
  const task = workflowPlanFacade.task(plan, choice.taskId);
  ensure(
    task.kind === "delivery",
    "USAGE",
    `${task.id} is not a delivery task; it starts without a confirmation.`
  );
  ensure(
    task.status === "TODO",
    "TASK_NOT_TODO",
    `Task ${task.id} is already ${task.status}.`
  );
  workflowPlanFacade.startTask(plan, task.id, "decision request");
  return {
    kind: "confirm-delivery",
    params: {
      taskDigest: hostDigest({
        acceptance: task.acceptance,
        checks: task.checks,
        dependencies: task.dependencies,
        files: task.files,
        title: task.title,
      }),
    },
    proposal: null,
    scopeId,
    taskId: task.id,
  };
}

export function digestOf(subject: DecisionSubject): string {
  const { kind, params, proposal, scopeId, taskId } = subject;
  return hostDigest({ kind, params, proposal, scopeId, taskId });
}

/**
 * What a card shows: the bookkeeping of the stored request with the subject
 * Kit computed now, so a record edited in the file cannot show other data.
 */
export function viewOf(
  request: DecisionRequest,
  subject: DecisionSubject
): DecisionView {
  const { createdAt, id, inputDigest, revision, state } = request;
  return { ...subject, createdAt, id, inputDigest, revision, state };
}

function sameTarget(left: DecisionSubject, right: DecisionSubject): boolean {
  return (
    left.kind === right.kind &&
    left.scopeId === right.scopeId &&
    left.taskId === right.taskId
  );
}

/**
 * Registers the request of `choice` and refuses with
 * USER_DECISION_REQUIRED: nothing of the plan changes. The same subject
 * keeps its id; another one of the same kind and target replaces the
 * request and leaves the earlier one stale.
 */
export function requireDecision(
  context: KitContext,
  choice: DecisionChoice
): never {
  const view = locked(context, () => {
    const subject = subjectOf(context, choice);
    const inputDigest = digestOf(subject);
    const registry = readRegistry(context);
    const same = registry.requests.find(
      (item) => item.state === "pending" && item.inputDigest === inputDigest
    );
    if (same) {
      return viewOf(same, subject);
    }
    for (const item of registry.requests) {
      if (item.state === "pending" && sameTarget(item, subject)) {
        item.state = "stale";
      }
    }
    const request: DecisionRequest = {
      ...subject,
      choice,
      createdAt: context.now(),
      id: `dec-${hostDigest({ at: context.now(), inputDigest, n: registry.requests.length }).slice(0, 12)}`,
      inputDigest,
      revision: workflowPlanFacade.read(context.root)?.revision ?? 0,
      state: "pending",
    };
    registry.requests.push(request);
    writeRegistry(context, registry);
    return viewOf(request, subject);
  });
  throw new WorkflowError(
    "USER_DECISION_REQUIRED",
    `This step (${view.kind}) is the user's decision: Workflow Kit records it from the panel button or from the user's message, not from this command.`,
    { decision: view },
    `Tell the user the decision waits in the Workflow Kit panel. If the user already decided in this chat, run \`wfk decision ${view.kind}\` (the app takes the user's words itself); never pass the user's words yourself.`
  );
}

/** The subject of `request` when the current state still gives its digest. */
export function reproduced(
  context: KitContext,
  request: DecisionRequest
): DecisionSubject | null {
  try {
    const subject = subjectOf(context, request.choice);
    return digestOf(subject) === request.inputDigest ? subject : null;
  } catch {
    return null;
  }
}

/**
 * The pending requests `status` shows: each is recomputed, so a stale or a
 * planted record is not listed. Read-only.
 */
export function pendingDecisions(context: KitContext): DecisionView[] {
  if (decisionsMode(context) !== "host") {
    return [];
  }
  const views: DecisionView[] = [];
  for (const item of readRegistry(context).requests) {
    const subject = item.state === "pending" ? reproduced(context, item) : null;
    if (subject) {
      views.push(viewOf(item, subject));
    }
  }
  return views;
}

/** Changes the stored request `id` under the Kit lock. */
export function markRequest(
  context: KitContext,
  id: string,
  change: (request: DecisionRequest) => void
): void {
  locked(context, () => {
    const registry = readRegistry(context);
    const request = registry.requests.find((item) => item.id === id);
    if (request) {
      change(request);
      writeRegistry(context, registry);
    }
  });
}
