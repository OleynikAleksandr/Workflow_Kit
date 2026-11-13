// M24: orchestration of one confirmed turn interruption, independent of provider/OS.
import type { AgentChannel, InterruptView } from '#agent-channel';
import type { Autopilot } from '#autopilot';
import type { CrossReview } from '#cross-review';
import { HttpError } from '#http-server';
import type { ProjectRegistry } from '#project-registry';
import { INTERRUPT_TIMEOUT_MS } from '#provider-registry';
import type { CachedProviderProject, InterruptAvailability, InterruptResult, Project, Provider, ProviderRegistry } from '#provider-registry';

export interface TurnInterruptionOptions {
  channel: AgentChannel;
  projects: Pick<ProjectRegistry, 'get'>;
  providers: ProviderRegistry;
  autopilot: Pick<Autopilot, 'interrupt'>;
  reviews: Pick<CrossReview, 'interrupted'>;
  timeoutMs?: number;
}
type Success = Extract<InterruptResult, { stopped: true }>;

function deadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([work, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new HttpError(504, 'interrupt-timeout', 'Остановка ответа не подтверждена вовремя', { hint: 'Повторите проверку; автоматическое продолжение удерживается.' })), ms);
  })]).finally(() => clearTimeout(timer));
}

export function createTurnInterruption(options: TurnInterruptionOptions) {
  const { channel, providers } = options;
  const timeoutMs = options.timeoutMs ?? INTERRUPT_TIMEOUT_MS;
  const records = new Map<string, Promise<Success>>();
  const active = new Map<string, string>();

  function available(provider: Provider | undefined, project: Project, id: string, capability: boolean): InterruptAvailability {
    if (!provider?.interruptTurn || !provider.interruptAvailability || !capability) return { available: false, reason: 'Провайдер не поддерживает остановку ответа' };
    try { return provider.interruptAvailability(project, id); }
    catch { return { available: false, reason: 'Не удалось проверить возможность остановки ответа' }; }
  }

  function view(project: Project, key: string, capability: boolean, failed = false): InterruptView {
    const activity = channel.get(key);
    const turn = channel.interruption(key);
    const known = activity?.projectId === project.id && turn?.turnRef !== null && turn?.turnRef !== undefined;
    const cut = key.indexOf(':');
    const technical = available(providers.get(key.slice(0, cut)), project, key.slice(cut + 1), capability);
    return {
      available: Boolean(known && !failed && technical.available && activity?.state === 'working'),
      reason: !known ? 'Состояние текущего хода ещё не подтверждено' : failed ? 'Не удалось прочитать состояние сессии' : technical.reason,
      turnRef: turn?.turnRef ?? null,
      state: known ? activity!.state : 'unknown',
      pending: turn?.pending ?? false,
      barrier: turn?.barrier ?? false,
      result: turn?.result ?? null,
    };
  }

  async function section(): Promise<Record<string, Record<string, InterruptView>>> {
    const snapshots = await providers.cachedProjects();
    const result: Record<string, Record<string, InterruptView>> = {};
    const groups = new Map<string, CachedProviderProject>();
    for (const group of snapshots) {
      groups.set(`${group.project.id}\n${group.providerId}`, group);
      if (group.project.archivedAt || group.failed) continue;
      for (const session of group.sessions) {
        const key = `${group.providerId}:${session.localId}`;
        if (!channel.excluded(key, group.project.id)) (result[group.project.id] ??= {})[key] = view(group.project, key, group.capabilities['interruptTurn']?.available === true);
      }
    }
    // A failed listing must not make an already observed session look supported.
    for (const activity of channel.list()) {
      if (!activity.projectId) continue;
      const group = groups.get(`${activity.projectId}\n${activity.client}`);
      if (!group || group.project.archivedAt) continue;
      if (!group.failed && !group.sessions.some((s) => s.localId === activity.sessionId)) continue;
      (result[activity.projectId] ??= {})[activity.key] = view(group.project, activity.key, group.capabilities['interruptTurn']?.available === true, group.failed);
    }
    return result;
  }

  async function interrupt(projectId: string, key: string, body: unknown): Promise<Success> {
    const expires = Date.now() + timeoutMs;
    const bounded = <T>(work: Promise<T>): Promise<T> => deadline(work, Math.max(1, expires - Date.now()));
    const ref = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>)['turnRef'] : null;
    if (typeof ref !== 'string' || !/^[A-Za-z0-9._:-]{1,200}$/.test(ref)) throw new HttpError(400, 'invalid-body', 'Нужна ссылка на текущий ход turnRef');
    const project = await options.projects.get(projectId);
    if (!project) throw new HttpError(404, 'unknown-session', 'Проект или сессия не найдены');
    if (project.archivedAt || channel.excluded(key, projectId)) throw new HttpError(409, 'session-archived', 'Сессия убрана в архив');
    const cut = key.indexOf(':');
    const provider = cut > 0 ? providers.get(key.slice(0, cut)) : undefined;
    const id = key.slice(cut + 1);
    const sessions = provider ? await bounded(provider.listSessions(project).catch(() => [])) : [];
    if (!sessions.some((s) => s.localId === id && s.provider === provider?.id)) throw new HttpError(404, 'unknown-session', 'Сессия не принадлежит проекту');
    const recordKey = `${projectId}\n${key}\n${ref}`;
    const saved = records.get(recordKey);
    if (saved) return saved;
    const capability = (await bounded(provider!.capabilities()))['interruptTurn']?.available === true;
    const technical = available(provider, project, id, capability);
    if (!technical.available) throw new HttpError(409, 'interrupt-not-supported', technical.reason ?? 'Остановка ответа недоступна');
    // Validation awaits may overlap another request. Recheck deduplication before any effects.
    const latestProject = await options.projects.get(projectId);
    if (!latestProject) throw new HttpError(404, 'unknown-session', 'Проект или сессия не найдены');
    if (latestProject.archivedAt || channel.excluded(key, projectId)) throw new HttpError(409, 'session-archived', 'Сессия убрана в архив');
    const concurrent = records.get(recordKey);
    if (concurrent) return concurrent;
    channel.suspend(key, projectId);
    const pause = Promise.resolve().then(() => options.autopilot.interrupt(projectId, key));
    const review = Promise.resolve().then(() => options.reviews.interrupted(projectId, key));
    const barriers = Promise.all([pause, review]);
    const current = channel.interruption(key);
    const stale = (): HttpError => new HttpError(409, 'stale-turn', 'Состояние хода изменилось', { current: view(project, key, capability) });
    if (current?.turnRef !== ref || active.has(`${projectId}\n${key}`)) {
      try { await bounded(barriers); }
      catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(502, 'interrupt-failed', error instanceof Error ? error.message : String(error));
      }
      throw stale();
    }
    channel.interruptionPending(key, ref, true);
    const activeKey = `${projectId}\n${key}`;
    active.set(activeKey, ref);
    // Start the review barrier and plan pause before calling the provider, without waiting for IO.
    const native = Promise.resolve().then(() => provider!.interruptTurn!(project, id, { turnRef: ref, nativeTurnId: current.nativeTurnId }));
    const job = (async (): Promise<Success> => {
      try {
        const result = await bounded(native);
        if (result.status === 'unavailable') throw new HttpError(409, 'interrupt-not-supported', result.reason);
        if (result.status === 'stale') throw stale();
        if (!['interrupted', 'already-idle'].includes(result.status) || !(result.nativeTurnId === null || typeof result.nativeTurnId === 'string') || !result.stopped || !['provider-event', 'provider-state', 'pty-marker'].includes(result.proof)) throw new Error('Нет подтверждения остановки');
        if (!channel.confirmInterrupted(key, ref, result.nativeTurnId)) throw stale();
        await bounded(barriers);
        channel.interruptionPending(key, ref, false, result.status);
        return result;
      } catch (error) {
        const status = error instanceof HttpError && error.code === 'stale-turn' ? 'stale' : 'failed';
        channel.interruptionPending(key, ref, false, status);
        if (error instanceof HttpError) throw error;
        throw new HttpError(502, 'interrupt-failed', error instanceof Error ? error.message : String(error), { hint: 'Автоматическое продолжение удерживается; проверьте сессию и повторите действие.' });
      }
    })();
    records.set(recordKey, job);
    // Observe every branch even if the native call fails first. A timed-out RPC is never duplicated.
    void Promise.allSettled([native, pause, review, job, barriers]).then((results) => {
      if (active.get(activeKey) === ref) active.delete(activeKey);
      if (results[3]?.status === 'rejected') records.delete(recordKey);
      if (records.size > 256) for (const old of records.keys()) {
        if (old !== recordKey && !active.has(old.slice(0, old.lastIndexOf('\n')))) { records.delete(old); break; }
      }
    });
    return job;
  }
  return { interrupt, section };
}
