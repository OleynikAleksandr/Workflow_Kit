// User decisions of a project in the `host` decisions mode (M40): the typed
// request Kit registers when a decision command comes without a host ticket,
// its recomputation from the current state and the local registry. The
// request names exactly what the user allows; the host applies it with a
// ticket bound to its id and digest (kit-decision-apply.ts).
import { workflowExecutionModeFacade } from "../../workflow-execution-mode/src/workflow-execution-mode-facade.js";
import {
  type WorkflowPlan,
  workflowPlanFacade,
} from "../../workflow-plan/src/workflow-plan-facade.js";
import {
  ensure,
  WorkflowError,
} from "../../workflow-platform/src/workflow-platform-facade.js";
import type { ProfileInput } from "../../workflow-quality/src/workflow-quality-facade.js";
import { type KitContext, locked, readConfig, readPlan } from "./kit-context.js";
import {
  type DecisionChoice,
  type DecisionRequest,
  type DecisionSubject,
  type DecisionView,
  readRegistry,
  viewOf,
  writeRegistry,
} from "./kit-decision-registry.js";
import { externalCommits, externalMessage } from "./kit-external.js";
import { hostDigest } from "./kit-host-auth.js";

export type {
  DecisionChoice,
  DecisionKind,
  DecisionRequest,
  DecisionSubject,
  DecisionView,
} from "./kit-decision-registry.js";
export {
  markRequest,
  readRegistry,
  viewOf,
  writeRegistry,
} from "./kit-decision-registry.js";

/** `host` when the project lets only the app record user decisions. */
export function decisionsMode(context: KitContext): "agent" | "host" {
  return readConfig(context).decisions === "host" ? "host" : "agent";
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
  if (choice.kind === "adopt-commits") {
    const commits = externalCommits(context, plan);
    ensure(
      commits.length > 0,
      "NO_EXTERNAL_COMMITS",
      "There are no commits made past the Workflow Kit to adopt."
    );
    return {
      kind: "adopt-commits",
      params: { commits },
      proposal: null,
      scopeId,
      taskId: null,
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

function sameTarget(left: DecisionSubject, right: DecisionSubject): boolean {
  return (
    left.kind === right.kind &&
    left.scopeId === right.scopeId &&
    left.taskId === right.taskId
  );
}

/**
 * Registers the request of `choice`; the caller holds the Kit lock. The
 * same subject keeps its id; another one of the same kind and target
 * replaces the request and leaves the earlier one stale.
 */
export function registerDecision(
  context: KitContext,
  choice: DecisionChoice
): DecisionView {
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
}

/**
 * Registers the request of `choice` and refuses with
 * USER_DECISION_REQUIRED: nothing of the plan changes.
 */
export function requireDecision(
  context: KitContext,
  choice: DecisionChoice
): never {
  const view = locked(context, () => registerDecision(context, choice));
  throw new WorkflowError(
    "USER_DECISION_REQUIRED",
    `This step (${view.kind}) is the user's decision: Workflow Kit records it from the panel button or from the user's message, not from this command.`,
    { decision: view },
    `Tell the user the decision waits in the Workflow Kit panel. If the user already decided in this chat, run \`wfk decision ${view.kind}\` (the app takes the user's words itself); never pass the user's words yourself.`
  );
}

/**
 * The barrier of commits made past the Kit (M40, spec 3.2): task:start,
 * commit, accept and close fail with EXTERNAL_COMMITS and the list of SHAs
 * until the user adopts them. In the `host` mode the refusal registers the
 * `adopt-commits` request itself, so the card needs no further command.
 * The caller holds the Kit lock.
 */
export function ensureNoExternalCommits(
  context: KitContext,
  plan: WorkflowPlan
): void {
  const commits = externalCommits(context, plan);
  if (commits.length === 0) {
    return;
  }
  const host = decisionsMode(context) === "host";
  const decision = host
    ? registerDecision(context, { kind: "adopt-commits" })
    : null;
  throw new WorkflowError(
    "EXTERNAL_COMMITS",
    externalMessage(commits),
    { commits, decision },
    host
      ? "Tell the user: the decision to adopt these commits waits in the Workflow Kit panel. Never commit with `git commit`."
      : 'Ask the user; then `scripts/workflow commits:adopt --commits <sha,sha> --note "<the user\'s words>"`. Never commit with `git commit`.'
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
