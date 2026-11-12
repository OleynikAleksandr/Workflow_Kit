// The data the autopilot decision reads and returns.

export type StopReason =
  | "blocked"
  | "delivery-confirmation"
  | "disabled"
  | "limit"
  | "no-progress"
  | "no-scope"
  | "paused"
  | "ready-for-acceptance"
  | "transaction-pending"
  | "turn-error"
  | "user-message"
  | "waiting-for-executors"
  | "waiting-for-mode-choice";

/** Per-session autopilot state kept by the host. */
export interface AutopilotState {
  continues: number;
  enabled: boolean;
  maxContinues: number;
  /** The orchestration key of the last decision; null outside orchestration. */
  orchestrationKey: string | null;
}

/** One assignment the orchestrator still has to wait for or act on. */
export interface AutopilotAssignment {
  /** INTEGRATED, but its worktree or branch removal is PENDING. */
  cleanupPending: boolean;
  id: string;
  sourceCommit: string | null;
  status:
    | "ASSIGNED"
    | "INTEGRATED"
    | "NEEDS_SETUP"
    | "READY"
    | "READY_FOR_INTEGRATION"
    | "RUNNING";
  taskId: string;
}

/** The orchestrated scope as the orchestrator in main sees it (spec 10.3). */
export interface AutopilotOrchestration {
  /** Active assignments of the scope and integrated ones awaiting cleanup. */
  assignments: AutopilotAssignment[];
  /** The unfinished integration journal, or null. */
  integration: {
    assignmentId: string | null;
    phase: string | null;
    taskId: string | null;
  } | null;
  /** Task ids the scheduler hands out now, in plan order. */
  readyTasks: string[];
}

/** The project status after the turn, as reported by the Workflow Kit. */
export interface AutopilotProjectStatus {
  blockedReason: string | null;
  delivery: "ACCEPTED" | "IN_PROGRESS" | "READY_FOR_ACCEPTANCE" | null;
  head: string | null;
  nextTask: {
    id: string;
    kind: string;
    status: "DONE" | "IN_PROGRESS" | "TODO";
    title: string;
  } | null;
  /**
   * The orchestrated scope seen from main; null or absent in a sequential
   * scope, without a scope and in an executor worktree.
   */
  orchestration?: AutopilotOrchestration | null;
  /**
   * The user paused the workflow (`pause:set --on`): the current task
   * finishes, the next one does not start. Absent in a Kit without the
   * pause, which decides as not paused.
   */
  paused?: boolean;
  /** A scope proposal waits for the user's execution mode choice. */
  proposalPending?: boolean;
  revision: number;
  scope: "ACTIVE" | "BLOCKED" | "NONE";
  /** An unfinished commit transaction or a failed commit check. */
  transactionPending: boolean;
}

export interface AutopilotTurn {
  /** Plan revision and HEAD when the turn started. */
  before: { head: string | null; revision: number };
  outcome: "cancelled" | "completed" | "error";
  /** The user queued or sent a message of their own. */
  userMessage: boolean;
}

/**
 * A decision; in an orchestrated scope it also carries the orchestration key
 * it saw, which the next decision compares for progress.
 */
export type AutopilotDecision =
  | {
      action: "continue";
      orchestrationKey?: string;
      taskId: string;
      text: string;
    }
  | {
      action: "stop";
      detail: string;
      orchestrationKey?: string;
      reason: StopReason;
    };
