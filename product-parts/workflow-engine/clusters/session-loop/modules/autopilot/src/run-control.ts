// The control of an autopiloting run (spec M39 controls 1): pause, resume and stop of exactly the
// run the panel shows (runId and its revision), the pause of the old plan buttons and of the M24
// stop, and the recovery after a restart of the service. A pause or stop sets the barrier first:
// every later automatic step reads the run again and does nothing. Stop revokes the grant for
// good (user-stop); the plan can go on by hand. After a restart the started run's idle owner
// gets one continuation; a session the provider still runs gets none; an unreachable owner is
// named, never replaced by a new session.
import type { KeyedMutex } from '#data-store';
import { WorkflowActionError } from './autopilot-types.ts';
import type { RunJournal, RunRecord } from './run-journal.ts';
import type { RunKit } from './run-kit.ts';

/** The autopilot actions the control presses (the same as the plan buttons). */
export interface ControlActions {
  pause(projectId: string): Promise<void>;
  resume(projectId: string, session?: string): Promise<{ owner: string; runId?: string }>;
  halt(projectId: string): void;
}

export interface RunControlDeps {
  journal: RunJournal;
  kit: RunKit;
  projectPath(projectId: string): Promise<string | undefined>;
  listProjects(): Promise<Array<{ id: string; path: string }>>;
  actions(): ControlActions | null;
  /** The owner's activity in the channel: working sessions get no parallel turn. */
  activity(key: string): { state: string } | undefined;
  /** Why the owner cannot get a message now (archived, unknown, no wake), or null. */
  unreachable?(projectId: string, key: string): Promise<string | null>;
  /** Queues the continuation for the owner (and wakes it when the provider can). */
  send(projectId: string, key: string, text: string): void;
  mutex?: KeyedMutex;
  log?: (line: string) => void;
}

export const CONTROL_TEXTS = {
  paused: 'Запуск поставлен на паузу: нажмите «Продолжить».',
  interrupted: 'Ответ остановлен: запуск на паузе до «Продолжить».',
  stopped: 'Запуск остановлен: план можно продолжить вручную или начать новый запуск.',
  recover: (runId: string) => `Workflow Kit: autopilot run ${runId} goes on after a restart of the service. Run \`scripts/workflow recover --format text\` and follow its next line.`,
} as const;

const fail = (code: string, message: string, status = 409, nextAction: string | null = null): never => {
  throw new WorkflowActionError(code, message, status, nextAction);
};

export function createRunControl(deps: RunControlDeps) {
  const log = deps.log ?? (() => undefined);
  const serial = <T>(projectId: string, action: () => Promise<T>): Promise<T> => (deps.mutex ? deps.mutex.run(`project:${projectId}`, action) : action());

  async function target(projectId: string, input: unknown): Promise<{ folder: string; run: RunRecord }> {
    const body = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
    if (typeof body['runId'] !== 'string' || !Number.isSafeInteger(body['expectedRevision'])) fail('bad-request', 'Нужны runId и expectedRevision запуска', 400);
    const folder = (await deps.projectPath(projectId)) ?? fail('project-not-found', 'Проект не найден', 404);
    const run = await deps.journal.active(folder);
    if (!run || run.runId !== body['runId']) fail('run-not-found', 'Этого запуска в проекте нет или он закончен', 404);
    if (run!.revision !== body['expectedRevision']) {
      throw new WorkflowActionError('run-stale', 'Запуск уже изменился', 409, null, { current: { runId: run!.runId, revision: run!.revision, phase: run!.phase } });
    }
    return { folder, run: run! };
  }

  /** The barrier of a pause: written before Kit is asked, kept by every later step. */
  async function barrier(folder: string, run: RunRecord, reason: 'user-pause' | 'interrupted'): Promise<RunRecord> {
    if (run.phase === 'paused') return run;
    return deps.journal.update(folder, run.runId, (r) => ({ ...r, phase: 'paused', pausedFrom: r.phase === 'blocked' ? r.pausedFrom : r.phase, reason, nextAction: reason === 'user-pause' ? CONTROL_TEXTS.paused : CONTROL_TEXTS.interrupted }));
  }

  return {
    /** workflow/pause and the M24 stop (called by the autopilot under the route's lock). */
    async onPause(projectId: string, reason: 'user-pause' | 'interrupted'): Promise<void> {
      const folder = await deps.projectPath(projectId);
      const run = folder ? await deps.journal.active(folder) : null;
      if (folder && run && run.phase !== 'preparing') await barrier(folder, run, reason);
    },

    pause: (projectId: string, input: unknown) =>
      serial(projectId, async () => {
        const { folder, run } = await target(projectId, input);
        const paused = await barrier(folder, run, 'user-pause');
        await deps.actions()?.pause(projectId);
        return paused;
      }),

    resume: (projectId: string, input: unknown) =>
      serial(projectId, async () => {
        const { run } = await target(projectId, input);
        if (run.phase !== 'paused' && run.phase !== 'blocked') return { runId: run.runId, phase: run.phase, already: true };
        const actions = deps.actions() ?? fail('unavailable', 'Автопилот ещё не готов', 503);
        return actions.resume(projectId, run.owner.key);
      }),

    stop: (projectId: string, input: unknown) =>
      serial(projectId, async () => {
        const { folder, run } = await target(projectId, input);
        // The barrier first: nothing automatic starts while Kit records the revocation.
        await deps.journal.update(folder, run.runId, (r) => ({ ...r, phase: 'stopped', pausedFrom: r.phase, reason: 'user-stop', nextAction: CONTROL_TEXTS.stopped }));
        deps.actions()?.halt(projectId);
        let tickets: string[] = [];
        if (run.authority && !run.authority.revocation) {
          const step = await deps.kit.host(folder, {
            operation: 'autopilot:revoke', runId: run.runId, scopeId: run.scopeId ?? 'NONE', ownerSession: run.owner.sessionId, file: false,
            input: { note: 'The user stopped the run in the panel', reason: 'user-stop', runId: run.runId },
            args: (_file, revision) => ['autopilot:revoke', '--run', run.runId, '--reason', 'user-stop', '--note', 'The user stopped the run in the panel', '--expected-revision', String(revision)],
          });
          if (!step.ok) log(`autopiloting: revoke of ${run.runId} failed: ${step.code} ${step.message}`);
          tickets = step.redeemed ? [step.ticketId] : [];
        }
        return deps.journal.update(folder, run.runId, (r) => ({
          ...r,
          tickets: [...r.tickets, ...tickets],
          authority: r.authority ? { ...r.authority, revocation: r.authority.revocation ?? { at: new Date().toISOString(), reason: 'user-stop', resumable: false } } : null,
        }));
      }),

    /** `wfk session run pause|stop` of the run's owner (the agent understood the user's words). */
    async byOwner(projectId: string, key: string, action: 'pause' | 'stop'): Promise<RunRecord> {
      const folder = (await deps.projectPath(projectId)) ?? fail('project-not-found', 'Проект не найден', 404);
      const run = await deps.journal.active(folder);
      if (!run) fail('run-not-found', 'В проекте нет запуска автопилота', 404);
      if (run!.owner.key !== key) fail('not-owner', 'Управляет запуском только сессия-владелец', 403);
      const input = { runId: run!.runId, expectedRevision: run!.revision };
      return action === 'pause' ? this.pause(projectId, input) : this.stop(projectId, input);
    },

    /** After a restart: one continuation for the idle owner of each started run (once per Kit state). */
    async recoverAll(): Promise<void> {
      for (const project of await deps.listProjects()) {
        await serial(project.id, async () => {
          const run = await deps.journal.active(project.path).catch(() => null);
          if (!run || (run.phase !== 'executing' && run.phase !== 'delivering') || run.wait) return;
          const status = await deps.kit.status(project.path);
          const grant = status?.authorization;
          if (!status || !grant || grant.runId !== run.runId || grant.revoked) return;
          if (deps.activity(run.owner.key)?.state === 'working') return;
          const reason = (await deps.unreachable?.(project.id, run.owner.key)) ?? null;
          if (reason) {
            await deps.journal.update(project.path, run.runId, (r) => ({ ...r, phase: 'blocked', pausedFrom: r.phase, reason: `owner-unreachable: ${reason}`, nextAction: 'Откройте сессию-владельца и нажмите «Продолжить».' }));
            return;
          }
          const actionId = `recover:${status.revision}:${status.head ?? '-'}`;
          if (run.pendingAction?.actionId === actionId) return;
          await deps.journal.update(project.path, run.runId, (r) => ({ ...r, pendingAction: { actionId, type: 'continue', stage: 'sent' } }));
          deps.send(project.id, run.owner.key, CONTROL_TEXTS.recover(run.runId));
          log(`autopiloting: ${run.runId} continued after a restart`);
        });
      }
    },
  };
}

export type RunControl = ReturnType<typeof createRunControl>;
