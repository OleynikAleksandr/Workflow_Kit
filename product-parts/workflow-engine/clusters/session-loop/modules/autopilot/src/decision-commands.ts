// `wfk decision <kind>` and the decision buttons of the panel (spec M40 2.2). The agent names only
// the meaning of what the user wrote («the user accepts the result»): POST /api/sessions/decision
// { kind, task?, option? } finds the calling session like `wfk session plan`, and the service
// records the decision by a host operation with the note taken from the user's delivered message
// of that session's current turn. POST /api/projects/:id/workflow/decision { kind, decision: { id,
// inputDigest }, requestId, session } is the button of a decision card. Both work only in a
// project with `decisions: host`.
import { HttpError, classifyAddress } from '#http-server';
import type { Router } from '#http-server';
import type { KeyedMutex } from '#data-store';
import type { WorkflowState } from '#kit-runner';
import type { KitChoiceOption, KitDecisionKind } from '#plan-view';
import { WorkflowActionError } from './autopilot-types.ts';
import type { Autopilot } from './autopilot-types.ts';
import { originOf } from './decisions.ts';
import type { DecisionBy, DecisionDone, Decisions } from './decisions.ts';
import { runHttp } from './runs-routes.ts';
import { PREFIX } from './texts.ts';

export const DECISION_KINDS: readonly KitDecisionKind[] = ['accept', 'adopt-commits', 'approve-install', 'choose', 'close', 'confirm-delivery', 'unblock'];
const OPTIONS: readonly KitChoiceOption[] = ['sequential', 'orchestrated', 'refine'];

/** What the agent reads after a decision the service applied itself. */
export const DECISION_DONE: Readonly<Record<'adopt-commits' | 'approve-install' | 'unblock', string>> = {
  'adopt-commits': `${PREFIX} the user adopted the commits made past the Kit; Workflow Kit recorded it. Go on with the plan.`,
  'approve-install': `${PREFIX} the user approved the tool installation; Workflow Kit applied the stored quality profile. Go on with the plan.`,
  unblock: `${PREFIX} the user lifted the block; Workflow Kit recorded it. Go on with the plan.`,
};

export const DECISION_COMMAND_TEXTS = {
  agentMode: 'В этом проекте решения пользователя записывают команды Kit (режим decisions: agent), а не Workflow Kit.',
  agentNext: 'Выполните команду Kit этого решения (`scripts/workflow …`) или обновите Kit проекта кнопкой «Обновить Kit».',
  kind: `Ожидается решение: ${DECISION_KINDS.join(' | ')}`,
  option: 'Для choose нужен способ выполнения: --option sequential | orchestrated | refine',
  noProposal: 'Нет предложенного плана, для которого выбирается способ выполнения',
} as const;

export interface DecisionCommand {
  kind: KitDecisionKind;
  /** `confirm-delivery`: the task the agent or the card names. */
  taskId?: string;
  /** `choose`. */
  option?: KitChoiceOption;
  /** The session key: the caller of `wfk decision`, or the session the panel shows. */
  session?: string;
  by: DecisionBy;
}

export interface DecisionAnswer {
  kind: KitDecisionKind;
  decisionId: string | null;
  already: boolean;
  /** What the agent does next. */
  text: string;
}

export interface DecisionCommandsDeps {
  autopilot: Pick<Autopilot, 'accept' | 'choose' | 'close' | 'confirmDelivery'>;
  decisions: Decisions;
  workflow: WorkflowState;
  projectPath(projectId: string): Promise<string | undefined>;
  /** Queues a service message for a session (the answer of a button for the agent). */
  tell(projectId: string, key: string, text: string): void;
}

const answer = (kind: KitDecisionKind, decision: DecisionDone | null, text: string): DecisionAnswer => ({ kind, decisionId: decision?.decisionId ?? null, already: decision?.already ?? false, text });

export function createDecisionCommands(deps: DecisionCommandsDeps) {
  return {
    async run(projectId: string, command: DecisionCommand): Promise<DecisionAnswer> {
      const root = (await deps.projectPath(projectId)) ?? null;
      if (!root) throw new WorkflowActionError('project-not-found', 'Проект не найден', 404);
      if ((await deps.decisions.mode(root)) !== 'host') throw new WorkflowActionError('decisions-agent-mode', DECISION_COMMAND_TEXTS.agentMode, 409, DECISION_COMMAND_TEXTS.agentNext);
      const { kind, session, by } = command;
      switch (kind) {
        case 'accept': {
          const done = await deps.autopilot.accept(projectId, undefined, session, by);
          return answer(kind, done.decision, done.text);
        }
        case 'close': {
          const done = await deps.autopilot.close(projectId, undefined, session, by);
          return answer(kind, done.decision, done.text);
        }
        case 'choose': {
          if (!command.option || !OPTIONS.includes(command.option)) throw new WorkflowActionError('bad-request', DECISION_COMMAND_TEXTS.option, 400);
          const proposal = (await deps.workflow.refresh(projectId))?.proposal; // a fresh read: the agent may have just proposed
          if (!proposal || !session) throw new WorkflowActionError('no-proposal', DECISION_COMMAND_TEXTS.noProposal, 409);
          const done = await deps.autopilot.choose(projectId, { session, generation: proposal.generation, option: command.option, by });
          return answer(kind, null, done.text ?? '');
        }
        case 'confirm-delivery': {
          const done = await deps.autopilot.confirmDelivery(projectId, '', session, { ...by, ...(command.taskId ? { taskId: command.taskId } : {}) });
          return answer(kind, null, done.text ?? '');
        }
        default: {
          const done = await deps.decisions.apply(root, projectId, { kind, origin: originOf(session, by), expected: by.expected ?? null });
          void deps.workflow.refresh(projectId);
          const text = DECISION_DONE[kind];
          // The agent that ran `wfk decision` reads the answer of its command.
          if (!by.message && session) deps.tell(projectId, session, text);
          return answer(kind, done, text);
        }
      }
    },
  };
}

export type DecisionCommands = ReturnType<typeof createDecisionCommands>;

const fields = (body: unknown): Record<string, unknown> => (body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {});
const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined);

/** `decision: { id, inputDigest }` and `requestId` of a button; absent fields stay absent. */
export function decisionBy(input: Record<string, unknown>): DecisionBy {
  const shown = fields(input['decision']);
  const id = text(shown['id']);
  const requestId = text(input['requestId']);
  return { ...(id ? { expected: { id, inputDigest: text(shown['inputDigest']) ?? null } } : {}), ...(requestId ? { requestId } : {}) };
}

function commandOf(input: Record<string, unknown>): Omit<DecisionCommand, 'by' | 'session'> {
  const kind = input['kind'] as KitDecisionKind;
  if (!DECISION_KINDS.includes(kind)) throw new HttpError(400, 'bad-request', DECISION_COMMAND_TEXTS.kind);
  const option = text(input['option']) as KitChoiceOption | undefined;
  const taskId = text(input['task']);
  return { kind, ...(option ? { option } : {}), ...(taskId ? { taskId } : {}) };
}

export function registerDecisionRoutes(options: {
  router: Router;
  commands: DecisionCommands;
  locate(input: Record<string, unknown>): Promise<{ projectId: string; key: string }>;
  /** Serializes the actions on a project, like the other plan buttons. */
  mutex?: KeyedMutex;
}): void {
  const serial = <T>(projectId: string, action: () => Promise<T>): Promise<T> => runHttp(() => (options.mutex ? options.mutex.run(`project:${projectId}`, action) : action()));
  options.router.post('/api/sessions/decision', async ({ body, req }) => {
    if (classifyAddress(req.socket.remoteAddress) !== 'loopback') throw new HttpError(403, 'loopback-only', 'Команда принимается только с этого компьютера');
    const input = fields(body);
    const command = commandOf(input);
    const { projectId, key } = await options.locate(input);
    // The agent passes no words and no request: the source is the user's message of this turn.
    return serial(projectId, () => options.commands.run(projectId, { ...command, session: key, by: { message: key } }));
  });
  options.router.post('/api/projects/:id/workflow/decision', ({ params, body }) => {
    const input = fields(body);
    const session = text(input['session']);
    return serial(params['id']!, () => options.commands.run(params['id']!, { ...commandOf(input), ...(session ? { session } : {}), by: decisionBy(input) }));
  });
}
