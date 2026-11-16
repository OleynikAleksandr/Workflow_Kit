// Types of the autopilot service and its panel actions, split from autopilot.ts (M39 T005).
import type { StopContext, StopDecision } from '#agent-channel';
import type { KitRunner, WorkflowState } from '#kit-runner';
import type { AgentChannel } from '#agent-channel';
import type { KitChoiceOption } from '#plan-view';
import type { StopReason } from './decide.ts';
import type { PlanStart } from './start.ts';

/** `accepted` and `closed` label a plan the user accepted or closed (spec M37 2.2). */
export type AutopilotReason = StopReason | 'waiting-for-plan-start' | 'waiting-for-review' | 'waiting-for-main' | 'waiting-for-plan-decision' | 'accepted' | 'closed';

/**
 * The cross review (M4): its Stop decision comes before the autopilot's. canStart — the session
 * would now wait for the mode choice of an open proposal.
 */
export interface ReviewDecider {
  decide(context: StopContext, canStart?: boolean): Promise<StopDecision | null>;
  isReviewer(key: string): boolean;
  /** Why sequential/orchestrated must wait for the plan review (spec M4 11.3), or null. */
  choiceBlocked?(projectId: string, working: readonly string[]): Promise<string | null>;
}

/** Autopilot state of one session, shown in the panel. */
export interface SessionAutopilot {
  key: string;
  projectId: string | null;
  enabled: boolean;
  continues: number;
  maxContinues: number;
  orchestrationKey: string | null;
  /** Plan revision and HEAD when the current turn started (progress check). */
  before: { head: string | null; revision: number } | null;
  /** Who started the current turn: the user typing in the chat or a panel message. */
  origin: 'user' | 'kit' | null;
  last: { action: 'continue' | 'hold' | 'release'; reason: AutopilotReason | null; label: string | null; detail: string; at: string } | null;
  /** The plan start under way (spec M11), or null. */
  start: PlanStart | null;
}

/** A Kit refusal of a panel action. */
export class WorkflowActionError extends Error {
  readonly code: string;
  readonly status: number;
  readonly nextAction: string | null;
  constructor(code: string, message: string, status = 409, nextAction: string | null = null) {
    super(message);
    this.name = 'WorkflowActionError';
    this.code = code;
    this.status = status;
    this.nextAction = nextAction;
  }
}

export interface AutopilotOptions {
  runner: KitRunner;
  workflow: WorkflowState;
  channel: AgentChannel;
  projectPath: (projectId: string) => Promise<string | undefined>;
  review?: ReviewDecider;
  /**
   * Whether sessions of a provider may run a scope with executors (the provider's orchestration
   * capability). Default: every provider may.
   */
  orchestration?: (client: string) => Promise<{ available: boolean; reason?: string }>;
  /** Whether the project lists the session (its provider knows it); absent — every session counts. */
  owns?: (projectId: string, key: string) => Promise<boolean>;
  maxContinues?: number;
  /**
   * M39 autopiloting runs: the grant of a manual start is recorded before the first work message;
   * «Продолжить» of a run paused by Settings off records a new grant revision. Both return the
   * run id, or null when the start gets no M39 authority (off, legacy plan, old Kit).
   */
  authority?: {
    beforeStart(projectId: string, key: string): Promise<string | null>;
    beforeResume(projectId: string, key: string): Promise<string | null>;
  };
  now?: () => Date;
  log?: (line: string) => void;
}

export interface ChooseRequest {
  session: string;
  generation: number;
  option: KitChoiceOption;
  /** `scope:choose --expected-digest` (M39): Kit refuses a proposal changed since this digest. */
  expectedDigest?: string;
  /**
   * M39: the choice of an autopiloting run — its note names the run, and no «wait for the start
   * button» message goes to the agent: the start follows at once.
   */
  automatic?: { runId: string; note: string };
}

export interface Autopilot {
  /** The channel's Stop decider. */
  decide(context: StopContext): Promise<StopDecision>;
  /** A UserPromptSubmit of a session: `delivered` when it carried panel messages. */
  onPrompt(key: string, delivered: boolean): void;
  choose(projectId: string, request: ChooseRequest): Promise<{ option: KitChoiceOption; owner: string }>;
  /** `already` — a start runs without a problem: nothing was sent again (spec M11 2.3). */
  start(projectId: string, session?: string): Promise<{ owner: string; already?: boolean; runId?: string }>;
  pause(projectId: string): Promise<void>;
  interrupt(projectId: string, key: string): Promise<void>;
  resume(projectId: string, session?: string): Promise<{ owner: string; runId?: string }>;
  /** Runs the Kit command and tells the owner session (spec M37 2.2); `session` — the session of the request. */
  accept(projectId: string, note?: string, session?: string): Promise<void>;
  close(projectId: string, note?: string, session?: string): Promise<void>;
  /** Asks the owner session to tidy the paths outside commits (spec M37 2.3). */
  tidy(projectId: string, session?: string): Promise<{ owner: string; paths: string[] }>;
  fixes(projectId: string, text: string, session?: string): Promise<{ owner: string }>;
  confirmDelivery(projectId: string, words: string, session?: string): Promise<{ owner: string; taskId: string }>;
  get(key: string): SessionAutopilot | undefined;
  section(): { sessions: SessionAutopilot[] };
}
