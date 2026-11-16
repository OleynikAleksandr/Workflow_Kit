// The waits of a started autopiloting run (spec M39 runtime 5, controls 2): CI of an exact SHA
// and an agent's question. A wait is shown as a wait and costs no attempt. CI: the agent reports
// the pushed SHA with `wfk session progress` (only the run's owner, only the CI policy the grant
// froze — a smaller requiredChecks or another branch gives another digest and is refused); the
// report is no result: the service reads GitHub itself (`ci.read`, the policy from the grant).
// Green — the owner goes on; red on a started delivery — Kit `task:defer-delivery`, then the
// owner adds a fixes round; no access — a capability blocker; a GitHub failure — retries 5/15/45 s.
// T008: a SHA the service itself sent to the CI branch (`stage: 'service'`, before the acceptance
// or after the close) is checked with the policy frozen in the run — the grant disappears with
// the closed scope; green sends no message (the completion goes on), red blocks the run.
// A question of the owner holds the run in `waiting` until it is answered; an expired hook blocks
// the run with «Нужны данные».
import type { KeyedMutex } from '#data-store';
import { WorkflowActionError } from './autopilot-types.ts';
import { hostInputDigest } from './host-ticket.ts';
import type { RunJournal, RunRecord } from './run-journal.ts';
import type { RunKit } from './run-kit.ts';

export interface CiPolicyLike {
  remote: string;
  branch: string;
  requiredChecks: string[];
  exactSha: boolean;
}

/** The verdict of an independent CI read (git-publish `GitHubCi`). */
export type CiReadVerdict =
  | { state: 'success'; sha: string; jobs: Array<{ name: string }> }
  | { state: 'pending'; sha: string; missing: string[]; running: string[] }
  | { state: 'failed'; sha: string; failed: Array<{ name: string; conclusion: string | null }> }
  | { state: 'unavailable'; reason: string; transient?: boolean };

export interface RunWaitsDeps {
  journal: RunJournal;
  kit: RunKit;
  ci: { read(root: string, sha: string, policy: CiPolicyLike): Promise<CiReadVerdict> };
  projectPath(projectId: string): Promise<string | undefined>;
  listProjects(): Promise<Array<{ id: string; path: string }>>;
  send(projectId: string, key: string, text: string): void;
  mutex?: KeyedMutex;
  now?: () => Date;
  log?: (line: string) => void;
}

/** Backoff of a failing action: three retries, then blocked. */
export const RETRY_DELAYS_MS = [5_000, 15_000, 45_000] as const;

export const WAIT_TEXTS = {
  ci: (sha: string) => `Ждёт CI для ${sha.slice(0, 12)}`,
  question: 'Агент ждёт ответа на вопрос',
  expired: 'Нужны данные: ожидание ответа у провайдера завершилось',
  green: (runId: string, sha: string, jobs: string[]) => `Workflow Kit: autopilot run ${runId}: CI is green for ${sha} (${jobs.join(', ')}). Finish the delivery task and commit it.`,
  deferred: (runId: string, sha: string, failed: string, task: string) =>
    `Workflow Kit: autopilot run ${runId}: CI failed for ${sha} (${failed}). Kit deferred delivery task ${task}. Add a fixes round with \`scripts/workflow plan:extend --input <file.json> --expected-revision <N>\` that fixes the failures within the reviewed goal, then go on with the plan.`,
  red: (failed: string) => `CI не прошёл (${failed}): поставка не начата или не может быть отложена.`,
} as const;

const SHA = /^[0-9a-f]{40}$/u;
const ACTION = /^[A-Za-z0-9:._-]{1,100}$/u;
const fail = (code: string, message: string, status = 409): never => {
  throw new WorkflowActionError(code, message, status);
};

export function createRunWaits(deps: RunWaitsDeps) {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? (() => undefined);
  const serial = <T>(projectId: string, action: () => Promise<T>): Promise<T> => (deps.mutex ? deps.mutex.run(`project:${projectId}`, action) : action());
  const resume = (r: RunRecord): RunRecord['phase'] => (r.phase === 'waiting' ? (r.pausedFrom ?? 'delivering') : r.phase);

  async function retry(folder: string, run: RunRecord, actionId: string, error: string): Promise<void> {
    const count = (run.retries?.[actionId]?.count ?? 0) + 1;
    if (count > RETRY_DELAYS_MS.length) {
      await deps.journal.update(folder, run.runId, (r) => ({ ...r, phase: 'blocked', pausedFrom: resume(r), reason: `ci-unavailable: ${error}`, nextAction: 'Проверьте доступ к GitHub и нажмите «Продолжить».' }));
      return;
    }
    const nextAt = new Date(now().getTime() + RETRY_DELAYS_MS[count - 1]!).toISOString();
    await deps.journal.update(folder, run.runId, (r) => ({ ...r, retries: { ...r.retries, [actionId]: { count, nextAt, error } } }));
  }

  async function checkCi(projectId: string, folder: string, run: RunRecord): Promise<RunRecord | null> {
    const wait = run.wait!;
    const actionId = wait.actionId ?? `ci:${wait.sha}`;
    const due = run.retries?.[actionId]?.nextAt;
    if (due && Date.parse(due) > now().getTime()) return run;
    const service = wait.stage === 'service';
    let status = service ? null : await deps.kit.status(folder);
    const grant = status?.authorization;
    if (!service && (!grant || grant.runId !== run.runId || grant.revoked || !grant.ci)) return run;
    const policy = service ? run.completion?.ci : (grant!.ci as CiPolicyLike);
    if (!policy) return run;
    const verdict = await deps.ci.read(folder, wait.sha!, policy);
    if (verdict.state === 'pending') return run;
    if (verdict.state === 'unavailable') {
      if (verdict.transient) await retry(folder, run, actionId, verdict.reason);
      else await deps.journal.update(folder, run.runId, (r) => ({ ...r, phase: 'blocked', pausedFrom: resume(r), reason: `ci-unavailable: ${verdict.reason}`, nextAction: 'Настройте gh (gh auth login) и нажмите «Продолжить».' }));
      return deps.journal.read(folder, run.runId);
    }
    const at = now().toISOString();
    if (verdict.state === 'success') {
      const done = await deps.journal.update(folder, run.runId, (r) => ({ ...r, wait: null, phase: resume(r), pausedFrom: null, receipts: [...r.receipts, { actionId, type: 'ci', at, commit: verdict.sha, detail: verdict.jobs.map((j) => j.name).join(', ') }] }));
      if (!service) deps.send(projectId, run.owner.key, WAIT_TEXTS.green(run.runId, verdict.sha, verdict.jobs.map((j) => j.name)));
      return done;
    }
    const failed = verdict.failed.map((job) => `${job.name}: ${job.conclusion ?? 'unknown'}`).join(', ');
    if (service) status = null;
    const task = status?.nextTask;
    if (task?.kind !== 'delivery' || task.status !== 'IN_PROGRESS') {
      const closed = run.pausedFrom === 'publishing';
      return deps.journal.update(folder, run.runId, (r) => ({ ...r, wait: null, phase: 'blocked', pausedFrom: resume(r), reason: WAIT_TEXTS.red(failed), receipts: [...r.receipts, { actionId, type: 'ci-failed', at, commit: verdict.sha, detail: failed }], nextAction: closed ? 'Scope уже закрыт: исправление требует отдельного согласованного scope.' : 'Исправьте причину и нажмите «Продолжить».' }));
    }
    const reason = `CI failed for ${verdict.sha}: ${failed}`;
    const deferred = await deps.kit.command(folder, ['task:defer-delivery', task.id, '--reason', reason, '--outcome', 'red CI of the pushed commit', '--expected-revision', String(status!.revision)]);
    if (!deferred.ok) {
      return deps.journal.update(folder, run.runId, (r) => ({ ...r, wait: null, phase: 'blocked', pausedFrom: resume(r), reason: `${deferred.code}: ${deferred.message}`, nextAction: 'Отложите поставку командой task:defer-delivery и нажмите «Продолжить».' }));
    }
    const done = await deps.journal.update(folder, run.runId, (r) => ({ ...r, wait: null, phase: 'executing', pausedFrom: null, receipts: [...r.receipts, { actionId, type: 'ci-failed', at, commit: verdict.sha, detail: `${failed}; deferred ${task.id}` }] }));
    deps.send(projectId, run.owner.key, WAIT_TEXTS.deferred(run.runId, verdict.sha, failed, task.id));
    log(`autopiloting: ${run.runId} red CI for ${verdict.sha}; ${task.id} deferred`);
    return done;
  }

  return {
    /** `wfk session progress`: the owner reports a wait for CI of a pushed SHA. */
    progress: (projectId: string, key: string, input: unknown) =>
      serial(projectId, async () => {
        const body = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
        const { runId, actionId, stage, targetSha, ciPolicyDigest, waitReason } = body;
        if (typeof runId !== 'string' || typeof actionId !== 'string' || !ACTION.test(actionId) || typeof targetSha !== 'string' || !SHA.test(targetSha) || typeof ciPolicyDigest !== 'string' || (stage !== 'pushed' && stage !== 'waiting') || typeof waitReason !== 'string' || waitReason.trim() === '') {
          fail('bad-request', 'Нужны runId, actionId, stage (pushed | waiting), targetSha (полный SHA), ciPolicyDigest и waitReason', 400);
        }
        const folder = (await deps.projectPath(projectId)) ?? fail('project-not-found', 'Проект не найден', 404);
        const run = await deps.journal.active(folder);
        if (!run || run.runId !== runId) fail('run-not-found', 'Этого запуска в проекте нет или он закончен', 404);
        if (run!.owner.key !== key) fail('not-owner', 'Ожидание сообщает только сессия-владелец запуска', 403);
        if (run!.receipts.some((receipt) => receipt.actionId === actionId)) fail('action-done', `Действие ${String(actionId)} уже закончено`);
        const grant = (await deps.kit.status(folder))?.authorization;
        if (!grant || grant.runId !== runId || grant.revoked || !grant.ci) fail('no-ci-policy', 'У разрешения запуска нет политики CI');
        if (hostInputDigest(grant!.ci) !== ciPolicyDigest) fail('ci-policy-mismatch', 'Политика CI не совпадает с закреплённой в разрешении запуска');
        const wait = { reason: 'ci' as const, since: now().toISOString(), sha: targetSha as string, actionId: actionId as string, stage: stage as string, detail: WAIT_TEXTS.ci(targetSha as string) };
        await deps.journal.update(folder, run!.runId, (r) => ({ ...r, wait, phase: 'waiting', pausedFrom: r.phase === 'waiting' ? r.pausedFrom : r.phase }));
        return { recorded: true, runId, wait, note: 'A wait is no CI result: Workflow Kit reads the required jobs of this SHA on GitHub itself.' };
      }),

    /** One CI check of every run that waits for CI (a timer of the service). */
    async pollAll(): Promise<void> {
      for (const project of await deps.listProjects()) {
        await serial(project.id, async () => {
          const run = await deps.journal.active(project.path).catch(() => null);
          if (run?.phase === 'waiting' && run.wait?.reason === 'ci' && run.wait.sha) await checkCi(project.id, project.path, run);
        }).catch((error: unknown) => log(`autopiloting: CI check of ${project.id}: ${error instanceof Error ? error.message : String(error)}`));
      }
    },

    /** The owner asked a question (AskUserQuestion, request_user_input, PermissionRequest): wait. */
    async questionStarted(projectId: string, key: string): Promise<void> {
      const folder = await deps.projectPath(projectId);
      const run = folder ? await deps.journal.active(folder) : null;
      if (!folder || !run || run.owner.key !== key || run.wait || !['executing', 'delivering'].includes(run.phase)) return;
      await deps.journal.update(folder, run.runId, (r) => ({ ...r, phase: 'waiting', pausedFrom: r.phase, wait: { reason: 'question', since: now().toISOString(), detail: WAIT_TEXTS.question } }));
    },

    /** The question was answered (the run goes on in the same turn) or its hook expired (blocked). */
    async questionEnded(projectId: string, key: string, outcome: 'answered' | 'expired'): Promise<void> {
      const folder = await deps.projectPath(projectId);
      const run = folder ? await deps.journal.active(folder) : null;
      if (!folder || !run || run.owner.key !== key || run.wait?.reason !== 'question') return;
      await deps.journal.update(folder, run.runId, (r) =>
        outcome === 'answered'
          ? { ...r, wait: null, phase: resume(r), pausedFrom: null }
          : { ...r, wait: null, phase: 'blocked', pausedFrom: resume(r), reason: 'question-expired', nextAction: `${WAIT_TEXTS.expired}. Ответьте агенту в приложении и нажмите «Продолжить».` },
      );
    },
  };
}

export type RunWaits = ReturnType<typeof createRunWaits>;
