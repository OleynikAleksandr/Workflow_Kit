// The cross review of a proposed plan (spec M4 sections 3-4): a session of the other provider
// reviews the specification and the plan; the service forwards the finished turns of both sides
// through the agent channel until the reviewer approves and the main agent agrees, or the rounds
// run out. Only turns started by a delivery of the other side are forwarded.
import type { StopContext, StopDecision, StopEvent } from '#agent-channel';
import { FINISHED, readReviews, saveReview } from './store.ts';
import type { Review, ReviewStatus } from './store.ts';
import {
  FINISHED_FOR_REVIEWER,
  MAX_ROUNDS,
  PLAN_REQUEST,
  clip,
  QUESTION_REMINDER,
  REMINDER,
  SOURCE,
  STATUS_LABELS,
  mainAgrees,
  reviewerApproves,
  reviewerBrief,
  toMain,
  toReviewer,
} from './texts.ts';
import type { ReviewProvider } from './texts.ts';
import type { CrossReview, CrossReviewDeps, ReviewSummary } from './contract.ts';
import { FIND_REVIEWER, findReviewer } from './find-reviewer.ts';

export type { CrossReview, CrossReviewDeps, ReviewSummary } from './contract.ts';

export const CHOICE_WAITS_REVIEW = 'Идёт ревью плана: путь выбирается после согласия ревьюера и агента';
export const CHOICE_WAITS_TURN = 'Сначала ревью плана: оно (или вопрос о нём) появится, когда агент закончит ход';
export const CHOICE_WAITS_QUESTION = 'Сначала ответьте на вопрос о плане в сессии агента';

/** A review without progress this long is given up (the reviewer does not answer). */
export const REVIEW_STALL_MS = 60 * 60_000;

const other = (provider: ReviewProvider): ReviewProvider => (provider === 'claude' ? 'codex' : 'claude');
const providerOf = (key: string): ReviewProvider => (key.startsWith('codex:') ? 'codex' : 'claude');

export function createCrossReview(deps: CrossReviewDeps): CrossReview {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? (() => undefined);
  const iso = (): string => now().toISOString();
  /** mainKey → review (the latest of the session). */
  const reviews = new Map<string, Review>();
  /** reviewerKey → mainKey. */
  const reviewers = new Map<string, string>();
  const paths = new Map<string, string>();
  /** The last finished turn per session key (an orphan reviewer turn waits here). */
  const events = new Map<string, StopEvent>();
  /** Serialized work per main key. */
  const work = new Map<string, Promise<void>>();
  /** Main sessions whose failed review the user asked to start again. */
  const retries = new Set<string>();
  /** Sessions held while their review still creates the reviewer (maybe it is one of them). */
  const tentative = new Set<string>();

  const active = (review: Review | undefined): boolean => !!review && !FINISHED.has(review.status);

  function queue(mainKey: string, task: () => Promise<void>): Promise<void> {
    const next = (work.get(mainKey) ?? Promise.resolve()).then(task).catch((error: unknown) => {
      log(`review: ${mainKey}: ${error instanceof Error ? error.message : String(error)}`);
    });
    work.set(mainKey, next);
    return next;
  }

  async function projectPath(projectId: string): Promise<string | null> {
    const known = paths.get(projectId);
    if (known) return known;
    const project = (await deps.listProjects()).find((p) => p.id === projectId);
    if (project) paths.set(projectId, project.path);
    return project?.path ?? null;
  }

  async function save(review: Review): Promise<void> {
    review.updatedAt = iso();
    const folder = await projectPath(review.projectId);
    if (folder) await saveReview(folder, review);
  }

  function setReviewer(review: Review, key: string): void {
    review.reviewerKey = key;
    reviewers.set(key, review.mainKey);
  }

  async function finish(review: Review, status: ReviewStatus, reason: string | null = null): Promise<void> {
    review.status = status;
    review.reason = reason;
    review.entries.push({ from: 'kit', round: review.round, text: reason ? `${STATUS_LABELS[status]}: ${reason}` : STATUS_LABELS[status]!, at: iso() });
    await save(review);
    if (review.reviewerKey && (status === 'agreed' || status === 'disagreed' || status === 'cancelled')) {
      deps.enqueue(review.reviewerKey, FINISHED_FOR_REVIEWER[status], review.projectId);
    }
    deps.wake(review.mainKey);
    log(`review: ${review.mainKey} ${status}${reason ? ` (${reason})` : ''}`);
  }

  /** A finished turn of the reviewer: its remarks go to the main agent. */
  async function fromReviewer(review: Review, event: StopEvent): Promise<void> {
    const expected = review.status === 'starting' || (review.status === 'reviewing' && event.origin === 'delivery' && event.sources.includes(SOURCE));
    if (!expected) return;
    const text = event.lastAssistantMessage?.trim() || '(ревьюер не написал замечаний)';
    review.round += 1;
    review.approved = reviewerApproves(text);
    review.entries.push({ from: 'reviewer', round: review.round, text, at: iso() });
    review.status = 'answering';
    await save(review);
    deps.enqueue(review.mainKey, toMain(review.reviewerProvider, review.round, text), review.projectId);
  }

  /** A finished turn of the main agent: the plan description, agreement, the end of the rounds, or the next round. */
  async function fromMain(review: Review, event: StopEvent): Promise<void> {
    if (review.status === 'preparing') {
      // Any finished turn ends the preparation: the service continued it with PLAN_REQUEST.
      const plan = event.lastAssistantMessage?.trim() ?? '';
      review.entries.push({ from: 'main', round: 0, text: plan || '(агент не описал план)', at: iso() });
      review.status = 'starting';
      await save(review);
      launch(review, plan);
      return;
    }
    if (review.status !== 'answering' || event.origin !== 'delivery' || !event.sources.includes(SOURCE)) return;
    const text = event.lastAssistantMessage?.trim() || '(агент ответил без текста)';
    review.entries.push({ from: 'main', round: review.round, text, at: iso() });
    if (review.approved && mainAgrees(text)) return finish(review, 'agreed');
    if (review.round >= review.maxRounds) return finish(review, 'disagreed', `${review.maxRounds} кругов без согласия`);
    review.status = 'reviewing';
    await save(review);
    if (review.reviewerKey) deps.enqueue(review.reviewerKey, toReviewer(review.mainProvider, review.round, text), review.projectId);
  }

  async function start(projectId: string, mainKey: string, proposal: { generation: number; scopeId: string | null }): Promise<Review> {
    const projects = await deps.listProjects();
    const project = projects.find((p) => p.id === projectId);
    const mainProvider = providerOf(mainKey);
    const mainTitle = deps.sessionTitle(projectId, mainKey) ?? project?.name ?? 'сессия';
    const review: Review = {
      projectId,
      scopeId: proposal.scopeId,
      mainKey,
      mainTitle,
      mainProvider,
      reviewerProvider: other(mainProvider),
      reviewerKey: null,
      reviewerRef: null,
      reviewerTitle: `${mainTitle} — ревью`,
      status: 'preparing',
      round: 0,
      maxRounds: MAX_ROUNDS,
      generation: proposal.generation,
      approved: false,
      reason: null,
      entries: [],
      createdAt: iso(),
      updatedAt: iso(),
    };
    const old = reviews.get(mainKey);
    if (old?.reviewerKey) reviewers.delete(old.reviewerKey);
    reviews.set(mainKey, review);
    await save(review);
    log(`review: ${mainKey} starts, reviewer ${review.reviewerProvider}; the main agent describes the plan first`);
    return review;
  }

  /** Creates the reviewer session with the brief and the main agent's plan description. */
  function launch(review: Review, plan: string): void {
    const { projectId, mainKey, mainProvider, mainTitle } = review;
    void queue(mainKey, async () => {
      try {
        const project = (await deps.listProjects()).find((p) => p.id === projectId);
        const brief = reviewerBrief({ projectName: project?.name ?? projectId, projectPath: project?.path ?? '', mainProvider, mainTitle, plan });
        // A brief typed into a Claude terminal was not sent (M4 13.9): Claude gets it by the queue.
        const typed = review.reviewerProvider === 'codex';
        const ref = await deps.createSession(projectId, review.reviewerProvider, {
          title: review.reviewerTitle,
          ...(typed ? { firstMessage: brief } : {}),
          // The review itself holds the reviewer's first turn: never wait for it (M4 11.1).
          detached: true,
        });
        if (review.status !== 'starting') return;
        review.reviewerRef = ref;
        if (review.reviewerProvider === 'codex' && ref.localId) setReviewer(review, `codex:${ref.localId}`);
        await save(review);
        if (!typed) void bindClaude(review, brief);
        const early = review.reviewerKey ? events.get(review.reviewerKey) : undefined;
        if (early) await fromReviewer(review, early);
        // A held early Stop asks again: the reviewer stays held, any other session is let go.
        for (const key of [...tentative]) {
          tentative.delete(key);
          deps.wake(key);
        }
      } catch (error) {
        if (review.status === 'starting') await finish(review, 'failed', error instanceof Error ? error.message : String(error));
      }
    });
  }

  /** Finds the key of a new Claude reviewer from its hooks and hands it the brief (M4 13.9). */
  async function bindClaude(review: Review, brief: string): Promise<void> {
    const ref = review.reviewerRef!;
    const settled = (): boolean => review.status !== 'starting' || review.reviewerKey !== null;
    const key = await findReviewer(() => deps.resolveReviewer(review.projectId, 'claude', ref), { ...(deps.findReviewer ?? FIND_REVIEWER), stop: settled });
    await queue(review.mainKey, async () => {
      if (review.status !== 'starting') return;
      if (!key && !review.reviewerKey) return finish(review, 'failed', 'сессия ревьюера Claude не отозвалась за 3 минуты');
      if (!review.reviewerKey) setReviewer(review, key!);
      await save(review);
      (deps.deliver ?? deps.enqueue)(review.reviewerKey!, brief, review.projectId);
    });
  }

  /** A Stop of an unknown session while a review of its project waits for the reviewer. */
  async function adopt(context: StopContext): Promise<Review | null> {
    for (const review of reviews.values()) {
      if (review.status !== 'starting' || review.reviewerKey || !review.reviewerRef) continue;
      if (review.projectId !== context.projectId || review.reviewerProvider !== context.client) continue;
      const key = await deps.resolveReviewer(review.projectId, review.reviewerProvider, review.reviewerRef).catch(() => null);
      if (key !== context.key) continue;
      setReviewer(review, key);
      const event = events.get(key);
      await queue(review.mainKey, async () => {
        if (event) await fromReviewer(review, event);
        else await save(review);
      });
      return review;
    }
    return null;
  }

  const hold = (reason: string): StopDecision => ({ kind: 'hold', reason, timeoutAnswer: REMINDER });

  async function cancel(projectId: string, key: string, reason: string): Promise<Review | null> {
    const review = reviews.get(key);
    if (!review || review.projectId !== projectId || !active(review)) return null;
    await queue(key, () => finish(review, 'cancelled', reason));
    return review;
  }

  return {
    async load() {
      for (const project of await deps.listProjects()) {
        paths.set(project.id, project.path);
        for (const review of await readReviews(project.path)) {
          review.projectId = project.id;
          reviews.set(review.mainKey, review);
          if (review.reviewerKey) reviewers.set(review.reviewerKey, review.mainKey);
        }
      }
    },
    onStop(event) {
      events.set(event.key, event);
      const asMain = reviews.get(event.key);
      if (asMain && active(asMain)) {
        void queue(asMain.mainKey, () => fromMain(asMain, event));
        return;
      }
      const mainKey = reviewers.get(event.key);
      const asReviewer = mainKey ? reviews.get(mainKey) : undefined;
      if (asReviewer && active(asReviewer)) void queue(asReviewer.mainKey, () => fromReviewer(asReviewer, event));
    },
    async decide(context, canStart = false) {
      if (!context.projectId) return null;
      const mainKey = reviewers.get(context.key);
      if (mainKey) {
        await work.get(mainKey);
        return active(reviews.get(mainKey)) ? hold('waiting-for-main') : { kind: 'release' };
      }
      if (deps.question?.(context.projectId, context.key)) return { kind: 'hold', reason: 'waiting-for-plan-decision', timeoutAnswer: QUESTION_REMINDER };
      const own = reviews.get(context.key);
      if (own) await work.get(context.key);
      if (own && active(own)) {
        if (!(await deps.proposal(context.projectId))) {
          await finish(own, 'cancelled', 'предложение плана закрыто');
          return null;
        }
        if (now().getTime() - Date.parse(own.updatedAt) > REVIEW_STALL_MS) {
          await finish(own, 'failed', 'другая сторона не отвечает больше часа');
          return null;
        }
        return hold('waiting-for-review');
      }
      const adopted = await adopt(context);
      if (adopted) return active(adopted) ? hold('waiting-for-main') : { kind: 'release' };
      const creating = [...reviews.values()].some(
        (r) => r.status === 'starting' && !r.reviewerRef && r.projectId === context.projectId && r.reviewerProvider === context.client,
      );
      if (creating) {
        tentative.add(context.key);
        return { kind: 'hold', reason: 'waiting-for-main' };
      }
      if (!canStart) return null;
      if (deps.decided && deps.askProposal && !deps.decided(context.projectId, context.key)) {
        // A plan came without a decision about its review: the user decides now (spec M4 12.2).
        if (!(await deps.proposal(context.projectId))) return null;
        await deps.askProposal(context.projectId, context.key);
        return { kind: 'hold', reason: 'waiting-for-plan-decision', timeoutAnswer: QUESTION_REMINDER };
      }
      if (!deps.toggle(context.projectId, context.key)) return null;
      const proposal = await deps.proposal(context.projectId);
      if (!proposal) return null;
      if (own && own.scopeId === proposal.scopeId && !(own.status === 'failed' && retries.has(context.key))) return null;
      retries.delete(context.key);
      if ([...reviews.values()].some((r) => r.projectId === context.projectId && active(r))) return null;
      await start(context.projectId, context.key, proposal);
      return { kind: 'continue', text: PLAN_REQUEST };
    },
    async choiceBlocked(projectId, working) {
      if (deps.asking?.(projectId)) return CHOICE_WAITS_QUESTION;
      if ([...reviews.values()].some((r) => r.projectId === projectId && active(r))) return CHOICE_WAITS_REVIEW;
      const undecided = (key: string): boolean => (deps.decided ? !deps.decided(projectId, key) : false);
      const candidates = working.filter((key) => !reviewers.has(key) && (deps.toggle(projectId, key) || undecided(key)));
      if (candidates.length === 0) return null;
      const proposal = await deps.proposal(projectId);
      if (!proposal) return null;
      return candidates.some((key) => reviews.get(key)?.scopeId !== proposal.scopeId) ? CHOICE_WAITS_TURN : null;
    },
    async toggled(projectId, key, on) {
      if (on) deps.wake(key);
      else await cancel(projectId, key, 'переключатель «Ревью плана» выключен');
    },
    cancel,
    async retry(projectId, key) {
      const review = reviews.get(key);
      if (!review || review.projectId !== projectId || review.status !== 'failed') return false;
      const proposal = await deps.proposal(projectId);
      if (!proposal || proposal.scopeId !== review.scopeId) return false;
      retries.add(key);
      log(`review: ${key} retry requested`);
      deps.wake(key);
      return true;
    },
    isReviewer: (key) => reviewers.has(key),
    async idle() {
      for (;;) {
        const pending = [...work.values()];
        await Promise.all(pending);
        if ([...work.values()].every((promise, index) => promise === pending[index]) && work.size === pending.length) return;
      }
    },
    get(projectId, key) {
      const review = reviews.get(key) ?? reviews.get(reviewers.get(key) ?? '');
      return review && review.projectId === projectId ? structuredClone(review) : null;
    },
    section() {
      const projects: Record<string, ReviewSummary[]> = {};
      for (const review of reviews.values()) {
        const summary: ReviewSummary = {
          ...review,
          statusLabel: STATUS_LABELS[review.status] ?? review.status,
          active: active(review),
          // Whole texts up to the forwarding limit (spec M4 13.7): the journal scrolls in the panel.
          entries: review.entries.map((entry) => ({ ...entry, text: clip(entry.text) })),
        };
        (projects[review.projectId] ??= []).push(summary);
      }
      return { projects };
    },
  };
}

