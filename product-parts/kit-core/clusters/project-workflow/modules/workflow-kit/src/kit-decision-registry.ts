// The decision requests of a project (M40): their types and the local
// registry `.harness/workflow/local/decisions.json` (not in git).
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { ExecutionModeOption } from "../../workflow-execution-mode/src/workflow-execution-mode-facade.js";
import { workflowPlatformFacade } from "../../workflow-platform/src/workflow-platform-facade.js";
import type { ProfileInput } from "../../workflow-quality/src/workflow-quality-facade.js";
import { type KitContext, locked } from "./kit-context.js";

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
  | { kind: "adopt-commits" }
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
