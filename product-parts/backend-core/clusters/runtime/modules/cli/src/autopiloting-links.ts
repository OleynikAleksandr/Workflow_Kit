// M39 T006–T007: the facts the autopiloting runs read from other modules — the version of the open
// proposal (Kit `scope:proposal --digest`), the cross review of the run's owner, the calling
// session of an agent's command and why an owner cannot get a message.
import type { ProposalDigestRef, Review } from '#cross-review';
import type { ReviewFact } from '#autopilot';
import type { KitRunner } from '#kit-runner';
import type { ProjectRegistry } from '#project-registry';
import { HttpError } from '#http-server';
import type { Provider } from '#provider-registry';
import { TitleError, namedSession } from '#session-titles';

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

/** The project and the session of an agent's command (`wfk session progress|run`), like `wfk session plan`. */
export async function locateSession(
  input: Record<string, unknown>,
  deps: { resolveFolderProject(folder: string): Promise<{ id: string } | undefined>; isClient(id: string): boolean; running(projectId: string): Promise<string> },
): Promise<{ projectId: string; key: string }> {
  for (const folder of [input['projectDir'], input['cwd']]) {
    if (typeof folder !== 'string' || folder === '') continue;
    const project = await deps.resolveFolderProject(folder);
    if (!project) continue;
    const named = namedSession(input, deps.isClient);
    if (named) return { projectId: project.id, key: `${named.client}:${named.id}` };
    try {
      return { projectId: project.id, key: await deps.running(project.id) };
    } catch (error) {
      if (error instanceof TitleError) throw new HttpError(error.status, error.code, error.message, error.details);
      throw error;
    }
  }
  throw new HttpError(404, 'project-not-found', 'Папка не относится к проекту Workflow Kit');
}

/** Why the owner of a run cannot get a message after a restart, or null (T007: never a new session instead). */
export function ownerUnreachable(provider: Pick<Provider, 'wakeSession' | 'sendMessage'> | undefined, excluded: boolean): string | null {
  if (!provider) return 'провайдер сессии не подключён';
  if (excluded) return 'сессия в архиве или убрана из списка';
  if (!provider.wakeSession && !provider.sendMessage) return 'провайдер не умеет будить сессию: откройте её и напишите любое сообщение';
  return null;
}
