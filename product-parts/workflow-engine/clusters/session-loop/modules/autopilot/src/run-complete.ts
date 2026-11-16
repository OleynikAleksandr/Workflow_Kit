// The completion of an authorized run (spec M39 completion, T008): the service itself accepts
// the result with evidence (`accept --autopilot-run`), closes the scope (`close --autopilot-run`),
// sends the final SHA to the CI branch of the frozen policy (`stageCi`), waits for its CI and
// publishes exactly that SHA (`publish` with the expected target), all under the project lock
// the panel's publish button takes too. Each step is decided from facts — the Kit status, the
// git history and the remote — so a restart after accept, close or push repeats nothing; the
// journal records the receipts outside git (no evidence commit makes a new unverified SHA).
import type { KeyedMutex } from '#data-store';
import type { RunJournal, RunRecord } from './run-journal.ts';
import type { RunKit, RunKitStatus } from './run-kit.ts';
import { RETRY_DELAYS_MS, WAIT_TEXTS } from './run-waits.ts';

export interface PublisherLike {
  publish(folder: string, scopeOpen: boolean, expected: { sha: string; branch: string; upstream: string }): Promise<{ sha: string; already: boolean; commits?: number }>;
  stageCi(folder: string, target: { sha: string; remote: string; branch: string }): Promise<{ sha: string; already: boolean }>;
}

export type GitRead = (cwd: string, args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>;

export interface RunCompletionDeps {
  journal: RunJournal;
  kit: RunKit;
  /** git-publish `createPublisher`: the same service the publish button uses. */
  publisher: PublisherLike;
  git: GitRead;
  projectPath(projectId: string): Promise<string | undefined>;
  listProjects(): Promise<Array<{ id: string; path: string }>>;
  mutex?: KeyedMutex;
  now?: () => Date;
  log?: (line: string) => void;
}

export const COMPLETE_TEXTS = {
  manual: 'Приёмку выполняет пользователь (ручной критерий): после неё запуск сам закроет scope и опубликует результат.',
  evidence: (files: string) => `Нет закоммиченных доказательств приёмки: ${files}`,
  afterClose: 'Scope уже закрыт: исправление требует отдельного согласованного scope.',
  scopeChanged: 'Открыт другой scope: старый запуск не публикует его незаконченный результат.',
  noUpstream: 'У запуска нет адресата публикации (upstream): результат остаётся локальным.',
  closedElsewhere: 'Scope закрыт не этим запуском: публикация — кнопкой «Опубликовать на GitHub».',
  retry: 'Устраните причину и нажмите «Продолжить».',
} as const;

/** Next actions for the refusals of the publisher (git-publish `PublishError` codes). */
const PUBLISH_NEXT: Record<string, string> = {
  'push-auth': 'Проверьте вход в GitHub (учётные данные git) и нажмите «Продолжить».',
  'remote-ahead': 'На удалённой ветке есть чужие коммиты: объедините истории вручную; запуск их не перезаписывает.',
  'no-upstream': COMPLETE_TEXTS.noUpstream,
  'worktree-dirty': 'В проекте есть незакоммиченные файлы: уберите свои временные файлы или закоммитите документы через docs:commit; чужие файлы запуск не трогает.',
  'publication-target-changed': 'Ветка или upstream проекта изменились после разрешения: запуск не публикует в новый адрес.',
  'head-changed': 'После закрытия в ветке появились другие коммиты: запуск публикует только проверенный SHA.',
};

/** Phases in which the completion acts. */
const ACTING = new Set<RunRecord['phase']>(['executing', 'delivering', 'accepting', 'closing', 'publishing']);

export function createRunCompletion(deps: RunCompletionDeps) {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? (() => undefined);
  const serial = <T>(projectId: string, action: () => Promise<T>): Promise<T> => (deps.mutex ? deps.mutex.run(`project:${projectId}`, action) : action());
  const has = (run: RunRecord, actionId: string): boolean => run.receipts.some((receipt) => receipt.actionId === actionId);
  const live = (status: RunKitStatus, run: RunRecord): boolean => status.authorization?.runId === run.runId && !status.authorization.revoked;
  const receipt = (actionId: string, type: string, commit: string | null, detail: string) => ({ actionId, type, at: now().toISOString(), commit, detail });

  const update = (folder: string, run: RunRecord, change: (r: RunRecord) => RunRecord) => deps.journal.update(folder, run.runId, change);
  const block = (folder: string, run: RunRecord, reason: string, nextAction: string = COMPLETE_TEXTS.retry) =>
    update(folder, run, (r) => ({ ...r, phase: 'blocked', pausedFrom: r.phase, reason, nextAction }));

  async function head(folder: string): Promise<string | null> {
    const out = await deps.git(folder, ['rev-parse', 'HEAD']);
    return out.code === 0 ? out.stdout.trim() : null;
  }

  /** Commits Kit made (the trailer of its transaction), newest first: Kit picks the one whose record passed. */
  async function kitCommits(folder: string): Promise<string[]> {
    const out = await deps.git(folder, ['log', '-n', '200', '--format=%H%x09%(trailers:key=Workflow-Transaction,valueonly,separator=)', 'HEAD']);
    return out.stdout.split('\n').map((line) => line.split('\t')).filter(([sha, trailer]) => sha && trailer?.trim()).map(([sha]) => sha!);
  }

  /** The close commit of this run in the history (a fact after a restart), or null. */
  async function closedBy(folder: string, runId: string): Promise<string | null> {
    const out = await deps.git(folder, ['log', '-n', '50', '--format=%H%x09%s', '--fixed-strings', `--grep=(autopilot run ${runId})`, 'HEAD']);
    const line = out.stdout.split('\n').find((entry) => entry.split('\t')[1]?.startsWith('chore: close scope'));
    return line ? line.split('\t')[0]! : null;
  }

  /** A failed git step: credentials and refusals block at once; another failure retries 5/15/45 s. */
  async function failed(folder: string, run: RunRecord, actionId: string, error: unknown): Promise<RunRecord> {
    const code = (error as { code?: unknown })?.code;
    const message = error instanceof Error ? error.message : String(error);
    const output = (error as { output?: unknown })?.output;
    const why = `${typeof code === 'string' ? code : 'error'}: ${message}${typeof output === 'string' && output ? ` (${output.slice(0, 300)})` : ''}`;
    if (code === 'push-failed') {
      const count = (run.retries?.[actionId]?.count ?? 0) + 1;
      if (count <= RETRY_DELAYS_MS.length) {
        const nextAt = new Date(now().getTime() + RETRY_DELAYS_MS[count - 1]!).toISOString();
        return update(folder, run, (r) => ({ ...r, retries: { ...r.retries, [actionId]: { count, nextAt, error: why } } }));
      }
    }
    log(`autopiloting: ${run.runId} ${actionId}: ${why}`);
    return block(folder, run, why, (typeof code === 'string' && PUBLISH_NEXT[code]) || COMPLETE_TEXTS.retry);
  }

  const due = (run: RunRecord, actionId: string): boolean => {
    const at = run.retries?.[actionId]?.nextAt;
    return !at || Date.parse(at) <= now().getTime();
  };

  /** Sends `sha` to the CI branch of the frozen policy (once) and waits for its CI. */
  async function stage(folder: string, run: RunRecord, sha: string): Promise<RunRecord | null> {
    const ci = run.completion?.ci;
    if (!ci) return null;
    const actionId = `ci-stage:${sha}`;
    if (!due(run, actionId)) return null;
    let current = run;
    if (!has(run, actionId)) {
      try {
        const staged = await deps.publisher.stageCi(folder, { sha, remote: ci.remote, branch: ci.branch });
        current = await update(folder, run, (r) => ({ ...r, receipts: [...r.receipts, receipt(actionId, 'ci-stage', sha, staged.already ? `already on ${ci.remote}/${ci.branch}` : `pushed to ${ci.remote}/${ci.branch}`)] }));
      } catch (error) {
        return failed(folder, run, actionId, error);
      }
    }
    const wait = { reason: 'ci' as const, since: now().toISOString(), sha, actionId: `ci:${sha}`, stage: 'service', detail: WAIT_TEXTS.ci(sha) };
    return update(folder, current, (r) => ({ ...r, phase: 'waiting', pausedFrom: r.phase, wait }));
  }

  const greenFor = (run: RunRecord, sha: string) => run.receipts.some((r) => r.type === 'ci' && r.commit === sha);

  async function accept(folder: string, run: RunRecord, status: RunKitStatus): Promise<RunRecord | null> {
    if (status.delivery === 'ACCEPTED') {
      return update(folder, run, (r) => ({ ...r, phase: 'closing', receipts: has(r, `accept:${r.scopeId}`) ? r.receipts : [...r.receipts, receipt(`accept:${r.scopeId}`, 'accept', status.head, 'accepted (fact of the plan)')] }));
    }
    if (status.scope !== 'ACTIVE' || status.delivery !== 'READY_FOR_ACCEPTANCE' || !live(status, run)) return block(folder, run, 'not-ready-for-acceptance: результат не готов к приёмке или разрешение запуска не действует');
    if (status.transactionPending || status.orchestration?.integration) return null;
    const automatic = (status.acceptance ?? []).filter((entry) => entry.kind === 'automatic');
    const missing = automatic.flatMap((entry) => entry.evidenceMissing ?? []);
    if (missing.length > 0) return block(folder, run, COMPLETE_TEXTS.evidence(missing.join(', ')), 'Закоммитьте файлы доказательств в задаче плана и нажмите «Продолжить».');
    const ci = run.completion?.ci ?? null;
    const proof = [...run.receipts].reverse().find((r) => r.type === 'ci' && r.commit);
    if (ci && !proof) return stage(folder, run, status.head!);
    const commits = automatic.some((entry) => (entry.checks ?? []).length > 0) ? await kitCommits(folder) : [];
    const input = {
      ci: ci ? { checks: [...ci.requiredChecks], sha: proof!.commit! } : null,
      criteria: automatic.map((entry) => ({ criterion: entry.criterion, checks: (entry.checks ?? []).flatMap((id) => commits.map((commit) => ({ commit, id }))), evidence: [...(entry.evidence ?? [])] })),
      head: status.head!,
    };
    const scope = await deps.kit.scope(folder);
    const step = await deps.kit.host(folder, {
      operation: 'accept', runId: run.runId, scopeId: run.scopeId!, ownerSession: scope?.ownerSession ?? null, input, file: true,
      args: (file, revision) => ['accept', '--autopilot-run', run.runId, '--input', file!, '--expected-revision', String(revision)],
    });
    const tickets = step.redeemed ? [step.ticketId] : [];
    if (step.ok) {
      const sha = (step.result?.['commit'] as { sha?: string } | null)?.sha ?? null;
      log(`autopiloting: ${run.runId} accepted ${run.scopeId}`);
      return update(folder, run, (r) => ({ ...r, phase: 'closing', tickets: [...r.tickets, ...tickets], receipts: [...r.receipts, receipt(`accept:${r.scopeId}`, 'accept', sha, `automatic acceptance by run ${r.runId}`)] }));
    }
    const current = tickets.length ? await update(folder, run, (r) => ({ ...r, tickets: [...r.tickets, ...tickets] })) : run;
    // CI of another SHA than the docs-only past of HEAD: the service checks HEAD itself.
    if (ci && step.code === 'AUTOPILOT_EVIDENCE_REQUIRED' && step.details && 'absent' in step.details && proof?.commit !== status.head) return stage(folder, current, status.head!);
    return block(folder, current, `${step.code}: ${step.message}`, step.code === 'AUTOPILOT_MANUAL_REQUIRED' ? COMPLETE_TEXTS.manual : COMPLETE_TEXTS.retry);
  }

  async function close(folder: string, run: RunRecord, status: RunKitStatus): Promise<RunRecord | null> {
    if (status.scope === 'NONE') {
      const sha = await closedBy(folder, run.runId);
      if (!sha) return block(folder, run, 'closed-elsewhere', COMPLETE_TEXTS.closedElsewhere);
      return update(folder, run, (r) => ({ ...r, phase: 'publishing', completion: { ...r.completion!, finalSha: sha }, receipts: has(r, `close:${r.scopeId}`) ? r.receipts : [...r.receipts, receipt(`close:${r.scopeId}`, 'close', sha, 'closed (fact of the history)')] }));
    }
    if (status.delivery !== 'ACCEPTED' || !live(status, run) || !status.authorization?.close) return block(folder, run, 'not-accepted: scope не принят или разрешение не включает закрытие');
    if (status.transactionPending) return null;
    const scope = await deps.kit.scope(folder);
    const step = await deps.kit.host(folder, {
      operation: 'close', runId: run.runId, scopeId: run.scopeId!, ownerSession: scope?.ownerSession ?? null, input: { runId: run.runId, scopeId: run.scopeId }, file: false,
      args: (_file, revision) => ['close', '--scope', run.scopeId!, '--autopilot-run', run.runId, '--expected-revision', String(revision)],
    });
    const tickets = step.redeemed ? [step.ticketId] : [];
    if (!step.ok) {
      const current = tickets.length ? await update(folder, run, (r) => ({ ...r, tickets: [...r.tickets, ...tickets] })) : run;
      return block(folder, current, `${step.code}: ${step.message}`, step.code === 'DIRTY_TREE' ? PUBLISH_NEXT['worktree-dirty']! : COMPLETE_TEXTS.retry);
    }
    const sha = (step.result?.['commit'] as { sha?: string } | null)?.sha ?? (await head(folder));
    log(`autopiloting: ${run.runId} closed ${run.scopeId} at ${sha}`);
    return update(folder, run, (r) => ({ ...r, phase: 'publishing', tickets: [...r.tickets, ...tickets], completion: { ...r.completion!, finalSha: sha }, receipts: [...r.receipts, receipt(`close:${r.scopeId}`, 'close', sha, `closed by run ${r.runId}`)] }));
  }

  async function publish(folder: string, run: RunRecord, status: RunKitStatus): Promise<RunRecord | null> {
    const completion = run.completion;
    const sha = completion?.finalSha;
    if (!sha) return block(folder, run, 'no-final-sha: нет коммита закрытия запуска');
    if (status.scope !== 'NONE') return block(folder, run, 'scope-changed', COMPLETE_TEXTS.scopeChanged);
    if (!completion.publication) return block(folder, run, 'no-upstream', COMPLETE_TEXTS.noUpstream);
    if (completion.ci?.exactSha && !greenFor(run, sha)) return stage(folder, run, sha);
    const actionId = `publish:${sha}`;
    if (!due(run, actionId)) return null;
    try {
      const done = await deps.publisher.publish(folder, false, { sha, branch: completion.publication.branch, upstream: completion.publication.upstream });
      log(`autopiloting: ${run.runId} published ${sha} to ${completion.publication.upstream}`);
      return update(folder, run, (r) => ({
        ...r, phase: 'completed', pausedFrom: null, reason: null, nextAction: null, retries: {},
        completion: { ...r.completion!, published: { sha, upstream: completion.publication!.upstream, commits: done.commits ?? 0, already: done.already, at: now().toISOString() } },
        receipts: [...r.receipts, receipt(actionId, 'publish', sha, done.already ? `${completion.publication!.upstream} already had ${sha} (verified after fetch)` : `pushed to ${completion.publication!.upstream}, verified after fetch`)],
      }));
    } catch (error) {
      return failed(folder, run, actionId, error);
    }
  }

  /** One step of the run from the facts, or null when nothing can be done now. */
  async function step(folder: string, run: RunRecord): Promise<RunRecord | null> {
    const status = await deps.kit.status(folder);
    if (!status) return null;
    if (run.phase === 'executing' || run.phase === 'delivering') {
      if (status.scope !== 'ACTIVE' || !live(status, run)) return null;
      const snapshot = { ci: (status.authorization!.ci ?? null) as NonNullable<RunRecord['completion']>['ci'], publication: run.authority!.publication, finalSha: null };
      if (status.delivery === 'READY_FOR_ACCEPTANCE') {
        if (!status.authorization!.accept) return run.nextAction === COMPLETE_TEXTS.manual ? null : update(folder, run, (r) => ({ ...r, nextAction: COMPLETE_TEXTS.manual }));
        return update(folder, run, (r) => ({ ...r, phase: 'accepting', completion: snapshot }));
      }
      if (status.delivery === 'ACCEPTED' && status.authorization!.close) return update(folder, run, (r) => ({ ...r, phase: 'closing', nextAction: null, completion: r.completion ?? snapshot }));
      return null;
    }
    if (run.phase === 'accepting') return accept(folder, run, status);
    if (run.phase === 'closing') return close(folder, run, status);
    if (run.phase === 'publishing') return publish(folder, run, status);
    return null;
  }

  async function advance(projectId: string): Promise<RunRecord | null> {
    const folder = await deps.projectPath(projectId);
    if (!folder) return null;
    return serial(projectId, async () => {
      let run = await deps.journal.active(folder);
      // accept → close → stage/publish in one pass; every step re-reads the facts.
      for (let i = 0; i < 6 && run && run.authority && !run.authority.revocation && ACTING.has(run.phase); i += 1) {
        const next = await step(folder, run);
        if (!next || (next.phase === run.phase && next.revision === run.revision)) break;
        run = next;
      }
      return run;
    });
  }

  return {
    advance,
    /** Every project with a run (a timer of the service and the start after a restart). */
    async advanceAll(): Promise<void> {
      for (const project of await deps.listProjects()) {
        await advance(project.id).catch((error: unknown) => log(`autopiloting: completion of ${project.id}: ${error instanceof Error ? error.message : String(error)}`));
      }
    },
  };
}

export type RunCompleter = ReturnType<typeof createRunCompletion>;
