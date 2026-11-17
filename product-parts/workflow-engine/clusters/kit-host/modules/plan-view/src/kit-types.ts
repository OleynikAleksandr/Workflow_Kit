// The parts of Kit 2.2.3 command results the service reads. Kit may add fields; readers ignore
// what they do not know and treat missing optional fields as absent.

export type KitTaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';
export type KitStrategy = 'sequential' | 'orchestrated';
export type KitChoiceOption = KitStrategy | 'refine';

/** One task of `status.tasks`, in plan order. */
export interface KitTask {
  id: string;
  kind: string;
  title: string;
  status: KitTaskStatus;
  roundId: string;
  parallelSafe: boolean;
  dependencies: string[];
}

/** A task reference (`currentTask`, `nextTask`). */
export interface KitTaskRef {
  id: string;
  kind: string;
  title: string;
  status: KitTaskStatus;
  roundId: string;
}

/** `status.scope`; null when no scope is active. */
export interface KitScope {
  id: string;
  objective: string;
  status: 'ACTIVE' | 'BLOCKED';
  delivery: 'IN_PROGRESS' | 'READY_FOR_ACCEPTANCE' | 'ACCEPTED';
  blockedReason: string | null;
}

/** `status.execution`; null before a mode is chosen. */
export interface KitExecution {
  strategy: KitStrategy;
  ownerSession: string | null;
  maxWorkers?: number;
}

/** One orchestrated assignment of `status.assignments`. */
export interface KitAssignment {
  id?: string;
  taskId: string;
  status: string;
  worktree?: string | null;
}

/** `status.scopeProposal`: a short marker of an open proposal. */
export interface KitScopeProposalMarker {
  generation: number;
  hasParallelWork: boolean;
  options: KitChoiceOption[];
  recommended: KitStrategy;
  refining: boolean;
}

/** Result of `status`. */
export interface KitStatus {
  installed: boolean;
  revision: number;
  head: string | null;
  project: { id: string; name: string } | null;
  scope: KitScope | null;
  execution: KitExecution | null;
  tasks: KitTask[];
  progress: { done: number; total: number };
  currentTask: KitTaskRef | null;
  nextTask: KitTaskRef | null;
  paused: boolean;
  assignments: KitAssignment[];
  scopeProposal: KitScopeProposalMarker | null;
  transaction: unknown;
  /** Changed paths outside commits, without Kit-managed state; absent in an old Kit. */
  changes?: string[];
  /** Pending user decisions of a `decisions: host` project (Kit 2.4.0+, M40); absent in an older Kit. */
  decisions?: KitDecision[];
  /** Who records the user's decisions (Kit 2.4.0+): `host` — only the app; absent — `agent`. */
  decisionsMode?: 'agent' | 'host';
}

export type KitDecisionKind = 'accept' | 'adopt-commits' | 'approve-install' | 'choose' | 'close' | 'confirm-delivery' | 'unblock';

/**
 * A decision request of Kit (M40): what exactly the user allows. The panel builds a card from
 * it; the button returns `id` and `inputDigest`, so data changed after the card was shown is
 * refused (`DECISION_STALE`).
 */
export interface KitDecision {
  id: string;
  kind: KitDecisionKind;
  scopeId: string | null;
  taskId: string | null;
  proposal: { digest: string; generation: number } | null;
  params: Record<string, unknown>;
  inputDigest: string;
  revision: number;
  createdAt: string;
  state: 'pending' | 'applied' | 'stale';
}

/**
 * Result of `scope:proposal --digest` (Kit 2.3.0+, M39): the digest of the open proposal over
 * its canonical plan fields and the bytes of its spec/context documents.
 */
export interface KitProposalDigest {
  /** sha256 of every spec/context document by path; null for a missing file. */
  documentDigests: Record<string, string | null>;
  generation: number;
  proposalDigest: string;
  scopeId: string | null;
}

/** Result of `scope:proposal` (null when no proposal is open). */
export interface KitProposal {
  /**
   * Whether the proposal has the `automation` block (Kit 2.4.4+); absent on an older Kit, where
   * the service learns it only from the chosen scope.
   */
  automation?: boolean;
  createdAt: string;
  generation: number;
  hasParallelWork: boolean;
  host: string | null;
  objective: string | null;
  options: KitChoiceOption[];
  reason: string;
  recommended: KitStrategy;
  refining: boolean;
  scopeId: string | null;
}
