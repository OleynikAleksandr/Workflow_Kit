// The decision gate of the CLI (M40). In a project with `decisions: host`
// a decision command without a host ticket registers a decision request and
// refuses (USER_DECISION_REQUIRED); with `--decision <id>` it is a host-only
// operation whose ticket is bound to the request, its note and its source.
import type { ExecutionModeOption } from "../../workflow-execution-mode/src/workflow-execution-mode-facade.js";
import type { DecisionSource } from "../../workflow-plan/src/workflow-plan-facade.js";
import { ensure } from "../../workflow-platform/src/workflow-platform-facade.js";
import type { ProfileInput } from "../../workflow-quality/src/workflow-quality-facade.js";
import {
  flag,
  integerFlag,
  type ParsedArgs,
  positional,
  readJsonFile,
  requiredFlag,
} from "./kit-cli-args.js";
import { canonicalRoot, type HostedRun } from "./kit-cli-autopilot.js";
import { choice, expectedDigest, generation } from "./kit-cli-execution.js";
import type { DecisionChoice, DecisionKind } from "./kit-decisions.js";
import { type HostOperation, hostDigest } from "./kit-host-auth.js";
import type { WorkflowKitFacade } from "./workflow-kit-facade.js";

interface GateContext {
  args: ParsedArgs;
  io: { cwd: string };
  kit: WorkflowKitFacade;
  root: string;
}

/** The decision each gated command records. */
const KINDS: Readonly<Record<string, DecisionKind>> = {
  accept: "accept",
  close: "close",
  "commits:adopt": "adopt-commits",
  "quality:apply": "approve-install",
  "scope:choose": "choose",
  "task:start": "confirm-delivery",
  "task:unblock": "unblock",
};

const OPTIONS = new Set(["orchestrated", "refine", "sequential"]);
const SOURCES = new Set(["button", "grant", "message"]);

function sourceOf(args: ParsedArgs): DecisionSource {
  const kind = requiredFlag(args, "source");
  ensure(SOURCES.has(kind), "USAGE", "--source is button, message or grant.");
  const runId = flag(args, "autopilot-run") ?? null;
  ensure(
    (kind === "grant") === (runId !== null),
    "USAGE",
    "--autopilot-run goes with --source grant, and only with it."
  );
  return {
    kind: kind as DecisionSource["kind"],
    messageId: flag(args, "message-id") ?? null,
    runId,
    session: flag(args, "decision-session") ?? null,
  };
}

/** The host form: `<command> --decision <id> --source ... --note ... --expected-revision N`. */
function hosted(command: string, id: string, context: GateContext): HostedRun {
  const { args, kit, root } = context;
  const request = kit.decisionRequest(root, id);
  ensure(
    request.kind === KINDS[command],
    "USAGE",
    `Decision ${id} is ${request.kind}; it is not applied by ${command}.`
  );
  const revision = integerFlag(args, "expected-revision");
  ensure(
    revision !== undefined,
    "USAGE",
    "--expected-revision is required: the ticket is bound to the plan revision."
  );
  const note = requiredFlag(args, "note");
  const source = sourceOf(args);
  return {
    request: {
      decisionId: id,
      expectedRevision: revision,
      inputDigest: hostDigest({ decision: request.inputDigest, note, source }),
      operation: command as HostOperation,
      ownerSession: kit.grantOwner(root),
      root: canonicalRoot(root),
      runId: source.runId ?? null,
      scopeId: request.scopeId ?? "NONE",
    },
    run: () =>
      kit.applyDecision(root, id, { expectedRevision: revision, note, source }),
  };
}

/** What the agent's form of `command` asks the user to decide, or null. */
function choiceOf(command: string, context: GateContext): DecisionChoice | null {
  const { args, io, kit, root } = context;
  if (flag(args, "autopilot-run") !== undefined) {
    // The M39 run forms keep their own host ticket or grant check.
    return null;
  }
  switch (command) {
    case "commits:adopt":
      return { kind: "adopt-commits" };
    case "accept":
      kit.externalGuard(root);
      return { kind: "accept" };
    case "close":
      kit.externalGuard(root);
      return { kind: "close", scopeId: requiredFlag(args, "scope") };
    case "task:unblock":
      return { kind: "unblock" };
    case "scope:choose":
      return {
        expectedDigest: expectedDigest(args),
        generation: generation(args),
        kind: "choose",
        option: choice<ExecutionModeOption>(args, "option", OPTIONS),
        session: requiredFlag(args, "session"),
      };
    case "task:start": {
      const taskId = positional(args, 0, "Task id");
      kit.externalGuard(root);
      return kit.needsDeliveryDecision(root, taskId)
        ? { kind: "confirm-delivery", taskId }
        : null;
    }
    default: {
      const input = readJsonFile<ProfileInput>(
        io.cwd,
        requiredFlag(args, "input")
      );
      return Array.isArray(input?.install) && input.install.length > 0
        ? { input, kind: "approve-install" }
        : null;
    }
  }
}

/**
 * The gate of `command`: null when the command runs as before (the `agent`
 * mode, a command without a user decision), a host operation for
 * `--decision <id>`, or the USER_DECISION_REQUIRED refusal that registers
 * the request.
 */
export function decisionGate(
  command: string,
  context: GateContext
): HostedRun | null {
  if (KINDS[command] === undefined) {
    return null;
  }
  const id = flag(context.args, "decision");
  if (context.kit.decisionsMode(context.root) !== "host") {
    ensure(
      id === undefined,
      "USAGE",
      "--decision applies only in a project with `decisions: host`."
    );
    return null;
  }
  if (id !== undefined) {
    return hosted(command, id, context);
  }
  const asked = choiceOf(command, context);
  return asked === null ? null : context.kit.requireDecision(context.root, asked);
}
