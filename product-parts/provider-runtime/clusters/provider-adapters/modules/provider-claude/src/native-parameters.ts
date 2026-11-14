import { folderKey } from './folder-key.ts';
import { readFile, rename, writeFile } from 'node:fs/promises';
import type { Project, NativeHookEvent, ProviderTurnState } from '#provider-registry';
import type { ClaudeRuntime } from './runtime.ts';
import type { SessionRecord } from './records.ts';
import { findSession } from './sessions.ts';
import { PARAMETER_CANCEL, PARAMETER_FRESH_MS, PARAMETER_STATE, supportedNativeVersion } from './pty/parameter-protocol.ts';
import type { NativeParameterState } from './pty/parameter-protocol.ts';
import { TURN_SUFFIX, parseTurn } from './pty/turn-file.ts';
import type { TurnState } from './pty/turn-file.ts';

export async function readNativeJson(file: string): Promise<any> {
  try { const raw = await readFile(file, 'utf8'); return raw.length <= 32_768 ? JSON.parse(raw) : null; } catch { return null; }
}
export async function writeNativeJson(file: string, value: unknown): Promise<void> {
  await writeFile(file + '.partial', JSON.stringify(value), { encoding: 'utf8', mode: 0o600 });
  await rename(file + '.partial', file);
}
function validState(state: NativeParameterState | null, record: SessionRecord, now: number): state is NativeParameterState {
  return !!state && state.version === 1 && state.hostId === record.controlHostId
    && /^[a-f0-9-]{36}$/i.test(state.sessionId) && (!record.localId || state.sessionId === record.localId)
    && typeof state.epoch === 'string' && state.epoch.startsWith(state.hostId + ':')
    && supportedNativeVersion(state.cliVersion) && Number.isFinite(state.at) && now >= state.at && now - state.at <= PARAMETER_FRESH_MS
    && ['idle', 'control', 'busy', 'dialog', 'unknown'].includes(state.status)
    && Array.isArray(state.models) && state.models.length <= 64 && Array.isArray(state.efforts) && state.efforts.length <= 5;
}
export async function nativeParameterState(rt: ClaudeRuntime, project: Project, sid: string): Promise<NativeParameterState | null> {
  const { record } = await findSession(rt, project, sid);
  if (!record?.controlHostId || record.archived || !(await rt.isAlive(record.processId))) return null;
  const state = await readNativeJson(record.debugFile + PARAMETER_STATE) as NativeParameterState | null;
  return validState(state, record, Date.now()) ? state : null;
}
/** Cancels the transaction a host runs now (a hook of the user, Stop, a direct message). */
export async function cancelNativeParameters(_rt: ClaudeRuntime, debug: string, hostId: string): Promise<void> {
  await writeNativeJson(debug + PARAMETER_CANCEL, { hostId, id: null });
}
/** The latest <debug>.turn of a session the panel runs (M28): the cli ends a turn interrupted without Stop. */
export async function claudeTurnState(rt: ClaudeRuntime, project: Project, sid: string): Promise<ProviderTurnState | null> {
  const { record } = await findSession(rt, project, sid);
  if (!record?.controlHostId || record.archived || !(await rt.isAlive(record.processId))) return null;
  const turn = parseTurn(await readFile(record.debugFile + TURN_SUFFIX, 'utf8').catch(() => null));
  return turn ? { state: turn.state, at: turn.at, source: turn.source } : null;
}
/**
 * Turn boundaries of panel sessions (M28 3.2): the prompt hook writes `working`, the Stop hook `idle`
 * into <debug>.turn. Builtin commands typed by the engine raise no hooks (M27), so a hook during a
 * transaction is the user's: the transaction is cancelled and the hook always reaches the channel.
 */
export async function nativeControlHook(rt: ClaudeRuntime, input: NativeHookEvent): Promise<boolean> {
  if (!input.panelProcess || !input.cwd) return false;
  const records = (await rt.store.read()).sessions;
  for (const record of records.filter(r => folderKey(r.projectPath) === folderKey(input.cwd!) && r.controlHostId && !r.archived && (!r.localId || r.localId === input.sessionId))) {
    if (!(await rt.isAlive(record.processId))) continue;
    const state = await readNativeJson(record.debugFile + PARAMETER_STATE) as NativeParameterState | null;
    if (!validState(state, record, Date.now()) || state.sessionId !== input.sessionId) continue;
    await writeNativeJson(record.debugFile + TURN_SUFFIX, { version: 1, state: input.event === 'stop' ? 'idle' : 'working', at: Date.now(), source: 'hook' } satisfies TurnState);
    if (input.event === 'continue') break;
    if (state.status === 'control' && state.pending) await cancelNativeParameters(rt, record.debugFile, state.hostId);
    if (input.event === 'prompt') await writeNativeJson(record.debugFile + '.parameters-input', { hostId: state.hostId });
    break;
  }
  return false;
}
