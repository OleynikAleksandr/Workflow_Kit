import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { InvalidJsonFileError, createKeyedMutex, readJsonFile, writeJsonAtomic } from '#data-store';
import type { DataDirs, EventLog, KeyedMutex } from '#data-store';
import { ProjectError, fsError } from './errors.ts';
import { isInside, nodeFs, realHome, requireDirectory, resolveInsideHome, samePath } from './home-paths.ts';
import type { HomeScope } from './home-paths.ts';
import { checkProjectName } from './names.ts';

/** Version of the projects.json format. */
export const PROJECTS_FILE_VERSION = 1;

/** A registered project. */
export interface Project {
  /** Stable id used in URLs (12 hex characters). */
  id: string;
  /** Display name: the given name for created projects, the folder name for opened ones. */
  name: string;
  /** Real absolute path of the project folder. */
  path: string;
  /** How the project got into the list. */
  source: 'created' | 'opened';
  createdAt: string;
  /** Set when the user moved the project to the archive (the folder stays). */
  archivedAt?: string;
}

/** A project as shown in /api/state. */
export interface ProjectView extends Project {
  /** True when the folder no longer exists (or cannot be reached). */
  missing: boolean;
}

/** The "projects" section of /api/state. */
export interface ProjectsSection {
  /** Root for new projects (config.json projectsRoot, "~" expanded). */
  root: string;
  /** Home folder: the folder picker starts and stays here. */
  home: string;
  projects: ProjectView[];
  /** Set when projects.json cannot be read; the list is then empty. */
  error?: string;
}

/** Reports why a project cannot be removed (live sessions, environments); empty when it can. */
export type RemoveGuard = (project: Project) => string[] | Promise<string[]>;

/**
 * Called after a project left the list (removed or deleted from disk) with the projects that
 * remain; the service drops every record of the project (its sessions in the providers).
 */
export type RemovedHook = (project: Project, remaining: readonly Project[]) => void | Promise<void>;

/**
 * Called after a project went into the archive (archived true) or came back from it; the service
 * stops the project's sessions or brings them back.
 */
/**
 * Called before the folder of a project is deleted from disk (the guards passed): the service
 * deletes the project's sessions in the provider apps, which it finds partly in the folder.
 */
export type BeforeDeleteHook = (project: Project) => void | Promise<void>;

export type ArchivedHook = (project: Project, archived: boolean) => void | Promise<void>;

/** Options of the registry; file system, clock and ids are injectable for tests. */
export interface ProjectRegistryOptions extends HomeScope {
  /** projects.json path (see projectsFile). */
  file: string;
  /** config.json projectsRoot; "~" and "~/..." are expanded to the home folder. */
  projectsRoot: string;
  events?: EventLog;
  mutex?: KeyedMutex;
  now?: () => Date;
  newId?: () => string;
  /** Saves a new root for new projects (config.json projectsRoot). */
  saveRoot?: (root: string) => Promise<void>;
}

/** The project list stored in projects.json. */
export interface ProjectRegistry {
  readonly file: string;
  /** Root for new projects with "~" expanded (changes with setRoot). */
  readonly root: string;
  list(): Promise<Project[]>;
  get(id: string): Promise<Project | undefined>;
  /** Creates the folder <root>/<name> and registers it. */
  create(name: unknown): Promise<Project>;
  /** Registers an existing folder inside home; an already registered folder is returned as is. */
  open(folder: unknown): Promise<{ project: Project; existing: boolean }>;
  /** Removes the project from the list only; the folder stays on disk. */
  remove(id: string): Promise<Project>;
  /** Moves the project to the archive (hidden from the tree; the folder stays). */
  archive(id: string): Promise<Project>;
  /** Brings an archived project back. */
  restore(id: string): Promise<Project>;
  /**
   * Deletes the folder of an archived project from disk and removes the project from the list.
   * `confirm` must be the exact project name; the home folder and the projects root are never
   * deleted, and the remove guards (live sessions) apply.
   */
  deleteFolder(id: string, confirm: unknown): Promise<Project>;
  /** Changes the root for new projects: an absolute folder inside home, created when missing. */
  setRoot(folder: unknown): Promise<string>;
  addRemoveGuard(guard: RemoveGuard): void;
  /** Runs after a project left the list; a failing hook does not undo the removal. */
  addRemovedHook(hook: RemovedHook): void;
  /** Runs after an archive or a restore; a failing hook does not undo it. */
  addArchivedHook(hook: ArchivedHook): void;
  /** Runs before deleteFolder removes the folder; a failing hook does not stop the deletion. */
  addBeforeDeleteHook(hook: BeforeDeleteHook): void;
  section(): Promise<ProjectsSection>;
}

/** Path of projects.json inside the data directories. */
export function projectsFile(dirs: DataDirs): string {
  return path.join(dirs.configDir, 'projects.json');
}

/** Expands "~" and "~/..." against the home folder. */
export function expandHome(value: string, homedir: string): string {
  if (value === '~') return homedir;
  if (value.startsWith('~/') || value.startsWith('~\\')) return path.join(homedir, value.slice(2));
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseProject(value: unknown): Project | undefined {
  if (!isRecord(value)) return undefined;
  const { id, name, path: folder, source, createdAt, archivedAt } = value;
  if (typeof id !== 'string' || typeof name !== 'string' || typeof folder !== 'string') return undefined;
  return {
    id,
    name,
    path: folder,
    source: source === 'created' ? 'created' : 'opened',
    createdAt: typeof createdAt === 'string' ? createdAt : '',
    ...(typeof archivedAt === 'string' ? { archivedAt } : {}),
  };
}

/** Creates the registry over projects.json; actions run one at a time (D10). */
export function createProjectRegistry(options: ProjectRegistryOptions): ProjectRegistry {
  const fs = options.fs ?? nodeFs;
  const mutex = options.mutex ?? createKeyedMutex();
  const now = options.now ?? (() => new Date());
  const newId = options.newId ?? (() => randomBytes(6).toString('hex'));
  let root = expandHome(options.projectsRoot, options.homedir);
  const guards: RemoveGuard[] = [];
  const removedHooks: RemovedHook[] = [];
  const archivedHooks: ArchivedHook[] = [];
  const beforeDeleteHooks: BeforeDeleteHook[] = [];

  async function removed(project: Project, remaining: Project[]): Promise<void> {
    for (const hook of removedHooks) {
      try {
        await hook(project, remaining);
      } catch {
        // The project is already out of the list; leftovers are cleaned at the next start.
      }
    }
  }
  let cache: Project[] | undefined;

  async function load(): Promise<Project[]> {
    if (cache) return cache;
    let raw: unknown;
    try {
      raw = await readJsonFile(options.file);
    } catch (error) {
      if (error instanceof InvalidJsonFileError) {
        throw new ProjectError('registry-invalid', `Файл ${options.file} повреждён (невалидный JSON); он не перезаписывается`);
      }
      throw error;
    }
    if (raw === undefined) return (cache = []);
    if (!isRecord(raw) || !Array.isArray(raw['projects'])) {
      throw new ProjectError('registry-invalid', `Файл ${options.file} не похож на список проектов; он не перезаписывается`);
    }
    return (cache = raw['projects'].map(parseProject).filter((p): p is Project => p !== undefined));
  }

  async function save(projects: Project[]): Promise<void> {
    await writeJsonAtomic(options.file, { version: PROJECTS_FILE_VERSION, projects });
    cache = projects;
  }

  async function log(type: string, project: Project): Promise<void> {
    await options.events?.append(type, { id: project.id, name: project.name, path: project.path }).catch(() => undefined);
  }

  function findByPath(projects: Project[], real: string): Project | undefined {
    return projects.find((p) => samePath(p.path, real, options.platform));
  }

  async function ensureRoot(): Promise<string> {
    if (!path.isAbsolute(root)) {
      throw new ProjectError('invalid-path', `Корень проектов в config.json должен быть абсолютным путём: ${root}`);
    }
    try {
      await fs.mkdir(root, { recursive: true });
      return await fs.realpath(root);
    } catch (error) {
      throw fsError(error, root, options.platform);
    }
  }

  async function create(rawName: unknown): Promise<Project> {
    const check = checkProjectName(rawName);
    if (!check.ok) throw new ProjectError('invalid-name', check.reason);
    const projects = await load();
    const home = await realHome(options);
    const realRoot = await ensureRoot();
    const target = path.join(realRoot, check.name);
    if (!isInside(target, home, options.platform)) {
      throw new ProjectError('outside-home', `Корень проектов вне домашней папки: ${realRoot}`);
    }
    try {
      await fs.mkdir(target, { recursive: false });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new ProjectError('exists', `Папка «${check.name}» уже есть в корне проектов; откройте её через выбор папки`);
      }
      throw fsError(error, target, options.platform);
    }
    const real = await resolveInsideHome(target, options);
    const project: Project = { id: newId(), name: check.name, path: real, source: 'created', createdAt: now().toISOString() };
    await save([...projects, project]);
    await log('project.created', project);
    return project;
  }

  async function open(folder: unknown): Promise<{ project: Project; existing: boolean }> {
    const projects = await load();
    const real = await resolveInsideHome(folder, options);
    await requireDirectory(real, options);
    try {
      await fs.readdir(real);
    } catch (error) {
      throw fsError(error, real, options.platform);
    }
    const known = findByPath(projects, real);
    if (known) return { project: known, existing: true };
    const name = path.basename(real).normalize('NFC');
    const project: Project = { id: newId(), name, path: real, source: 'opened', createdAt: now().toISOString() };
    await save([...projects, project]);
    await log('project.opened', project);
    return { project, existing: false };
  }

  async function remove(id: string): Promise<Project> {
    const projects = await load();
    const project = projects.find((p) => p.id === id);
    if (!project) throw new ProjectError('not-found', `Проект не найден: ${id}`);
    const blockers = (await Promise.all(guards.map((guard) => guard(project)))).flat();
    if (blockers.length > 0) {
      throw new ProjectError('busy', 'Проект занят: сначала остановите его сессии и окружения', { blockers });
    }
    const remaining = projects.filter((p) => p.id !== id);
    await save(remaining);
    await log('project.removed', project);
    await removed(project, remaining);
    return project;
  }

  async function deleteFolder(id: string, confirm: unknown): Promise<Project> {
    const projects = await load();
    const project = projects.find((p) => p.id === id);
    if (!project) throw new ProjectError('not-found', `Проект не найден: ${id}`);
    if (!project.archivedAt) throw new ProjectError('not-archived', 'С диска удаляется только проект из архива: сначала уберите его в архив');
    if (confirm !== project.name) throw new ProjectError('confirm-mismatch', `Для удаления введите точное имя проекта: ${project.name}`);
    const home = await realHome(options);
    const protectedPaths = [home, root, options.homedir];
    if (!isInside(project.path, home, options.platform) || protectedPaths.some((p) => samePath(p, project.path, options.platform))) {
      throw new ProjectError('invalid-path', `Эту папку Workflow Kit не удаляет: ${project.path}`);
    }
    const blockers = (await Promise.all(guards.map((guard) => guard(project)))).flat();
    if (blockers.length > 0) {
      throw new ProjectError('busy', 'Проект занят: сначала остановите его сессии и окружения', { blockers });
    }
    for (const hook of beforeDeleteHooks) {
      try {
        await hook(project);
      } catch {
        // The hook reports its own failures; the folder is deleted anyway.
      }
    }
    try {
      await fs.rm(project.path);
    } catch (error) {
      throw fsError(error, project.path, options.platform);
    }
    const remaining = projects.filter((p) => p.id !== id);
    await save(remaining);
    await log('project.deleted', project);
    await removed(project, remaining);
    return project;
  }

  async function setArchived(id: string, archived: boolean): Promise<Project> {
    const projects = await load();
    const index = projects.findIndex((p) => p.id === id);
    if (index < 0) throw new ProjectError('not-found', `Проект не найден: ${id}`);
    const { archivedAt: _old, ...rest } = projects[index]!;
    const project: Project = archived ? { ...rest, archivedAt: now().toISOString() } : rest;
    const next = [...projects];
    next[index] = project;
    await save(next);
    await log(archived ? 'project.archived' : 'project.restored', project);
    for (const hook of archivedHooks) {
      try {
        await hook(project, archived);
      } catch {
        // The archive state is saved; the hook reports its own failures.
      }
    }
    return project;
  }

  async function setRoot(folder: unknown): Promise<string> {
    if (typeof folder !== 'string' || folder.trim() === '') throw new ProjectError('invalid-path', 'Укажите папку для проектов');
    const expanded = expandHome(folder.trim(), options.homedir);
    if (!path.isAbsolute(expanded)) throw new ProjectError('invalid-path', `Нужен абсолютный путь: ${folder}`);
    const home = await realHome(options);
    try {
      await fs.mkdir(expanded, { recursive: true });
    } catch (error) {
      throw fsError(error, expanded, options.platform);
    }
    const real = await resolveInsideHome(expanded, options);
    if (!isInside(real, home, options.platform)) throw new ProjectError('outside-home', `Папка вне домашней: ${real}`);
    await options.saveRoot?.(real);
    root = real;
    return real;
  }

  async function exists(folder: string): Promise<boolean> {
    try {
      return (await fs.stat(folder)).isDirectory();
    } catch {
      return false;
    }
  }

  return {
    file: options.file,
    get root() {
      return root;
    },
    list: () => load().then((p) => [...p]),
    get: async (id) => (await load()).find((p) => p.id === id),
    create: (name) => mutex.run('projects', () => create(name)),
    open: (folder) => mutex.run('projects', () => open(folder)),
    remove: (id) => mutex.run('projects', () => remove(id)),
    archive: (id) => mutex.run('projects', () => setArchived(id, true)),
    restore: (id) => mutex.run('projects', () => setArchived(id, false)),
    deleteFolder: (id, confirm) => mutex.run('projects', () => deleteFolder(id, confirm)),
    setRoot: (folder) => mutex.run('projects', () => setRoot(folder)),
    addRemoveGuard(guard) {
      guards.push(guard);
    },
    addRemovedHook(hook) {
      removedHooks.push(hook);
    },
    addArchivedHook(hook) {
      archivedHooks.push(hook);
    },
    addBeforeDeleteHook(hook) {
      beforeDeleteHooks.push(hook);
    },
    async section() {
      const base = { root, home: options.homedir };
      let projects: Project[];
      try {
        projects = await load();
      } catch (error) {
        return { ...base, projects: [], error: error instanceof Error ? error.message : String(error) };
      }
      const views = await Promise.all(projects.map(async (p) => ({ ...p, missing: !(await exists(p.path)) })));
      return { ...base, projects: views };
    },
  };
}
