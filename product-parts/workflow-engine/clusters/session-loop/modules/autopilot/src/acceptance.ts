// The end of a plan in the panel (spec M37 2.2, 2.3): «Принять план» and «Закрыть план» run the Kit
// command and tell the owner session, so the agent answers the user; «Попросить агента убрать»
// (tidy) asks it to clean the working tree, which `close` needs. The labels `accepted` and
// `closed` replace a stale «Ждёт приёмки».
import type { AgentChannel } from '#agent-channel';
import type { KitRunner, WorkflowState } from '#kit-runner';
import type { AutopilotReason, SessionAutopilot } from './autopilot.ts';
import type { AutopilotProjectStatus } from './decide.ts';
import { wakeHolders } from './owner.ts';
import { CLEAN_TEXTS, acceptedMessage, closedMessage, dirtyTreeText, tidyMessage } from './texts.ts';

/** Kit --note of a panel press without the user's own words. */
export const ACCEPT_NOTE = 'Пользователь принял план в панели Workflow Kit';
export const CLOSE_NOTE = 'Пользователь закрыл план в панели Workflow Kit';

export interface PlanEndDeps {
  runner: KitRunner;
  workflow: WorkflowState;
  channel: AgentChannel;
  root(projectId: string): Promise<string>;
  /** Owner session key per project, remembered at the choice. */
  owners: Map<string, string>;
  entries(): Iterable<SessionAutopilot>;
  entry(key: string, projectId: string): SessionAutopilot;
  note(entry: SessionAutopilot, action: 'continue' | 'hold' | 'release', reason: AutopilotReason | null, detail: string): void;
  /** Forgets the plan starts of the project. */
  forget(projectId: string): void;
  /** Throws the refusal of a panel action (409). */
  fail(code: string, message: string, nextAction?: string | null): never;
  log(line: string): void;
}

export interface PlanEnd {
  accept(projectId: string, words?: string, session?: string): Promise<void>;
  close(projectId: string, words?: string, session?: string): Promise<void>;
  /** Asks the owner session to tidy the paths outside commits; the autopilot stays as it is. */
  tidy(projectId: string, session?: string): Promise<{ owner: string; paths: string[] }>;
  /** The reason a release is noted with: an accepted or closed plan is not «Ждёт приёмки». */
  endReason(previous: AutopilotReason | null, reason: AutopilotReason, status: AutopilotProjectStatus): AutopilotReason;
  /** Corrects the stale label of a session the autopilot does not drive (acceptance or closing in the chat). */
  settle(entry: SessionAutopilot, status: AutopilotProjectStatus): void;
}

function pathsOf(details: unknown): string[] {
  const paths = typeof details === 'object' && details !== null ? (details as { paths?: unknown }).paths : null;
  return Array.isArray(paths) ? paths.filter((file): file is string => typeof file === 'string') : [];
}

export function createPlanEnd(deps: PlanEndDeps): PlanEnd {
  /** The session to tell: the remembered owner, Kit's owner session, else the session of the request. */
  async function ownerKey(projectId: string, session?: string): Promise<string | null> {
    const remembered = deps.owners.get(projectId);
    if (remembered) return remembered;
    const raw = deps.workflow.status(projectId)?.execution?.ownerSession ?? (await deps.workflow.refresh(projectId))?.execution?.ownerSession;
    const found = raw ? deps.channel.list().find((activity) => activity.sessionId === raw) : undefined;
    return found?.key ?? session ?? null;
  }

  /** Queues the message for the owner; a session out of the Kit process would only drop it. */
  function tell(projectId: string, key: string | null, text: string, what: 'accept' | 'close'): void {
    const missing = !key ? 'no owner' : deps.channel.excluded(key, projectId) ? 'owner left the Kit process' : null;
    if (missing || !key) {
      deps.log(`autopilot: ${what} of ${projectId}: no session to notify (${missing})`);
      return;
    }
    deps.channel.enqueue(key, text, 'panel', projectId);
  }

  function disable(projectId: string): void {
    deps.forget(projectId);
    for (const entry of deps.entries()) if (entry.projectId === projectId) entry.enabled = false;
  }

  async function activeScope(projectId: string): Promise<{ id: string }> {
    const scope = deps.workflow.status(projectId)?.scope ?? (await deps.workflow.refresh(projectId))?.scope;
    return scope ?? deps.fail('no-scope', 'Нет активного плана');
  }

  return {
    async accept(projectId, words, session) {
      const scope = await activeScope(projectId);
      const key = await ownerKey(projectId, session);
      const outcome = await deps.runner.run(await deps.root(projectId), ['accept', '--note', words && words.trim().length >= 3 ? words.trim() : ACCEPT_NOTE]);
      if (!outcome.ok) deps.fail(outcome.code, outcome.message, outcome.nextAction);
      disable(projectId);
      const view = await deps.workflow.refresh(projectId);
      tell(projectId, key, acceptedMessage(scope.id, view?.plan?.dirty ?? []), 'accept');
      wakeHolders(deps.channel, projectId, key ?? '', ['ready-for-acceptance']);
      if (key) deps.note(deps.entry(key, projectId), 'release', 'accepted', 'Пользователь принял план в панели');
    },

    async close(projectId, words, session) {
      const scope = await activeScope(projectId);
      const key = await ownerKey(projectId, session);
      const outcome = await deps.runner.run(await deps.root(projectId), ['close', '--scope', scope.id, '--note', words && words.trim().length >= 10 ? words.trim() : CLOSE_NOTE]);
      void deps.workflow.refresh(projectId);
      if (!outcome.ok) {
        const paths = outcome.code === 'DIRTY_TREE' ? pathsOf(outcome.details) : [];
        if (paths.length > 0) deps.fail('dirty-tree', dirtyTreeText(paths));
        deps.fail(outcome.code, outcome.message, outcome.nextAction);
      }
      deps.owners.delete(projectId);
      disable(projectId);
      tell(projectId, key, closedMessage(scope.id), 'close');
      if (key) deps.note(deps.entry(key, projectId), 'release', 'closed', 'Пользователь закрыл план в панели');
    },

    async tidy(projectId, session) {
      const view = await deps.workflow.refresh(projectId);
      const plan = view?.scope ? view.plan : null;
      if (!plan) deps.fail('no-scope', 'Нет активного плана');
      const phase = plan.phase;
      if (phase !== 'acceptance' && phase !== 'accepted') deps.fail('not-finished', 'Убирать файлы можно, когда план выполнен');
      if (plan.dirty.length === 0) deps.fail('clean', CLEAN_TEXTS[phase]);
      const key = await ownerKey(projectId, session);
      if (!key) deps.fail('no-owner', 'Не найдена сессия-владелец плана: уберите файлы сами');
      if (deps.channel.excluded(key, projectId)) deps.fail('owner-unavailable', 'Сессия-владелец плана не получает сообщений Workflow Kit: уберите файлы сами');
      // A session of the Kit process that cannot be woken now keeps the message in its queue.
      deps.channel.enqueue(key, tidyMessage(plan.dirty), 'panel', projectId);
      return { owner: key, paths: [...plan.dirty] };
    },

    endReason(previous, reason, status) {
      if (reason === 'ready-for-acceptance' && status.delivery === 'ACCEPTED') return 'accepted';
      if (reason === 'no-scope' && (previous === 'ready-for-acceptance' || previous === 'accepted' || previous === 'closed')) return 'closed';
      return reason;
    },

    settle(entry, status) {
      const previous = entry.last?.reason ?? null;
      if (previous === 'ready-for-acceptance' && status.delivery === 'ACCEPTED') deps.note(entry, 'release', 'accepted', 'Результат принят');
      else if ((previous === 'ready-for-acceptance' || previous === 'accepted') && status.scope === 'NONE') deps.note(entry, 'release', 'closed', 'План закрыт');
    },
  };
}
