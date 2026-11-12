// The "kitUpdate" section of /api/state and POST /api/projects/:id/kit/update (spec M22 section
// 2.6). The section only reads a cache (D11): inspect runs in refresh(), on start, every interval,
// after a plan change and after an update. The update runs in the background (202).
import { HttpError, jsonResult } from '#http-server';
import type { Router, StateRegistry } from '#http-server';
import { KIT_VERSION } from '#kit-bundle';
import type { KitRunner } from '#kit-runner';
import type { Project, ProviderRegistry } from '#provider-registry';
import { approveKitHooks, kitAction } from './update.ts';
import type { HookApprovalOptions, KitUpdateState } from './update.ts';

export interface KitUpdateOptions {
  router: Router;
  state: StateRegistry;
  projects: { get(id: string): Promise<Project | undefined>; list(): Promise<Project[]> };
  kit: Pick<KitRunner, 'inspect' | 'install'>;
  providers: Pick<ProviderRegistry, 'list'>;
  /** Kit version of the app's bundle (default KIT_VERSION of kit-bundle). */
  bundled?: string;
  /** Background refresh period; 0 turns it off (tests). Default 60 s. */
  intervalMs?: number;
  hooks?: HookApprovalOptions;
  now?: () => Date;
  log?: (line: string) => void;
  /** Called after an update attempt (the workflow state re-reads the project). */
  onUpdated?: (projectId: string) => void;
}

export interface KitUpdateSection {
  projects: Record<string, KitUpdateState>;
}

export interface KitUpdate {
  /** Runs inspect for one project, or for every active project, into the cache. */
  refresh(projectId?: string): Promise<void>;
  section(): KitUpdateSection;
  /** Resolves when the update of the project started last has finished (tests, shutdown). */
  settled(projectId: string): Promise<void>;
  stop(): void;
}

export function registerKitUpdateRoutes(options: KitUpdateOptions): KitUpdate {
  const bundled = options.bundled ?? KIT_VERSION;
  const now = options.now ?? (() => new Date());
  const cache = new Map<string, KitUpdateState>();
  const jobs = new Map<string, Promise<void>>();

  function entry(id: string): KitUpdateState {
    let found = cache.get(id);
    if (!found) {
      found = { installed: null, bundled, state: null, action: 'none', running: false, checkedAt: null };
      cache.set(id, found);
    }
    return found;
  }

  async function refreshOne(project: Project): Promise<void> {
    const outcome = await options.kit.inspect(project.path);
    const current = entry(project.id);
    current.checkedAt = now().toISOString();
    if (!outcome.ok) {
      Object.assign(current, { installed: null, state: null, action: 'none', note: `Kit: ${outcome.message}` });
      return;
    }
    delete current.note;
    current.state = outcome.result.state;
    current.installed = outcome.result.version;
    current.action = kitAction(outcome.result, bundled);
  }

  async function refresh(projectId?: string): Promise<void> {
    const list = projectId ? [await options.projects.get(projectId)] : await options.projects.list();
    const active = list.filter((p): p is Project => !!p && !p.archivedAt);
    if (!projectId) {
      const keep = new Set(active.map((p) => p.id));
      for (const id of cache.keys()) if (!keep.has(id) && !jobs.has(id)) cache.delete(id);
    }
    // One project at a time: each inspect is a node process.
    for (const project of active) {
      if (jobs.has(project.id)) continue;
      await refreshOne(project).catch(() => undefined);
    }
  }

  async function update(project: Project): Promise<void> {
    const current = entry(project.id);
    const from = current.installed;
    try {
      const outcome = await options.kit.install(project.path, { update: true });
      if (!outcome.ok) {
        current.error = { code: outcome.code, message: outcome.message, nextAction: outcome.nextAction, at: now().toISOString() };
        options.log?.(`kit: update failed ${project.name}: ${outcome.code}`);
        return;
      }
      const hooks: string[] = [];
      for (const provider of options.providers.list()) {
        const line = await approveKitHooks(provider, project, options.hooks);
        if (line) hooks.push(line);
      }
      const to = outcome.result.version;
      current.last = { from, to, commit: outcome.result.commit?.sha ?? null, hooks, at: now().toISOString() };
      options.log?.(`kit: updated ${project.name} ${from ?? '—'} → ${to}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      current.error = { code: 'KIT_UPDATE_FAILED', message, nextAction: null, at: now().toISOString() };
    } finally {
      await refreshOne(project).catch(() => undefined);
      current.running = false;
      jobs.delete(project.id);
      options.onUpdated?.(project.id);
    }
  }

  options.router.post('/api/projects/:id/kit/update', async ({ params }) => {
    const id = params['id']!;
    const project = await options.projects.get(id);
    if (!project) throw new HttpError(404, 'not-found', `Проект не найден: ${id}`);
    if (jobs.has(id)) throw new HttpError(409, 'busy', 'Kit этого проекта уже обновляется');
    const current = entry(id);
    current.running = true;
    delete current.error;
    delete current.last;
    jobs.set(id, update(project));
    return jsonResult(202, { started: true, project: id, from: current.installed, to: bundled });
  });
  const section = (): KitUpdateSection => ({ projects: Object.fromEntries([...cache].map(([id, value]) => [id, { ...value }])) });
  options.state.add('kitUpdate', section);

  const intervalMs = options.intervalMs ?? 60_000;
  void refresh().catch(() => undefined);
  const timer = intervalMs > 0 ? setInterval(() => void refresh().catch(() => undefined), intervalMs) : null;
  timer?.unref();
  return {
    refresh,
    section,
    settled: async (projectId) => {
      await jobs.get(projectId);
    },
    stop: () => timer && clearInterval(timer),
  };
}
