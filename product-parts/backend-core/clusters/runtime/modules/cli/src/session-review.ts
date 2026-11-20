// M48 T003: the review of a session is one value — the switch on the session's autopilot card and
// the answer «С ревью / Без ревью» on the plan question (plan-review toggles). It changes until the
// execution path is chosen (then the card hides it); while the review of the session runs, off
// cancels it; a plan the review already finished keeps its decision. On over an open unreviewed
// proposal starts its review (the toggle wakes the session; the review starts at its Stop).
import { SettingsError } from '#autopilot';
import type { SessionReviewState } from '#autopilot';
import { FINISHED } from '#cross-review';
import type { CrossReview } from '#cross-review';
import type { WorkflowState } from '#kit-runner';
import type { ReviewToggles } from '#plan-review';
import { toggleLock } from './review-wiring.ts';

/** The reason a cancellation from the session card leaves in the review. */
export const CARD_CANCEL_REASON = 'ревью отменено на карточке автопилота сессии';

export function createSessionReview(deps: {
  toggles: Pick<ReviewToggles, 'get' | 'set' | 'decided' | 'question' | 'answer'>;
  review: Pick<CrossReview, 'get' | 'cancel'>;
  workflow: Pick<WorkflowState, 'get'>;
}) {
  function state(projectId: string, key: string): SessionReviewState {
    if (deps.workflow.get(projectId)?.execution) return 'closed';
    const found = deps.review.get(projectId, key);
    if (found && found.mainKey === key && !FINISHED.has(found.status)) return 'running';
    return toggleLock(deps.review as CrossReview, deps.workflow as WorkflowState, projectId, key) ? 'reviewed' : 'open';
  }
  return {
    state,
    /** The decided toggle value of a session, or null (a new session record takes it over Settings). */
    decided: (projectId: string, key: string): boolean | null => (deps.toggles.decided(projectId, key) ? deps.toggles.get(projectId, key) : null),
    /** Before the card writes a review change: refuses what can no longer change; off cancels a running review. */
    async guard(projectId: string, key: string, on: boolean): Promise<void> {
      const now = state(projectId, key);
      if (now === 'closed') throw new SettingsError('review-closed', 'Способ выполнения уже выбран: ревью этого плана больше не меняется');
      if (now === 'running') {
        if (!on) await deps.review.cancel(projectId, key, CARD_CANCEL_REASON);
        return;
      }
      if (now === 'reviewed') throw new SettingsError('review-locked', 'Этот план уже прошёл ревью: решение о ревью не меняется');
    },
    /** After the card wrote the change: the toggle follows; an open proposal question is answered by it. */
    async apply(projectId: string, key: string, on: boolean): Promise<void> {
      if (deps.toggles.question(projectId, key)?.kind === 'proposal') {
        await deps.toggles.answer(projectId, key, on ? 'review' : 'plan');
        return;
      }
      await deps.toggles.set(projectId, key, on);
    },
  };
}

export type SessionReview = ReturnType<typeof createSessionReview>;
