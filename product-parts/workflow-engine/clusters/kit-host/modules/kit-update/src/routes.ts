// The "kitUpdate" section of /api/state and POST /api/projects/:id/kit/update (spec M22 section
// 2.6, the structure: M38 section 2.2). The section only reads a cache (D11): inspect and the
// structure check run in refresh(), on start, every interval, after a plan change and after an
// update. The update runs in the background (202): the outdated structure is written first and
// Kit commits it together with its own files (`install --update --with`).
import { HttpError, jsonResult } from '#http-server';
import type { Router, StateRegistry } from '#http-server';
import { KIT_VERSION } from '#kit-bundle';
import type { KitRunner } from '#kit-runner';
import type { Project, ProviderRegistry } from '#provider-registry';
import { STRUCTURE_NO_CHANGES, dirtyNote, pendingPaths, restore, snapshot, structureState, writtenPaths } from './structure.ts';
import type { KitStructureLast, StructureAccess, StructureSnapshot } from './structure.ts';
import { KIT_INSTALLED_STATES, approveKitHooks, decisionsOption, kitAction } from './update.ts';
import { deferralText } from './deferral.ts';
import type { KitDeferral } from './deferral.ts';
import type { HookApprovalOptions, KitUpdateState } from './update.ts';

export interface KitUpdateOptions {
  router: Router;
  state: StateRegistry;
  projects: { get(id: string): Promise<Project | undefined>; list(): Promise<Project[]> };
  /** `status` lists the files outside commits before the structure is written (spec M38). */
  kit: Pick<KitRunner, 'inspect' | 'install'> & Partial<Pick<KitRunner, 'status'>>;
  providers: Pick<ProviderRegistry, 'list'>;
  /** kit-structure's check and install; without it the structure is not looked at. */
  structure?: StructureAccess;
  /** Kit version of the app's bundle (default KIT_VERSION of kit-bundle). */
  bundled?: string;
  /** Background refresh period; 0 turns it off (tests). Default 60 s. */
  intervalMs?: number;
  hooks?: HookApprovalOptions;
  now?: () => Date;
  log?: (line: string) => void;
  /** Called after an update attempt (the workflow state re-reads the project). */
  onUpdated?: (projectId: string) => void;
  /**
   * M41: why the update waits — an open plan or a run not yet published (`kitDeferral`), read
   * fresh at the request and again under `mutex` before the first write.
   */
  deferral?: (root: string) => Promise<KitDeferral | null>;
  /** M41: the project lock the completion of a run takes (`project:<id>`). */
  mutex?: { run<T>(key: string, action: () => Promise<T>): Promise<T> };
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

/** The structure written for the update, or why it was not. */
interface PreparedStructure {
  with: string[];
  saved: StructureSnapshot | null;
  last: KitStructureLast | null;
  note: string | null;
}

const NO_STRUCTURE: PreparedStructure = { with: [], saved: null, last: null, note: null };
const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function registerKitUpdateRoutes(options: KitUpdateOptions): KitUpdate {
  const bundled = options.bundled ?? KIT_VERSION;
  const now = options.now ?? (() => new Date());
  const cache = new Map<string, KitUpdateState>();
  const jobs = new Map<string, Promise<void>>();

  function entry(id: string): KitUpdateState {
    let found = cache.get(id);
    if (!found) {
      found = { installed: null, bundled, state: null, action: 'none', structure: null, running: false, checkedAt: null };
      cache.set(id, found);
    }
    return found;
  }

  const deferralOf = async (project: Project): Promise<KitDeferral | null> => (options.deferral ? options.deferral(project.path) : null);
  const serial = <T>(id: string, action: () => Promise<T>): Promise<T> => (options.mutex ? options.mutex.run(`project:${id}`, action) : action());

  async function refreshOne(project: Project): Promise<void> {
    const outcome = await options.kit.inspect(project.path);
    const current = entry(project.id);
    current.checkedAt = now().toISOString();
    if (options.deferral) current.deferred = await deferralOf(project).catch(() => null);
    delete current.structureNote;
    current.structure = null;
    if (!outcome.ok) {
      Object.assign(current, { installed: null, state: null, action: 'none', note: `Kit: ${outcome.message}` });
      return;
    }
    delete current.note;
    current.state = outcome.result.state;
    current.installed = outcome.result.version;
    const installed = KIT_INSTALLED_STATES.has(outcome.result.state);
    if (installed && options.structure) {
      try {
        current.structure = structureState(await options.structure.check(project.path));
      } catch (error) {
        current.structureNote = `Структура Kit: ${message(error)}`;
      }
    }
    current.action = kitAction(outcome.result, bundled) === 'update' || (installed && current.structure?.installable) ? 'update' : 'none';
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

  /**
   * Writes the missing and outdated structure fragments unless one of their files has changes
   * outside commits; the old texts are kept so that a Kit failure can put them back.
   */
  async function prepareStructure(project: Project): Promise<PreparedStructure> {
    const access = options.structure;
    if (!access) return NO_STRUCTURE;
    const skipped = (note: string): PreparedStructure => ({ ...NO_STRUCTURE, note });
    try {
      const report = await access.check(project.path);
      if (!report.installable) return NO_STRUCTURE;
      const status = options.kit.status ? await options.kit.status(project.path) : null;
      const changes = status?.ok ? status.result.changes : undefined;
      if (!Array.isArray(changes)) return skipped(STRUCTURE_NO_CHANGES);
      const paths = pendingPaths(report);
      const dirty = paths.filter((p) => changes.includes(p));
      if (dirty.length > 0) return skipped(dirtyNote(dirty));
      const saved = await snapshot(project.path, paths);
      const result = await access.install(project.path);
      const files = writtenPaths(report, result.written);
      return { with: files, saved, last: { from: report.installedVersion, to: report.version, files }, note: null };
    } catch (error) {
      // kit-structure refuses before it writes anything (invalid JSON, broken markers).
      return skipped(message(error));
    }
  }

  async function update(project: Project): Promise<void> {
    const current = entry(project.id);
    const from = current.installed;
    let prepared = NO_STRUCTURE;
    const putBack = async (): Promise<void> => {
      if (prepared.saved) await restore(project.path, prepared.saved).catch(() => undefined);
    };
    try {
      // M41: the facts are read again under the project lock before the first write; the
      // structure, Kit's commit and the restore of the structure all happen under it.
      const outcome = await serial(project.id, async () => {
        const deferred = await deferralOf(project);
        if (deferred) {
          current.deferred = deferred;
          current.error = { code: deferred.code, message: deferralText(deferred), nextAction: null, at: now().toISOString() };
          options.log?.(`kit: update deferred ${project.name}: ${deferred.code}`);
          return null;
        }
        prepared = await prepareStructure(project);
        // M40: the bundled Kit 2.4.0+ makes the project a `host` one (the app records the decisions).
        const installed = await options.kit.install(project.path, { update: true, ...(prepared.with.length > 0 ? { with: prepared.with } : {}), ...decisionsOption(bundled) });
        if (!installed.ok) await putBack();
        return installed;
      });
      if (!outcome) return;
      if (!outcome.ok) {
        current.error = { code: outcome.code, message: outcome.message, nextAction: outcome.nextAction, at: now().toISOString() };
        options.log?.(`kit: update failed ${project.name}: ${outcome.code}`);
        return;
      }
      // Kit committed the structure: it is never put back after this point.
      prepared = { ...prepared, saved: null };
      const hooks: string[] = [];
      for (const provider of options.providers.list()) {
        const line = await approveKitHooks(provider, project, options.hooks);
        if (line) hooks.push(line);
      }
      const to = outcome.result.version;
      const structureNote = prepared.note ? `Структура Kit не обновлена: ${prepared.note}` : null;
      current.last = { from, to, commit: outcome.result.commit?.sha ?? null, hooks, structure: prepared.last, structureNote, at: now().toISOString() };
      options.log?.(`kit: updated ${project.name} ${from ?? '—'} → ${to}`);
      if (prepared.last) options.log?.(`kit: structure ${project.name} ${prepared.last.from ?? '—'} → ${prepared.last.to}`);
      if (prepared.note) options.log?.(`kit: structure skipped ${project.name}: ${prepared.note}`);
    } catch (error) {
      await serial(project.id, putBack);
      current.error = { code: 'KIT_UPDATE_FAILED', message: message(error), nextAction: null, at: now().toISOString() };
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
    // M41: an open plan or a run not yet published: nothing starts, nothing is written.
    const deferred = await deferralOf(project);
    if (options.deferral) current.deferred = deferred;
    if (deferred) throw new HttpError(409, deferred.code, deferralText(deferred), { scopeId: deferred.scopeId, runId: deferred.runId });
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
