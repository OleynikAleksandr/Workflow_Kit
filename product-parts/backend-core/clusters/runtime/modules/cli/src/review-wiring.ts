// Wiring of the cross review (spec M4 section 7): the autopilot asks the review first at every
// Stop, the toggle starts or cancels it, reviewers are created like «Новая сессия» and found by
// their provider listing; messages go through the waking channel.
import type { AgentChannel } from '#agent-channel';
import type { ReviewDecider } from '#autopilot';
import { FINISHED, createCrossReview, registerCrossReviewRoutes } from '#cross-review';
import type { CrossReview } from '#cross-review';
import type { WorkflowState } from '#kit-runner';
import { HttpError } from '#http-server';
import type { Router, StateRegistry } from '#http-server';
import { ANSWER_MESSAGES, registerPlanQuestionRoute } from '#plan-review';
import type { ReviewToggles } from '#plan-review';
import type { ProjectRegistry } from '#project-registry';
import { providerCapability, providerLabel } from '#provider-registry';
import type { Provider, ProviderRegistry } from '#provider-registry';
import { TitleError, namedSession } from '#session-titles';
import type { SessionTitles } from '#session-titles';
import { ledOutside } from './direct-message.ts';

/** The autopilot's view of the review, attached once the review exists. */
export function lateReviewDecider(): ReviewDecider & { attach(review: CrossReview): void } {
  let target: CrossReview | null = null;
  return {
    attach: (review) => void (target = review),
    decide: async (context, canStart) => (target ? target.decide(context, canStart) : null),
    isReviewer: (key) => target?.isReviewer(key) ?? false,
    choiceBlocked: async (projectId, working) => (target ? target.choiceBlocked(projectId, working) : null),
  };
}

/**
 * Why the toggle of a session can no longer change (spec M4 section 10): its review runs, or the
 * open proposal was already reviewed. A review of an earlier scope does not lock it.
 */
export function toggleLock(review: CrossReview, workflow: WorkflowState, projectId: string, key: string): string | null {
  const found = review.get(projectId, key);
  if (!found) return null;
  if (!FINISHED.has(found.status)) return 'Ревью плана этой сессии идёт: его можно прервать на карточке ревью';
  const open = workflow.get(projectId)?.proposal?.scopeId ?? null;
  return open !== null && found.scopeId === open ? 'Этот план уже прошёл ревью' : null;
}

/**
 * Hands a message to a session that may not have had a turn yet (spec M4 13.9): it is queued, and a
 * session of a provider that can wake it (wakeSession) is woken at once — the prompt hook of the
 * woken turn hands over the queue; the usual wake waits for the channel to see the session idle
 * after a Stop. A session led outside the panel (ledOutside, M19) is not woken: the brief stays
 * queued for its next hook and the answer is false.
 */
export async function deliverToSession(
  deps: {
    channel: Pick<AgentChannel, 'enqueue'> & Partial<Pick<AgentChannel, 'get' | 'interruption' | 'automaticWake'>>;
    providers: Pick<ProviderRegistry, 'get'>;
    project: (id: string) => Promise<Parameters<NonNullable<ReturnType<ProviderRegistry['get']>>['listSessions']>[0]>;
    log?: (line: string) => void;
  },
  key: string,
  text: string,
  projectId: string,
): Promise<boolean> {
  deps.channel.enqueue(key, text, 'review', projectId);
  const colon = key.indexOf(':');
  const provider = deps.providers.get(key.slice(0, colon));
  if (!provider?.wakeSession) return false;
  if (ledOutside(provider, deps.channel.get?.(key))) {
    deps.log?.(`review: ${key} runs outside the panel, its brief waits for the next hook`);
    return false;
  }
  if (deps.channel.interruption?.(key)?.barrier) return false;
  const project = await deps.project(projectId);
  if (deps.channel.interruption?.(key)?.barrier) return false;
  const send = () => provider.wakeSession!(project, key.slice(colon + 1)).catch(() => false);
  const woken = await (deps.channel.automaticWake ? deps.channel.automaticWake(key, send) : send());
  deps.log?.(`review: ${woken ? 'woke' : 'could not wake'} ${key} for its brief`);
  return woken;
}

/** True when the reviewer of this provider reads its brief from the queue (spec M12 section 2.3). */
export function briefByQueue(provider: Pick<Provider, 'reviewBrief' | 'wakeSession'> | undefined): boolean {
  if (!provider) return false;
  if (provider.reviewBrief) return provider.reviewBrief === 'queue';
  return typeof provider.wakeSession === 'function';
}

export function wireCrossReview(options: {
  router: Router;
  state: StateRegistry;
  channel: AgentChannel;
  /** Queues and wakes an idle session of a provider that can be woken. */
  messages: AgentChannel;
  projects: ProjectRegistry;
  providers: ProviderRegistry;
  workflow: WorkflowState;
  toggles: ReviewToggles;
  titles: SessionTitles;
  /** The deepest registered project that contains a folder. */
  resolveFolderProject: (folder: string) => Promise<{ id: string } | undefined>;
  /** True for the id of a registered provider. */
  isClient: (client: string) => boolean;
  log?: (line: string) => void;
}): CrossReview {
  const { projects, providers } = options;
  const project = async (id: string) => {
    const found = await projects.get(id);
    if (!found) throw new Error('Проект не найден');
    return found;
  };
  const review = createCrossReview({
    listProjects: async () => (await projects.list()).map((p) => ({ id: p.id, name: p.name, path: p.path })),
    createSession: async (projectId, provider, opts) => {
      const target = providers.get(provider);
      if (!target) throw new Error(`Провайдер ${provider} не подключён`);
      const info = await target.createSession(await project(projectId), opts);
      return { localId: info.localId || null, remoteId: info.remoteId ?? null };
    },
    resolveReviewer: async (projectId, provider, ref) => {
      const target = providers.get(provider);
      if (!target) return null;
      const list = await target.listSessions(await project(projectId)).catch(() => []);
      const found = list.find((info) => (ref.remoteId && info.remoteId === ref.remoteId) || (ref.localId && info.localId === ref.localId));
      return found?.localId ? `${provider}:${found.localId}` : null;
    },
    enqueue: (key, text, projectId) => void options.messages.enqueue(key, text, 'review', projectId),
    deliver: (key, text, projectId) => void deliverToSession({ channel: options.channel, providers, project, log: options.log }, key, text, projectId),
    wake: (key) => options.channel.wake(key),
    continuationBlocked: (key) => options.channel.interruption(key)?.barrier === true,
    resumeDelivery: (key) => options.channel.resumeDelivery(key),
    toggle: (projectId, key) => options.toggles.get(projectId, key),
    proposal: async (projectId) => {
      const view = (await options.workflow.refresh(projectId)) ?? options.workflow.get(projectId);
      const proposal = view?.proposal ?? null;
      return proposal && !view?.execution ? { generation: proposal.generation, scopeId: proposal.scopeId } : null;
    },
    sessionTitle: (projectId, key) => options.titles.name(projectId, key).name || null,
    question: (projectId, key) => options.toggles.question(projectId, key) !== null,
    asking: (projectId) => options.toggles.asking(projectId),
    decided: (projectId, key) => options.toggles.decided(projectId, key),
    askProposal: async (projectId, key) => void (await options.toggles.ask(projectId, key, 'proposal', '')),
    providerTitle: (id) => {
      const provider = providers.get(id);
      return provider ? providerLabel(provider) : id;
    },
    reviewerBlocked: async (id) => {
      const capability = await providerCapability(providers.get(id), 'reviewer');
      return capability.available ? null : (capability.reason ?? 'провайдер не может вести ревью');
    },
    // The provider says how its reviewer gets the brief (reviewBrief, M12); without it a provider
    // that can wake its session reads the brief from the queue, the others get it typed.
    briefByQueue: (id) => briefByQueue(providers.get(id)),
    log: options.log,
  });
  // The plan question (spec M4 12): `wfk session plan` opens it, the answer reaches the agent. The
  // session is the named one (a registered client and its id), else the only running one.
  registerPlanQuestionRoute({
    router: options.router,
    toggles: options.toggles,
    resolveProject: options.resolveFolderProject,
    sessionKey: async (input, projectId) => {
      const named = namedSession(input, options.isClient);
      if (named) return `${named.client}:${named.id}`;
      try {
        return await options.titles.running(projectId);
      } catch (error) {
        if (error instanceof TitleError) throw new HttpError(error.status, error.code, error.message, error.details);
        throw error;
      }
    },
  });
  options.toggles.onAnswer((projectId, key, choice, question) => {
    if (question.kind === 'agent') void options.messages.enqueue(key, ANSWER_MESSAGES[choice], 'panel', projectId);
    options.channel.wake(key);
  });
  options.channel.onStop((event) => review.onStop(event));
  registerCrossReviewRoutes({ router: options.router, state: options.state, review });
  return review;
}
