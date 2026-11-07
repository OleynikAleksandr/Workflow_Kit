// The channel to agents without a chat of our own (spec section 9.2): the Stop hook asks the
// service what to answer and may be held until the user decides (at most 9 minutes); the
// UserPromptSubmit hook marks the turn as running and carries messages that missed a Stop.
// Every message is delivered once: it stays queued until the hook's HTTP answer was sent.
import { randomUUID } from 'node:crypto';
import { blockAnswer, contextAnswer, sessionKey } from './hook-input.ts';
import type { AgentClient, HookInput } from './hook-input.ts';

/** Longest hold of a Stop hook; the hook itself may wait 600 s. */
export const STOP_HOLD_MS = 9 * 60_000;
/** Longest kept tail of the last assistant message. */
const LAST_MESSAGE_CHARS = 400;

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
}

/** A message queued for an agent. */
export interface QueuedMessage {
  id: string;
  text: string;
  source: string;
  createdAt: string;
}

/** What the decider wants after a Stop with no queued message. */
export type StopDecision =
  | { kind: 'continue'; text: string }
  | { kind: 'hold'; reason: string }
  | { kind: 'release' };

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
}

export interface AgentChannelOptions {
  /** Project of a hook by its folder (cwd or $CLAUDE_PROJECT_DIR). */
  resolveProject: (folder: string) => Promise<{ id: string } | undefined>;
  decide?: StopDecider;
  holdMs?: number;
  now?: () => Date;
  onChange?: (key: string) => void;
  log?: (line: string) => void;
}

export interface AgentChannel {
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
  get(key: string): SessionActivity | undefined;
  list(): SessionActivity[];
  queued(key: string): QueuedMessage[];
  section(): { sessions: SessionActivity[] };
  /** Releases every held Stop (service shutdown). */
  close(): void;
}

interface Slot {
  activity: SessionActivity;
  queue: QueuedMessage[];
  wake: (() => void) | null;
}

const RELEASE: StopDecision = { kind: 'release' };
const noop = (): void => undefined;

export function createAgentChannel(options: AgentChannelOptions): AgentChannel {
  const now = options.now ?? (() => new Date());
  const holdMs = options.holdMs ?? STOP_HOLD_MS;
  const log = options.log ?? noop;
  let decide: StopDecider = options.decide ?? (() => RELEASE);
  const slots = new Map<string, Slot>();
  let closed = false;

  const iso = (): string => now().toISOString();
  const changed = (key: string): void => options.onChange?.(key);

  async function slotOf(input: HookInput): Promise<Slot> {
    const key = sessionKey(input.client, input.sessionId);
    let slot = slots.get(key);
    if (!slot) {
      slot = {
        activity: {
          key,
          client: input.client,
          sessionId: input.sessionId,
          projectId: null,
          state: 'waiting',
          since: iso(),
          turnStartedAt: null,
          lastStopAt: null,
          lastAssistantMessage: null,
          pending: 0,
          holdReason: null,
          holdUntil: null,
        },
        queue: [],
        wake: null,
      };
      slots.set(key, slot);
    }
    if (!slot.activity.projectId) {
      for (const folder of [input.projectDir, input.cwd]) {
        if (!folder) continue;
        const project = await options.resolveProject(folder).catch(() => undefined);
        if (project) {
          slot.activity.projectId = project.id;
          break;
        }
      }
    }
    return slot;
  }

  function setState(slot: Slot, state: ActivityState, extra: Partial<SessionActivity> = {}): void {
    if (slot.activity.state !== state) slot.activity.since = iso();
    Object.assign(slot.activity, { state, holdReason: null, holdUntil: null }, extra);
    slot.activity.pending = slot.queue.length;
    changed(slot.activity.key);
  }

  /** Takes the whole queue as one delivery; ack drops it, nack puts it back in front. */
  function deliver(slot: Slot, render: (text: string) => Record<string, unknown>): HookReply {
    const taken = slot.queue.splice(0, slot.queue.length);
    slot.activity.pending = 0;
    let settled = false;
    const text = taken.map((message) => message.text).join('\n\n');
    return {
      answer: render(text),
      ack: () => {
        if (settled) return;
        settled = true;
        changed(slot.activity.key);
      },
      nack: () => {
        if (settled) return;
        settled = true;
        slot.queue.unshift(...taken);
        slot.activity.pending = slot.queue.length;
        changed(slot.activity.key);
      },
    };
  }

  const empty = (answer: Record<string, unknown> | null = null): HookReply => ({ answer, ack: noop, nack: noop });

  /** Waits until the slot is woken, the hold time passes or the hook went away. */
  function hold(slot: Slot, reason: string, deadline: number, signal?: AbortSignal): Promise<'woken' | 'timeout' | 'aborted'> {
    setState(slot, 'holding', { holdReason: reason, holdUntil: new Date(deadline).toISOString() });
    return new Promise((resolve) => {
      const finish = (result: 'woken' | 'timeout' | 'aborted'): void => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        if (slot.wake === wake) slot.wake = null;
        resolve(result);
      };
      const wake = (): void => finish('woken');
      const onAbort = (): void => finish('aborted');
      const timer = setTimeout(() => finish('timeout'), Math.max(0, deadline - now().getTime()));
      timer.unref?.();
      slot.wake?.();
      slot.wake = wake;
      if (closed || signal?.aborted) finish('aborted');
      else signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  return {
    async stop(input, signal) {
      const slot = await slotOf(input);
      const last = input.lastAssistantMessage ? input.lastAssistantMessage.slice(-LAST_MESSAGE_CHARS) : slot.activity.lastAssistantMessage;
      setState(slot, 'waiting', { lastStopAt: iso(), turnStartedAt: null, lastAssistantMessage: last });
      const deadline = now().getTime() + holdMs;
      let woken = false;
      for (;;) {
        if (slot.queue.length > 0) {
          const reply = deliver(slot, (text) => blockAnswer(text));
          setState(slot, 'working', { turnStartedAt: iso() });
          return reply;
        }
        let decision: StopDecision;
        try {
          decision = await decide({
            key: slot.activity.key,
            client: input.client,
            sessionId: input.sessionId,
            projectId: slot.activity.projectId,
            stopHookActive: input.stopHookActive,
            lastAssistantMessage: input.lastAssistantMessage,
            woken,
          });
        } catch (error) {
          log(`channel: decider failed for ${slot.activity.key}: ${error instanceof Error ? error.message : String(error)}`);
          decision = RELEASE;
        }
        if (slot.queue.length > 0) continue;
        if (decision.kind === 'continue') {
          setState(slot, 'working', { turnStartedAt: iso() });
          return empty(blockAnswer(decision.text));
        }
        if (decision.kind === 'release' || closed || now().getTime() >= deadline) {
          setState(slot, 'waiting');
          return empty();
        }
        const result = await hold(slot, decision.reason, deadline, signal);
        if (result !== 'woken') {
          setState(slot, 'waiting');
          return empty();
        }
        woken = true;
      }
    },
    async prompt(input) {
      const slot = await slotOf(input);
      slot.wake?.();
      if (slot.queue.length > 0) {
        const reply = deliver(slot, (text) => contextAnswer(text));
        setState(slot, 'working', { turnStartedAt: iso() });
        return reply;
      }
      setState(slot, 'working', { turnStartedAt: iso() });
      return empty();
    },
    enqueue(key, text, source = 'panel', projectId) {
      const message: QueuedMessage = { id: randomUUID(), text, source, createdAt: iso() };
      let slot = slots.get(key);
      if (!slot) {
        const [client, ...rest] = key.split(':');
        slot = {
          activity: {
            key,
            client: client === 'codex' ? 'codex' : 'claude',
            sessionId: rest.join(':'),
            projectId: projectId ?? null,
            state: 'waiting',
            since: iso(),
            turnStartedAt: null,
            lastStopAt: null,
            lastAssistantMessage: null,
            pending: 0,
            holdReason: null,
            holdUntil: null,
          },
          queue: [],
          wake: null,
        };
        slots.set(key, slot);
      }
      if (projectId && !slot.activity.projectId) slot.activity.projectId = projectId;
      slot.queue.push(message);
      slot.activity.pending = slot.queue.length;
      changed(key);
      slot.wake?.();
      return message;
    },
    wake(key) {
      slots.get(key)?.wake?.();
    },
    setDecider(next) {
      decide = next;
    },
    get: (key) => {
      const slot = slots.get(key);
      return slot ? { ...slot.activity } : undefined;
    },
    list: () => [...slots.values()].map((slot) => ({ ...slot.activity })),
    queued: (key) => [...(slots.get(key)?.queue ?? [])],
    section: () => ({ sessions: [...slots.values()].map((slot) => ({ ...slot.activity })) }),
    close() {
      closed = true;
      for (const slot of slots.values()) slot.wake?.();
    },
  };
}
