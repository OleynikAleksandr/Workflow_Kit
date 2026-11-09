// The "publication" section of /api/state and POST /api/projects/:id/publish (spec
// publication-order, section 3.1). The section only reads a cache (D11): git runs in refresh(),
// on start, every interval, after a plan change and after a publish.
import { HttpError } from '#http-server';
import type { Router, StateRegistry } from '#http-server';
import type { ProjectRegistry } from '#project-registry';
import { runGit } from './git.ts';
import type { GitRunner } from './git.ts';
import { PublishError, publish, readPublication } from './publication.ts';
import type { PublicationState } from './publication.ts';

export interface PublicationOptions {
  router: Router;
  state: StateRegistry;
  projects: Pick<ProjectRegistry, 'get' | 'list'>;
  /** Whether a Kit scope of the project is open (the workflow view has a scope). */
  scopeOpen(projectId: string): boolean;
  git?: GitRunner;
  /** Background refresh period; 0 turns it off (tests). Default 30 s. */
  intervalMs?: number;
  log?: (line: string) => void;
}

export interface Publication {
  /** Reads the state of one project, or of every active project, into the cache. */
  refresh(projectId?: string): Promise<void>;
  section(): { projects: Record<string, PublicationState> };
  stop(): void;
}

export function registerPublicationRoutes(options: PublicationOptions): Publication {
  const git = options.git ?? runGit;
  const cache = new Map<string, PublicationState>();
  const publishing = new Set<string>();

  async function refreshOne(id: string, folder: string): Promise<void> {
    const state = await readPublication(git, folder, options.scopeOpen(id)).catch(() => null);
    if (state && state.status !== 'none') cache.set(id, state);
    else cache.delete(id);
  }

  async function refresh(projectId?: string): Promise<void> {
    const list = projectId ? [await options.projects.get(projectId)] : await options.projects.list();
    await Promise.all(
      list.filter((p): p is NonNullable<typeof p> => !!p && !p.archivedAt).map((p) => refreshOne(p.id, p.path)),
    );
  }

  options.router.post('/api/projects/:id/publish', async ({ params }) => {
    const id = params['id']!;
    const project = await options.projects.get(id);
    if (!project) throw new HttpError(404, 'not-found', `Проект не найден: ${id}`);
    if (publishing.has(id)) throw new HttpError(409, 'publishing', 'Публикация этого проекта уже идёт');
    publishing.add(id);
    try {
      const result = await publish(git, project.path, options.scopeOpen(id));
      options.log?.(`publish: ${project.name} ${result.from.slice(0, 7)}..${result.sha.slice(0, 7)}`);
      return { published: true, ...result };
    } catch (error) {
      if (error instanceof PublishError) {
        throw new HttpError(error.code === 'push-failed' ? 502 : 409, error.code, error.message, error.output ? { output: error.output } : undefined);
      }
      throw error;
    } finally {
      publishing.delete(id);
      await refreshOne(id, project.path);
    }
  });
  options.state.add('publication', () => ({ projects: Object.fromEntries(cache) }));

  const intervalMs = options.intervalMs ?? 30_000;
  void refresh().catch(() => undefined);
  const timer = intervalMs > 0 ? setInterval(() => void refresh().catch(() => undefined), intervalMs) : null;
  timer?.unref();
  return {
    refresh,
    section: () => ({ projects: Object.fromEntries(cache) }),
    stop: () => timer && clearInterval(timer),
  };
}
