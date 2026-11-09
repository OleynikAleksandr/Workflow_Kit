// The autopilot of agent sessions (spec section 9.4) and the plan actions of the panel
// (section 8.3): after a Stop of a session the decider reads `autopilot:status` and either
// continues the agent, holds the Stop until the user decides, or releases it; the panel actions
// run Kit commands and tell the agent through the channel.
import type { AgentChannel, StopContext, StopDecision } from '#agent-channel';
import type { KitOutcome, KitRunner, WorkflowState } from '#kit-runner';
import type { KitChoiceOption } from '#plan-view';
import { DEFAULT_MAX_CONTINUES, decideAutopilot, nextAutopilotState } from './decide.ts';
import type { AutopilotProjectStatus, StopReason } from './decide.ts';
import {
  CHOICE_NOTES,
  CHOSEN_WAIT,
  PREFIX,
  REFINE_MESSAGE,
  RESUME_MESSAGE,
  CODEX_EXECUTOR_HOWTO,
  START_MESSAGES,
  executorHowto,
  STOP_LABELS,
  deliveryMessage,
  fixesMessage,
} from './texts.ts';

/** Stops that wait for a user decision in the panel: the Stop hook is held. */
const HOLDING: ReadonlySet<string> = new Set(['waiting-for-mode-choice', 'waiting-for-plan-start', 'delivery-confirmation', 'ready-for-acceptance']);

export type AutopilotReason = StopReason | 'waiting-for-plan-start' | 'waiting-for-review' | 'waiting-for-main' | 'waiting-for-plan-decision';

/**
 * The cross review (M4): its Stop decision comes before the autopilot's. canStart — the session
 * would now wait for the mode choice of an open proposal.
 */
export interface ReviewDecider {
  decide(context: StopContext, canStart?: boolean): Promise<StopDecision | null>;
  isReviewer(key: string): boolean;
  /** Why sequential/orchestrated must wait for the plan review (spec M4 11.3), or null. */
  choiceBlocked?(projectId: string, working: readonly string[]): Promise<string | null>;
}

/** Autopilot state of one session, shown in the panel. */
export interface SessionAutopilot {
  key: string;
  projectId: string | null;
  enabled: boolean;
  continues: number;
  maxContinues: number;
  orchestrationKey: string | null;
  /** Plan revision and HEAD when the current turn started (progress check). */
  before: { head: string | null; revision: number } | null;
  /** Who started the current turn: the user typing in the chat or a panel message. */
  origin: 'user' | 'kit' | null;
  last: { action: 'continue' | 'hold' | 'release'; reason: AutopilotReason | null; label: string | null; detail: string; at: string } | null;
}

/** A Kit refusal of a panel action. */
export class WorkflowActionError extends Error {
  readonly code: string;
  readonly status: number;
  readonly nextAction: string | null;
  constructor(code: string, message: string, status = 409, nextAction: string | null = null) {
    super(message);
    this.name = 'WorkflowActionError';
    this.code = code;
    this.status = status;
    this.nextAction = nextAction;
  }
}

export interface AutopilotOptions {
  runner: KitRunner;
  workflow: WorkflowState;
  channel: AgentChannel;
  projectPath: (projectId: string) => Promise<string | undefined>;
  review?: ReviewDecider;
  maxContinues?: number;
  now?: () => Date;
  log?: (line: string) => void;
}

export interface ChooseRequest {
  session: string;
  generation: number;
  option: KitChoiceOption;
}

export interface Autopilot {
  /** The channel's Stop decider. */
  decide(context: StopContext): Promise<StopDecision>;
  /** A UserPromptSubmit of a session: `delivered` when it carried panel messages. */
  onPrompt(key: string, delivered: boolean): void;
  choose(projectId: string, request: ChooseRequest): Promise<{ option: KitChoiceOption; owner: string }>;
  start(projectId: string, session?: string): Promise<{ owner: string }>;
  pause(projectId: string): Promise<void>;
  resume(projectId: string, session?: string): Promise<{ owner: string }>;
  accept(projectId: string, note?: string): Promise<void>;
  close(projectId: string, note?: string): Promise<void>;
  fixes(projectId: string, text: string, session?: string): Promise<{ owner: string }>;
  confirmDelivery(projectId: string, words: string, session?: string): Promise<{ owner: string; taskId: string }>;
  get(key: string): SessionAutopilot | undefined;
  section(): { sessions: SessionAutopilot[] };
}

function clientOf(key: string): string {
  return key.split(':')[0] ?? '';
}

function idOf(key: string): string {
  return key.slice(key.indexOf(':') + 1);
}

export function createAutopilot(options: AutopilotOptions): Autopilot {
  const now = options.now ?? (() => new Date());
  const log = options.log ?? (() => undefined);
  const max = options.maxContinues ?? DEFAULT_MAX_CONTINUES;
  const states = new Map<string, SessionAutopilot>();
  /** Owner session key per project, remembered at the choice. */
  const owners = new Map<string, string>();

  function state(key: string, projectId: string | null = null): SessionAutopilot {
    let entry = states.get(key);
    if (!entry) {
      entry = { key, projectId, enabled: false, continues: 0, maxContinues: max, orchestrationKey: null, before: null, origin: null, last: null };
      states.set(key, entry);
    }
    if (projectId) entry.projectId = projectId;
    return entry;
  }

  function note(entry: SessionAutopilot, action: 'continue' | 'hold' | 'release', reason: AutopilotReason | null, detail: string): void {
    entry.last = { action, reason, label: reason ? (STOP_LABELS[reason] ?? reason) : null, detail, at: now().toISOString() };
  }

  async function root(projectId: string): Promise<string> {
    const folder = await options.projectPath(projectId);
    if (!folder) throw new WorkflowActionError('project-not-found', 'Проект не найден', 404);
    return folder;
  }

  async function kit<T>(projectId: string, args: string[]): Promise<T> {
    const outcome: KitOutcome<T> = await options.runner.run<T>(await root(projectId), args);
    if (!outcome.ok) throw new WorkflowActionError(outcome.code, outcome.message, 409, outcome.nextAction);
    void options.workflow.refresh(projectId);
    return outcome.result;
  }

  async function autopilotStatus(projectId: string): Promise<AutopilotProjectStatus | null> {
    const folder = await options.projectPath(projectId);
    if (!folder || !options.runner.installed(folder)) return null;
    const outcome = await options.runner.run<AutopilotProjectStatus>(folder, ['autopilot:status']);
    return outcome.ok ? outcome.result : null;
  }

  /** The session that owns the plan: request, remembered owner, or Kit execution.ownerSession. */
  async function owner(projectId: string, requested?: string): Promise<string> {
    if (requested) return requested;
    const remembered = owners.get(projectId);
    if (remembered) return remembered;
    const raw = options.workflow.status(projectId)?.execution?.ownerSession ?? (await options.workflow.refresh(projectId))?.execution?.ownerSession;
    if (raw) {
      const found = options.channel.list().find((activity) => activity.sessionId === raw);
      if (found) return found.key;
    }
    throw new WorkflowActionError('no-owner', 'Не найдена сессия-владелец плана', 409, 'Откройте сессию, в которой агент предложил план.');
  }

  async function enable(projectId: string, key: string, text: string): Promise<void> {
    const entry = state(key, projectId);
    const status = await autopilotStatus(projectId);
    entry.enabled = true;
    entry.continues = 0;
    entry.orchestrationKey = null;
    entry.before = status ? { head: status.head, revision: status.revision } : null;
    entry.origin = 'kit';
    note(entry, 'continue', null, 'Сообщение из панели отправлено агенту');
    options.channel.enqueue(key, text, 'panel');
  }

  async function strategy(projectId: string): Promise<'sequential' | 'orchestrated'> {
    const status = options.workflow.status(projectId) ?? undefined;
    const execution = status?.execution ?? (await options.workflow.refresh(projectId))?.execution;
    return execution?.strategy === 'orchestrated' ? 'orchestrated' : 'sequential';
  }

  return {
    async decide(context) {
      const entry = state(context.key, context.projectId);
      if (!context.projectId) return { kind: 'release' };
      const status = await autopilotStatus(context.projectId);
      if (!status) return { kind: 'release' };
      const hold = (reason: AutopilotReason, detail: string): StopDecision => {
        note(entry, 'hold', reason, detail);
        return { kind: 'hold', reason };
      };
      const other = options.channel
        .list()
        .some((a) => a.key !== context.key && a.projectId === context.projectId && (a.holdReason === 'waiting-for-mode-choice' || a.holdReason === 'waiting-for-review' || a.holdReason === 'waiting-for-plan-decision'));
      if (options.review) {
        const reviewer = options.review.isReviewer(context.key);
        const reviewed = await options.review.decide(context, status.proposalPending && !other && !reviewer);
        if (reviewed || reviewer) {
          const decision = reviewed ?? { kind: 'release' as const };
          const reason = decision.kind === 'hold' ? (decision.reason as AutopilotReason) : null;
          note(entry, decision.kind === 'hold' ? 'hold' : 'release', reason, reason ? (STOP_LABELS[reason] ?? reason) : 'Ревью плана закончено');
          return decision;
        }
      }
      if (status.proposalPending && !other) return hold('waiting-for-mode-choice', 'План предложен: выберите путь в панели');
      const view = (await options.workflow.refresh(context.projectId)) ?? options.workflow.get(context.projectId);
      const plan = view?.plan ?? null;
      if (plan && !entry.enabled && plan.phase === 'ready' && plan.ownerSession === context.sessionId) {
        owners.set(context.projectId, context.key);
        return hold('waiting-for-plan-start', 'План готов: нажмите «Начать выполнение плана»');
      }
      if (!entry.enabled) {
        entry.origin = null;
        return { kind: 'release' };
      }
      const turn = {
        before: entry.before ?? { head: null, revision: -1 },
        outcome: 'completed' as const,
        userMessage: entry.origin === 'user' && !context.woken,
      };
      const decision = decideAutopilot(
        { enabled: entry.enabled, continues: entry.continues, maxContinues: entry.maxContinues, orchestrationKey: entry.orchestrationKey },
        status,
        turn,
      );
      const next = nextAutopilotState({ enabled: entry.enabled, continues: entry.continues, maxContinues: entry.maxContinues, orchestrationKey: entry.orchestrationKey }, decision);
      entry.continues = next.continues;
      entry.orchestrationKey = next.orchestrationKey;
      if (decision.action === 'continue') {
        entry.before = { head: status.head, revision: status.revision };
        entry.origin = 'kit';
        note(entry, 'continue', null, `Продолжение: ${decision.taskId}`);
        log(`autopilot: ${context.key} continue ${decision.taskId}`);
        const howto = status.orchestration && clientOf(context.key) === 'codex' ? ` ${CODEX_EXECUTOR_HOWTO}` : '';
        return { kind: 'continue', text: `${PREFIX} autopilot. ${decision.text}${howto}` };
      }
      entry.origin = null;
      // An accepted result waits only for «Закрыть»: nothing to deliver, the Stop is not held.
      const accepted = decision.reason === 'ready-for-acceptance' && status.delivery === 'ACCEPTED';
      if (HOLDING.has(decision.reason) && !accepted) return hold(decision.reason, decision.detail);
      note(entry, 'release', decision.reason, decision.detail);
      return { kind: 'release' };
    },

    onPrompt(key, delivered) {
      state(key).origin = delivered ? 'kit' : 'user';
    },

    async choose(projectId, request) {
      if (!Number.isSafeInteger(request.generation) || request.generation < 1) {
        throw new WorkflowActionError('bad-request', 'Нужно поколение предложения', 400);
      }
      if (request.option !== 'refine' && options.review?.choiceBlocked) {
        const working = options.channel.list().filter((a) => a.projectId === projectId && a.state === 'working').map((a) => a.key);
        const blocked = await options.review.choiceBlocked(projectId, working);
        if (blocked) throw new WorkflowActionError('review-pending', blocked, 409, 'Дождитесь ревью плана: карточка выбора вернётся после него.');
      }
      await kit(projectId, [
        'scope:choose',
        '--generation',
        String(request.generation),
        '--option',
        request.option,
        '--session',
        idOf(request.session),
        '--note',
        CHOICE_NOTES[request.option],
      ]);
      const entry = state(request.session, projectId);
      if (request.option === 'refine') {
        entry.enabled = false;
        options.channel.enqueue(request.session, REFINE_MESSAGE, 'panel');
      } else {
        owners.set(projectId, request.session);
        options.channel.enqueue(request.session, CHOSEN_WAIT[request.option], 'panel');
      }
      return { option: request.option, owner: request.session };
    },

    async start(projectId, session) {
      const key = await owner(projectId, session);
      const mode = await strategy(projectId);
      // Orchestration runs with the subagents of the session's app: the procedure differs.
      await enable(projectId, key, mode === 'orchestrated' ? `${START_MESSAGES.orchestrated} ${executorHowto(key)}` : START_MESSAGES[mode]);
      return { owner: key };
    },

    async pause(projectId) {
      await kit(projectId, ['pause:set', '--on', '--note', 'Пользователь поставил план на паузу в панели Workflow Kit']);
    },

    async resume(projectId, session) {
      const status = await autopilotStatus(projectId);
      if (status?.paused) await kit(projectId, ['pause:set', '--off', '--note', 'Пользователь продолжил план в панели Workflow Kit']);
      const key = await owner(projectId, session);
      await enable(projectId, key, RESUME_MESSAGE);
      return { owner: key };
    },

    async accept(projectId, words) {
      await kit(projectId, ['accept', '--note', words && words.trim().length >= 3 ? words.trim() : 'Пользователь принял план в панели Workflow Kit']);
      for (const entry of states.values()) if (entry.projectId === projectId) entry.enabled = false;
    },

    async close(projectId, words) {
      const scope = options.workflow.status(projectId)?.scope ?? (await options.workflow.refresh(projectId))?.scope;
      if (!scope) throw new WorkflowActionError('no-scope', 'Нет активного плана', 409);
      await kit(projectId, ['close', '--scope', scope.id, '--note', words && words.trim().length >= 10 ? words.trim() : 'Пользователь закрыл план в панели Workflow Kit']);
      owners.delete(projectId);
    },

    async fixes(projectId, text, session) {
      if (!text.trim()) throw new WorkflowActionError('bad-request', 'Опишите, что исправить', 400);
      const key = await owner(projectId, session);
      await enable(projectId, key, fixesMessage(text.trim()));
      return { owner: key };
    },

    async confirmDelivery(projectId, words, session) {
      const status = await autopilotStatus(projectId);
      const task = status?.nextTask;
      if (!task || task.kind !== 'delivery') throw new WorkflowActionError('no-delivery', 'Нет задачи выпуска, ждущей подтверждения', 409);
      if (words.trim().length < 3) throw new WorkflowActionError('bad-request', 'Напишите подтверждение своими словами', 400);
      const key = await owner(projectId, session);
      await enable(projectId, key, deliveryMessage(task.id, words.trim()));
      return { owner: key, taskId: task.id };
    },

    get: (key) => {
      const entry = states.get(key);
      return entry ? { ...entry } : undefined;
    },
    section: () => ({ sessions: [...states.values()].map((entry) => ({ ...entry })) }),
  };
}
