// One slot per agent session: its activity, the queue, what the current turn began with and, for
// clients whose Stop hook cannot be held, the state of the detached turn end and delivery.
import type { AgentClient } from './hook-input.ts';
import type { ActivityState, IdleListener, QueuedMessage, SessionActivity, StopContext, StopDecision, TurnEndEvent, TurnOrigin } from './types.ts';

type Timer = ReturnType<typeof setTimeout>;

/** A message on its way to a detached session: made before the send, kept until it is accepted. */
export interface Outbox {
  /** The same on every retry, so an accepted prompt is never run twice. */
  id: string;
  text: string;
  origin: TurnOrigin;
  sources: string[];
  /** The queued messages it was made of; a user prompt that comes first takes them back. */
  messages: QueuedMessage[];
}

export interface Slot {
  activity: SessionActivity;
  queue: QueuedMessage[];
  /** Wakes the held Stop hook of the slot. */
  wake: (() => void) | null;
  origin: TurnOrigin;
  sources: string[];
  /** Turn generation: grows at every turn end and user prompt; a detached stop of an older one is dropped. */
  generation: number;
  outbox: Outbox | null;
  /** Refused sends of the outbox in a row. */
  failures: number;
  /** Text of the prompt the service sent and whose UserPromptSubmit has not come yet. */
  expected: string | null;
  /** A Stop came with a live session lock and its detached stop has not run yet. */
  stopPending: boolean;
  /** Generation whose detached stop runs now. */
  stopping: number | null;
  /** A Stop came without a live session lock: nothing is processed or sent. */
  lockless: boolean;
  /** The decision path (outbox, queue, decider) runs now. */
  advancing: boolean;
  /** A send request is on its way. */
  sending: boolean;
  /** The whole last answer read at the turn end (for a decider asked again after a wake). */
  lastAnswer: string | null;
  watch: { cancelled: boolean; timer?: Timer } | null;
  confirmTimer?: Timer;
  /** The reminder of a hold with timeoutAnswer: when it goes and with what text. */
  reminder: { at: number; timer: Timer } | null;
}

export function newSlot(key: string, client: AgentClient, sessionId: string, projectId: string | null, since: string): Slot {
  return {
    activity: {
      key,
      client,
      sessionId,
      projectId,
      state: 'waiting',
      since,
      turnStartedAt: null,
      lastStopAt: null,
      lastAssistantMessage: null,
      pending: 0,
      holdReason: null,
      holdUntil: null,
      note: null,
      external: false,
    },
    queue: [],
    wake: null,
    origin: 'unknown',
    sources: [],
    generation: 0,
    outbox: null,
    failures: 0,
    expected: null,
    stopPending: false,
    stopping: null,
    lockless: false,
    advancing: false,
    sending: false,
    lastAnswer: null,
    watch: null,
    reminder: null,
  };
}

/** Messages waiting for delivery: the queue and the ones inside an unsent outbox. */
export function pendingOf(slot: Slot): number {
  return slot.queue.length + (slot.outbox?.messages.length ?? 0);
}

/** What the detached path needs from the channel. */
export interface ChannelCore {
  slots: Map<string, Slot>;
  setState(slot: Slot, state: ActivityState, extra?: Partial<SessionActivity>): void;
  /** Calls the stop listeners with the whole last answer and resets the origin of the turn. */
  notify(slot: Slot, lastAssistantMessage: string | null): void;
  /** The decider; a failed one releases. */
  decide(context: StopContext): Promise<StopDecision>;
  idleListeners: Set<IdleListener>;
  changed(key: string): void;
  iso(): string;
  now(): Date;
  holdMs: number;
  log(line: string): void;
  closed(): boolean;
  /** The session left the Kit process (archived or removed): nothing is decided or sent for it. */
  excluded(slot: Slot): boolean;
}

export interface Detached {
  supports(slot: Slot): boolean;
  turnEnd(slot: Slot, event: TurnEndEvent): Promise<void>;
  /** True for the UserPromptSubmit of a prompt the service sent: the turn keeps its origin. */
  ownPrompt(slot: Slot, prompt: string | null): boolean;
  /** A prompt of the user: cancels the pending turn end and gives an unsent delivery back to the queue. */
  userPrompt(slot: Slot): void;
  /** A message was queued: the failure count starts anew and an idle session gets it at once. */
  enqueued(slot: Slot): void;
  wake(slot: Slot): void;
  flush(slot: Slot): Promise<void>;
  maintain(): Promise<void>;
  /** The slot is dropped: its watcher, reminder, confirmation timer and outbox go. */
  drop(slot: Slot): void;
  close(): void;
}
