// A plan question the plan has already answered (spec M36 2.2): the agent asked
// `wfk session plan` and then proposed a plan or a scope appeared, or the proposal the question
// was about is gone. Such a question is closed without a decision instead of holding the session.
import type { CrossReviewDeps, OpenQuestion } from './contract.ts';

/** What the project's plan looks like now: the open proposal (with its time) and the active scope. */
export interface QuestionPlan {
  proposal: { createdAt: string | null } | null;
  scopeId: string | null;
}

/** Why the question is stale (for the service log), or null while it still waits for the user. */
export function staleReason(question: OpenQuestion, plan: QuestionPlan): string | null {
  if (question.kind === 'proposal') return plan.proposal ? null : 'no open proposal';
  const proposed = plan.proposal?.createdAt ? Date.parse(plan.proposal.createdAt) : Number.NaN;
  if (proposed > Date.parse(question.askedAt)) return 'a newer proposal';
  if (plan.scopeId !== null && plan.scopeId !== (question.scopeId ?? null)) return 'another scope';
  return null;
}

export interface QuestionGate {
  /** The session's question still waits for the user; a stale one is closed first. */
  open(projectId: string, key: string): Promise<boolean>;
  /** Any question of the project still waits for the user; stale ones are closed first. */
  asking(projectId: string): Promise<boolean>;
}

/** Without dismissQuestion (older wiring) every open question waits, as before M36. */
export function createQuestionGate(deps: CrossReviewDeps, log: (line: string) => void): QuestionGate {
  async function planOf(projectId: string): Promise<QuestionPlan> {
    const proposal = await deps.proposal(projectId);
    return { proposal: proposal ? { createdAt: proposal.createdAt ?? null } : null, scopeId: deps.scope?.(projectId) ?? null };
  }
  async function settle(projectId: string, key: string, question: OpenQuestion, plan: QuestionPlan): Promise<boolean> {
    const reason = deps.dismissQuestion ? staleReason(question, plan) : null;
    if (!reason) return true;
    await deps.dismissQuestion!(projectId, key);
    log(`review: plan question of ${key} closed: ${reason}`);
    return false;
  }
  return {
    async open(projectId, key) {
      const question = deps.question?.(projectId, key) ?? null;
      if (!question) return false;
      return settle(projectId, key, question, deps.dismissQuestion ? await planOf(projectId) : { proposal: null, scopeId: null });
    },
    async asking(projectId) {
      const open = deps.questions?.(projectId) ?? [];
      if (open.length > 0 && deps.dismissQuestion) {
        const plan = await planOf(projectId);
        for (const { key, question } of open) await settle(projectId, key, question, plan);
      }
      return deps.asking?.(projectId) ?? false;
    },
  };
}
