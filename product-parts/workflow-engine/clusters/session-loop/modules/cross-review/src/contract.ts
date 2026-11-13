// Contract of the cross review (spec M4): what the service gives it and what it offers.
import type { StopContext, StopDecision, StopEvent } from '#agent-channel';
import type { Review } from './store.ts';
import type { ReviewProvider } from './texts.ts';

export interface CrossReviewDeps {
  listProjects(): Promise<Array<{ id: string; name: string; path: string }>>;
  /** Title of a provider for the texts (default: its id). */
  providerTitle?(provider: ReviewProvider): string;
  /**
   * Why a provider cannot be the reviewer now (not registered, its reviewer capability is not
   * available), else null. Default: every provider of REVIEW_PAIRS can.
   */
  reviewerBlocked?(provider: ReviewProvider): Promise<string | null>;
  /**
   * The provider does not send a typed first message of a new session (spec M4 13.9): the brief
   * goes by the queue and a wake once the session's key is known. Default: false.
   */
  briefByQueue?(provider: ReviewProvider): boolean;
  /** Starts the reviewer session like «Новая сессия» with a first message. */
  createSession(projectId: string, provider: ReviewProvider, opts: { title: string; firstMessage?: string; detached: true }): Promise<{ localId: string | null; remoteId: string | null }>;
  /** Channel key of a created session once its hooks are known, else null. */
  resolveReviewer(projectId: string, provider: ReviewProvider, ref: { localId: string | null; remoteId: string | null }): Promise<string | null>;
  /** Queues a message for a session (and wakes it when the provider can). */
  enqueue(key: string, text: string, projectId: string): void;
  /**
   * Hands a message to a session that may not have finished a turn yet: queued and woken at once
   * (spec M4 13.9; a reviewer with briefByQueue gets its brief this way). Defaults to enqueue.
   */
  deliver?(key: string, text: string, projectId: string): void;
  /** How the key of a briefByQueue reviewer is looked for after its creation (spec M4 13.9). */
  findReviewer?: { pollMs: number; timeoutMs: number };
  /** Asks the decider again for a held Stop. */
  wake(key: string): void;
  /** Cheap channel barrier, rechecked after asynchronous review preparation. */
  continuationBlocked?(key: string): boolean;
  /** Explicit retry after interruption: allow delivery again. */
  resumeDelivery?(key: string): void;
  toggle(projectId: string, key: string): boolean;
  /** The open plan proposal of a project, or null. */
  proposal(projectId: string): Promise<{ generation: number; scopeId: string | null } | null>;
  sessionTitle(projectId: string, key: string): string | null;
  /** The session has an open plan question (spec M4 12): its Stop waits for the answer. */
  question?(projectId: string, key: string): boolean;
  /** Any open plan question in the project. */
  asking?(projectId: string): boolean;
  /** The session has a review decision (an answer to the question). */
  decided?(projectId: string, key: string): boolean;
  /** Asks the proposal question of a session without a decision (spec M4 12.2). */
  askProposal?(projectId: string, key: string): Promise<void>;
  now?: () => Date;
  log?: (line: string) => void;
}

export interface ReviewSummary extends Omit<Review, 'entries'> {
  statusLabel: string;
  active: boolean;
  entries: Review['entries'];
}

export interface CrossReview {
  load(): Promise<void>;
  /** Channel listener: remembers the finished turn and forwards it when it belongs to a review. */
  onStop(event: StopEvent): void;
  /**
   * Stop decision for a session in a review, or null. canStart: the session would now wait for
   * the mode choice of an open proposal — with the toggle on, its review starts here.
   */
  decide(context: StopContext, canStart?: boolean): Promise<StopDecision | null>;
  /**
   * Why the mode choice must wait (spec M4 section 11.3), or null: a review runs, or one of the
   * working sessions has the toggle on and has not reviewed the open proposal yet.
   */
  choiceBlocked(projectId: string, working: readonly string[]): Promise<string | null>;
  /** The toggle changed: on asks the held Stop again (starts the review), off cancels it. */
  toggled(projectId: string, key: string, on: boolean): Promise<void>;
  cancel(projectId: string, key: string, reason: string): Promise<Review | null>;
  interrupted(projectId: string, key: string): Promise<void>;
  /**
   * «Повторить ревью» (spec M4 13.2): the session's review of the open proposal failed — its held
   * Stop is asked again and the review starts anew. False when there is nothing to retry.
   */
  retry(projectId: string, key: string): Promise<boolean>;
  isReviewer(key: string): boolean;
  /** The review of a session as main or reviewer. */
  get(projectId: string, key: string): Review | null;
  section(): { projects: Record<string, ReviewSummary[]> };
  /** Resolves when no review work is running (tests, shutdown). */
  idle(): Promise<void>;
}
