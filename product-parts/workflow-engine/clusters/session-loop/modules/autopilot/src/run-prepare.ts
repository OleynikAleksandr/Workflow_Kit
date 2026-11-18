// The preparation of a full autopiloting run (spec M39 runtime 3, controls 1): from the user's
// direct instruction to the started plan without a card. One reconciler per project reads the
// run, Kit (`autopilot:status`, `status`, `scope:proposal --digest`) and the cross review, and
// takes at most one next step: wait for the proposal, wait for the review, choose the
// recommended mode with `--expected-digest` of the agreed (or, without review, current)
// version, start the plan through the same service action as the button. Triggers: a finished
// turn, a finished review, the service start. «После ручного запуска Плана» never gets here.
// M40: the plan is started once per scope (a receipt `start:<scope>`); a plan without the
// `automation` block or without a grant after its start stops the run with a reason instead of
// a start message after every turn; a proposal without the block is neither reviewed nor chosen
// (run-proposal.ts returns it to its author); a run whose scope is gone is finished (run-end.ts).
import type { KitChoiceOption, KitProposalDigest } from '#plan-view';
import type { KeyedMutex } from '#data-store';
import type { ChooseRequest } from './autopilot-types.ts';
import type { RunJournal, RunRecord } from './run-journal.ts';
import type { RunKit } from './run-kit.ts';
import { settleRunEnd } from './run-end.ts';
import { proposalLacksAutomation, stopRun } from './run-proposal.ts';

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
  /**
   * M44: writes the grant of the run again (`runs.beginExecution`) when the plan was started but
   * Kit holds no grant of the run; without it such a run stops at once (M40).
   */
  authorize?(projectId: string, key: string): Promise<unknown>;
  mutex?: KeyedMutex;
  log?: (line: string) => void;
  now?: () => Date;
}

/** The phases the reconciler acts in; any other (paused, blocked, executing, stopped…) is left alone. */
const PREPARING: ReadonlySet<RunRecord['phase']> = new Set(['preparing', 'reviewing', 'choosing', 'starting']);

/** M44: attempts of the start (and of the grant after it) before the run is blocked. */
export const START_ATTEMPTS = 3;

export const PREPARE_TEXTS = {
  reviewFailed: (status: string, reason: string | null) => `Ревью плана не согласовано (${status}${reason ? `: ${reason}` : ''}): план не запущен автоматически.`,
  changed: 'Предложение или его документы изменились после согласия ревью: допуск отменён, план не запущен.',
  scopeChanged: 'В проекте выбран другой план или другой владелец: автопилот этого запуска его не запускает.',
  next: 'Повторите ревью или запустите план вручную кнопками карточки.',
  noOption: 'Рекомендованный способ выполнения недоступен, последовательное выполнение план не допускает.',
  retry: 'Нажмите «Продолжить» — служба снова попросит разрешение Kit, — или запустите план кнопками карточки.',
} as const;

/** The Kit code and text of a refused step, as one line. */
function causeOf(error: unknown, fallback: string): string {
  const code = (error as { code?: string }).code ?? fallback;
  return `${code}: ${error instanceof Error ? error.message : String(error)}`;
}

export function createPreparation(deps: PreparationDeps) {
  const log = deps.log ?? (() => undefined);
  const now = deps.now ?? (() => new Date());
  const serial = <T>(projectId: string, action: () => Promise<T>): Promise<T> => (deps.mutex ? deps.mutex.run(`project:${projectId}`, action) : action());

  /** The run again after an await: null when it stopped, paused or left the preparation meanwhile. */
  async function still(folder: string, run: RunRecord): Promise<RunRecord | null> {
    const current = await deps.journal.read(folder, run.runId);
    return current && PREPARING.has(current.phase) ? current : null;
  }

  // M44: a second block (the grant already blocked the run) keeps the phase the run came from.
  /**
   * M44: a refused start or grant is tried again by the next step (a finished turn, the minute
   * tick) up to START_ATTEMPTS times; then the run is blocked `authorization-missing: <cause>`.
   */
  async function retry(folder: string, run: RunRecord, kind: 'start' | 'grant', cause: string): Promise<RunRecord> {
    const current = (await deps.journal.read(folder, run.runId)) ?? run;
    const count = (current.retries?.[kind]?.count ?? 0) + 1;
    if (count >= START_ATTEMPTS) {
      log(`autopiloting: ${run.runId} ${kind} failed ${count} times: ${cause}`);
      return block(folder, current, `authorization-missing: ${cause}`, PREPARE_TEXTS.retry);
    }
    log(`autopiloting: ${run.runId} ${kind} attempt ${count}/${START_ATTEMPTS} failed: ${cause}; the next step retries`);
    return deps.journal.advance(folder, run.runId, (r) => ({
      ...r,
      phase: 'starting',
      pausedFrom: null,
      reason: `${cause} (attempt ${count}/${START_ATTEMPTS})`,
      retries: { ...(r.retries ?? {}), [kind]: { count, nextAt: now().toISOString(), error: cause } },
    }));
  }

  const block = (folder: string, run: RunRecord, reason: string, nextAction: string = PREPARE_TEXTS.next): Promise<RunRecord> => {
    log(`autopiloting: ${run.runId} blocked: ${reason}`);
    return deps.journal.advance(folder, run.runId, (r) => ({ ...r, phase: 'blocked', pausedFrom: r.phase === 'blocked' ? r.pausedFrom : r.phase, reason, nextAction }));
  };

  const phase = (folder: string, run: RunRecord, next: RunRecord['phase']): Promise<RunRecord> =>
    deps.journal.advance(folder, run.runId, (r) => (r.phase === next ? null : { ...r, phase: next }));

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
    let current = await deps.journal.advance(folder, run.runId, (r) => ({
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
      // M40: the run was paused, stopped or revoked before the ticket — it keeps that state.
      if (code === 'run-not-live') return null;
      return block(folder, current, code === 'PROPOSAL_CHANGED' || code === 'DECISION_STALE' ? PREPARE_TEXTS.changed : `${code}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const scope = await deps.kit.scope(folder);
    current = await deps.journal.advance(folder, run.runId, (r) => ({
      ...r,
      phase: 'starting',
      scopeId: scope?.id ?? version.scopeId,
      pendingAction: null,
      receipts: [...r.receipts, { actionId, type: 'choose', at: now().toISOString(), commit: null, detail: note }],
    }));
    return start(folder, current);
  }

  /**
   * Starts the chosen plan once: the receipt `start:<scope>` keeps a later step from sending the
   * start message again. A plan the run cannot be authorized for stops the run with the reason.
   */
  async function start(folder: string, run: RunRecord): Promise<RunRecord | null> {
    const actions = deps.actions();
    const fresh = await still(folder, run);
    // M44: no silent exit — every outcome of the start is in the service log.
    if (!actions || !fresh) {
      log(`autopiloting: ${run.runId} start skipped: ${!actions ? 'the panel actions are not attached yet' : 'the run left the preparation'}`);
      return fresh;
    }
    const scope = await deps.kit.scope(folder);
    if (!scope) {
      log(`autopiloting: ${run.runId} start skipped: Kit reports no scope yet; the next step retries`);
      return fresh;
    }
    if (!scope.automation) {
      log(`autopiloting: ${run.runId} stopped: scope ${scope.id} has no automation block`);
      return stopRun(deps.journal, folder, fresh, 'automation-missing');
    }
    const actionId = `start:${scope.id}`;
    if (fresh.receipts.some((receipt) => receipt.actionId === actionId)) {
      if (!deps.authorize) {
        log(`autopiloting: ${run.runId} stopped: scope ${scope.id} was started but has no grant of the run`);
        return stopRun(deps.journal, folder, fresh, 'authorization-missing');
      }
      // M44: the plan was started, Kit holds no grant of the run: write the grant again.
      try {
        await deps.authorize(run.projectId, run.owner.key);
      } catch (error) {
        return retry(folder, fresh, 'grant', causeOf(error, 'grant-failed'));
      }
      const granted = (await deps.kit.status(folder))?.authorization;
      if (!granted || granted.runId !== run.runId || granted.revoked) return retry(folder, fresh, 'grant', 'Kit holds no grant of the run after autopilot:authorize');
      log(`autopiloting: ${run.runId} grant restored for the started scope ${scope.id}`);
      return deps.journal.advance(folder, run.runId, (r) => ({ ...r, phase: 'executing', reason: null, retries: {} }));
    }
    try {
      await actions.start(run.projectId, run.owner.key);
    } catch (error) {
      return retry(folder, fresh, 'start', causeOf(error, 'start-failed'));
    }
    const revision = (await deps.kit.status(folder))?.revision ?? null;
    log(`autopiloting: ${run.runId} started scope ${scope.id} (plan revision ${revision ?? 'unknown'})`);
    return deps.journal.advance(folder, run.runId, (r) =>
      r.receipts.some((receipt) => receipt.actionId === actionId)
        ? null
        : { ...r, reason: null, retries: {}, receipts: [...r.receipts, { actionId, type: 'start', at: now().toISOString(), commit: null, detail: `scope ${scope.id}, plan revision ${revision ?? 'unknown'}` }] },
    );
  }

  async function step(projectId: string): Promise<RunRecord | null> {
    const folder = await deps.projectPath(projectId);
    if (!folder) return null;
    const active = await deps.journal.active(folder);
    // M40: a run whose scope the user closed by hand ends here, whatever its phase.
    const run = active ? await settleRunEnd({ journal: deps.journal, kit: deps.kit, log }, folder, active) : null;
    if (!run || run.mode !== 'full' || !PREPARING.has(run.phase)) return run;
    const status = await deps.kit.status(folder);
    if (!status || !deps.kit.supported(status).ready) return run;
    const scope = await deps.kit.scope(folder);
    if (scope) {
      // A chosen plan: this run's (its owner, its proposal) is started, any other is not taken over.
      const own = scope.ownerSession === run.owner.sessionId && (run.scopeId === null || run.scopeId === scope.id);
      if (!own) return block(folder, run, PREPARE_TEXTS.scopeChanged, 'Запустите новый запуск после окончания этого плана.');
      const grant = status.authorization;
      if (grant && grant.runId === run.runId && !grant.revoked) return deps.journal.advance(folder, run.runId, (r) => (r.phase === 'executing' ? null : { ...r, phase: 'executing', scopeId: scope.id }));
      return start(folder, await deps.journal.advance(folder, run.runId, (r) => ({ ...r, phase: 'starting', scopeId: scope.id })));
    }
    const version = await deps.kit.digest(folder);
    if (!version) return phase(folder, run, 'preparing');
    // M40: no review and no choice for a proposal without the automation block; its author gets
    // it back at the end of the turn (run-proposal.ts).
    if (await proposalLacksAutomation(deps.kit, folder)) return phase(folder, run, 'preparing');
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
