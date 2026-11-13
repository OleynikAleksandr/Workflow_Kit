// Interrupt one exact native turn; a successful empty RPC is never confirmation.
import { ProviderError } from '#provider-registry';
import type { InterruptAvailability, InterruptResult, InterruptTarget, Project, SessionInfo } from '#provider-registry';
import { RpcError } from './rpc.ts';
import { compareVersions } from './runtime.ts';
import type { CodexRuntime } from './runtime.ts';
import { NATIVE_ID, nativeTurn, object, turnSnapshot } from './turn-snapshot.ts';
import type { NativeTurn, TurnSnapshot } from './turn-snapshot.ts';

export const MIN_INTERRUPT_CODEX = '0.167.2';
export interface InterruptDeps { interruptWaitMs?: number; interruptPollMs?: number }
const HINT = 'Автопродолжение удерживается; проверьте Codex и повторите остановку.';
export function interruptProgramReason(rt: Pick<CodexRuntime, 'program'>): string | null {
  if (rt.program.installed !== true || !rt.program.version) return 'Версия Codex ещё не подтверждена';
  if (rt.program.error || rt.program.unsupported) return rt.program.error ?? rt.program.unsupported;
  return compareVersions(rt.program.version, MIN_INTERRUPT_CODEX) < 0 ? `Для Stop нужен Codex ${MIN_INTERRUPT_CODEX} или новее` : null;
}

export function createInterruptParts(rt: CodexRuntime, deps: InterruptDeps = {}, blocked: () => string | null = () => null) {
  const members = new Map<string, Set<string>>();
  const cache = new Map<string, { snapshot: TurnSnapshot | null; at: number }>();
  const bindings = new Map<string, string>();
  const timeoutMs = deps.interruptWaitMs ?? 8000;
  const pollMs = deps.interruptPollMs ?? 200;
  function observe(threadId: string, answer: unknown): void {
    let snapshot: TurnSnapshot | null = null;
    try { snapshot = turnSnapshot(answer, threadId); } catch { /* invalid reads must not retain positive availability */ }
    cache.set(threadId, { snapshot, at: Date.now() });
    if (cache.size > 512) cache.delete(cache.keys().next().value!);
  }
  function availability(project: Project, threadId: string): InterruptAvailability {
    const daemon = rt.cachedDaemon();
    const entry = cache.get(threadId);
    const snapshot = entry?.snapshot;
    const reason = blocked() ?? interruptProgramReason(rt)
      ?? (!members.get(project.id)?.has(threadId) || project.archivedAt ? 'Сессия не принадлежит активному проекту' : null)
      ?? (!daemon?.running || daemon.error ? 'Нет доступного демона Codex для управления этим ходом' : null)
      ?? (!entry || !snapshot || Date.now() - entry.at > 6000 ? 'Нет свежего состояния треда в демоне Codex' : null)
      ?? (snapshot?.state === 'notLoaded' ? 'Тред ведёт внешний процесс или он не загружен в демоне Kit' : null)
      ?? (snapshot?.state === 'systemError' ? 'Codex сообщил ошибку треда' : null)
      ?? (snapshot?.state === 'idle' && snapshot.active ? 'История активного хода не совпадает с состоянием демона' : null)
      ?? (snapshot?.state === 'active' && !snapshot.active ? 'Native id активного хода не подтверждён' : null)
      ?? (!snapshot?.turns.length ? 'У треда нет подтверждённого хода' : null);
    return { available: reason === null, reason };
  }
  async function interrupt(project: Project, threadId: string, target: InterruptTarget): Promise<InterruptResult> {
    const technical = availability(project, threadId);
    if (!technical.available) return { status: 'unavailable', stopped: false, reason: technical.reason! };
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(threadId) || (target.nativeTurnId !== null && !NATIVE_ID.test(target.nativeTurnId))) return { status: 'unavailable', stopped: false, reason: 'Неверный id треда или хода' };
    const cached = cache.get(threadId)!.snapshot!;
    const bindingKey = `${project.id}\n${threadId}\n${target.turnRef}`;
    const bound = bindings.get(bindingKey);
    if (bound && target.nativeTurnId && bound !== target.nativeTurnId) return { status: 'stale', stopped: false };
    const expected = bound ?? target.nativeTurnId ?? cached.active?.id ?? cached.turns.at(-1)?.id;
    if (!expected) return { status: 'unavailable', stopped: false, reason: 'Native id цели не подтверждён' };
    bindings.set(bindingKey, expected);
    if (bindings.size > 256) bindings.delete(bindings.keys().next().value!);
    const expires = Date.now() + timeoutMs;
    let expired = false;
    const timeout = () => new ProviderError('interrupt-timeout', 'Остановка ответа Codex не подтверждена', { status: 504, hint: HINT });
    const remaining = () => { const ms = expires - Date.now(); if (expired || ms <= 0) throw timeout(); return ms; };
    const success = (turn: NativeTurn, proof: 'provider-event' | 'provider-state'): InterruptResult => {
      if (turn.status === 'failed') throw new ProviderError('interrupt-failed', 'Ожидаемый ход Codex завершился с ошибкой', { status: 502, hint: HINT });
      return { status: turn.status === 'interrupted' ? 'interrupted' : 'already-idle', stopped: true, proof, nativeTurnId: expected };
    };
    const stale: InterruptResult = { status: 'stale', stopped: false };
    let timer: ReturnType<typeof setTimeout>;
    const work = rt.withDaemon(async (session) => {
      remaining(); // A late connection cannot send a destructive request after the deadline.
      let cursor = session.notifications.length;
      const notes = (): InterruptResult | null => {
        let completed: NativeTurn | null = null;
        let successor = false;
        for (const note of session.notifications.slice(cursor)) {
          if (!object(note.params) || note.params['threadId'] !== threadId) continue;
          const turn = nativeTurn(note.params['turn']);
          if (note.method === 'turn/started' && turn && turn.id !== expected) successor = true;
          if (note.method === 'turn/completed' && turn?.id === expected && turn.status !== 'inProgress') completed = turn;
        }
        cursor = session.notifications.length;
        return successor ? stale : completed ? success(completed, 'provider-event') : null;
      };
      const read = async () => {
        let answer: unknown;
        try { answer = await session.request('thread/read', { threadId, includeTurns: true }, remaining()); }
        catch (error) { observe(threadId, null); throw error; }
        remaining();
        observe(threadId, answer);
        return turnSnapshot(answer, threadId);
      };
      const classify = (snapshot: TurnSnapshot): InterruptResult | null => {
        if (snapshot.active && snapshot.active.id !== expected) return stale;
        const turn = snapshot.turns.find((candidate) => candidate.id === expected);
        if (!turn) return stale;
        if (turn.status !== 'inProgress') {
          if (snapshot.turns.at(-1)?.id !== expected) return stale;
          return success(turn, 'provider-state');
        }
        if (snapshot.state !== 'active') return { status: 'unavailable', stopped: false, reason: 'Этот ход не управляется активным демоном Kit' };
        return null;
      };
      let snapshot = await read();
      let outcome = classify(snapshot);
      if (outcome) return outcome;
      // A second read fences a native successor that arrived during preflight IO.
      snapshot = await read();
      outcome = classify(snapshot);
      if (outcome) return outcome;
      const before = notes();
      if (before) return before;
      let failure: unknown;
      try { await session.request('turn/interrupt', { threadId, turnId: expected }, remaining()); }
      catch (error) { remaining(); failure = error; }
      for (;;) {
        remaining();
        try { snapshot = await read(); } catch (error) { const note = notes(); if (note) return note; throw error; }
        if (snapshot.active && snapshot.active.id !== expected) return stale;
        const observed = snapshot.turns.find((turn) => turn.id === expected);
        if (observed?.status === 'failed') return success(observed, 'provider-state');
        const completed = notes();
        if (completed) return completed;
        outcome = classify(snapshot);
        if (outcome) return outcome;
        if (failure) throw failure;
        await new Promise((resolve) => setTimeout(resolve, Math.min(pollMs, remaining())));
      }
    }, timeoutMs);
    return Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => { expired = true; reject(timeout()); }, Math.max(1, expires - Date.now())); })])
      .catch((error: unknown) => {
        if (error instanceof ProviderError) throw error;
        if (expired || Date.now() >= expires || (error instanceof RpcError && error.code === 'timeout')) throw timeout();
        throw new ProviderError('interrupt-failed', `Codex: ${error instanceof Error ? error.message : String(error)}`, { status: 502, hint: HINT });
      }).finally(() => clearTimeout(timer));
  }
  return { observe, interruptAvailability: availability, interruptTurn: interrupt, sessions(project: Project, sessions: SessionInfo[]) { members.set(project.id, new Set(sessions.map((s) => s.localId))); } };
}
