// The autopilot of agent sessions (spec section 9.4) and the plan actions of the panel
// (section 8.3): after a Stop of a session the decider reads `autopilot:status` and either
// continues the agent, holds the Stop until the user decides, or releases it; the panel actions
// run Kit commands and tell the agent through the channel.
import type { StopDecision } from '#agent-channel';
import type { KitOutcome } from '#kit-runner';
import type { KitChoiceOption } from '#plan-view';
import { DEFAULT_MAX_CONTINUES, decideAutopilot, nextAutopilotState } from './decide.ts';
import { grantedDelivery, liveGrant } from './decide-orchestration.ts';
import type { AutopilotProjectStatus } from './decide.ts';
import { CHOICE_NOTES, CHOSEN_WAIT, EXECUTOR_HOWTO, PREFIX, REFINE_MESSAGE, RESUME_MESSAGE, START_MESSAGES, STOP_LABELS } from './texts.ts';
import { deliveryMessage, deliveryStartedMessage, executorHowto, fixesMessage, sequentialOnlyNote } from './texts.ts';
import { originOf } from './decisions.ts';
import { createPlanEnd } from './acceptance.ts';
import { createPlanStarts } from './start.ts';
import { blockedByInterruption, pauseInterruptedOwner } from './interrupt.ts';
import { moveOwner, wakeHolders } from './owner.ts';
import { WorkflowActionError } from './autopilot-types.ts';
import type { Autopilot, AutopilotOptions, AutopilotReason, SessionAutopilot } from './autopilot-types.ts';

export type { Autopilot, AutopilotOptions, AutopilotReason, ChooseRequest, ReviewDecider, SessionAutopilot } from './autopilot-types.ts';
export { WorkflowActionError } from './autopilot-types.ts';

/** Stops that wait for a user decision in the panel: the Stop hook is held. */
const HOLDING: ReadonlySet<string> = new Set(['waiting-for-mode-choice', 'waiting-for-plan-start', 'delivery-confirmation', 'ready-for-acceptance']);

const clientOf = (key: string): string => key.split(':')[0] ?? '';
const idOf = (key: string): string => key.slice(key.indexOf(':') + 1);

export function createAutopilot(options: AutopilotOptions): Autopilot {
  const now = options.now ?? (() => new Date());
  const log = options.log ?? (() => undefined);
  const max = options.maxContinues ?? DEFAULT_MAX_CONTINUES;
  const states = new Map<string, SessionAutopilot>();
  /** Owner session key per project, remembered at the choice. */
  const owners = new Map<string, string>();
  /** Plan starts by session key (spec M11). */
  const starts = createPlanStarts({ channel: options.channel, workflow: options.workflow, now });

  function state(key: string, projectId: string | null = null): SessionAutopilot {
    let entry = states.get(key);
    if (!entry) {
      entry = { key, projectId, enabled: false, continues: 0, maxContinues: max, orchestrationKey: null, before: null, origin: null, last: null, start: null };
      states.set(key, entry);
    }
    if (projectId) entry.projectId = projectId;
    return entry;
  }

  function note(entry: SessionAutopilot, action: 'continue' | 'hold' | 'release', reason: AutopilotReason | null, detail: string): void {
    entry.last = { action, reason, label: reason ? (STOP_LABELS[reason] ?? reason) : null, detail, at: now().toISOString() };
  }

  /** A provider without orchestration runs a scope only sequentially (spec M8 section 5). */
  async function requireOrchestration(key: string): Promise<void> {
    const capability = await options.orchestration?.(clientOf(key));
    if (!capability || capability.available) return;
    const reason = capability.reason ?? 'сессии этого провайдера не запускают исполнителей';
    throw new WorkflowActionError('orchestration-unavailable', `Оркестрация недоступна: ${reason}`, 409, 'Выберите «Выполнить самому, последовательно».');
  }

  /** The note for the sequential texts of a session that cannot orchestrate; '' for the others. */
  async function sequentialOnly(key: string): Promise<string> {
    const capability = await options.orchestration?.(clientOf(key));
    return capability && !capability.available ? sequentialOnlyNote(clientOf(key)) : '';
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

  async function enable(projectId: string, key: string, text: string): Promise<string> {
    const entry = state(key, projectId);
    const status = await autopilotStatus(projectId);
    entry.enabled = true;
    entry.continues = 0;
    entry.orchestrationKey = null;
    entry.before = status ? { head: status.head, revision: status.revision } : null;
    entry.origin = 'kit';
    note(entry, 'continue', null, 'Сообщение из панели отправлено агенту');
    return options.channel.enqueue(key, text, 'panel', projectId).id;
  }

  const planEnd = createPlanEnd({
    ...(options.decisions ? { decisions: options.decisions } : {}),
    runner: options.runner,
    workflow: options.workflow,
    channel: options.channel,
    root,
    owners,
    entries: () => states.values(),
    entry: state,
    note,
    forget: (projectId) => starts.forgetProject(projectId),
    fail: (code, message, nextAction = null) => {
      throw new WorkflowActionError(code, message, 409, nextAction);
    },
    log,
  });

  async function strategy(projectId: string): Promise<'sequential' | 'orchestrated'> {
    const status = options.workflow.status(projectId) ?? undefined;
    const execution = status?.execution ?? (await options.workflow.refresh(projectId))?.execution;
    return execution?.strategy === 'orchestrated' ? 'orchestrated' : 'sequential';
  }

  return {
    async decide(context) {
      const entry = state(context.key, context.projectId);
      if (blockedByInterruption(options.channel, context.key)) return { kind: 'release' };
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
      // M40: a full run returns a proposal without the automation block to its author before any
      // review or choice; the second such proposal stops the run and the usual cards go on.
      const returned = status.proposalPending ? ((await options.runs?.proposal?.(context.projectId, context.key).catch(() => null)) ?? null) : null;
      if (returned) {
        entry.origin = 'kit';
        note(entry, 'continue', null, 'Предложение без блока automation возвращено автору');
        log(`autopilot: ${context.key} proposal returned: no automation block`);
        return { kind: 'continue', text: `${PREFIX} autopilot. ${returned.text}` };
      }
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
      // M11 2.2: the turn begun by the start message ended and Kit records no started work.
      if (starts.turnEnded(context.key, plan?.phase ?? null)) {
        entry.enabled = false;
        owners.set(context.projectId, context.key);
        return hold('waiting-for-plan-start', 'Запуск плана не удался: агент закончил ход, не начав первую задачу');
      }
      if (plan && !entry.enabled && plan.phase === 'ready' && plan.ownerSession === context.sessionId) {
        owners.set(context.projectId, context.key);
        return hold('waiting-for-plan-start', 'План готов: нажмите «Начать выполнение плана»');
      }
      // M39 T007: a started run of this owner keeps its barrier and survives a restart of the service.
      const live = (await options.runs?.live(context.projectId, context.key)) ?? null;
      if (live?.barrier) {
        entry.origin = null;
        note(entry, 'release', live.barrier, live.run.reason ?? STOP_LABELS[live.barrier] ?? live.barrier);
        return { kind: 'release' };
      }
      if (live) entry.enabled = true;
      if (!entry.enabled) {
        entry.origin = null;
        planEnd.settle(entry, status);
        return { kind: 'release' };
      }
      const userMessage = entry.origin === 'user' && !context.woken;
      const turn = { before: entry.before ?? { head: null, revision: -1 }, outcome: 'completed' as const, userMessage: userMessage && !live };
      const decisionState = { enabled: entry.enabled, continues: entry.continues, maxContinues: live ? Number.POSITIVE_INFINITY : entry.maxContinues, orchestrationKey: entry.orchestrationKey };
      const shared = decideAutopilot(decisionState, status, turn);
      const next = nextAutopilotState(decisionState, shared);
      entry.continues = next.continues;
      entry.orchestrationKey = next.orchestrationKey;
      // M44 3.4: «autopilot» only under the live Kit grant of this run; without it the texts are manual.
      const grant = live ? liveGrant(status) : null;
      const granted = !live || (grant !== null && grant.runId === live.run.runId);
      const decision = live ? await options.runs!.turn(live, shared, status, userMessage, granted) : shared;
      if (decision.action === 'continue') {
        entry.before = { head: status.head, revision: status.revision };
        entry.origin = 'kit';
        note(entry, 'continue', null, `Продолжение: ${decision.taskId}`);
        log(`autopilot: ${context.key} continue ${decision.taskId}`);
        const procedure = EXECUTOR_HOWTO[clientOf(context.key)];
        const howto = status.orchestration && procedure?.repeat ? ` ${procedure.text}` : '';
        return { kind: 'continue', text: `${PREFIX}${granted ? ' autopilot.' : ''} ${decision.text}${howto}` };
      }
      entry.origin = null;
      // An accepted result waits only for «Закрыть»: nothing to deliver, the Stop is not held.
      const accepted = decision.reason === 'ready-for-acceptance' && status.delivery === 'ACCEPTED';
      if (HOLDING.has(decision.reason) && !accepted) return hold(decision.reason, decision.detail);
      note(entry, 'release', planEnd.endReason(entry.last?.reason ?? null, decision.reason, status), decision.detail);
      return { kind: 'release' };
    },

    onPrompt(key, delivered) {
      state(key).origin = delivered ? 'kit' : 'user';
    },

    async choose(projectId, request) {
      if (!Number.isSafeInteger(request.generation) || request.generation < 1) {
        throw new WorkflowActionError('bad-request', 'Нужно поколение предложения', 400);
      }
      if (request.option === 'orchestrated') await requireOrchestration(request.session);
      if (request.option !== 'refine' && options.review?.choiceBlocked) {
        const busy = options.channel.list().filter((a) => a.projectId === projectId && a.state === 'working').map((a) => a.key);
        // A stray session the project does not list (M16: a background thread of an app) is no review source.
        const listed = await Promise.all(busy.map(async (key) => (options.owns ? options.owns(projectId, key).catch(() => true) : true)));
        const working = busy.filter((_, index) => listed[index]);
        const blocked = await options.review.choiceBlocked(projectId, working);
        if (blocked) throw new WorkflowActionError('review-pending', blocked, 409, 'Дождитесь ревью плана: карточка выбора вернётся после него.');
      }
      const note = request.automatic?.note ?? CHOICE_NOTES[request.option];
      const digest = request.expectedDigest ? ['--expected-digest', request.expectedDigest] : [];
      // M40: a `host` project records the choice by a host operation — of the run's grant, of the
      // button or of the user's message; the `agent` mode keeps the Kit 2.3 form.
      const decision = await options.decisions?.apply(await root(projectId), projectId, {
        kind: 'choose',
        origin: request.automatic ? { kind: 'grant', runId: request.automatic.runId } : originOf(request.session, request.by),
        note,
        expected: request.by?.expected ?? null,
        choice: { generation: request.generation, option: request.option, session: idOf(request.session), expectedDigest: request.expectedDigest ?? null },
      });
      if (decision?.already) {
        // A second press of the same card: the choice is recorded, the agent heard of it.
        owners.set(projectId, request.session);
        return { option: request.option, owner: request.session };
      }
      if (decision) void options.workflow.refresh(projectId);
      else await kit(projectId, ['scope:choose', '--generation', String(request.generation), '--option', request.option, '--session', idOf(request.session), '--note', note, ...digest]);
      wakeHolders(options.channel, projectId, request.session, ['waiting-for-mode-choice']); // M31 3.3: release the other holders
      const entry = state(request.session, projectId);
      // The session that ran `wfk decision` reads the answer of its command, not a queued message.
      const tell = (text: string): void => void (request.by?.message ? null : options.channel.enqueue(request.session, text, 'panel', projectId));
      if (request.option === 'refine') {
        entry.enabled = false;
        tell(REFINE_MESSAGE);
        return { option: request.option, owner: request.session, text: REFINE_MESSAGE };
      }
      if (request.automatic) {
        owners.set(projectId, request.session);
        await options.workflow.refresh(projectId); // the start that follows reads the chosen execution
      } else {
        owners.set(projectId, request.session);
        const only = request.option === 'sequential' ? await sequentialOnly(request.session) : '';
        const text = `${CHOSEN_WAIT[request.option]}${only}`;
        tell(text);
        return { option: request.option, owner: request.session, text };
      }
      return { option: request.option, owner: request.session };
    },

    async start(projectId, session) {
      const key = await owner(projectId, session);
      const moved = session ? await moveOwner(options, await root(projectId), projectId, key) : null; // M31 3.3
      if (moved && !moved.ok) throw new WorkflowActionError(moved.code, moved.message, 409, moved.nextAction);
      if (moved?.moved) owners.set(projectId, key);
      for (const previous of moved?.ok ? moved.previousKeys : []) state(previous).enabled = false;
      const entry = state(key, projectId);
      const current = starts.view(key);
      if (current && !current.problem) {
        // F001: a repeated press names the run it joins.
        const live = await options.runs?.live(projectId, key).catch(() => null);
        return { owner: key, already: true, ...(live ? { runId: live.run.runId } : {}) };
      }
      const mode = await strategy(projectId);
      if (mode === 'orchestrated') await requireOrchestration(key);
      const runId = (await options.authority?.beforeStart(projectId, key)) ?? null;
      if (starts.restart(key)) {
        // The old message still waits: no duplicate, the wait starts anew and the channel retries.
        entry.enabled = true;
        note(entry, 'continue', null, 'Запуск плана повторён: команда ждёт отправки агенту');
        await options.channel.flush(key);
        return { owner: key, ...(runId ? { runId } : {}) };
      }
      const messageId = await enable(projectId, key, mode === 'orchestrated' ? `${START_MESSAGES.orchestrated} ${executorHowto(key)}` : `${START_MESSAGES[mode]}${await sequentialOnly(key)}`);
      starts.begin(key, projectId, messageId);
      return { owner: key, ...(runId ? { runId } : {}) };
    },

    async interrupt(projectId, key) {
      state(key, projectId).enabled = false;
      await options.authority?.onPause?.(projectId, 'interrupted');
      await pauseInterruptedOwner({ workflow: options.workflow, projectId, key, pause: () => kit(projectId, ['pause:set', '--on', '--note', 'Пользователь остановил ответ в панели Workflow Kit']) });
    },
    async pause(projectId) {
      await options.authority?.onPause?.(projectId, 'user-pause');
      await kit(projectId, ['pause:set', '--on', '--note', 'Пользователь поставил план на паузу в панели Workflow Kit']);
    },
    halt(projectId) {
      for (const entry of states.values()) if (entry.projectId === projectId) entry.enabled = false;
    },

    async resume(projectId, session) {
      const status = await autopilotStatus(projectId);
      if (status?.paused) await kit(projectId, ['pause:set', '--off', '--note', 'Пользователь продолжил план в панели Workflow Kit']);
      const key = await owner(projectId, session);
      const runId = (await options.authority?.beforeResume(projectId, key)) ?? null;
      options.channel.resumeDelivery?.(key);
      // M39: one sender — a run whose owner already works, or already has a message waiting for
      // it (the continuation after a restart), gets no second message (Stop + resume, F001).
      if (runId && (options.channel.get(key)?.state === 'working' || options.channel.queued(key).length > 0)) return { owner: key, runId };
      await enable(projectId, key, RESUME_MESSAGE);
      return { owner: key, ...(runId ? { runId } : {}) };
    },

    accept: (projectId, words, session, by) => planEnd.accept(projectId, words, session, by),
    close: (projectId, words, session, by) => planEnd.close(projectId, words, session, by),
    tidy: (projectId, session) => planEnd.tidy(projectId, session),

    async fixes(projectId, text, session) {
      if (!text.trim()) throw new WorkflowActionError('bad-request', 'Опишите, что исправить', 400);
      const key = await owner(projectId, session);
      // M39: a started delivery of a live run is deferred first (Kit rules), then the fixes round.
      const status = await autopilotStatus(projectId);
      const task = status?.nextTask;
      if (status && liveGrant(status) && task?.kind === 'delivery' && task.status === 'IN_PROGRESS') {
        await kit(projectId, ['task:defer-delivery', task.id, '--reason', `The user asked for fixes in the panel: ${text.trim().slice(0, 300)}`, '--expected-revision', String(status.revision)]);
      }
      await enable(projectId, key, fixesMessage(text.trim()));
      return { owner: key };
    },

    async confirmDelivery(projectId, words, session, by) {
      const status = await autopilotStatus(projectId);
      const task = status?.nextTask;
      if (!task || task.kind !== 'delivery') throw new WorkflowActionError('no-delivery', 'Нет задачи выпуска, ждущей подтверждения', 409);
      if (by?.taskId && by.taskId !== task.id) throw new WorkflowActionError('task-mismatch', `Подтверждения ждёт задача ${task.id}, а не ${by.taskId}`, 409);
      const key = await owner(projectId, session);
      // M39: a delivery the live run confirmed in advance gets no second message; the run sends it.
      if (task.status === 'TODO' && grantedDelivery(status!, task)) return { owner: key, taskId: task.id };
      // M40, a `host` project: the service starts the task itself, then tells the agent.
      const folder = await root(projectId);
      if (options.decisions && (await options.decisions.mode(folder)) === 'host') {
        const decision = task.status === 'TODO' ? await options.decisions.apply(folder, projectId, { kind: 'confirm-delivery', taskId: task.id, origin: originOf(session, by), note: words, expected: by?.expected ?? null }) : null;
        void options.workflow.refresh(projectId);
        const text = deliveryStartedMessage(task.id);
        // A second press (the task runs already) tells the agent nothing new; `wfk decision`
        // answers its caller itself.
        if (!by?.message && decision && !decision.already) await enable(projectId, key, text);
        return { owner: key, taskId: task.id, started: true, text };
      }
      if (words.trim().length < 3) throw new WorkflowActionError('bad-request', 'Напишите подтверждение своими словами', 400);
      await enable(projectId, key, deliveryMessage(task.id, words.trim()));
      return { owner: key, taskId: task.id };
    },

    get: (key) => {
      const entry = states.get(key);
      return entry ? { ...entry, start: starts.view(entry.key) } : undefined;
    },
    section: () => ({ sessions: [...states.values()].map((entry) => ({ ...entry, start: starts.view(entry.key) })) }),
  };
}
