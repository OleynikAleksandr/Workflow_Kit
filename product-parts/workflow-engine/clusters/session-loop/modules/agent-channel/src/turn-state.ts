// One public generation for both delivery protocols. Watch generations remain private to Slot.
import { randomUUID } from 'node:crypto';
import type { Slot } from './slots.ts';
import { USER_MESSAGE_SOURCE } from './types.ts';
import type { QueuedMessage, TurnOrigin, UserSource } from './types.ts';

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
  /** M40: the user's message this turn begins with; null for every service turn. */
  user: UserSource | null;
  started: boolean;
  startedRef: string | null;
  createdAt: number;
  /**
   * M47: a panel message pasted into the terminal (directTurn). While it is being sent and
   * confirmed, the first prompt hook of the session takes it whatever its text (Claude 2.1.328
   * wraps a long paste in <pasted_content>).
   */
  direct?: true;
}
export interface TurnState extends TurnSnapshot {
  notifiedRef: string | null;
  operation: string | null;
  reservation: Reservation | null;
  lastPrompt: string | null;
  /**
   * M40: the delivered user message that began this generation (a typed prompt, or panel messages
   * of the user alone); every new generation clears it.
   */
  userSource: UserSource | null;
  retired: Set<string>;
  wakingUntil: number;
}
export const newTurnState = (): TurnState => ({ turnRef: null, nativeTurnId: null, barrier: false, pending: false, result: null, origin: 'unknown', operation: null, reservation: null, lastPrompt: null, userSource: null, notifiedRef: null, retired: new Set(), wakingUntil: 0 });

export function beginTurn(slot: Slot, origin: TurnOrigin, native: string | null = null, sources: string[] = []): void {
  const previous = slot.turn.nativeTurnId;
  if (previous && native !== previous) slot.turn.retired.add(previous);
  if (slot.turn.retired.size > 64) slot.turn.retired.delete(slot.turn.retired.values().next().value!);
  slot.generation += 1;
  Object.assign(slot.turn, { turnRef: randomUUID(), nativeTurnId: native, origin, pending: false, result: null, operation: null, userSource: null });
  slot.origin = origin;
  slot.sources = sources;
}

/**
 * M40: the decision source of a delivery — the user's messages (the id of the last one) when
 * every delivered message is the user's own; a delivery that carries a review, a reminder or
 * another service message has none.
 */
export function userSourceOf(messages: readonly QueuedMessage[]): UserSource | null {
  const last = messages.at(-1);
  if (!last || messages.some((message) => message.source !== USER_MESSAGE_SOURCE)) return null;
  return { id: last.id, text: messages.map((message) => message.text).join('\n\n'), at: last.createdAt, via: 'panel' };
}

export function reserveTurn(slot: Slot, text: string, origin: TurnOrigin, sources: string[], now: number, user: UserSource | null = null): Reservation {
  const reservation = { previousNative: slot.turn.nativeTurnId, text: text.trim(), origin, sources: [...sources], user: origin === 'user' || origin === 'delivery' ? user : null, started: false, startedRef: null, createdAt: now };
  slot.turn.reservation = reservation;
  return reservation;
}

/** An accepted RPC and its own early/late prompt hook describe the same generation. */
export function acceptTurn(slot: Slot, reservation: Reservation, native: string | null = null): boolean {
  if (reservation.started || slot.turn.reservation !== reservation) return false;
  reservation.started = true;
  beginTurn(slot, reservation.origin, native, reservation.sources);
  slot.turn.userSource = reservation.user;
  reservation.startedRef = slot.turn.turnRef;
  return true;
}

/**
 * The prompt hook of a reserved turn: 'own' for the same text, 'order' (M47) for the first hook
 * while a direct paste is sent or confirmed and the text differs, 'late' for a hook of a turn
 * already replaced, null otherwise.
 */
export function ownPrompt(slot: Slot, prompt: string | null, native: string | null, now: number): 'own' | 'order' | 'late' | null {
  const reservation = slot.turn.reservation;
  if (!reservation || prompt === null || now - reservation.createdAt > 60_000) return null;
  const same = prompt.trim() === reservation.text;
  const byOrder = !same && reservation.direct === true && slot.sending && !reservation.started;
  if (!same && !byOrder) return null;
  if (reservation.started && reservation.startedRef !== slot.turn.turnRef) return 'late';
  acceptTurn(slot, reservation, native);
  if (native && reservation.previousNative && native !== reservation.previousNative) slot.turn.retired.add(reservation.previousNative);
  if (native) { slot.turn.nativeTurnId = native; slot.turn.retired.delete(native); }
  slot.turn.reservation = null;
  slot.turn.lastPrompt = prompt;
  return same ? 'own' : 'order';
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
  /**
   * M45: with `confirmMs` the pasted message counts only once its prompt hook took the reservation;
   * no hook in that time gives 'unconfirmed' (the panel shows the message as not delivered).
   */
  directTurn(key: string, projectId: string, text: string, send: () => Promise<boolean>, confirmMs?: number): Promise<boolean | 'unconfirmed'>;
  automaticWake(key: string, send: () => Promise<boolean>): Promise<boolean>;
}
