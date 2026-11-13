// Types of the channel to agents: the activity of a session shown in the panel, queued messages,
// the Stop decider, hook replies and the options of createAgentChannel.
import type { AgentClient, HookInput } from './hook-input.ts';
import type { TurnControl } from './turn-state.ts';

/** Longest hold of a Stop hook; the hook itself may wait 600 s. */
export const STOP_HOLD_MS = 9 * 60_000;
/** Longest kept tail of the last assistant message. */
export const LAST_MESSAGE_CHARS = 400;

export type ActivityState = 'working' | 'waiting' | 'holding';

/** Activity of one agent session, shown in the panel ("работает над ответом 0:15"). */
export interface SessionActivity {
  key: string;
  client: AgentClient;
  sessionId: string;
  projectId: string | null;
  state: ActivityState;
  /** When the current state began. */
  since: string;
  turnStartedAt: string | null;
  lastStopAt: string | null;
  lastAssistantMessage: string | null;
  /** Messages waiting for delivery. */
  pending: number;
  /** Why a Stop is held (for example "waiting-for-mode-choice"). */
  holdReason: string | null;
  holdUntil: string | null;
  /** What went wrong with the session's turn end or delivery (detached clients), for the panel. */
  note: string | null;
  /**
   * The last hook of the session came without the panel's process mark (panelProcess false): the
   * session runs in a process outside the panel. False until the first hook (spec M19 2.2).
   */
  external: boolean;
}

/** A message queued for an agent. */
export interface QueuedMessage {
  id: string;
  text: string;
  source: string;
  createdAt: string;
}

/**
 * What the decider wants after a Stop with no queued message. A hold with timeoutAnswer does not
 * end silently: when the hold time passes the agent gets that text (a reminder) and goes on.
 */
export type StopDecision =
  | { kind: 'continue'; text: string }
  | { kind: 'hold'; reason: string; timeoutAnswer?: string }
  | { kind: 'release' };

/** How the turn that just ended began. */
export type TurnOrigin = 'delivery' | 'decider' | 'reminder' | 'user' | 'unknown';

/** A finished turn: what the agent said last and what started the turn (spec M4 section 7). */
export interface StopEvent {
  key: string;
  client: AgentClient;
  sessionId: string;
  projectId: string | null;
  /** The whole last message of the turn (not cut like the activity). */
  lastAssistantMessage: string | null;
  origin: TurnOrigin;
  /** Sources of the delivered messages that started the turn ('delivery' only). */
  sources: string[];
}

export type StopListener = (event: StopEvent) => void;

/** Facts the decider gets about a Stop. */
export interface StopContext {
  key: string;
  client: AgentClient;
  sessionId: string;
  projectId: string | null;
  stopHookActive: boolean;
  lastAssistantMessage: string | null;
  /** True when the decider is asked again after a wake-up of a held Stop. */
  woken: boolean;
}

export type StopDecider = (context: StopContext) => Promise<StopDecision> | StopDecision;

/** A hook answer with the delivery to confirm once it was sent. */
export interface HookReply {
  /** JSON the hook prints, or null for no output. */
  answer: Record<string, unknown> | null;
  /** Confirms the delivery (messages leave the queue). */
  ack(): void;
  /** The answer was not sent: messages go back to the head of the queue. */
  nack(): void;
  /** True for a UserPromptSubmit of a prompt the service itself sent (detached delivery). */
  own?: boolean;
}

/** A session of a client that takes messages as prompts. */
export interface SessionRef {
  key: string;
  client: AgentClient;
  sessionId: string;
  projectId: string | null;
}

/** A turn end told by a hook that cannot be held (wfk hook turn-end). */
export interface TurnEndNotice {
  client: AgentClient;
  sessionId: string;
  cwd: string | null;
  event: TurnEndEvent;
  /** The hook runs inside a process the panel started; absent counts as false. */
  panelProcess?: boolean;
}

export type TurnEndEvent = 'Stop' | 'StopFailure' | 'Interrupt';
export const TURN_END_EVENTS: readonly TurnEndEvent[] = ['Stop', 'StopFailure', 'Interrupt'];

/**
 * Delivery for clients whose Stop hook cannot be held (spec M8 section 3): the hook only tells
 * that the turn ended, and the next message goes as a prompt once the session is idle. The
 * service builds it from the provider registry (sessionIdle, lastAnswer, sendMessage).
 */
export interface DetachedDelivery {
  /** True for a client whose provider has sessionIdle and sendMessage. */
  supports(client: AgentClient): boolean;
  /** No turn runs in the session (no live session lock). */
  idle(session: SessionRef): Promise<boolean>;
  /** Text of the last answer; null for a turn without text; rejects when it cannot be read. */
  lastAnswer(session: SessionRef): Promise<string | null>;
  /** Sends the text as a prompt; true when it was accepted. The id is the same on every retry. */
  send(session: SessionRef, text: string, delivery: { id: string }): Promise<boolean>;
  /** Sessions archived in the panel get no message. */
  archived?(session: SessionRef): boolean;
  /** Names of the client for the notes: short label, app title, the setting that turns session locks off. */
  names?(client: AgentClient): { label: string; title: string; lockSwitch?: string | null };
  /** Pause between idle checks of the watcher (1 s) and the longest watch (120 s). */
  pollMs?: number;
  watchMs?: number;
  /** Pause before lastAnswer is tried again (2 s, two more tries). */
  retryMs?: number;
  /** How long a sent prompt may stay without its UserPromptSubmit (60 s). */
  confirmMs?: number;
  /** Interval of maintain() run by the channel itself (60 s); 0 turns it off. */
  maintainMs?: number;
}

/** Hears that a session became idle, before its last answer is read; awaited. */
export type IdleListener = (key: string) => void | Promise<void>;

export interface AgentChannelOptions {
  /** Project of a hook by its folder (cwd or $CLAUDE_PROJECT_DIR). */
  resolveProject: (folder: string) => Promise<{ id: string } | undefined>;
  decide?: StopDecider;
  holdMs?: number;
  now?: () => Date;
  onChange?: (key: string) => void;
  log?: (line: string) => void;
  /** Turn end and delivery of clients whose Stop hook cannot be held. */
  detached?: DetachedDelivery;
  /**
   * True for a session that left the Kit process: archived or removed from the list in the panel
   * (spec M22 2.8). Its hooks get an empty answer, it gets no message and is in no list.
   */
  excluded?(session: SessionRef & { projectId: string }): boolean;
}

export interface AgentChannel extends TurnControl {
  stop(input: HookInput, signal?: AbortSignal): Promise<HookReply>;
  prompt(input: HookInput): Promise<HookReply>;
  /**
   * Queues a message for a session and wakes its held Stop. projectId names the project of a
   * session the channel has not seen yet (after a restart of the service).
   */
  enqueue(key: string, text: string, source?: string, projectId?: string): QueuedMessage;
  /** Asks the decider again for a held Stop (for example after a plan change). */
  wake(key: string): void;
  setDecider(decide: StopDecider): void;
  /** Hears every Stop before the decider; returns the unsubscribe. */
  onStop(listener: StopListener): () => void;
  /**
   * A turn end of a detached client (POST /api/hooks/turn-end); false for a client that is not
   * one. The work itself goes on in the background once the session is idle.
   */
  turnEnd(notice: TurnEndNotice): Promise<boolean>;
  /** Delivers what waits for an idle session of a detached client (queue or an unsent message). */
  flush(key: string): Promise<void>;
  /** Picks up turn ends whose watch expired and retries unsent messages (every minute). */
  maintain(): Promise<void>;
  /** Hears a detached session becoming idle (a waiting rename goes then); returns the unsubscribe. */
  onIdle(listener: IdleListener): () => void;
  get(key: string): SessionActivity | undefined;
  list(): SessionActivity[];
  queued(key: string): QueuedMessage[];
  /** True while the message waits for delivery: in the queue or in an unsent outbox. */
  waiting(key: string, id: string): boolean;
  section(): { sessions: SessionActivity[] };
  /**
   * True when the session left the Kit process (options.excluded); projectId names the project of
   * a session the channel has not seen.
   */
  excluded(key: string, projectId?: string | null): boolean;
  /**
   * Drops the session at once (it was archived or removed): its held Stop is released, its queue,
   * outbox and watchers go. A later hook of a session that is still excluded is answered empty.
   */
  forget(key: string): void;
  /** Releases every held Stop and stops the watchers (service shutdown). */
  close(): void;
}
