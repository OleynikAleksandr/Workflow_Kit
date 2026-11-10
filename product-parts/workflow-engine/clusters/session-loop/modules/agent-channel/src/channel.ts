// The channel to agents without a chat of our own (spec section 9.2): the Stop hook asks the
// service what to answer and may be held until the user decides (at most 9 minutes); the
// UserPromptSubmit hook marks the turn as running and carries messages that missed a Stop.
// Every message is delivered once: it stays queued until the hook's HTTP answer was sent.
// A client whose Stop hook cannot be held gets its next message as a prompt (detached.ts).
import { randomUUID } from 'node:crypto';
import { createDetached } from './detached.ts';
import { blockAnswer, promptAnswer, sessionKey } from './hook-input.ts';
import { newSlot, pendingOf } from './slots.ts';
import type { ChannelCore, Slot } from './slots.ts';
import { LAST_MESSAGE_CHARS, STOP_HOLD_MS } from './types.ts';
import type { ActivityState, AgentChannel, AgentChannelOptions, HookReply, IdleListener, QueuedMessage, SessionActivity, StopContext, StopDecider, StopDecision, StopEvent, StopListener, TurnOrigin } from './types.ts';

const RELEASE: StopDecision = { kind: 'release' };
const noop = (): void => undefined;

export function createAgentChannel(options: AgentChannelOptions): AgentChannel {
  const now = options.now ?? (() => new Date());
  const holdMs = options.holdMs ?? STOP_HOLD_MS;
  const log = options.log ?? noop;
  let decide: StopDecider = options.decide ?? (() => RELEASE);
  const slots = new Map<string, Slot>();
  const listeners = new Set<StopListener>();
  let closed = false;

  const iso = (): string => now().toISOString();
  const changed = (key: string): void => options.onChange?.(key);

  async function slotOf(input: { client: string; sessionId: string; cwd: string | null; projectDir?: string | null }): Promise<Slot> {
    const key = sessionKey(input.client, input.sessionId);
    let slot = slots.get(key);
    if (!slot) {
      slot = newSlot(key, input.client, input.sessionId, null, iso());
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
    slot.activity.pending = pendingOf(slot);
    changed(slot.activity.key);
  }

  /** Takes the whole queue as one delivery; ack drops it, nack puts it back in front. */
  function deliver(slot: Slot, render: (text: string) => Record<string, unknown>): HookReply {
    const taken = slot.queue.splice(0, slot.queue.length);
    slot.sources = taken.map((message) => message.source);
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

  /** The next turn of the slot begins with this origin. */
  function begin(slot: Slot, origin: TurnOrigin, sources: string[] = []): void {
    slot.origin = origin;
    if (origin !== 'delivery') slot.sources = sources;
  }

  function notify(slot: Slot, lastAssistantMessage: string | null): void {
    const event: StopEvent = {
      key: slot.activity.key,
      client: slot.activity.client,
      sessionId: slot.activity.sessionId,
      projectId: slot.activity.projectId,
      lastAssistantMessage,
      origin: slot.origin,
      sources: [...slot.sources],
    };
    slot.origin = 'unknown';
    slot.sources = [];
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (error) {
        log(`channel: stop listener failed for ${event.key}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

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

  async function safeDecide(context: StopContext): Promise<StopDecision> {
    try {
      return await decide(context);
    } catch (error) {
      log(`channel: decider failed for ${context.key}: ${error instanceof Error ? error.message : String(error)}`);
      return RELEASE;
    }
  }

  const idleListeners = new Set<IdleListener>();
  const core: ChannelCore = { slots, setState, notify, decide: safeDecide, idleListeners, changed, iso, now, holdMs, log, closed: () => closed };
  const detached = options.detached ? createDetached(core, options.detached) : null;

  return {
    async stop(input, signal) {
      const slot = await slotOf(input);
      const last = input.lastAssistantMessage ? input.lastAssistantMessage.slice(-LAST_MESSAGE_CHARS) : slot.activity.lastAssistantMessage;
      setState(slot, 'waiting', { lastStopAt: iso(), turnStartedAt: null, lastAssistantMessage: last });
      notify(slot, input.lastAssistantMessage);
      const deadline = now().getTime() + holdMs;
      let woken = false;
      let timeoutAnswer: string | undefined;
      for (;;) {
        if (slot.queue.length > 0) {
          const reply = deliver(slot, (text) => blockAnswer(text));
          begin(slot, 'delivery');
          setState(slot, 'working', { turnStartedAt: iso() });
          return reply;
        }
        const decision = await safeDecide({
          key: slot.activity.key,
          client: input.client,
          sessionId: input.sessionId,
          projectId: slot.activity.projectId,
          stopHookActive: input.stopHookActive,
          lastAssistantMessage: input.lastAssistantMessage,
          woken,
        });
        if (slot.queue.length > 0) continue;
        if (decision.kind === 'continue') {
          begin(slot, 'decider');
          setState(slot, 'working', { turnStartedAt: iso() });
          return empty(blockAnswer(decision.text));
        }
        timeoutAnswer = decision.kind === 'hold' ? decision.timeoutAnswer : undefined;
        if (decision.kind === 'release' || closed) {
          setState(slot, 'waiting');
          return empty();
        }
        const result = now().getTime() >= deadline ? 'timeout' : await hold(slot, decision.reason, deadline, signal);
        if (result === 'timeout' && timeoutAnswer && !closed) {
          begin(slot, 'reminder');
          setState(slot, 'working', { turnStartedAt: iso() });
          return empty(blockAnswer(timeoutAnswer));
        }
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
      if (detached?.supports(slot)) {
        if (detached.ownPrompt(slot, input.prompt)) return { ...empty(), own: true };
        detached.userPrompt(slot);
      }
      if (slot.queue.length > 0) {
        const reply = deliver(slot, (text) => promptAnswer(input.dialect, text));
        slot.origin = 'user';
        setState(slot, 'working', { turnStartedAt: iso() });
        return reply;
      }
      begin(slot, 'user');
      setState(slot, 'working', { turnStartedAt: iso() });
      return empty();
    },
    enqueue(key, text, source = 'panel', projectId) {
      const message: QueuedMessage = { id: randomUUID(), text, source, createdAt: iso() };
      let slot = slots.get(key);
      if (!slot) {
        const cut = key.indexOf(':');
        slot = newSlot(key, cut < 0 ? key : key.slice(0, cut), cut < 0 ? '' : key.slice(cut + 1), projectId ?? null, iso());
        slots.set(key, slot);
      }
      if (projectId && !slot.activity.projectId) slot.activity.projectId = projectId;
      slot.queue.push(message);
      slot.activity.pending = pendingOf(slot);
      changed(key);
      slot.wake?.();
      if (detached?.supports(slot)) detached.enqueued(slot);
      return message;
    },
    wake(key) {
      const slot = slots.get(key);
      slot?.wake?.();
      if (slot && detached?.supports(slot)) detached.wake(slot);
    },
    setDecider(next) {
      decide = next;
    },
    onStop(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async turnEnd(notice) {
      if (!detached || closed || !options.detached?.supports(notice.client)) return false;
      const slot = await slotOf(notice);
      // The hook is machine-wide: a session outside every project is only noted.
      if (slot.activity.projectId) await detached.turnEnd(slot, notice.event);
      return true;
    },
    async flush(key) {
      const slot = slots.get(key);
      if (slot && detached?.supports(slot)) await detached.flush(slot);
    },
    maintain: async () => detached?.maintain(),
    onIdle(listener) {
      idleListeners.add(listener);
      return () => idleListeners.delete(listener);
    },
    get: (key) => {
      const slot = slots.get(key);
      return slot ? { ...slot.activity } : undefined;
    },
    list: () => [...slots.values()].map((slot) => ({ ...slot.activity })),
    queued: (key) => [...(slots.get(key)?.queue ?? [])],
    waiting: (key, id) => {
      const slot = slots.get(key);
      return Boolean(slot && (slot.queue.some((m) => m.id === id) || slot.outbox?.messages.some((m) => m.id === id)));
    },
    section: () => ({ sessions: [...slots.values()].map((slot) => ({ ...slot.activity })) }),
    close() {
      closed = true;
      detached?.close();
      for (const slot of slots.values()) slot.wake?.();
    },
  };
}
