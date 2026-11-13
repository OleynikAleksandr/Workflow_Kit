// Stop only a turn held by Kit's existing server. No start, takeover, reload or process stop.
import { ProviderError } from '#provider-registry';
import type { InterruptAvailability, InterruptResult, InterruptTarget, Project, SessionInfo } from '#provider-registry';
import type { KimiClient } from './client.ts';
import { KimiError, KIMI_CODES, describeKimiError, shapeError } from './client.ts';
import type { Liveness } from './locks.ts';
import { inFolder } from './paths.ts';
import type { KimiRuntime } from './provider.ts';
import { SERVER_OWNER } from './server.ts';
import { ARCHIVED_NOTE, WAITING_NOTE, folderRoots } from './session-list.ts';
import { SESSION_ID } from './session-store.ts';
import { parseMessages, parseSession, parseWorkspaces } from './shapes.ts';
import { turnLock } from './turn-lock.ts';
import type { TurnLock } from './turn-lock.ts';
import type { KimiTurnGate } from './turn-gate.ts';

export interface KimiInterruptDeps { interruptWaitMs?: number; interruptPollMs?: number }
interface Owner { client: KimiClient; pid: number; processId: string }
interface Snapshot { owner: Owner | null; lock: TurnLock; at: number; roots: string[]; blocked: string | null }
interface Binding { prompt: string; lock: string; workspace: string; port: number; aborted: boolean }
const FOREIGN = 'Ход Kimi держит другой процесс; Kit не забирает управление';
const UNKNOWN = 'Владелец текущего хода Kimi не подтверждён';
const TIMEOUT_HINT = 'Автопродолжение удерживается; проверьте Kimi и повторите остановку.';

export function createKimiInterrupt(rt: KimiRuntime, live: Liveness, gate: KimiTurnGate, deps: KimiInterruptDeps = {}) {
  const snapshots = new Map<string, Snapshot>();
  const bindings = new Map<string, Binding>();
  const key = (project: Project, id: string) => `${project.id}\n${id}`;
  const timeoutMs = deps.interruptWaitMs ?? 8000;
  const pollMs = deps.interruptPollMs ?? 200;
  async function owner(): Promise<Owner | null> {
    const client = await rt.server.own();
    if (!client) return null;
    const records = await rt.context.supervisor.list(SERVER_OWNER);
    for (const record of records) {
      if (record.args[record.args.indexOf('--port') + 1] === String(client.port) && await rt.context.supervisor.quickCheck(record.id) === 'alive') return { client, pid: record.pid, processId: record.id };
    }
    return null;
  }
  async function refresh(project: Project, sessions: SessionInfo[]): Promise<void> {
    const mine = await owner().catch(() => null);
    const roots = await folderRoots(project.path);
    for (const id of snapshots.keys()) if (id.startsWith(`${project.id}\n`)) snapshots.delete(id);
    await Promise.all(sessions.map(async (session) => {
      if (!SESSION_ID.test(session.localId)) return;
      const lock = mine ? await turnLock(rt.paths.locks, session.localId, mine.pid, live) : { kind: 'unknown' as const, signature: null };
      const blocked = session.note?.includes(ARCHIVED_NOTE) ? 'Сессия Kimi в архиве' : session.note?.includes(WAITING_NOTE) ? WAITING_NOTE : null;
      snapshots.set(key(project, session.localId), { owner: mine, lock, roots, blocked, at: Date.now() });
    }));
  }
  function availability(project: Project, id: string): InterruptAvailability {
    const snapshot = snapshots.get(key(project, id));
    const reason = !snapshot || Date.now() - snapshot.at > 6000 ? UNKNOWN : snapshot.blocked ?? (!snapshot.owner ? 'Сессия не управляется сервером Kit' : snapshot.lock.kind === 'foreign' ? FOREIGN : snapshot.lock.kind === 'unknown' ? UNKNOWN : null);
    return { available: reason === null, reason };
  }
  async function interrupt(project: Project, id: string, target: InterruptTarget): Promise<InterruptResult> {
    const expires = Date.now() + timeoutMs;
    const technical = availability(project, id);
    const cached = snapshots.get(key(project, id));
    const unavailable = (reason: string): InterruptResult => ({ status: 'unavailable', stopped: false, reason });
    if (!technical.available || !cached?.owner) return unavailable(technical.reason ?? UNKNOWN);
    if (target.nativeTurnId !== null) return unavailable('Native id этого хода Kimi не сопоставлен с промптом');
    const timeout = () => new ProviderError('interrupt-timeout', 'Остановка ответа Kimi не подтверждена', { status: 504, hint: TIMEOUT_HINT });
    const bounded = <T>(work: Promise<T>): Promise<T> => {
      let timer: ReturnType<typeof setTimeout>;
      return Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(timeout()), Math.max(1, expires - Date.now())); })]).finally(() => clearTimeout(timer));
    };
    const requestOptions = () => {
      if (Date.now() >= expires) throw timeout();
      return { timeoutMs: Math.max(1, expires - Date.now()), deadline: expires };
    };
    const bindingKey = `${key(project, id)}\n${target.turnRef}`;
    const result = (status: 'interrupted' | 'already-idle'): InterruptResult => ({ status, stopped: true, proof: 'provider-state', nativeTurnId: null });
    return bounded(gate.interrupt<InterruptResult>(id, async (acceptedWhileWaiting) => {
      if (Date.now() >= expires) throw timeout();
      const mine = await owner();
      if (!mine || mine.pid !== cached.owner!.pid || mine.client.port !== cached.owner!.client.port || mine.processId !== cached.owner!.processId) return unavailable('Сервер Kit изменился');
      if (acceptedWhileWaiting()) return { status: 'stale', stopped: false };
      const client = mine.client;
      const probe = async () => {
        const [raw, page, lock] = await Promise.all([
          client.get(`/api/v1/sessions/${id}`, requestOptions()),
          client.get(`/api/v1/sessions/${id}/messages?role=user&page_size=100`, requestOptions()),
          turnLock(rt.paths.locks, id, mine.pid, live),
        ]);
        const session = parseSession(raw);
        const state = raw as Record<string, unknown>;
        if (session.id !== id || typeof state['busy'] !== 'boolean' || typeof state['main_turn_active'] !== 'boolean' || typeof state['archived'] !== 'boolean' || typeof state['pending_interaction'] !== 'string') throw shapeError('session turn flags');
        const prompt = parseMessages(page).items.find((m) => m.role === 'user' && m.origin === 'user')?.id ?? null;
        return { session, prompt, lock, busy: state['busy'] || state['main_turn_active'], reason: state['last_turn_reason'] };
      };
      let current = await probe();
      if (current.session.archived || current.session.waiting) return unavailable(current.session.archived ? 'Сессия Kimi в архиве' : WAITING_NOTE);
      if (current.lock.kind === 'foreign' || current.lock.kind === 'unknown') return unavailable(current.lock.kind === 'foreign' ? FOREIGN : UNKNOWN);
      const cwd = current.session.cwd ?? parseWorkspaces(await client.get('/api/v1/workspaces', requestOptions())).find((w) => w.id === current.session.workspaceId)?.root;
      if (!cwd || !cached.roots.some((root) => inFolder(cwd, root, rt.context.platform))) return unavailable('Папка сессии не принадлежит проекту');
      if (cached.lock.kind === 'own' && current.lock.kind === 'own' && cached.lock.signature !== current.lock.signature) return { status: 'stale', stopped: false };
      let binding = bindings.get(bindingKey);
      if (!binding) {
        if (!current.busy || current.lock.kind !== 'own' || !current.prompt || current.lock.signature !== cached.lock.signature) return unavailable('Текущий промпт Kimi не подтверждён для этой цели');
        binding = { prompt: current.prompt, lock: current.lock.signature, workspace: current.session.workspaceId, port: client.port, aborted: false };
        bindings.set(bindingKey, binding);
        if (bindings.size > 256) bindings.delete(bindings.keys().next().value!);
      }
      const stale = () => client.port !== binding!.port || current.prompt !== binding!.prompt || current.session.workspaceId !== binding!.workspace || (current.lock.kind === 'own' && current.lock.signature !== binding!.lock);
      if (stale()) return { status: 'stale', stopped: false };
      // Recheck after all preflight IO, immediately before the one abort request.
      current = await probe();
      if (stale() || acceptedWhileWaiting()) return { status: 'stale', stopped: false };
      if (current.session.archived || current.session.waiting || current.lock.kind === 'foreign' || current.lock.kind === 'unknown') return unavailable('Состояние или владелец сессии изменились');
      let aborted = false;
      if (current.busy) {
        const response = await client.post(`/api/v1/sessions/${id}:abort`, {}, { ...requestOptions(), retryAuth: false });
        if (!response || typeof response !== 'object' || typeof (response as Record<string, unknown>)['aborted'] !== 'boolean') throw shapeError('abort.aborted');
        aborted = (response as { aborted: boolean }).aborted;
        if (aborted) binding.aborted = true;
      }
      let stableIdle = 0;
      for (;;) {
        if (Date.now() >= expires) throw timeout();
        current = await probe();
        if (stale()) return { status: 'stale', stopped: false };
        if (current.session.archived || current.session.waiting || current.lock.kind === 'foreign' || current.lock.kind === 'unknown') return unavailable('Состояние или владелец сессии изменились');
        if (!current.busy && current.lock.kind === 'idle') stableIdle++; else stableIdle = 0;
        if (stableIdle >= 2) {
          if (current.reason === 'completed') return result('already-idle');
          if (aborted || binding.aborted) return result('interrupted');
        }
        await new Promise((resolve) => setTimeout(resolve, Math.min(pollMs, Math.max(1, expires - Date.now()))));
      }
    })).catch((error: unknown) => {
      if (error instanceof ProviderError) throw error;
      if (Date.now() >= expires || (error instanceof KimiError && error.kind === 'transport' && error.timedOut)) throw timeout();
      if (error instanceof KimiError && error.code === KIMI_CODES.foreignSession) return unavailable(FOREIGN);
      throw new ProviderError('interrupt-failed', `Kimi: ${describeKimiError(error, rt.program().version)}`, { status: 502, hint: TIMEOUT_HINT });
    });
  }
  return { refresh, interruptAvailability: availability, interruptTurn: interrupt };
}
