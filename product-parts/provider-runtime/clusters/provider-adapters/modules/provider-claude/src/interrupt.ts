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

interface Cached { snapshot: HostSnapshot | null; debug: string; projectId: string }
const cache = new WeakMap<ClaudeRuntime, Map<string, Cached>>();
/** Ids the last listing saw without a Kit terminal: only these get the in-app reason (M28 T010). */
const outside = new WeakMap<ClaudeRuntime, Map<string, string>>();
const validSnapshot = (v: any): v is HostSnapshot => v?.version === 1 && typeof v.epoch === 'string' && Number.isFinite(v.at) && ['working', 'idle', 'dialog', 'unknown'].includes(v.state);
const readJson = async (file: string): Promise<any> => JSON.parse(await readFile(file, 'utf8').catch(() => 'null'));

/** The row of one session: a live Kit terminal, keyed by every id the panel may use (hook id too). */
async function lookup(rt: ClaudeRuntime, project: Project, sid: string): Promise<{ ids: string[]; row: Cached | null }> {
  const { record, hook } = await findSession(rt, project, sid);
  const ids = [sid, record?.localId, record?.remoteId, hook?.hook.sessionId].filter((id): id is string => Boolean(id));
  if (!record || record.archived || !record.processId || !record.debugFile || !(await rt.isAlive(record.processId))) return { ids, row: null };
  // A host that has not written its first state yet is still a Kit terminal (the first seconds of a turn).
  const snapshot = await readJson(record.debugFile + STATE_SUFFIX).catch(() => null);
  return { ids, row: { snapshot: validSnapshot(snapshot) ? snapshot : null, debug: record.debugFile, projectId: project.id } };
}
function store(rt: ClaudeRuntime, project: Project, ids: string[], row: Cached | null): void {
  let entries = cache.get(rt); if (!entries) cache.set(rt, entries = new Map());
  let away = outside.get(rt); if (!away) outside.set(rt, away = new Map());
  for (const id of ids) {
    if (row) { entries.set(id, row); away.delete(id); }
    else if (!entries.has(id)) away.set(id, project.id);
  }
}

export async function refreshInterruptions(rt: ClaudeRuntime, project: Project, sessions: SessionInfo[]): Promise<void> {
  const entries = cache.get(rt); const away = outside.get(rt);
  if (entries) for (const [id, row] of entries) if (row.projectId === project.id) entries.delete(id);
  if (away) for (const [id, owner] of away) if (owner === project.id) away.delete(id);
  const found = await Promise.all(sessions.map(async (session) => session.state === 'running'
    ? lookup(rt, project, session.localId) : { ids: [session.localId, session.remoteId].filter((id): id is string => Boolean(id)), row: null }));
  for (const { ids, row } of found) if (row) store(rt, project, ids, row);
  for (const { ids, row } of found) if (!row) store(rt, project, ids, null);
}

/** The only reason Stop is unavailable (M28 3.4): no Kit terminal runs this session. */
export const STOP_IN_APP_REASON = 'Остановите ответ в приложении Claude';
/**
 * Stop is available for the whole turn of a session a Kit terminal runs (M28 3.4): the screen is
 * checked by the host only at the press; Esc in a permission dialog is a denial, never an approval.
 */
export function interruptAvailability(rt: ClaudeRuntime, project: Project, sid: string): InterruptAvailability {
  const row = cache.get(rt)?.get(sid);
  if (row?.projectId === project.id) return { available: true, reason: null };
  // Not listed yet (a new session, a hook id the listing has not seen): the press checks the host itself.
  if (row || outside.get(rt)?.get(sid) === project.id) return { available: false, reason: STOP_IN_APP_REASON };
  return { available: true, reason: null };
}

export async function interruptTurn(rt: ClaudeRuntime, project: Project, sid: string, target: InterruptTarget): Promise<InterruptResult> {
  const owned = await findSession(rt, project, sid);
  if (owned.record?.controlHostId && await rt.isAlive(owned.record.processId)) await cancelNativeParameters(rt, owned.record.debugFile, owned.record.controlHostId);
  // The press never trusts a stale listing: the session's own record and host state decide (M28 T010).
  const seen = await lookup(rt, project, sid);
  store(rt, project, seen.ids, seen.row);
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
      // A host just started writes its first state within one poll; the press waits for it, bounded.
      const live = await poll<HostSnapshot>(async () => {
        const value = await readJson(cached.debug + STATE_SUFFIX).catch(() => null);
        return validSnapshot(value) ? value : undefined;
      }, { timeoutMs: Math.max(1, deadline - Date.now()), pollMs: Math.min(100, rt.options.pollMs) }).catch(() => undefined);
      const epoch = live?.epoch ?? fresh.snapshot?.epoch;
      if (!epoch || Date.now() >= deadline) throw timeoutError();
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
