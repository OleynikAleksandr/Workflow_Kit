// The preparation of a full autopiloting run (spec M39 runtime 3, controls 1): from the user's
// direct instruction to the started plan without a card. One reconciler per project reads the
// run, Kit (`autopilot:status`, `status`, `scope:proposal --digest`) and the cross review, and
// takes at most one next step: wait for the proposal, wait for the review, choose the
// recommended mode with `--expected-digest` of the agreed (or, without review, current)
// version, start the plan through the same service action as the button. Triggers: a finished
// turn, a finished review, the service start. «После ручного запуска Плана» never gets here.
import type { KitChoiceOption, KitProposalDigest } from '#plan-view';
import type { KeyedMutex } from '#data-store';
import type { ChooseRequest } from './autopilot-types.ts';
import type { RunJournal, RunRecord } from './run-journal.ts';
import type { RunKit } from './run-kit.ts';

/** The cross review of the owner's proposal as the reconciler needs it. */
export interface ReviewFact {
  status: 'preparing' | 'starting' | 'reviewing' | 'answering' | 'agreed' | 'disagreed' | 'failed' | 'cancelled';
  scopeId: string | null;
  reason: string | null;
  reviewedProposal: { scopeId: string | null; generation: number; digest: string } | null;
}

/** The service actions of the panel buttons the reconciler presses (the autopilot). */
export interface PrepareActions {
  choose(projectId: string, request: ChooseRequest): Promise<unknown>;
  start(projectId: string, session?: string): Promise<{ owner: string; already?: boolean; runId?: string }>;
}

export interface PreparationDeps {
  journal: RunJournal;
  kit: RunKit;
  projectPath(projectId: string): Promise<string | undefined>;
  /** The review of a main session (cross-review `get`), or null. */
  review(projectId: string, key: string): ReviewFact | null;
  /** The effective review decision of the session (plan-review): it wins over the run snapshot. */
  reviewOn(projectId: string, key: string): boolean;
  /** Whether a provider may run executors (its orchestration capability). */
  orchestration?(client: string): Promise<{ available: boolean; reason?: string }>;
  actions(): PrepareActions | null;
  mutex?: KeyedMutex;
  log?: (line: string) => void;
  now?: () => Date;
}

/** The phases the reconciler acts in; any other (paused, blocked, executing, stopped…) is left alone. */
const PREPARING: ReadonlySet<RunRecord['phase']> = new Set(['preparing', 'reviewing', 'choosing', 'starting']);

export const PREPARE_TEXTS = {
  reviewFailed: (status: string, reason: string | null) => `Ревью плана не согласовано (${status}${reason ? `: ${reason}` : ''}): план не запущен автоматически.`,
  changed: 'Предложение или его документы изменились после согласия ревью: допуск отменён, план не запущен.',
  scopeChanged: 'В проекте выбран другой план или другой владелец: автопилот этого запуска его не запускает.',
  next: 'Повторите ревью или запустите план вручную кнопками карточки.',
  noOption: 'Рекомендованный способ выполнения недоступен, последовательное выполнение план не допускает.',
} as const;

export function createPreparation(deps: PreparationDeps) {
  const log = deps.log ?? (() => undefined);
  const now = deps.now ?? (() => new Date());
  const serial = <T>(projectId: string, action: () => Promise<T>): Promise<T> => (deps.mutex ? deps.mutex.run(`project:${projectId}`, action) : action());

  /** The run again after an await: null when it stopped, paused or left the preparation meanwhile. */
  async function still(folder: string, run: RunRecord): Promise<RunRecord | null> {
    const current = await deps.journal.read(folder, run.runId);
    return current && PREPARING.has(current.phase) ? current : null;
  }

  const block = (folder: string, run: RunRecord, reason: string, nextAction: string = PREPARE_TEXTS.next): Promise<RunRecord> =>
    deps.journal.update(folder, run.runId, (r) => ({ ...r, phase: 'blocked', pausedFrom: r.phase, reason, nextAction }));

  const phase = (folder: string, run: RunRecord, next: RunRecord['phase']): Promise<RunRecord> =>
    deps.journal.update(folder, run.runId, (r) => (r.phase === next ? null : { ...r, phase: next }));

  /** Picks the recommended mode; orchestration without the provider's capability falls back to sequential. */
  async function option(run: RunRecord, folder: string): Promise<{ option: KitChoiceOption; why: string } | null> {
    const proposal = await deps.kit.proposal(folder);
    const recommended = proposal?.recommended ?? 'sequential';
    if (recommended !== 'orchestrated') return { option: recommended, why: 'recommended by the plan' };
    const capability = (await deps.orchestration?.(run.owner.client).catch(() => ({ available: false, reason: 'unknown' }))) ?? { available: true };
    if (capability.available) return { option: 'orchestrated', why: 'recommended by the plan' };
    if (!proposal?.options.includes('sequential')) return null;
    return { option: 'sequential', why: `orchestration is unavailable for ${run.owner.client} (${capability.reason ?? 'no capability'}); sequential fallback` };
  }

  /** Chooses the agreed version and starts it (the same service actions as the buttons). */
  async function chooseAndStart(folder: string, run: RunRecord, version: KitProposalDigest, review: 'agreed' | 'skipped-by-setting'): Promise<RunRecord | null> {
    const actions = deps.actions();
    if (!actions) return run;
    const picked = await option(run, folder);
    if (!picked) return block(folder, run, PREPARE_TEXTS.noOption);
    const actionId = `choose:${version.generation}:${version.proposalDigest.slice(0, 16)}`;
    let current = await deps.journal.update(folder, run.runId, (r) => ({
      ...r,
      phase: 'choosing',
      proposal: { scopeId: version.scopeId ?? '', generation: version.generation, digest: version.proposalDigest },
      pendingAction: { actionId, type: 'choose', stage: 'intent' },
      receipts: r.receipts.some((x) => x.actionId === `review:${version.proposalDigest}`)
        ? r.receipts
        : [...r.receipts, { actionId: `review:${version.proposalDigest}`, type: 'review', at: now().toISOString(), commit: null, detail: review }],
    }));
    const note = `Автоматический выбор по поручению ${run.runId}: ${picked.option} (${picked.why}; ревью: ${review})`;
    try {
      await actions.choose(run.projectId, { session: run.owner.key, generation: version.generation, option: picked.option, expectedDigest: version.proposalDigest, automatic: { runId: run.runId, note } });
    } catch (error) {
      const code = (error as { code?: string }).code ?? 'choose-failed';
      log(`autopiloting: ${run.runId} choose refused: ${code}`);
      return block(folder, current, code === 'PROPOSAL_CHANGED' ? PREPARE_TEXTS.changed : `${code}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const scope = await deps.kit.scope(folder);
    current = await deps.journal.update(folder, run.runId, (r) => ({
      ...r,
      phase: 'starting',
      scopeId: scope?.id ?? version.scopeId,
      pendingAction: null,
      receipts: [...r.receipts, { actionId, type: 'choose', at: now().toISOString(), commit: null, detail: note }],
    }));
    return start(folder, current);
  }

  async function start(folder: string, run: RunRecord): Promise<RunRecord | null> {
    const actions = deps.actions();
    const fresh = await still(folder, run);
    if (!actions || !fresh) return fresh;
    try {
      await actions.start(run.projectId, run.owner.key);
    } catch (error) {
      const code = (error as { code?: string }).code ?? 'start-failed';
      return block(folder, (await deps.journal.read(folder, run.runId)) ?? fresh, `${code}: ${error instanceof Error ? error.message : String(error)}`);
    }
    return deps.journal.read(folder, run.runId);
  }

  async function step(projectId: string): Promise<RunRecord | null> {
    const folder = await deps.projectPath(projectId);
    if (!folder) return null;
    const run = await deps.journal.active(folder);
    if (!run || run.mode !== 'full' || !PREPARING.has(run.phase)) return run;
    const status = await deps.kit.status(folder);
    if (!status || !deps.kit.supported(status).ready) return run;
    const scope = await deps.kit.scope(folder);
    if (scope) {
      // A chosen plan: this run's (its owner, its proposal) is started, any other is not taken over.
      const own = scope.ownerSession === run.owner.sessionId && (run.scopeId === null || run.scopeId === scope.id);
      if (!own) return block(folder, run, PREPARE_TEXTS.scopeChanged, 'Запустите новый запуск после окончания этого плана.');
      const grant = status.authorization;
      if (grant && grant.runId === run.runId && !grant.revoked) return deps.journal.update(folder, run.runId, (r) => (r.phase === 'executing' ? null : { ...r, phase: 'executing', scopeId: scope.id }));
      return start(folder, await deps.journal.update(folder, run.runId, (r) => ({ ...r, phase: 'starting', scopeId: scope.id })));
    }
    const version = await deps.kit.digest(folder);
    if (!version) return phase(folder, run, 'preparing');
    if (!deps.reviewOn(projectId, run.owner.key)) return chooseAndStart(folder, run, version, 'skipped-by-setting');
    const review = deps.review(projectId, run.owner.key);
    if (!review || review.scopeId !== version.scopeId || !['agreed', 'disagreed', 'failed', 'cancelled'].includes(review.status)) return phase(folder, run, 'reviewing');
    if (review.status !== 'agreed') return block(folder, run, PREPARE_TEXTS.reviewFailed(review.status, review.reason));
    if (review.reviewedProposal?.digest !== version.proposalDigest || review.reviewedProposal.generation !== version.generation) return block(folder, run, PREPARE_TEXTS.changed);
    return chooseAndStart(folder, run, version, 'agreed');
  }

  return {
    /** One step of the project's full run, serialized with the panel actions; errors are logged. */
    reconcile(projectId: string): Promise<RunRecord | null> {
      return serial(projectId, () => step(projectId)).catch((error: unknown) => {
        log(`autopiloting: ${projectId} preparation: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      });
    },
  };
}

export type Preparation = ReturnType<typeof createPreparation>;
