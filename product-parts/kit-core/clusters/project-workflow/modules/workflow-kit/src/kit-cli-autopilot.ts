// The host-only autopilot commands (M39): `autopilot:authorize`,
// `autopilot:revoke`, and the `--autopilot-run` forms of `accept` and
// `close`. Each names the HostRequest its ticket is bound to; the CLI runs
// the operation only after the parent verified and redeemed that ticket.
import { realpathSync } from "node:fs";
import {
  type AuthorizeInput,
  type RevokeReason,
  workflowPlanFacade,
} from "../../workflow-plan/src/workflow-plan-facade.js";
import { ensure } from "../../workflow-platform/src/workflow-platform-facade.js";
import {
  flag,
  integerFlag,
  type ParsedArgs,
  readJsonFile,
  requiredFlag,
} from "./kit-cli-args.js";
import type { AcceptanceInput } from "./kit-autopilot.js";
import {
  type HostOperation,
  type HostRequest,
  hostDigest,
} from "./kit-host-auth.js";
import type { WorkflowKitFacade } from "./workflow-kit-facade.js";

export interface HostCommandContext {
  args: ParsedArgs;
  io: { cwd: string };
  kit: WorkflowKitFacade;
  root: string;
}

/** A host operation: what the ticket is bound to and the write after it. */
export interface HostedRun {
  request: HostRequest;
  run: () => unknown;
}

interface HostCommandSpec {
  host: (context: HostCommandContext) => HostedRun | null;
  run: (context: HostCommandContext) => unknown;
  usage: string;
}

export function canonicalRoot(root: string): string {
  try {
    return realpathSync(root);
  } catch {
    return root;
  }
}

function expectedRevision(args: ParsedArgs): number {
  const value = integerFlag(args, "expected-revision");
  ensure(
    value !== undefined,
    "USAGE",
    "--expected-revision is required: the ticket is bound to the plan revision."
  );
  return value;
}

/** The scope id and the owner session of the current grant, from the plan. */
function planFacts(root: string): {
  ownerSession: string | null;
  scopeId: string;
} {
  const scope = workflowPlanFacade.read(root)?.scope ?? null;
  return {
    ownerSession: scope?.authorization?.ownerSession ?? null,
    scopeId: scope?.id ?? "NONE",
  };
}

function request(
  operation: HostOperation,
  root: string,
  fields: Omit<HostRequest, "operation" | "root">
): HostRequest {
  return { ...fields, operation, root: canonicalRoot(root) };
}

/** `accept --autopilot-run`: host only; `--note` is the manual form. */
export function acceptHost({
  args,
  io,
  kit,
  root,
}: HostCommandContext): HostedRun | null {
  const runId = flag(args, "autopilot-run");
  if (runId === undefined) {
    return null;
  }
  ensure(
    flag(args, "note") === undefined,
    "USAGE",
    "accept takes --note (the user's words) or --autopilot-run, not both."
  );
  const input = readJsonFile<AcceptanceInput>(
    root,
    io.cwd,
    requiredFlag(args, "input")
  );
  const revision = expectedRevision(args);
  return {
    request: request("accept", root, {
      ...planFacts(root),
      expectedRevision: revision,
      inputDigest: hostDigest(input),
      runId,
    }),
    run: () => kit.acceptRun(root, runId, input, revision),
  };
}

/** `close --autopilot-run`: host only; `--note` is the manual form. */
export function closeHost({
  args,
  kit,
  root,
}: HostCommandContext): HostedRun | null {
  const runId = flag(args, "autopilot-run");
  if (runId === undefined) {
    return null;
  }
  ensure(
    flag(args, "note") === undefined,
    "USAGE",
    "close takes --note (the user's command) or --autopilot-run, not both."
  );
  const scopeId = requiredFlag(args, "scope");
  const revision = expectedRevision(args);
  return {
    request: request("close", root, {
      ownerSession: planFacts(root).ownerSession,
      expectedRevision: revision,
      inputDigest: hostDigest({ runId, scopeId }),
      runId,
      scopeId,
    }),
    run: () => kit.closeRun(root, scopeId, runId, revision),
  };
}

function hostOnly(): never {
  ensure(false, "USAGE", "This command runs only with its host ticket.");
  throw new Error("unreachable");
}

export const AUTOPILOT_COMMANDS: Readonly<Record<string, HostCommandSpec>> = {
  "autopilot:authorize": {
    host: ({ args, io, kit, root }) => {
      const input = readJsonFile<AuthorizeInput>(
        root,
        io.cwd,
        requiredFlag(args, "input")
      );
      const revision = expectedRevision(args);
      return {
        request: request("autopilot:authorize", root, {
          expectedRevision: revision,
          inputDigest: hostDigest(input),
          ownerSession:
            typeof input?.ownerSession === "string" ? input.ownerSession : null,
          runId: String(input?.runId ?? ""),
          scopeId: String(input?.scopeId ?? ""),
        }),
        run: () => kit.authorize(root, input, revision),
      };
    },
    run: hostOnly,
    usage: "autopilot:authorize --input <file.json> --expected-revision N",
  },
  "autopilot:revoke": {
    host: ({ args, kit, root }) => {
      const input = {
        note: requiredFlag(args, "note"),
        reason: requiredFlag(args, "reason") as RevokeReason,
        runId: requiredFlag(args, "run"),
      };
      const revision = expectedRevision(args);
      return {
        request: request("autopilot:revoke", root, {
          ...planFacts(root),
          expectedRevision: revision,
          inputDigest: hostDigest(input),
          runId: input.runId,
        }),
        run: () => kit.revoke(root, input, revision),
      };
    },
    run: hostOnly,
    usage:
      'autopilot:revoke --run <id> --reason settings-off|user-stop --note "<why>" --expected-revision N',
  },
};
