import type { ChannelCore, Slot } from './slots.ts';
import { acceptTurn, beginTurn, cancelTurnWork, reserveTurn } from './turn-state.ts';
import type { TurnControl } from './turn-state.ts';

export function createTurnControl(core: ChannelCore, ensure: (key: string, projectId: string) => Slot): TurnControl {
  const visible = (key: string): Slot | undefined => {
    const slot = core.slots.get(key);
    return slot && !core.excluded(slot) ? slot : undefined;
  };
  return {
    async automaticWake(key, send) {
      const slot = visible(key);
      if (!slot || slot.turn.barrier || core.closed()) return false;
      slot.turn.wakingUntil = core.now().getTime() + 60_000;
      try {
        const accepted = await send();
        if (!accepted) slot.turn.wakingUntil = 0;
        return accepted;
      } catch (error) { slot.turn.wakingUntil = 0; throw error; }
    },
    interruption(key) {
      const turn = visible(key)?.turn;
      if (!turn) return undefined;
      const { turnRef, nativeTurnId, barrier, pending, result, origin } = turn;
      return { turnRef, nativeTurnId, barrier, pending, result, origin };
    },
    suspend(key, projectId) {
      const slot = visible(key) ?? (projectId ? ensure(key, projectId) : undefined);
      if (!slot) return;
      slot.turn.barrier = true;
      cancelTurnWork(slot);
      if (slot.activity.state === 'holding') core.setState(slot, 'waiting');
      slot.wake?.();
      core.changed(key);
    },
    resumeDelivery(key) {
      const slot = visible(key);
      if (slot) { slot.turn.barrier = false; core.changed(key); }
    },
    interruptionPending(key, ref, pending, result) {
      const slot = visible(key);
      if (!slot) return;
      if (pending && slot.turn.turnRef === ref) slot.turn.operation = ref;
      if (slot.turn.operation !== ref) return;
      slot.turn.pending = pending;
      if (result !== undefined) slot.turn.result = result;
      core.changed(key);
    },
    confirmInterrupted(key, ref, native) {
      const slot = visible(key);
      if (!slot || core.closed() || slot.turn.turnRef !== ref || slot.sending) return false;
      if (native && slot.turn.nativeTurnId && native !== slot.turn.nativeTurnId) return false;
      const operation = slot.turn.operation;
      const pending = slot.turn.pending;
      const retired = native ?? slot.turn.nativeTurnId;
      if (retired) slot.turn.retired.add(retired);
      if (slot.turn.retired.size > 64) slot.turn.retired.delete(slot.turn.retired.values().next().value!);
      cancelTurnWork(slot);
      beginTurn(slot, 'unknown');
      Object.assign(slot.turn, { barrier: true, operation, pending });
      core.setState(slot, 'waiting', { turnStartedAt: null, lastStopAt: core.iso() });
      slot.wake?.();
      return true;
    },
    async directTurn(key, projectId, text, send) {
      const slot = ensure(key, projectId);
      if (slot.turn.barrier || slot.sending || core.excluded(slot) || core.closed()) return false;
      const reservation = reserveTurn(slot, text, 'user', [], core.now().getTime());
      slot.sending = true;
      let sent = false;
      try { sent = await send(); }
      catch (error) { if (reservation.started) return true; throw error; }
      finally {
        slot.sending = false;
        if (core.slots.get(key) === slot && !core.excluded(slot)) {
          if (sent && acceptTurn(slot, reservation)) core.setState(slot, 'working', { turnStartedAt: core.iso() });
          if (!sent && !reservation.started && slot.turn.reservation === reservation) slot.turn.reservation = null;
        }
      }
      return sent || reservation.started;
    },
  };
}
