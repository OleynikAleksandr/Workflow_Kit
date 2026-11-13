// Fields verified against the local codex-cli 0.167.2 app-server JSON schema (interrupt.md).
export type NativeTurnStatus = 'inProgress' | 'completed' | 'interrupted' | 'failed';
export interface NativeTurn { id: string; status: NativeTurnStatus }
export interface TurnSnapshot { threadId: string; state: 'active' | 'idle' | 'notLoaded' | 'systemError'; turns: NativeTurn[]; active: NativeTurn | null }
const STATES = ['active', 'idle', 'notLoaded', 'systemError'];
const TURN_STATES = ['inProgress', 'completed', 'interrupted', 'failed'];
export const NATIVE_ID = /^[A-Za-z0-9_-]{1,200}$/;
export function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
export function nativeTurn(value: unknown): NativeTurn | null {
  if (!object(value) || typeof value['id'] !== 'string' || !NATIVE_ID.test(value['id']) || !TURN_STATES.includes(String(value['status']))) return null;
  return { id: value['id'], status: value['status'] as NativeTurnStatus };
}
export function turnSnapshot(answer: unknown, threadId: string): TurnSnapshot {
  const thread = object(answer) ? answer['thread'] : null;
  const status = object(thread) ? thread['status'] : null;
  if (!object(thread) || thread['id'] !== threadId || !object(status) || !STATES.includes(String(status['type'])) || !Array.isArray(thread['turns'])) throw new Error('Неизвестное состояние thread/read');
  const turns = thread['turns'].map(nativeTurn);
  if (turns.some((turn) => !turn) || new Set(turns.map((turn) => turn!.id)).size !== turns.length) throw new Error('Неизвестные или повторяющиеся native turn id');
  const known = turns as NativeTurn[];
  const active = known.filter((turn) => turn.status === 'inProgress');
  if (active.length > 1) throw new Error('Несколько активных native turn id');
  return { threadId, state: status['type'] as TurnSnapshot['state'], turns: known, active: active[0] ?? null };
}
