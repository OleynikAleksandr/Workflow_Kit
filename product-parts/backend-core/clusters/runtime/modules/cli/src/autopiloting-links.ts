// M39 T006: the facts the full-run preparation reads from other modules — the version of the open
// proposal (Kit `scope:proposal --digest`) and the cross review of the run's owner.
import type { ProposalDigestRef, Review } from '#cross-review';
import type { ReviewFact } from '#autopilot';
import type { KitRunner } from '#kit-runner';
import type { ProjectRegistry } from '#project-registry';

/** The digest of a project's open proposal and its document paths; null without one or with an old Kit. */
export async function proposalDigest(kit: Pick<KitRunner, 'installed' | 'proposalDigest'>, projects: Pick<ProjectRegistry, 'get'>, projectId: string): Promise<ProposalDigestRef | null> {
  const project = await projects.get(projectId);
  if (!project || !kit.installed(project.path)) return null;
  const outcome = await kit.proposalDigest(project.path);
  if (!outcome.ok || !outcome.result) return null;
  const { scopeId, generation, proposalDigest: digest, documentDigests } = outcome.result;
  return { scopeId, generation, digest, documents: Object.keys(documentDigests).sort() };
}

/** The review where the session is the main agent (a reviewer's own review is not its proposal's). */
export function reviewFact(review: Review | null, key: string): ReviewFact | null {
  if (!review || review.mainKey !== key) return null;
  return { status: review.status, scopeId: review.scopeId, reason: review.reason, reviewedProposal: review.reviewedProposal ?? null };
}
