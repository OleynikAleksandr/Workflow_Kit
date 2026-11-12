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
}

/** Result of `scope:proposal` (null when no proposal is open). */
export interface KitProposal {
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
