import { folderKey } from './folder-key.ts';
import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { ProviderError } from '#provider-registry';
import type { Project, NativeHookEvent } from '#provider-registry';
import type { ClaudeRuntime } from './runtime.ts';
import type { SessionRecord } from './records.ts';
import { findSession } from './sessions.ts';
import { withNativeHost } from './native-arbiter.ts';
import { poll } from './pty.ts';
import { PARAMETER_CANCEL, PARAMETER_FRESH_MS, PARAMETER_REQUEST, PARAMETER_RESULT, PARAMETER_STATE, supportedNativeVersion } from './pty/parameter-protocol.ts';
import type { NativeField, NativeParameterRequest, NativeParameterResult, NativeParameterState } from './pty/parameter-protocol.ts';
import { TURN_SUFFIX } from './pty/turn-file.ts';
import type { TurnState } from './pty/turn-file.ts';

const pending = new WeakMap<ClaudeRuntime, Map<string, { id: string; hostId: string }>>();
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
export async function cancelNativeParameters(rt: ClaudeRuntime, debug: string, hostId?: string): Promise<void> {
  const active = pending.get(rt)?.get(debug);
  if (active || hostId) await writeNativeJson(debug + PARAMETER_CANCEL, { hostId: active?.hostId ?? hostId, id: active?.id ?? null });
}
export async function applyNativeParameter(rt: ClaudeRuntime, project: Project, sid: string, field: Exclude<NativeField, 'catalog'>, value: string): Promise<NativeParameterState> {
  const { record } = await findSession(rt, project, sid);
  if (!record?.controlHostId || record.archived || !(await rt.isAlive(record.processId))) throw new ProviderError('native-unavailable', 'Эта сессия запущена старым или внешним host', { status: 503 });
  // Parameters never wait for an unknown future idle. Recheck after admission too.
  const before = await nativeParameterState(rt, project, sid);
  if (!before || before.status !== 'idle' || !before.inputEmpty) throw new ProviderError('native-busy', before?.reason ?? 'Нет свежего пустого idle Claude', { status: 409 });
  const deadline = Date.now() + 25_000;
  const admission = new AbortController();
  const timeout = (): ProviderError => new ProviderError('native-timeout', 'Claude не подтвердил изменение параметра', { status: 504 });
  const timer = setTimeout(() => admission.abort(timeout()), 25_000);
  try {
    return await withNativeHost(rt, record.debugFile, async () => {
      const state = await nativeParameterState(rt, project, sid);
      if (!state || state.epoch !== before.epoch || state.status !== 'idle' || !state.inputEmpty) throw new ProviderError('native-stale', 'Состояние Claude изменилось; повторите выбор', { status: 409 });
      const request: NativeParameterRequest = { version: 1, id: randomUUID(), hostId: state.hostId, sessionId: state.sessionId,
        epoch: state.epoch, expires: deadline - 750, field, value };
      let rows = pending.get(rt); if (!rows) pending.set(rt, rows = new Map());
      rows.set(record.debugFile, { id: request.id, hostId: state.hostId });
      const file = record.debugFile + PARAMETER_REQUEST;
      try {
        await writeNativeJson(file, request);
        const result = await poll<NativeParameterResult>(async () => {
          if (!(await rt.isAlive(record.processId))) throw new ProviderError('native-unavailable', 'Host Claude завершился', { status: 503 });
          const r = await readNativeJson(record.debugFile + PARAMETER_RESULT) as NativeParameterResult | null;
          return r?.version === 1 && r.id === request.id && r.hostId === request.hostId && r.sessionId === request.sessionId ? r : undefined;
        }, { timeoutMs: Math.max(1, deadline - Date.now()), pollMs: 100 });
        if (!result || result.status === 'timeout') throw timeout();
        if (result.status !== 'applied') throw new ProviderError(`native-${result.status}`, result.reason ?? 'Claude отклонил изменение', { status: result.status === 'unavailable' ? 503 : 409 });
        const effective = await nativeParameterState(rt, project, sid);
        if (!effective || effective.status !== 'idle' || !effective.inputEmpty || effective.epoch !== result.state?.epoch) throw new ProviderError('native-stale', 'Read-back Claude уже изменился', { status: 409 });
        return effective;
      } finally {
        await cancelNativeParameters(rt, record.debugFile);
        rows.delete(record.debugFile);
        if ((await readNativeJson(file))?.id === request.id) await rm(file, { force: true });
      }
    }, admission.signal);
  } finally { clearTimeout(timer); }
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
    await writeNativeJson(record.debugFile + TURN_SUFFIX, { version: 1, state: input.event === 'prompt' ? 'working' : 'idle', at: Date.now(), source: 'hook' } satisfies TurnState);
    if (state.status === 'control' && state.pending) await cancelNativeParameters(rt, record.debugFile, state.hostId);
    if (input.event === 'prompt') await writeNativeJson(record.debugFile + '.parameters-input', { hostId: state.hostId });
    break;
  }
  return false;
}
