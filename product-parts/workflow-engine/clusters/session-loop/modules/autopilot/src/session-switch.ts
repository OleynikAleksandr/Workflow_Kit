// M48 T002: the session card switches the autopilot of its session at any stage of the task (spec
// M48 3.2). The service reads the stage — the session's run, the project's plan, the open proposal,
// the plan question, the answered question («the agent writes the plan») — and does what the user
// would expect of the new mode there: a full mode registers a run by the press (`session-card`) and
// tells the agent; a started plan with the `automation` block is taken over; a started plan
// without it stays manual, and the card says so honestly. Off pauses the session's run (runs.ts).
import type { KeyedMutex } from '#data-store';
import { FINAL_PHASES, PRE_START } from './run-journal.ts';
import type { RunJournal, RunRecord } from './run-journal.ts';
import type { RunKit } from './run-kit.ts';
import { stopRun } from './run-proposal.ts';
import type { ProposalGate } from './run-proposal.ts';
import { preparationText } from './run-texts.ts';
import type { Runs } from './runs.ts';
import type { SessionSettingsChange, SessionSettingsStore } from './session-settings.ts';
import type { AutopilotingMode } from './settings.ts';

/** Where the task of a session is, as the card tells it. */
export type SessionStage = 'idle' | 'question' | 'writing' | 'proposed' | 'executing' | 'other-plan' | 'run' | 'paused' | 'other-run';

/** What a switch did, for the card (Russian). */
export const SWITCH_TEXTS = {
  idle: 'Полный автопилот включён: с ближайшим заданием агент подготовит план без вопроса, Kit запустит его и доведёт до публикации.',
  question: 'Вопрос о плане закрыт: агент готовит спецификацию и план для полного автопилота.',
  writing: 'Агент получил указание: план для полного автопилота, без вопроса и без ваших кнопок.',
  proposed: 'Автопилот взял предложенный план: выбор способа выполнения и запуск — без ваших кнопок.',
  proposedReview: 'Автопилот взял предложенный план: после ревью он выберет способ выполнения и запустит план.',
  returned: 'Автопилот вернул план агенту: в нём нет описания для автопилота, агент добавит его.',
  adopted: 'Автопилот продолжает начатый план и доводит его до публикации.',
  noAutomation: 'Этот план начат без описания для автопилота: его доводите вы; автопилот возьмёт следующий план сессии.',
  otherPlan: 'Открытый план проекта ведёт другая сессия: автопилот этой сессии возьмёт её следующий план.',
  otherRun: 'В проекте идёт запуск автопилота другой сессии: автопилот этой сессии начнёт работу после его окончания.',
  running: 'Запуск автопилота этой сессии уже идёт: план начат, смена режима его не меняет.',
  toFull: 'Запуск этой сессии теперь полный: автопилот сам выберет способ выполнения и запустит план.',
  toAfterStart: 'Автопилот больше не выбирает способ и не запускает план: нажмите «Начать выполнение плана», дальше Kit доведёт работу до публикации.',
  resumed: 'Запуск автопилота продолжен с того места, где он встал.',
  stillPaused: 'Запуск автопилота этой сессии стоит: нажмите «Продолжить» на его карточке.',
  afterStart: 'Автопилот включится, когда вы нажмёте «Начать выполнение плана»: дальше Kit доведёт работу до публикации.',
  paused: 'Запуск автопилота на паузе: включите автопилот снова или нажмите «Продолжить», чтобы продолжить его.',
  off: 'Автопилот сессии выключен: решения — вашими кнопками.',
  legacy: 'Этот план нельзя вести автопилотом (старый Kit или план без описания для автопилота): его доводите вы.',
  kitUpdate: 'Kit этого проекта не умеет вести автопилот: обновите Kit кнопкой «Обновить Kit»; до тех пор решения — вашими кнопками.',
} as const;

export interface SessionSwitchDeps {
  journal: RunJournal;
  kit: Pick<RunKit, 'status' | 'scope' | 'proposal' | 'supported'>;
  runs: Pick<Runs, 'beginExecution' | 'resume' | 'policy' | 'planDecision'>;
  sessions: Pick<SessionSettingsStore, 'get' | 'mark' | 'section'>;
  gate: Pick<ProposalGate, 'check'>;
  projectPath(projectId: string): Promise<string | undefined>;
  /** The open plan question of the session (plan-review), or null. */
  question(projectId: string, key: string): { kind: 'agent' | 'proposal' } | null;
  /** Stores the review decision of the session when it has none, closes its question; the effective one. */
  decideReview(projectId: string, key: string, on: boolean): Promise<boolean | void>;
  /** Queues a message for the session and wakes it when it is idle. */
  send(projectId: string, key: string, text: string): void;
  /** Wakes the session (a held Stop goes on; the cross review starts at its Stop). */
  wake(key: string): void;
  /** One preparation step of the project's full run (takes the project lock itself). */
  reconcile(projectId: string): Promise<void>;
  mutex?: KeyedMutex;
  log?: (line: string) => void;
  now?: () => Date;
}

interface Facts {
  folder: string;
  stage: SessionStage;
  run?: RunRecord;
  automation?: boolean;
}

export function createSessionSwitch(deps: SessionSwitchDeps) {
  const log = deps.log ?? (() => undefined);
  const now = deps.now ?? (() => new Date());
  const serial = <T>(projectId: string, action: () => Promise<T>): Promise<T> => (deps.mutex ? deps.mutex.run(`project:${projectId}`, action) : action());
  const effects = new Map<string, string>();
  const id = (projectId: string, key: string): string => `${projectId}\n${key}`;

  async function facts(projectId: string, key: string): Promise<Facts | null> {
    const folder = await deps.projectPath(projectId);
    if (!folder) return null;
    const active = await deps.journal.active(folder).catch(() => null);
    const run = active && !FINAL_PHASES.has(active.phase) ? active : null;
    if (run) {
      if (run.owner.key !== key) return { folder, stage: 'other-run', run };
      return { folder, stage: run.phase === 'paused' || run.phase === 'blocked' ? 'paused' : 'run', run };
    }
    const status = await deps.kit.status(folder).catch(() => null);
    if (status?.scope === 'ACTIVE' || status?.scope === 'BLOCKED') {
      const scope = await deps.kit.scope(folder).catch(() => null);
      await settleMark(projectId, key);
      const own = !scope?.ownerSession || scope.ownerSession === key.slice(key.indexOf(':') + 1);
      return { folder, stage: own ? 'executing' : 'other-plan', automation: Boolean(scope?.automation) };
    }
    const proposal = await deps.kit.proposal(folder).catch(() => null);
    if (proposal) {
      await settleMark(projectId, key);
      return { folder, stage: 'proposed', automation: proposal.automation !== false };
    }
    if (deps.question(projectId, key)) return { folder, stage: 'question' };
    const record = await deps.sessions.get(projectId, key);
    return { folder, stage: record?.preparing ? 'writing' : 'idle' };
  }

  /** The answered question is over once Kit shows a proposal or a plan. */
  async function settleMark(projectId: string, key: string): Promise<void> {
    const record = deps.sessions.section()[projectId]?.[key];
    if (record?.preparing) await deps.sessions.mark(projectId, key, null);
  }

  /** A run of the session registered by the press on its card, before its plan exists or starts. */
  function register(f: Facts, projectId: string, key: string, mode: AutopilotingMode, review: boolean, phase: RunRecord['phase'], scopeId: string | null): Promise<RunRecord> {
    return deps.journal.create(f.folder, {
      projectId,
      owner: { key, client: key.slice(0, key.indexOf(':')), sessionId: key.slice(key.indexOf(':') + 1) },
      mode: mode === 'full' ? 'full' : 'after-start',
      review,
      request: { source: 'session-card', quote: mode === 'full' ? 'Включён полный автопилот сессии' : 'Включён автопилот сессии после ручного запуска', at: now().toISOString(), turnId: null, goal: 'the task of the session' },
      proposal: null,
      scopeId,
      authority: null,
      phase,
      pausedFrom: null,
      reason: null,
      nextAction: null,
    });
  }

  async function effectiveReview(projectId: string, key: string, on: boolean): Promise<boolean> {
    const decided = await deps.decideReview(projectId, key, on).catch((error: unknown) => log(`autopiloting: review decision of ${key} kept: ${error instanceof Error ? error.message : String(error)}`));
    return typeof decided === 'boolean' ? decided : on;
  }

  /** The step of a switch on; `followUp` runs after the project lock is released. */
  async function on(projectId: string, key: string, mode: 'after-start' | 'full', review: boolean): Promise<{ effect: string; followUp?: () => Promise<void> }> {
    const f = await facts(projectId, key);
    if (!f) return { effect: SWITCH_TEXTS.off };
    switch (f.stage) {
      case 'other-run':
        return { effect: SWITCH_TEXTS.otherRun };
      case 'other-plan':
        return { effect: SWITCH_TEXTS.otherPlan };
      case 'paused':
        if (f.run!.phase === 'paused' && f.run!.reason === 'settings-off') {
          await deps.runs.resume(projectId, key);
          return { effect: SWITCH_TEXTS.resumed };
        }
        return { effect: SWITCH_TEXTS.stillPaused };
      case 'run': {
        const run = f.run!;
        if (!PRE_START.has(run.phase)) return { effect: SWITCH_TEXTS.running };
        if (run.mode === mode) return { effect: mode === 'full' ? SWITCH_TEXTS.toFull : SWITCH_TEXTS.toAfterStart };
        // A run before its start follows the session: full prepares and starts, after-start waits for the button.
        await deps.journal.advance(f.folder, run.runId, (r) => ({ ...r, mode }));
        return mode === 'full' ? { effect: SWITCH_TEXTS.toFull, followUp: () => deps.reconcile(projectId) } : { effect: SWITCH_TEXTS.toAfterStart };
      }
      case 'executing': {
        if (!f.automation) return { effect: SWITCH_TEXTS.noAutomation };
        const policy = await deps.runs.policy(projectId, key);
        if (policy.policy === 'legacy' || policy.policy === 'kit-update-required' || policy.policy === 'off') return { effect: SWITCH_TEXTS.legacy };
        const scope = await deps.kit.scope(f.folder);
        const run = await register(f, projectId, key, mode, review, 'starting', scope?.id ?? null);
        // The grant of the started plan (a refusal of Kit blocks the run with its reason and is told).
        if (await deps.runs.beginExecution(projectId, key)) return { effect: SWITCH_TEXTS.adopted };
        await stopRun(deps.journal, f.folder, run, 'authorization-missing');
        return { effect: SWITCH_TEXTS.legacy };
      }
      default:
        break;
    }
    if (mode === 'after-start') return { effect: SWITCH_TEXTS.afterStart };
    if (f.stage === 'idle') return { effect: SWITCH_TEXTS.idle };
    // A Kit that cannot autopilot gets no run (as `wfk session plan`): the cards stay manual.
    if (!deps.kit.supported(await deps.kit.status(f.folder).catch(() => null)).ready) return { effect: SWITCH_TEXTS.kitUpdate };
    const decided = await effectiveReview(projectId, key, review);
    const run = await register(f, projectId, key, 'full', decided, 'preparing', null);
    log(`autopiloting: ${projectId} run ${run.runId} registered by the session card of ${key} (stage ${f.stage})`);
    if (f.stage === 'proposed') {
      if (!f.automation) {
        const back = await deps.gate.check(projectId, key);
        if (back) deps.send(projectId, key, back.text);
        return { effect: SWITCH_TEXTS.returned };
      }
      return decided ? { effect: SWITCH_TEXTS.proposedReview, followUp: async () => deps.wake(key) } : { effect: SWITCH_TEXTS.proposed, followUp: () => deps.reconcile(projectId) };
    }
    await deps.sessions.mark(projectId, key, null);
    deps.send(projectId, key, preparationText('full', decided, run.runId, 'session-card'));
    if (f.stage === 'question') deps.wake(key);
    return { effect: f.stage === 'question' ? SWITCH_TEXTS.question : SWITCH_TEXTS.writing };
  }

  return {
    /** The stage of the session's task (the card shows it). */
    async stage(projectId: string, key: string): Promise<SessionStage | null> {
      return (await facts(projectId, key))?.stage ?? null;
    },
    /** What the last switch of the session did, or null. */
    effect: (projectId: string, key: string): string | null => effects.get(id(projectId, key)) ?? null,
    /** The listener of the session card (after the pause of runs.sessionChanged for off). */
    async changed({ projectId, key, before, after }: SessionSettingsChange): Promise<void> {
      if (before.mode === after.mode) return;
      if (after.mode === 'off') {
        const f = await facts(projectId, key);
        effects.set(id(projectId, key), f?.stage === 'paused' ? SWITCH_TEXTS.paused : SWITCH_TEXTS.off);
        return;
      }
      const step = await serial(projectId, () => on(projectId, key, after.mode as 'after-start' | 'full', after.review)).catch((error: unknown) => {
        const text = error instanceof Error ? error.message : String(error);
        log(`autopiloting: switch of ${key} to ${after.mode}: ${text}`);
        return { effect: text } as { effect: string; followUp?: () => Promise<void> };
      });
      effects.set(id(projectId, key), step.effect);
      await step.followUp?.().catch((error: unknown) => log(`autopiloting: after the switch of ${key}: ${error instanceof Error ? error.message : String(error)}`));
    },
    /**
     * The user answered the agent's plan question. In the full mode of the session the run is
     * registered and the agent gets the full-run instruction (queued before the answer message);
     * otherwise a specification and a plan mark the session «writing the plan».
     */
    async answered(projectId: string, key: string, choice: 'review' | 'plan' | 'talk', summary: string): Promise<void> {
      const run = await deps.runs.planDecision(projectId, key, choice, summary);
      if (run && run.mode === 'full' && PRE_START.has(run.phase)) {
        deps.send(projectId, key, preparationText('full', run.review, run.runId, run.request.source));
        return;
      }
      if (choice !== 'talk') await deps.sessions.mark(projectId, key, now().toISOString());
    },
    /** Clears the «writing» mark of the project's sessions once Kit shows a proposal or a plan. */
    async settle(projectId: string): Promise<void> {
      const marked = Object.values(deps.sessions.section()[projectId] ?? {}).filter((record) => record.preparing);
      if (marked.length === 0) return;
      const folder = await deps.projectPath(projectId);
      if (!folder) return;
      const status = await deps.kit.status(folder).catch(() => null);
      const busy = status?.scope === 'ACTIVE' || status?.scope === 'BLOCKED' || Boolean(await deps.kit.proposal(folder).catch(() => null));
      if (busy) for (const record of marked) await deps.sessions.mark(projectId, record.key, null);
    },
  };
}

export type SessionSwitch = ReturnType<typeof createSessionSwitch>;
