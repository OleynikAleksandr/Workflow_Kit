// The channel to agents without a chat of our own (spec section 9.2): the Stop hook asks the
// service what to answer and may be held until the user decides (at most 9 minutes); the
// UserPromptSubmit hook marks the turn as running and carries messages that missed a Stop.
// Every message is delivered once: it stays queued until the hook's HTTP answer was sent.
// A client whose Stop hook cannot be held gets its next message as a prompt (detached.ts).
import { randomUUID } from 'node:crypto';
import { createDetached } from './detached.ts';
import { createTurnControl } from './turn-control.ts';
import { acceptTurn, beginTurn, ownPrompt, reserveTurn } from './turn-state.ts';
import { blockAnswer, promptAnswer, sessionKey } from './hook-input.ts';
import { activityOf, newSlot, pendingOf } from './slots.ts';
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

  /** The slot of a hook; every hook tells whether the session runs outside the panel (external). */
  async function slotOf(input: { client: string; sessionId: string; cwd: string | null; projectDir?: string | null; panelProcess?: boolean }): Promise<Slot> {
    const key = sessionKey(input.client, input.sessionId);
    let slot = slots.get(key);
    if (!slot) {
      slot = newSlot(key, input.client, input.sessionId, null, iso());
      slots.set(key, slot);
    }
    const external = input.panelProcess !== true;
    if (slot.activity.external !== external) {
      slot.activity.external = external;
      changed(key);
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

  /** Only an acknowledged block starts a public generation; nack retains the queue. */
  function blockReply(slot: Slot, reply: HookReply, text: string, origin: TurnOrigin): HookReply {
    const reservation = reserveTurn(slot, text, origin, slot.sources, now().getTime());
    const native = slot.turn.nativeTurnId; // A block may continue the same provider-native turn.
    return {
      ...reply,
      ack() { reply.ack(); if (acceptTurn(slot, reservation, native)) setState(slot, 'working', { turnStartedAt: iso() }); },
      nack() {
        reply.nack();
        if (slot.turn.reservation === reservation) {
          slot.turn.reservation = null;
          setState(slot, 'waiting', { turnStartedAt: null });
        }
      },
    };
  }

  function notify(slot: Slot, lastAssistantMessage: string | null): void {
    if (slot.turn.barrier || (slot.turn.turnRef !== null && slot.turn.notifiedRef === slot.turn.turnRef)) return;
    slot.turn.notifiedRef = slot.turn.turnRef;
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

  /** The session left the Kit process (spec M22 2.8); a failing check keeps it in. */
  function excludedKey(key: string, projectId: string | null): boolean {
    if (!projectId || !options.excluded) return false;
    const cut = key.indexOf(':');
    try {
      return options.excluded({ key, client: cut < 0 ? key : key.slice(0, cut), sessionId: cut < 0 ? '' : key.slice(cut + 1), projectId });
    } catch (error) {
      log(`channel: excluded check failed for ${key}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
  const isOut = (slot: Slot): boolean => excludedKey(slot.activity.key, slot.activity.projectId);

  /** Drops the slot: a held Stop is released, the queue, outbox and watchers go. */
  function drop(slot: Slot): void {
    const key = slot.activity.key;
    if (slots.get(key) !== slot) return;
    slots.delete(key);
    slot.queue.length = 0;
    detached?.drop(slot);
    slot.wake?.();
    changed(key);
    log(`channel: ${key} left the Kit process (archived or removed from the list)`);
  }

  /** True when the slot is gone or out: its hook is answered empty. */
  function leaves(slot: Slot): boolean {
    if (slots.get(slot.activity.key) !== slot) return true;
    if (!isOut(slot)) return false;
    drop(slot);
    return true;
  }

  const idleListeners = new Set<IdleListener>();
  const core: ChannelCore = { slots, setState, notify, decide: safeDecide, idleListeners, changed, iso, now, holdMs, log, closed: () => closed, excluded: isOut };
  const detached = options.detached ? createDetached(core, options.detached) : null;
  const visible = (): Slot[] => [...slots.values()].filter((slot) => !isOut(slot));

  const ensure = (key: string, projectId: string): Slot => {
    let slot = slots.get(key);
    if (!slot) {
      const cut = key.indexOf(':');
      slot = newSlot(key, key.slice(0, cut), key.slice(cut + 1), projectId, iso());
      slots.set(key, slot);
    }
    return slot;
  };
  const turns = createTurnControl(core, ensure);

  return {
    ...turns,
    async stop(input, signal) {
      const slot = await slotOf(input);
      if (leaves(slot) || (input.turnId && slot.turn.retired.has(input.turnId))) return empty();
      if (!slot.turn.turnRef) beginTurn(slot, slot.origin, input.turnId, slot.sources);
      else if (input.turnId) slot.turn.nativeTurnId = input.turnId;
      const generation = slot.generation;
      const last = input.lastAssistantMessage ? input.lastAssistantMessage.slice(-LAST_MESSAGE_CHARS) : slot.activity.lastAssistantMessage;
      setState(slot, 'waiting', { lastStopAt: iso(), turnStartedAt: null, lastAssistantMessage: last });
      notify(slot, input.lastAssistantMessage);
      const deadline = now().getTime() + holdMs;
      let woken = false;
      let timeoutAnswer: string | undefined;
      for (;;) {
        // Archived or removed while held: the Stop ends without an answer.
        if (leaves(slot) || slot.turn.barrier || slot.generation !== generation) return empty();
        if (slot.queue.length > 0) {
          const reply = deliver(slot, (text) => blockAnswer(text));
          setState(slot, 'working', { turnStartedAt: iso() });
          return blockReply(slot, reply, String(reply.answer?.['reason'] ?? ''), 'delivery');
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
        if (slot.turn.barrier || slot.generation !== generation) return empty();
        if (slot.queue.length > 0) continue;
        if (decision.kind === 'continue') {
          setState(slot, 'working', { turnStartedAt: iso() });
          return blockReply(slot, empty(blockAnswer(decision.text)), decision.text, 'decider');
        }
        timeoutAnswer = decision.kind === 'hold' ? decision.timeoutAnswer : undefined;
        if (decision.kind === 'release' || closed) {
          setState(slot, 'waiting');
          return empty();
        }
        const result = now().getTime() >= deadline ? 'timeout' : await hold(slot, decision.reason, deadline, signal);
        if (slot.turn.barrier || slot.generation !== generation) return empty();
        if (result === 'timeout' && timeoutAnswer && !closed) {
          setState(slot, 'working', { turnStartedAt: iso() });
          return blockReply(slot, empty(blockAnswer(timeoutAnswer)), timeoutAnswer, 'reminder');
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
      if (leaves(slot)) return empty();
      const own = ownPrompt(slot, input.prompt, input.turnId, now().getTime());
      if (own === 'late' || (!own && input.turnId && slot.turn.retired.has(input.turnId))) return empty();
      slot.wake?.();
      const automaticWake = slot.turn.wakingUntil > now().getTime();
      slot.turn.wakingUntil = 0;
      const duplicate = !own && input.turnId !== null && slot.turn.nativeTurnId === input.turnId && slot.activity.state === 'working' && slot.turn.lastPrompt === input.prompt;
      if (!own && !duplicate) {
        slot.turn.reservation = null;
        if (!automaticWake) slot.turn.barrier = false;
        beginTurn(slot, automaticWake ? 'delivery' : 'user', input.turnId, automaticWake ? slot.queue.map((m) => m.source) : []);
        slot.turn.lastPrompt = input.prompt;
      }
      if (duplicate) return empty();
      if (detached?.supports(slot)) {
        if (detached.ownPrompt(slot, input.prompt)) return { ...empty(), own: true };
        if (!own && !duplicate) detached.userPrompt(slot);
      }
      if (slot.turn.barrier) {
        setState(slot, 'working', { turnStartedAt: iso() });
        return { ...empty(), own: true };
      }
      if (slot.queue.length > 0) {
        const reply = deliver(slot, (text) => promptAnswer(input.dialect, text));
        slot.origin = automaticWake ? 'delivery' : 'user';
        setState(slot, 'working', { turnStartedAt: iso() });
        return reply;
      }
      setState(slot, 'working', { turnStartedAt: iso() });
      return own && slot.turn.origin !== 'user' ? { ...empty(), own: true } : empty();
    },
    enqueue(key, text, source = 'panel', projectId) {
      const message: QueuedMessage = { id: randomUUID(), text, source, createdAt: iso() };
      // A session out of the Kit process gets nothing: the message is dropped, not kept.
      if (excludedKey(key, projectId ?? slots.get(key)?.activity.projectId ?? null)) {
        const known = slots.get(key);
        if (known) drop(known);
        log(`channel: a ${source} message for ${key} was dropped: the session left the Kit process`);
        return message;
      }
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
      if (!slot.turn.barrier) slot.wake?.();
      if (detached?.supports(slot)) detached.enqueued(slot);
      return message;
    },
    wake(key) {
      const slot = slots.get(key);
      if (!slot?.turn.barrier) slot?.wake?.();
      if (slot && !slot.turn.barrier && detached?.supports(slot)) detached.wake(slot);
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
      if (leaves(slot)) return true;
      if (!slot.turn.turnRef) beginTurn(slot, 'unknown');
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
      return slot && !isOut(slot) ? activityOf(slot) : undefined;
    },
    list: () => visible().map(activityOf),
    queued: (key) => {
      const slot = slots.get(key);
      return slot && !isOut(slot) ? [...slot.queue] : [];
    },
    waiting: (key, id) => {
      const slot = slots.get(key);
      return Boolean(slot && !isOut(slot) && (slot.queue.some((m) => m.id === id) || slot.outbox?.messages.some((m) => m.id === id)));
    },
    section: () => ({ sessions: visible().map(activityOf) }),
    excluded: (key, projectId) => excludedKey(key, projectId ?? slots.get(key)?.activity.projectId ?? null),
    forget(key) {
      const slot = slots.get(key);
      if (slot) drop(slot);
    },
    close() {
      closed = true;
      detached?.close();
      for (const slot of slots.values()) slot.wake?.();
    },
  };
}
