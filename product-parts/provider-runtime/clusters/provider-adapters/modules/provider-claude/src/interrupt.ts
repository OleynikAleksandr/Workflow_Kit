// Claude adapter: a bounded host request, never stopSession/resumeSession or a permission answer.
import { cancelNativeParameters } from './native-parameters.ts';
import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { ProviderError } from '#provider-registry';
import type { InterruptAvailability, InterruptResult, InterruptTarget, Project, SessionInfo } from '#provider-registry';
import { findSession } from './sessions.ts';
import type { ClaudeRuntime } from './runtime.ts';
import { DIALOG_REASON, REQUEST_SUFFIX, RESULT_SUFFIX, STATE_SUFFIX } from './pty/interrupt-control.ts';
import type { HostResult, HostSnapshot } from './pty/interrupt-control.ts';
import { poll } from './pty.ts';
import { withNativeHost } from './native-arbiter.ts';

interface Cached { snapshot: HostSnapshot; debug: string; projectId: string }
const cache = new WeakMap<ClaudeRuntime, Map<string, Cached>>();
const readJson = async (file: string): Promise<any> => JSON.parse(await readFile(file, 'utf8').catch(() => 'null'));

export async function refreshInterruptions(rt: ClaudeRuntime, project: Project, sessions: SessionInfo[]): Promise<void> {
  let entries = cache.get(rt);
  if (!entries) cache.set(rt, entries = new Map());
  for (const [id, row] of entries) if (row.projectId === project.id) entries.delete(id);
  await Promise.all(sessions.map(async (session) => {
    if (session.state !== 'running') return;
    const { record } = await findSession(rt, project, session.localId);
    if (!record || record.archived || !record.processId || !(await rt.isAlive(record.processId))) return;
    const snapshot = await readJson(record.debugFile + STATE_SUFFIX).catch(() => null) as HostSnapshot | null;
    if (snapshot?.version === 1 && typeof snapshot.epoch === 'string' && Number.isFinite(snapshot.at) && ['working', 'idle', 'dialog', 'unknown'].includes(snapshot.state)) {
      const row = { snapshot, debug: record.debugFile, projectId: project.id };
      for (const id of [session.localId, record.localId, record.remoteId]) if (id) entries.set(id, row);
    }
  }));
}

/** The only reason Stop is unavailable (M28 3.4): no Kit terminal runs this session. */
export const STOP_IN_APP_REASON = 'Остановите ответ в приложении Claude';
/**
 * Stop is available for the whole turn of a session a Kit terminal runs (M28 3.4): the screen is
 * checked by the host only at the press; Esc in a permission dialog is a denial, never an approval.
 */
export function interruptAvailability(rt: ClaudeRuntime, project: Project, sid: string): InterruptAvailability {
  const row = cache.get(rt)?.get(sid);
  if (!row || row.projectId !== project.id) return { available: false, reason: STOP_IN_APP_REASON };
  return { available: true, reason: null };
}

export async function interruptTurn(rt: ClaudeRuntime, project: Project, sid: string, target: InterruptTarget): Promise<InterruptResult> {
  const owned = await findSession(rt, project, sid);
  if (owned.record?.controlHostId && await rt.isAlive(owned.record.processId)) await cancelNativeParameters(rt, owned.record.debugFile, owned.record.controlHostId);
  const technical = interruptAvailability(rt, project, sid);
  const cached = cache.get(rt)?.get(sid);
  if (!technical.available || !cached) return { status: 'unavailable', stopped: false, reason: technical.reason ?? STOP_IN_APP_REASON };
  const { record } = await findSession(rt, project, sid);
  if (!record || record.archived || record.debugFile !== cached.debug || !(await rt.isAlive(record.processId))) return { status: 'unavailable', stopped: false, reason: 'Сессия не управляется действующим терминалом Kit' };
  const timeoutError = (): ProviderError => new ProviderError('interrupt-timeout', 'Остановка ответа Claude не подтверждена', { status: 504, hint: 'Автопродолжение удерживается; проверьте терминал и повторите.' });
  const deadline = Date.now() + rt.options.interruptWaitMs;
  const admission = new AbortController();
  const timer = setTimeout(() => admission.abort(timeoutError()), rt.options.interruptWaitMs);
  try {
    return await withNativeHost(rt, cached.debug, async () => {
      const fresh = cache.get(rt)?.get(sid);
      const available = interruptAvailability(rt, project, sid);
      if (!fresh || fresh.debug !== cached.debug || !(await rt.isAlive(record.processId))) return { status: 'unavailable', stopped: false, reason: 'Сессия не управляется действующим терминалом Kit' };
      if (!available.available) return { status: 'unavailable', stopped: false, reason: available.reason ?? STOP_IN_APP_REASON };
      // The cli already checked the turn (turnRef); the host gets its own latest epoch.
      const live = await readJson(cached.debug + STATE_SUFFIX).catch(() => null) as HostSnapshot | null;
      const epoch = live?.version === 1 && typeof live.epoch === 'string' ? live.epoch : fresh.snapshot.epoch;
      if (Date.now() >= deadline) throw timeoutError();
      const id = randomUUID();
      const file = cached.debug + REQUEST_SUFFIX;
      const timeout = Math.max(1, deadline - Date.now());
      const request = { id, epoch, expires: Math.max(Date.now() + 1, deadline - 500) };
      try {
        await writeFile(file + '.partial', JSON.stringify(request), { encoding: 'utf8', mode: 0o600 });
        await rename(file + '.partial', file);
        const result = await poll<HostResult>(async () => {
          const response = await readJson(cached.debug + RESULT_SUFFIX).catch(() => null) as HostResult | null;
          return response?.id === id ? response : undefined;
        }, { timeoutMs: timeout, pollMs: Math.min(100, rt.options.pollMs) });
        if (!result || result.status === 'timeout') throw timeoutError();
        if (result.status === 'stale') return { status: 'stale', stopped: false };
        if (result.status === 'unavailable') return { status: 'unavailable', stopped: false, reason: result.reason ?? STOP_IN_APP_REASON };
        if (result.status !== 'interrupted' && result.status !== 'already-idle') throw new ProviderError('interrupt-failed', 'Неизвестный ответ терминала');
        return { status: result.status, stopped: true, proof: result.status === 'interrupted' ? 'pty-marker' : 'provider-state', nativeTurnId: target.nativeTurnId };
      } finally {
        if ((await readJson(file).catch(() => null))?.id === id) await rm(file, { force: true });
      }
    }, admission.signal);
  } finally {
    clearTimeout(timer);
  }
}
