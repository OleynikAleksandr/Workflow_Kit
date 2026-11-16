// M29 3.1: holds without a held Stop hook. A session the service can wake while idle ends its turn
// at once; the slot shows the hold reason, and what the decider or the panel says later is queued
// and the session woken (its UserPromptSubmit hook takes the queue).
import { randomUUID } from 'node:crypto';
import { reminderOf } from './reminder.ts';
import { pendingOf } from './slots.ts';
import type { ChannelCore, Released, Slot } from './slots.ts';
import type { ReleaseDelivery, SessionRef, StopContext, StopDecision } from './types.ts';

type Hold = Extract<StopDecision, { kind: 'hold' }>;

export interface Release {
  /** The session can be woken while idle: a hold does not keep its Stop hook. */
  supports(slot: Slot): boolean;
  /** Ends the released hold of the slot and its timer. */
  drop(slot: Slot): void;
  /** Shows the hold until its time; then a timeoutAnswer is queued as reminder and the session woken. */
  hold(slot: Slot, decision: Hold, context: StopContext, at?: number): void;
  /** A message was queued for a released slot: wake the session. */
  enqueued(slot: Slot): void;
  /** wake(key): the queue goes first, else the decider is asked again. */
  wake(slot: Slot): void;
}

const refOf = (slot: Slot): SessionRef => ({ key: slot.activity.key, client: slot.activity.client, sessionId: slot.activity.sessionId, projectId: slot.activity.projectId });
const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function createRelease(core: ChannelCore, deps: ReleaseDelivery | undefined, detached: (slot: Slot) => boolean): Release {
  function drop(slot: Slot): void {
    if (slot.released?.timer) clearTimeout(slot.released.timer);
    slot.released = null;
  }

  function wakeSession(slot: Slot): void {
    if (slot.turn.barrier || core.closed()) return;
    try {
      deps?.wake(refOf(slot));
    } catch (error) {
      core.log(`channel: release wake failed for ${slot.activity.key}: ${reasonOf(error)}`);
    }
  }

  function queueOn(slot: Slot, text: string, source: string): void {
    slot.queue.push({ id: randomUUID(), text, source, createdAt: core.iso() });
    slot.activity.pending = pendingOf(slot);
    core.changed(slot.activity.key);
  }

  function hold(slot: Slot, decision: Hold, context: StopContext, at?: number): void {
    drop(slot);
    const deadline = at ?? core.now().getTime() + core.holdMs;
    core.setState(slot, 'holding', { holdReason: decision.reason, holdUntil: new Date(deadline).toISOString() });
    const mark: Released = { at: deadline, timer: null, timeoutAnswer: reminderOf(decision, slot.afterReminder), context };
    slot.released = mark;
    mark.timer = setTimeout(() => {
      if (slot.released !== mark || core.slots.get(slot.activity.key) !== slot) return;
      mark.timer = null;
      core.setState(slot, 'waiting');
      if (mark.timeoutAnswer && !slot.turn.barrier && !core.closed()) {
        queueOn(slot, mark.timeoutAnswer, 'reminder');
        wakeSession(slot);
      }
    }, Math.max(0, deadline - core.now().getTime()));
    mark.timer.unref?.();
  }

  async function redecide(slot: Slot): Promise<void> {
    const mark = slot.released;
    if (!mark || slot.turn.barrier || core.closed()) return;
    if (slot.queue.length > 0) return wakeSession(slot);
    const decision = await core.decide({ ...mark.context, woken: true });
    if (slot.released !== mark || core.slots.get(slot.activity.key) !== slot || slot.turn.barrier || core.closed()) return;
    if (slot.queue.length > 0) return wakeSession(slot);
    if (decision.kind === 'hold') return hold(slot, decision, mark.context, mark.at);
    core.setState(slot, 'waiting');
    if (decision.kind === 'continue') {
      queueOn(slot, decision.text, 'autopilot');
      wakeSession(slot);
    }
  }

  return {
    supports(slot) {
      if (!deps || !slot.activity.projectId || detached(slot)) return false;
      try {
        return deps.supports(refOf(slot));
      } catch (error) {
        core.log(`channel: release check failed for ${slot.activity.key}: ${reasonOf(error)}`);
        return false;
      }
    },
    drop,
    hold,
    enqueued(slot) {
      if (slot.released) wakeSession(slot);
    },
    wake(slot) {
      if (slot.released) void redecide(slot);
    },
  };
}
