// One public generation for both delivery protocols. Watch generations remain private to Slot.
import { randomUUID } from 'node:crypto';
import type { Slot } from './slots.ts';
import type { TurnOrigin } from './types.ts';

export type InterruptionOutcome = 'interrupted' | 'already-idle' | 'stale' | 'failed' | null;
export interface TurnSnapshot {
  turnRef: string | null;
  nativeTurnId: string | null;
  barrier: boolean;
  pending: boolean;
  result: InterruptionOutcome;
  origin: TurnOrigin;
}
export interface InterruptView {
  available: boolean;
  reason: string | null;
  turnRef: string | null;
  state: 'unknown' | 'working' | 'holding' | 'waiting';
  pending: boolean;
  barrier: boolean;
  result: InterruptionOutcome;
}
export interface Reservation {
  previousNative: string | null;
  text: string;
  origin: TurnOrigin;
  sources: string[];
  started: boolean;
  startedRef: string | null;
  createdAt: number;
}
export interface TurnState extends TurnSnapshot {
  notifiedRef: string | null;
  operation: string | null;
  reservation: Reservation | null;
  lastPrompt: string | null;
  retired: Set<string>;
  wakingUntil: number;
}
export const newTurnState = (): TurnState => ({ turnRef: null, nativeTurnId: null, barrier: false, pending: false, result: null, origin: 'unknown', operation: null, reservation: null, lastPrompt: null, notifiedRef: null, retired: new Set(), wakingUntil: 0 });

export function beginTurn(slot: Slot, origin: TurnOrigin, native: string | null = null, sources: string[] = []): void {
  const previous = slot.turn.nativeTurnId;
  if (previous && native !== previous) slot.turn.retired.add(previous);
  if (slot.turn.retired.size > 64) slot.turn.retired.delete(slot.turn.retired.values().next().value!);
  slot.generation += 1;
  Object.assign(slot.turn, { turnRef: randomUUID(), nativeTurnId: native, origin, pending: false, result: null, operation: null });
  slot.origin = origin;
  slot.sources = sources;
}

export function reserveTurn(slot: Slot, text: string, origin: TurnOrigin, sources: string[], now: number): Reservation {
  const reservation = { previousNative: slot.turn.nativeTurnId, text: text.trim(), origin, sources: [...sources], started: false, startedRef: null, createdAt: now };
  slot.turn.reservation = reservation;
  return reservation;
}

/** An accepted RPC and its own early/late prompt hook describe the same generation. */
export function acceptTurn(slot: Slot, reservation: Reservation, native: string | null = null): boolean {
  if (reservation.started || slot.turn.reservation !== reservation) return false;
  reservation.started = true;
  beginTurn(slot, reservation.origin, native, reservation.sources);
  reservation.startedRef = slot.turn.turnRef;
  return true;
}

export function ownPrompt(slot: Slot, prompt: string | null, native: string | null, now: number): 'own' | 'late' | null {
  const reservation = slot.turn.reservation;
  if (!reservation || prompt === null || prompt.trim() !== reservation.text || now - reservation.createdAt > 60_000) return null;
  if (reservation.started && reservation.startedRef !== slot.turn.turnRef) return 'late';
  acceptTurn(slot, reservation, native);
  if (native && reservation.previousNative && native !== reservation.previousNative) slot.turn.retired.add(reservation.previousNative);
  if (native) { slot.turn.nativeTurnId = native; slot.turn.retired.delete(native); }
  slot.turn.reservation = null;
  slot.turn.lastPrompt = prompt;
  return 'own';
}

/** Stop the old watcher/reminder without throwing away any unsent messages. */
export function cancelTurnWork(slot: Slot): void {
  slot.generation += 1;
  if (slot.watch) { slot.watch.cancelled = true; clearTimeout(slot.watch.timer); slot.watch = null; }
  if (slot.reminder) clearTimeout(slot.reminder.timer);
  slot.reminder = null;
  clearTimeout(slot.confirmTimer);
  slot.stopPending = false;
  if (slot.outbox && slot.outbox.origin !== 'delivery' && !slot.sending) {
    slot.outbox = null;
    slot.expected = null;
  }
}

export interface TurnControl {
  interruption(key: string): TurnSnapshot | undefined;
  suspend(key: string, projectId?: string): void;
  resumeDelivery(key: string): void;
  interruptionPending(key: string, ref: string, pending: boolean, result?: InterruptionOutcome): void;
  confirmInterrupted(key: string, ref: string, native: string | null): boolean;
  /** Tracks direct sends too, including a prompt hook that arrives before the RPC answer. */
  directTurn(key: string, projectId: string, text: string, send: () => Promise<boolean>): Promise<boolean>;
  automaticWake(key: string, send: () => Promise<boolean>): Promise<boolean>;
}
