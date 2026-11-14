// <debug>.turn (M28 3.2): turn boundaries of a panel session. The provider writes `working` on the
// prompt hook and `idle` on the Stop hook; the host writes `idle`/`interrupt` when the screen shows
// a confirmed interruption (Claude sends no Stop hook after Esc). The newest `at` wins.
export const TURN_SUFFIX = '.turn';
export interface TurnState { version: 1; state: 'working' | 'idle'; at: number; source: 'hook' | 'interrupt' }
/** A screen-confirmed interruption needs this long without the spinner after the turn started. */
export const INTERRUPT_SETTLE_MS = 3000;

export function validTurn(value: unknown): value is TurnState {
  const v = value as Partial<TurnState> | null;
  return !!v && v.version === 1 && (v.state === 'working' || v.state === 'idle') && Number.isFinite(v.at)
    && (v.source === 'hook' || v.source === 'interrupt');
}
export function parseTurn(raw: string | null): TurnState | null {
  try { const v = raw && raw.length <= 1024 ? JSON.parse(raw) : null; return validTurn(v) ? v : null; } catch { return null; }
}
/** The last line of Claude's interruption notice; the transcript holds `[Request interrupted by user…`. */
export const INTERRUPTED_LINE = /^\s*⎿?\s*Interrupted\s+·/m;
