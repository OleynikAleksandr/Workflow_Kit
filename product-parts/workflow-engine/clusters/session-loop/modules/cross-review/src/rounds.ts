// The rounds of a cross review (spec M4 sections 3-4, M39 runtime 3): the reviewer's remarks go
// to the main agent, its answer back to the reviewer. With the proposal digest of Kit
// (`scope:proposal --digest`) the agreement is bound to one version: the reviewer's approval
// records the digest it saw, and the main agent's REVIEW: AGREED ends the review only when the
// proposal and its documents still have that digest. A change after the approval sends the final
// version to the reviewer again (within the rounds); the agreed review keeps reviewedProposal.
import type { StopEvent } from '#agent-channel';
import type { CrossReviewDeps, ProposalDigestRef } from './contract.ts';
import type { Review, ReviewStatus } from './store.ts';
import { SOURCE, mainAgrees, reviewerApproves, toMain, toReviewer } from './texts.ts';

/** What the reviewer reads about the version under review (M39). */
export function versionNote(current: ProposalDigestRef | null): string {
  if (!current) return '';
  const documents = current.documents.length > 0 ? current.documents.join(', ') : 'нет';
  return `\n\nВерсия предложения: generation ${current.generation}, digest ${current.digest.slice(0, 12)}; документы: ${documents}.`;
}

/** A change after the reviewer's approval: the final version goes to the reviewer again. */
export function changedNote(approved: string | null, current: ProposalDigestRef | null): string {
  const from = approved ? approved.slice(0, 12) : 'нет';
  const to = current ? current.digest.slice(0, 12) : 'предложение закрыто';
  return `\n\nПредложение или его документы изменились после твоего одобрения (digest ${from} → ${to}): одобрение относится только к окончательной версии, проверь её.`;
}

export interface RoundsDeps {
  deps: CrossReviewDeps;
  iso(): string;
  titleOf(provider: string): string;
  save(review: Review): Promise<void>;
  finish(review: Review, status: ReviewStatus, reason?: string | null): Promise<void>;
}

export function createRounds({ deps, iso, titleOf, save, finish }: RoundsDeps) {
  /** The current version; a review that once saw a digest is versioned for good (no unbound agreement later). */
  const digest = async (review: Review): Promise<ProposalDigestRef | null> => {
    const current = deps.digest ? await deps.digest(review.projectId).catch(() => null) : null;
    if (current) review.versioned = true;
    return current;
  };

  /** A finished turn of the reviewer: its remarks go to the main agent. */
  async function fromReviewer(review: Review, event: StopEvent): Promise<void> {
    const expected = review.status === 'starting' || (review.status === 'reviewing' && event.origin === 'delivery' && event.sources.includes(SOURCE));
    if (!expected) return;
    const text = event.lastAssistantMessage?.trim() || '(ревьюер не написал замечаний)';
    review.round += 1;
    review.approved = reviewerApproves(text);
    review.approvedDigest = review.approved ? ((await digest(review))?.digest ?? null) : null;
    review.entries.push({ from: 'reviewer', round: review.round, text, at: iso() });
    review.status = 'answering';
    await save(review);
    if (review.status !== 'answering') return;
    deps.enqueue(review.mainKey, toMain(titleOf(review.reviewerProvider), review.round, text), review.projectId);
  }

  /** A finished turn of the main agent: agreement on the same version, the end of the rounds, or the next round. */
  async function fromMain(review: Review, event: StopEvent): Promise<void> {
    if (review.status !== 'answering' || event.origin !== 'delivery' || !event.sources.includes(SOURCE)) return;
    const text = event.lastAssistantMessage?.trim() || '(агент ответил без текста)';
    review.entries.push({ from: 'main', round: review.round, text, at: iso() });
    const current = await digest(review);
    let note = versionNote(current);
    if (review.approved && mainAgrees(text)) {
      // An old Kit without `scope:proposal --digest`: no version on either side, the agreement stays unbound.
      if (!deps.digest || (current === null && !review.versioned)) return finish(review, 'agreed');
      if (current && current.digest === review.approvedDigest && current.scopeId === review.scopeId) {
        review.reviewedProposal = { scopeId: current.scopeId, generation: current.generation, digest: current.digest };
        return finish(review, 'agreed');
      }
      note = `${changedNote(review.approvedDigest ?? null, current)}${note}`;
      review.entries.push({ from: 'kit', round: review.round, text: 'Версия изменилась после одобрения: нужна проверка окончательной версии', at: iso() });
    }
    review.approved = false;
    review.approvedDigest = null;
    if (review.round >= review.maxRounds) return finish(review, 'disagreed', `${review.maxRounds} кругов без согласия`);
    review.status = 'reviewing';
    await save(review);
    if (review.status === 'reviewing' && review.reviewerKey) deps.enqueue(review.reviewerKey, `${toReviewer(titleOf(review.mainProvider), review.round, text)}${note}`, review.projectId);
  }

  return { fromReviewer, fromMain };
}
