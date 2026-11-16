// Autopiloting runs (spec M39 runtime sections 1–2): a run is the user's advance instruction for
// one project, recorded with its real source before anything acts on it. A direct instruction
// (`wfk session plan --authorized`) is accepted only when its quote is in the words the user
// really wrote to the session; a review, reminder or service message never authorizes. The manual
// start in the mode «После ручного запуска Плана» records the Kit grant through the host ticket
// before the first work message; Settings off pauses every run for good (resumable only by the
// user). The policy of a plan (automatic, manual acceptance, legacy, Kit update) is told ahead.
import type { UserWords } from '#agent-channel';
import type { KeyedMutex } from '#data-store';
import { UPDATE_KIT_TEXT } from '#plan-view';
import { WorkflowActionError } from './autopilot-types.ts';
import type { HostTickets } from './host-ticket.ts';
import { FINAL_PHASES } from './run-journal.ts';
import type { RunJournal, RunRecord, RunSource } from './run-journal.ts';
import type { RunKit, RunKitStatus, RunScope } from './run-kit.ts';
import type { AutopilotingMode, SettingsChange, SettingsStore } from './settings.ts';
import { POLICY_TEXTS, grantNote, preparationText } from './run-texts.ts';

export type StartPolicyKind = 'off' | 'automatic' | 'manual-acceptance' | 'legacy' | 'kit-update-required';

/** What the start of a plan will do, shown before the user presses it (spec M39 controls 3). */
export interface StartPolicy {
  mode: AutopilotingMode;
  policy: StartPolicyKind;
  text: string;
  /** Criterion numbers (1-based) that only the user accepts. */
  manualCriteria: number[];
}

export interface PreparationResult {
  action: 'prepare';
  runId: string | null;
  mode: AutopilotingMode;
  review: boolean;
  policy: AutopilotingMode | 'kit-update-required';
  /** The instruction the agent reads (English, like every agent text). */
  instruction: string;
}

/** A run as the panel state shows it: no quotes of the user's words. */
export interface RunBrief {
  runId: string;
  mode: RunRecord['mode'];
  phase: RunRecord['phase'];
  reason: string | null;
  source: RunRecord['request']['source'];
  scopeId: string | null;
  review: boolean;
  updatedAt: string;
}

export interface RunsOptions {
  settings: SettingsStore;
  journal: RunJournal;
  kit: RunKit;
  tickets: HostTickets;
  /** The recent words the user wrote to a session (agent-channel `userWords`). */
  words: (key: string) => UserWords[];
  projectPath: (projectId: string) => Promise<string | undefined>;
  listProjects: () => Promise<Array<{ id: string; path: string }>>;
  /** Stores the review decision of the session (plan-review), so no plan question opens. */
  /**
   * Stores the review decision of the session (plan-review) when it has none yet and returns the
   * effective one: a decision the session already has wins over the Settings default (T006).
   */
  decideReview?: (projectId: string, key: string, on: boolean) => Promise<boolean | void>;
  /** Serializes the work on a project with the panel actions (key `project:<id>`). */
  mutex?: KeyedMutex;
  log?: (line: string) => void;
}

export interface Runs {
  /** Restores the redeemed tickets and the briefs of every project's runs (service start). */
  load(): Promise<void>;
  authorizePreparation(projectId: string, key: string, summary: string, quote: string): Promise<PreparationResult>;
  /** The user's answer on the plan question card: in full mode review/plan register a run. */
  planDecision(projectId: string, key: string, choice: 'review' | 'plan' | 'talk', summary: string): Promise<RunRecord | null>;
  policy(projectId: string): Promise<StartPolicy>;
  /**
   * The manual start: records the grant before the first work message; null for off and legacy
   * plans. Called under the project lock of the panel action (it takes no lock itself), as resume.
   */
  beginExecution(projectId: string, key: string): Promise<RunRecord | null>;
  /**
   * «Продолжить»: a run paused by Settings off gets a new grant revision in the old boundaries; a
   * run paused by the user or blocked goes on from the phase it stopped in (T007).
   */
  resume(projectId: string, key: string): Promise<RunRecord | null>;
  settingsChanged(change: SettingsChange): Promise<void>;
  section(): Promise<{ projects: Record<string, RunBrief> }>;
}

const normalize = (text: string): string => text.replace(/\s+/gu, ' ').trim().toLowerCase();
const idOf = (key: string): string => key.slice(key.indexOf(':') + 1);
const clientOf = (key: string): string => key.slice(0, key.indexOf(':'));
const fail = (code: string, message: string, status = 409, nextAction: string | null = null): never => {
  throw new WorkflowActionError(code, message, status, nextAction);
};

function brief(run: RunRecord): RunBrief {
  return { runId: run.runId, mode: run.mode, phase: run.phase, reason: run.reason, source: run.request.source, scopeId: run.scopeId, review: run.review, updatedAt: run.updatedAt };
}

function live(status: RunKitStatus | null, run: RunRecord): boolean {
  const grant = status?.authorization;
  return Boolean(grant && grant.runId === run.runId && !grant.revoked && status?.proposal);
}

export function createRuns(options: RunsOptions): Runs {
  const log = options.log ?? (() => undefined);
  const briefs = new Map<string, RunBrief>();
  const remember = (run: RunRecord): RunRecord => (briefs.set(run.projectId, brief(run)), run);
  const serial = <T>(projectId: string, action: () => Promise<T>): Promise<T> => (options.mutex ? options.mutex.run(`project:${projectId}`, action) : action());

  async function root(projectId: string): Promise<string> {
    return (await options.projectPath(projectId)) ?? fail('project-not-found', 'Проект не найден', 404);
  }

  async function decideReview(projectId: string, key: string, on: boolean): Promise<boolean> {
    const effective = await options.decideReview?.(projectId, key, on).catch((error: unknown) => log(`autopiloting: review decision of ${key} kept: ${error instanceof Error ? error.message : String(error)}`));
    return typeof effective === 'boolean' ? effective : on;
  }

  async function policyOf(projectId: string, mode: AutopilotingMode): Promise<StartPolicy> {
    if (mode === 'off') return { mode, policy: 'off', text: POLICY_TEXTS.off, manualCriteria: [] };
    const status = await options.kit.status(await root(projectId));
    if (!options.kit.supported(status).ready) return { mode, policy: 'kit-update-required', text: `${UPDATE_KIT_TEXT} ${POLICY_TEXTS.legacy}`, manualCriteria: [] };
    if (!status?.acceptance) return { mode, policy: 'legacy', text: POLICY_TEXTS.legacy, manualCriteria: [] };
    const manual = status.acceptance.filter((entry) => entry.kind === 'manual').map((entry) => entry.criterion + 1);
    return manual.length > 0
      ? { mode, policy: 'manual-acceptance', text: POLICY_TEXTS.manual(manual), manualCriteria: manual }
      : { mode, policy: 'automatic', text: POLICY_TEXTS[mode], manualCriteria: [] };
  }

  /** The grant of the run for the scope: written through the host ticket; the run records it. */
  async function grant(folder: string, run: RunRecord, scope: RunScope, status: RunKitStatus, source: RunSource, note: string): Promise<RunRecord> {
    const automation = scope.automation!;
    const manual = automation.acceptance.some((entry) => entry.kind === 'manual');
    const input = {
      accept: !manual,
      acceptancePolicy: manual ? 'manual' : 'automatic',
      ci: automation.ci,
      close: true,
      deliveryTaskIds: automation.delivery.map((entry) => entry.taskId),
      mode: run.mode,
      note,
      ownerSession: scope.ownerSession,
      proposalDigest: status.proposal!.digest,
      publication: automation.publication,
      runId: run.runId,
      scopeId: scope.id,
      source,
    };
    const step = await options.kit.host(folder, {
      operation: 'autopilot:authorize',
      runId: run.runId,
      scopeId: scope.id,
      ownerSession: scope.ownerSession,
      input,
      file: true,
      args: (file, revision) => ['autopilot:authorize', '--input', file!, '--expected-revision', String(revision)],
    });
    const tickets = step.redeemed ? [step.ticketId] : [];
    if (!step.ok) {
      await options.journal.update(folder, run.runId, (r) => ({ ...r, phase: 'blocked', pausedFrom: r.phase, reason: `${step.code}: ${step.message}`, tickets: [...r.tickets, ...tickets] })).then(remember);
      return fail(step.code ?? 'grant-failed', `Kit не записал разрешение запуска: ${step.message ?? step.code}`, 409, 'Проверьте план и нажмите «Начать выполнение плана» ещё раз.');
    }
    const written = step.result?.['grant'] as { revision: number } | undefined;
    const commit = (step.result?.['commit'] as { sha?: string } | null)?.sha ?? null;
    return remember(
      await options.journal.update(folder, run.runId, (r) => ({
        ...r,
        scopeId: scope.id,
        proposal: { scopeId: scope.id, generation: status.proposal!.generation, digest: status.proposal!.digest },
        authority: {
          grantRevision: written?.revision ?? 1,
          deliveryTaskIds: input.deliveryTaskIds,
          accept: input.accept,
          close: true,
          publication: automation.publication,
          acceptancePolicy: manual ? 'manual' : 'automatic',
          baseHead: status.head,
          revocation: null,
        },
        phase: 'executing',
        pausedFrom: null,
        reason: null,
        tickets: [...r.tickets, ...tickets],
        receipts: [...r.receipts, { actionId: `authorize:${written?.revision ?? 1}`, type: 'authorize', at: new Date().toISOString(), commit, detail: source }],
      })),
    );
  }

  return {
    async load() {
      for (const project of await options.listProjects()) {
        const runs = await options.journal.list(project.path).catch(() => []);
        options.tickets.restore(runs.flatMap((run) => run.tickets));
        const last = runs.at(-1);
        if (last) briefs.set(project.id, brief(last));
      }
    },

    authorizePreparation: (projectId, key, summary, quote) =>
      serial(projectId, async () => {
        if (quote.trim().length < 3) fail('bad-request', 'Нужны точные слова пользователя в --authorized', 400);
        const latest = options.words(key).at(-1);
        if (!latest) {
          fail('authorization-source-missing', 'Служба не получила текст пользователя этой сессии: разрешение не записано.', 409, 'Покажите вопрос о плане без --authorized: `wfk session plan "<что собираемся сделать>"`.');
        }
        if (!normalize(latest!.text).includes(normalize(quote))) {
          fail('authorization-quote-mismatch', 'Этих слов нет в последнем сообщении пользователя: разрешение не записано.', 409, 'Передайте в --authorized точные слова из последнего сообщения пользователя или задайте вопрос о плане.');
        }
        const { settings } = await options.settings.read();
        const folder = await root(projectId);
        const review = await decideReview(projectId, key, settings.review);
        if (settings.mode !== 'full') {
          return { action: 'prepare', runId: null, mode: settings.mode, review, policy: settings.mode, instruction: preparationText(settings.mode, review, null) };
        }
        if (!options.kit.supported(await options.kit.status(folder)).ready) {
          return { action: 'prepare', runId: null, mode: 'full', review, policy: 'kit-update-required', instruction: preparationText('kit-update-required', review, null) };
        }
        const active = await options.journal.active(folder);
        if (active && active.owner.key === key && active.request.at === latest!.at && active.request.source === 'user-command') {
          return { action: 'prepare', runId: active.runId, mode: 'full', review: active.review, policy: 'full', instruction: preparationText('full', active.review, active.runId) };
        }
        if (active) fail('run-active', `В проекте уже идёт запуск автопилота ${active.runId}`, 409, 'Дождитесь его окончания или остановите его в панели.');
        const run = remember(
          await options.journal.create(folder, {
            projectId,
            owner: { key, client: clientOf(key), sessionId: idOf(key) },
            mode: 'full',
            review,
            request: { source: 'user-command', quote: quote.trim(), at: latest!.at, turnId: latest!.turnId, goal: summary.trim() },
            proposal: null,
            scopeId: null,
            authority: null,
            phase: 'preparing',
            pausedFrom: null,
            reason: null,
            nextAction: null,
          }),
        );
        log(`autopiloting: ${projectId} run ${run.runId} registered by the user's instruction in ${key}`);
        return { action: 'prepare', runId: run.runId, mode: 'full', review: run.review, policy: 'full', instruction: preparationText('full', run.review, run.runId) };
      }),

    planDecision: (projectId, key, choice, summary) =>
      serial(projectId, async () => {
        if (choice === 'talk') return null;
        const { settings } = await options.settings.read();
        if (settings.mode !== 'full') return null;
        const folder = await root(projectId);
        if (!options.kit.supported(await options.kit.status(folder)).ready) return null;
        const active = await options.journal.active(folder);
        if (active) return active.owner.key === key ? active : null;
        return remember(
          await options.journal.create(folder, {
            projectId,
            owner: { key, client: clientOf(key), sessionId: idOf(key) },
            mode: 'full',
            review: choice === 'review',
            request: { source: 'plan-decision', quote: choice === 'review' ? 'Спецификация и план с ревью' : 'Спецификация и план без ревью', at: new Date().toISOString(), turnId: null, goal: summary.trim() },
            proposal: null,
            scopeId: null,
            authority: null,
            phase: 'preparing',
            pausedFrom: null,
            reason: null,
            nextAction: null,
          }),
        );
      }),

    async policy(projectId) {
      return policyOf(projectId, (await options.settings.read()).settings.mode);
    },

    async beginExecution(projectId, key) {
      const { settings } = await options.settings.read();
      if (settings.mode === 'off') return null;
      const folder = await root(projectId);
      const policy = await policyOf(projectId, settings.mode);
      if (policy.policy === 'legacy' || policy.policy === 'kit-update-required') return null;
      const status = await options.kit.status(folder);
      const scope = await options.kit.scope(folder);
      if (!status?.proposal || !scope?.automation) return null;
      let run = await options.journal.active(folder);
      if (run && run.scopeId !== null && run.scopeId !== scope.id) {
        fail('run-active', `В проекте ещё идёт запуск автопилота ${run.runId} другого плана`, 409, 'Дождитесь его публикации или остановите его.');
      }
      if (run && FINAL_PHASES.has(run.phase)) run = null;
      if (run?.phase === 'paused' && run.authority?.revocation) {
        fail('run-paused', 'Запуск автопилота приостановлен выключением автопилотирования', 409, 'Нажмите «Продолжить», чтобы продолжить его в прежних границах.');
      }
      if (run && live(status, run)) return run;
      run ??= remember(
        await options.journal.create(folder, {
          projectId,
          owner: { key, client: clientOf(key), sessionId: idOf(key) },
          mode: 'after-start',
          review: settings.review,
          request: { source: 'panel-start', quote: '«Начать выполнение плана»', at: new Date().toISOString(), turnId: null, goal: scope.id },
          proposal: null,
          scopeId: scope.id,
          authority: null,
          phase: 'starting',
          pausedFrom: null,
          reason: null,
          nextAction: null,
        }),
      );
      return grant(folder, run, scope, status, run.request.source, grantNote(run));
    },

    async resume(projectId, key) {
      const folder = await root(projectId);
      const run = await options.journal.active(folder);
      if (!run || (run.phase !== 'paused' && run.phase !== 'blocked')) return null;
      if (!run.authority?.revocation) {
        // A pause of the user or of the M24 stop, or a removed obstacle: the run goes on where it stopped.
        return remember(await options.journal.update(folder, run.runId, (r) => ({ ...r, phase: r.pausedFrom ?? 'executing', pausedFrom: null, reason: null, nextAction: null, noProgress: 0 })));
      }
      if (!run.authority.revocation.resumable) return null;
      const status = await options.kit.status(folder);
      const scope = await options.kit.scope(folder);
      if (!status?.proposal || !scope?.automation || scope.id !== run.scopeId) {
        fail('scope-changed', 'План изменился: прежний запуск автопилота нельзя продолжить', 409, 'Запустите план заново.');
      }
      const note = `The user pressed «Продолжить» for run ${run.runId} paused by Settings off (session ${key})`;
      return grant(folder, { ...run, phase: run.pausedFrom ?? 'executing' }, scope!, status!, 'panel-resume', note);
    },

    async settingsChanged({ before, after }) {
      if (after.mode !== 'off' || before.mode === 'off') return;
      for (const project of await options.listProjects()) {
        await serial(project.id, async () => {
          const run = await options.journal.active(project.path).catch(() => null);
          if (!run || run.phase === 'paused') return;
          let revocation: NonNullable<RunRecord['authority']>['revocation'] = null;
          if (run.authority && !run.authority.revocation) {
            const step = await options.kit.host(project.path, {
              operation: 'autopilot:revoke',
              runId: run.runId,
              scopeId: run.scopeId ?? 'NONE',
              ownerSession: run.owner.sessionId,
              input: { note: 'Settings: autopiloting off', reason: 'settings-off', runId: run.runId },
              file: false,
              args: (_file, revision) => ['autopilot:revoke', '--run', run.runId, '--reason', 'settings-off', '--note', 'Settings: autopiloting off', '--expected-revision', String(revision)],
            });
            if (!step.ok) log(`autopiloting: revoke of ${run.runId} failed: ${step.code} ${step.message}`);
            revocation = { at: new Date().toISOString(), reason: 'settings-off', resumable: true };
            await options.journal.update(project.path, run.runId, (r) => ({ ...r, tickets: step.redeemed ? [...r.tickets, step.ticketId] : r.tickets }));
          }
          remember(
            await options.journal.update(project.path, run.runId, (r) => ({
              ...r,
              phase: 'paused',
              pausedFrom: r.phase,
              reason: 'settings-off',
              nextAction: 'Нажмите «Продолжить», чтобы продолжить запуск в прежних границах.',
              authority: r.authority ? { ...r.authority, revocation: r.authority.revocation ?? revocation } : null,
            })),
          );
          log(`autopiloting: ${project.id} run ${run.runId} paused by Settings off`);
        });
      }
    },

    async section() {
      return { projects: Object.fromEntries(briefs) };
    },
  };
}
