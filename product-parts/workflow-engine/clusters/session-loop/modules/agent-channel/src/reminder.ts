// One reminder in a row (spec M36 2.4): a session the service can wake (a released hold, M29, or a
// detached client, M8) is reminded once; when the turn that answered the reminder ends and the
// decider holds again, the hold goes without a reminder. What the session waits for (an answer, a
// review message, a panel message) wakes it. A held Stop hook keeps its reminder: it is the only
// way that hook ends without losing the delivery.
import type { StopDecision, TurnOrigin } from './types.ts';

/** Source of a queued reminder and origin of a turn a reminder started. */
export const REMINDER_SOURCE = 'reminder';

/** The turn was started by a reminder alone: its origin, or every message delivered with it. */
export function remindedTurn(origin: TurnOrigin, sources: readonly string[]): boolean {
  return origin === 'reminder' || (sources.length > 0 && sources.every((source) => source === REMINDER_SOURCE));
}

/** The reminder text of a hold of a wakeable session, or undefined right after a reminder turn. */
export function reminderOf(decision: Extract<StopDecision, { kind: 'hold' }>, afterReminder: boolean): string | undefined {
  return afterReminder ? undefined : decision.timeoutAnswer;
}
