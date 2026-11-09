// Turn end and delivery for clients whose Stop hook cannot be held (spec M8 section 3). The hook
// only tells that the turn ended; a watcher waits until the session is idle, then the detached
// stop reads the last answer, calls the stop listeners and takes the decision path of stop():
// queue, then the decider. What is to be said goes as a prompt with a stable id (the outbox), and
// the UserPromptSubmit of that prompt is recognised by its text.
import { randomUUID } from 'node:crypto';
import type { ChannelCore, Detached, Outbox, Slot } from './slots.ts';
import { LAST_MESSAGE_CHARS } from './types.ts';
import type { DetachedDelivery, SessionRef, StopDecision, TurnEndEvent, TurnOrigin } from './types.ts';

/** Refused sends in a row after which maintain() stops retrying. */
export const MAX_SEND_FAILURES = 5;
const ANSWER_TRIES = 3;

const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function createDetached(core: ChannelCore, deps: DetachedDelivery): Detached {
  const pollMs = deps.pollMs ?? 1000;
  const watchMs = deps.watchMs ?? 120_000;
  const retryMs = deps.retryMs ?? 2000;
  const confirmMs = deps.confirmMs ?? 60_000;
  const maintainMs = deps.maintainMs ?? 60_000;

  const ref = (slot: Slot): SessionRef => ({ key: slot.activity.key, client: slot.activity.client, sessionId: slot.activity.sessionId, projectId: slot.activity.projectId });
  const names = (slot: Slot): { label: string; title: string; lockSwitch?: string | null } =>
    deps.names?.(slot.activity.client) ?? { label: slot.activity.client, title: slot.activity.client };
  const later = (run: () => void, ms: number): ReturnType<typeof setTimeout> => {
    const timer = setTimeout(run, ms);
    timer.unref?.();
    return timer;
  };
  const sleep = (ms: number): Promise<void> => new Promise((resolve) => later(resolve, ms));
  const background = (work: Promise<void>, what: string, slot: Slot): void => {
    work.catch((error: unknown) => core.log(`channel: ${what} failed for ${slot.activity.key}: ${reasonOf(error)}`));
  };

  function setNote(slot: Slot, note: string | null): void {
    if (slot.activity.note === note) return;
    slot.activity.note = note;
    core.changed(slot.activity.key);
  }

  /** A failed check counts as a busy session: nothing is sent on a guess. */
  async function isIdle(slot: Slot): Promise<boolean> {
    try {
      return await deps.idle(ref(slot));
    } catch (error) {
      core.log(`channel: idle check failed for ${slot.activity.key}: ${reasonOf(error)}`);
      return false;
    }
  }

  function cancelWatch(slot: Slot): void {
    if (!slot.watch) return;
    slot.watch.cancelled = true;
    clearTimeout(slot.watch.timer);
    slot.watch = null;
  }

  function dropReminder(slot: Slot): void {
    if (slot.reminder) clearTimeout(slot.reminder.timer);
    slot.reminder = null;
  }

  function outboxOf(text: string, origin: TurnOrigin, messages: Outbox['messages'] = []): Outbox {
    return { id: randomUUID(), text, origin, sources: messages.map((message) => message.source), messages };
  }

  /** One watcher per session: asks every second whether the turn is over, for two minutes at most. */
  function watch(slot: Slot): void {
    cancelWatch(slot);
    const token: NonNullable<Slot['watch']> = { cancelled: false };
    slot.watch = token;
    let left = Math.max(1, Math.ceil(watchMs / pollMs));
    const tick = async (): Promise<void> => {
      if (token.cancelled || core.closed()) return;
      const idle = await isIdle(slot);
      if (token.cancelled) return;
      left -= 1;
      if (idle || left <= 0) {
        // An expired watch leaves the turn end pending: maintain() picks it up.
        slot.watch = null;
        if (idle) await detachedStop(slot);
        return;
      }
      token.timer = later(() => background(tick(), 'turn end watcher', slot), pollMs);
    };
    token.timer = later(() => background(tick(), 'turn end watcher', slot), pollMs);
  }

  async function turnEnd(slot: Slot, event: TurnEndEvent): Promise<void> {
    slot.generation += 1;
    const generation = slot.generation;
    cancelWatch(slot);
    dropReminder(slot);
    if (event !== 'Stop') {
      // A failed or interrupted turn is not an agent answer: nobody hears it and nothing continues.
      slot.stopPending = false;
      slot.origin = 'unknown';
      slot.sources = [];
      core.setState(slot, 'waiting', { lastStopAt: core.iso(), turnStartedAt: null });
      return;
    }
    let lockless: boolean;
    try {
      lockless = await deps.idle(ref(slot));
    } catch (error) {
      core.log(`channel: idle check failed for ${slot.activity.key}: ${reasonOf(error)}`);
      lockless = false;
    }
    if (slot.generation !== generation) return;
    if (lockless) {
      // The Stop hook runs inside the turn, so the lock must live: without it the end cannot be told.
      const { label, lockSwitch } = names(slot);
      slot.lockless = true;
      slot.stopPending = false;
      slot.origin = 'unknown';
      slot.sources = [];
      const note = `${label} запущен без замков сессий${lockSwitch ? ` (\`${lockSwitch}\`)` : ''}: автопилот, ревью и сообщения панели для этой сессии выключены`;
      core.setState(slot, 'waiting', { lastStopAt: core.iso(), turnStartedAt: null, note });
      return;
    }
    slot.lockless = false;
    slot.stopPending = true;
    setNote(slot, null);
    watch(slot);
  }

  async function detachedStop(slot: Slot): Promise<void> {
    const generation = slot.generation;
    if (slot.stopping === generation || !slot.stopPending) return;
    slot.stopping = generation;
    try {
      for (const listener of core.idleListeners) {
        try {
          await listener(slot.activity.key);
        } catch (error) {
          core.log(`channel: idle listener failed for ${slot.activity.key}: ${reasonOf(error)}`);
        }
      }
      let answer: string | null = null;
      let failure: string | null = null;
      for (let attempt = 0; attempt < ANSWER_TRIES; attempt += 1) {
        if (attempt > 0) await sleep(retryMs);
        if (slot.generation !== generation || core.closed()) return;
        try {
          answer = await deps.lastAnswer(ref(slot));
          failure = null;
          break;
        } catch (error) {
          failure = reasonOf(error);
        }
      }
      if (slot.generation !== generation || !slot.stopPending) return;
      // Busy again without a prompt hook: the turn end stays pending for maintain().
      if (!(await isIdle(slot)) || slot.generation !== generation) return;
      slot.stopPending = false;
      const read = failure === null;
      slot.lastAnswer = read ? answer : null;
      core.setState(slot, 'waiting', {
        lastStopAt: core.iso(),
        turnStartedAt: null,
        lastAssistantMessage: answer ? answer.slice(-LAST_MESSAGE_CHARS) : slot.activity.lastAssistantMessage,
        note: read ? null : `ответ ${names(slot).label} не прочитан: ${failure}`,
      });
      if (read) core.notify(slot, answer);
      else {
        // An unread answer is not an agent answer: the listeners and the decider are not called.
        slot.origin = 'unknown';
        slot.sources = [];
      }
      await advance(slot, { decide: read, woken: false });
    } finally {
      if (slot.stopping === generation) slot.stopping = null;
    }
  }

  /** A hold lasts until a wake or a new message; with timeoutAnswer the agent gets the reminder. */
  function hold(slot: Slot, decision: Extract<StopDecision, { kind: 'hold' }>): void {
    const text = decision.timeoutAnswer;
    if (!text) {
      dropReminder(slot);
      core.setState(slot, 'holding', { holdReason: decision.reason });
      return;
    }
    const at = slot.reminder?.at ?? core.now().getTime() + core.holdMs;
    dropReminder(slot);
    const timer = later(() => {
      slot.reminder = null;
      if (slot.activity.state !== 'holding' || slot.outbox || core.closed()) return;
      slot.outbox = outboxOf(text, 'reminder');
      background(advance(slot, { decide: false, woken: false }), 'reminder', slot);
    }, Math.max(0, at - core.now().getTime()));
    slot.reminder = { at, timer };
    core.setState(slot, 'holding', { holdReason: decision.reason, holdUntil: new Date(at).toISOString() });
  }

  /** The decision path: an unsent message first, then the whole queue, then the decider. */
  async function advance(slot: Slot, how: { decide: boolean; woken: boolean }): Promise<void> {
    if (slot.lockless || slot.advancing || slot.sending || core.closed() || deps.archived?.(ref(slot))) return;
    slot.advancing = true;
    try {
      const generation = slot.generation;
      if (!slot.outbox && slot.queue.length === 0 && how.decide) {
        const decision = await core.decide({
          key: slot.activity.key,
          client: slot.activity.client,
          sessionId: slot.activity.sessionId,
          projectId: slot.activity.projectId,
          stopHookActive: false,
          lastAssistantMessage: slot.lastAnswer,
          woken: how.woken,
        });
        if (slot.generation !== generation || core.closed()) return;
        if (!slot.outbox && slot.queue.length === 0) {
          if (decision.kind === 'hold') return hold(slot, decision);
          dropReminder(slot);
          if (decision.kind === 'release') return core.setState(slot, 'waiting');
          slot.outbox = outboxOf(decision.text, 'decider');
        }
      }
      if (!slot.outbox && slot.queue.length > 0) {
        const taken = slot.queue.splice(0, slot.queue.length);
        slot.outbox = outboxOf(taken.map((message) => message.text).join('\n\n'), 'delivery', taken);
      }
      if (slot.outbox) {
        dropReminder(slot);
        await send(slot);
      }
    } finally {
      slot.advancing = false;
    }
  }

  async function send(slot: Slot): Promise<void> {
    const outbox = slot.outbox;
    if (!outbox || slot.sending) return;
    if (!(await isIdle(slot)) || slot.outbox !== outbox || slot.sending) return;
    const generation = slot.generation;
    slot.sending = true;
    // Remembered before the request: the hook of the prompt may come before the answer.
    slot.expected = outbox.text.trim();
    let ok = false;
    let why = 'провайдер не принял сообщение';
    try {
      ok = await deps.send(ref(slot), outbox.text, { id: outbox.id });
    } catch (error) {
      why = reasonOf(error);
    } finally {
      slot.sending = false;
    }
    if (slot.outbox !== outbox) return; // The hook of the prompt already took it.
    const same = slot.generation === generation;
    if (!ok) {
      slot.failures += 1;
      core.log(`channel: message for ${slot.activity.key} was not delivered (${slot.failures}): ${why}`);
      if (same) core.setState(slot, 'waiting', slot.failures >= MAX_SEND_FAILURES ? { note: `сообщение не доставлено: ${why}` } : {});
      return;
    }
    slot.outbox = null;
    slot.failures = 0;
    if (same) {
      slot.origin = outbox.origin;
      slot.sources = [...outbox.sources];
      core.setState(slot, 'working', { turnStartedAt: core.iso(), note: null });
    }
    const expected = slot.expected;
    clearTimeout(slot.confirmTimer);
    slot.confirmTimer = later(() => {
      if (expected === null || slot.expected !== expected) return;
      slot.expected = null;
      const { label, title } = names(slot);
      setNote(slot, `хук Kit не работает в ${label} (перезапустите ${title})`);
    }, confirmMs);
  }

  function ownPrompt(slot: Slot, prompt: string | null): boolean {
    if (slot.expected === null || prompt === null || prompt.trim() !== slot.expected) return false;
    const outbox = slot.outbox;
    if (outbox && outbox.text.trim() === slot.expected) {
      // Accepted, whatever the send request answers.
      slot.outbox = null;
      slot.failures = 0;
      slot.origin = outbox.origin;
      slot.sources = [...outbox.sources];
    }
    slot.expected = null;
    clearTimeout(slot.confirmTimer);
    dropReminder(slot);
    core.setState(slot, 'working', { turnStartedAt: core.iso(), note: null });
    return true;
  }

  function userPrompt(slot: Slot): void {
    slot.generation += 1;
    cancelWatch(slot);
    dropReminder(slot);
    slot.stopPending = false;
    const outbox = slot.outbox;
    if (outbox && !slot.sending) {
      // Queued messages go with this prompt as the hook answer; a decider text is out of date.
      if (outbox.origin === 'delivery') slot.queue.unshift(...outbox.messages);
      slot.outbox = null;
      slot.failures = 0;
      slot.expected = null;
      clearTimeout(slot.confirmTimer);
    }
    if (!slot.lockless) slot.activity.note = null;
  }

  async function flush(slot: Slot, retry = false): Promise<void> {
    await Promise.resolve(); // Messages queued in one go leave as one prompt.
    if (slot.lockless || slot.sending || slot.advancing || slot.stopPending || slot.stopping !== null) return;
    if (slot.activity.state === 'working') return;
    if (!slot.outbox && slot.queue.length === 0) return;
    if (retry && slot.failures >= MAX_SEND_FAILURES) return;
    await advance(slot, { decide: false, woken: false });
  }

  async function maintain(): Promise<void> {
    for (const slot of [...core.slots.values()]) {
      if (core.closed()) return;
      if (!deps.supports(slot.activity.client) || slot.lockless) continue;
      try {
        if (slot.stopPending) {
          if (!slot.watch && slot.stopping === null && (await isIdle(slot))) await detachedStop(slot);
        } else await flush(slot, true);
      } catch (error) {
        core.log(`channel: maintain failed for ${slot.activity.key}: ${reasonOf(error)}`);
      }
    }
  }

  const interval = maintainMs > 0 ? setInterval(() => void maintain().catch(() => undefined), maintainMs) : null;
  interval?.unref?.();

  return {
    supports: (slot) => deps.supports(slot.activity.client),
    turnEnd,
    ownPrompt,
    userPrompt,
    enqueued(slot) {
      slot.failures = 0;
      background(flush(slot), 'flush', slot);
    },
    wake(slot) {
      slot.failures = 0;
      if (slot.activity.state === 'holding') background(advance(slot, { decide: true, woken: true }), 'wake', slot);
      else background(flush(slot), 'flush', slot);
    },
    flush: (slot) => flush(slot),
    maintain,
    close() {
      if (interval) clearInterval(interval);
      for (const slot of core.slots.values()) {
        cancelWatch(slot);
        dropReminder(slot);
        clearTimeout(slot.confirmTimer);
      }
    },
  };
}
