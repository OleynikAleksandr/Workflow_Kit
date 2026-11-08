// Wiring of the cross review (spec M4 section 7): the autopilot asks the review first at every
// Stop, the toggle starts or cancels it, reviewers are created like «Новая сессия» and found by
// their provider listing; messages go through the waking channel.
import type { AgentChannel } from '#agent-channel';
import type { ReviewDecider } from '#autopilot';
import { FINISHED, createCrossReview, registerCrossReviewRoutes } from '#cross-review';
import type { CrossReview } from '#cross-review';
import type { WorkflowState } from '#kit-runner';
import type { Router, StateRegistry } from '#http-server';
import type { ReviewToggles } from '#plan-review';
import type { ProjectRegistry } from '#project-registry';
import type { ProviderRegistry } from '#provider-registry';
import type { SessionTitles } from '#session-titles';

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

export function wireCrossReview(options: {
  router: Router;
  state: StateRegistry;
  channel: AgentChannel;
  /** Queues and wakes an idle Claude session. */
  messages: AgentChannel;
  projects: ProjectRegistry;
  providers: ProviderRegistry;
  workflow: WorkflowState;
  toggles: ReviewToggles;
  titles: SessionTitles;
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
    wake: (key) => options.channel.wake(key),
    toggle: (projectId, key) => options.toggles.get(projectId, key),
    proposal: async (projectId) => {
      const view = (await options.workflow.refresh(projectId)) ?? options.workflow.get(projectId);
      const proposal = view?.proposal ?? null;
      return proposal && !view?.execution ? { generation: proposal.generation, scopeId: proposal.scopeId } : null;
    },
    sessionTitle: (projectId, key) => options.titles.name(projectId, key).name || null,
    log: options.log,
  });
  options.channel.onStop((event) => review.onStop(event));
  registerCrossReviewRoutes({ router: options.router, state: options.state, review });
  return review;
}
