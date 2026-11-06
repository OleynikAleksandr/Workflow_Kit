// The per-session "Ревью плана" toggle (spec section 10). Milestone 2 only stores and shows it:
// no review runs and nothing reaches the agent. The value lives in the project folder,
// .workflow-kit/local/sessions/<client>.<session id>.json ({ "review": true|false }); the toggle
// is visible until the execution path is chosen (Kit scope with an execution).
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { readJsonFile, writeJsonAtomic } from '#data-store';

export const SESSIONS_DIR = '.workflow-kit/local/sessions';

/** Toggle state of one project for the panel. */
export interface ProjectReview {
  /** False after scope:choose: the toggle disappears and changes are refused. */
  visible: boolean;
  /** Session key → toggle value (only sessions that changed it; default off). */
  sessions: Record<string, boolean>;
}

export interface ReviewSection {
  projects: Record<string, ProjectReview>;
}

/** The toggle can no longer change (the path is chosen) or the session key is invalid. */
export class ReviewToggleError extends Error {
  readonly code: 'review-closed' | 'bad-session' | 'project-not-found';
  readonly status: number;
  constructor(code: ReviewToggleError['code'], message: string, status: number) {
    super(message);
    this.name = 'ReviewToggleError';
    this.code = code;
    this.status = status;
  }
}

export interface ReviewTogglesOptions {
  listProjects: () => Promise<Array<{ id: string; path: string }>>;
  /** True when the project's execution path is already chosen. */
  pathChosen: (projectId: string) => boolean;
}

export interface ReviewToggles {
  /** Reads the stored values of all projects. */
  load(): Promise<void>;
  get(projectId: string, key: string): boolean;
  set(projectId: string, key: string, on: boolean): Promise<ProjectReview>;
  section(): ReviewSection;
}

const KEY = /^(claude|codex):([A-Za-z0-9._-]{1,200})$/;

/** File name of a session key, or null for an invalid key. */
export function sessionFileName(key: string): string | null {
  const match = KEY.exec(key);
  return match ? `${match[1]}.${match[2]}.json` : null;
}

function keyOfFile(name: string): string | null {
  const match = /^(claude|codex)\.([A-Za-z0-9._-]{1,200})\.json$/.exec(name);
  return match ? `${match[1]}:${match[2]}` : null;
}

export function createReviewToggles(options: ReviewTogglesOptions): ReviewToggles {
  const values = new Map<string, Map<string, boolean>>();

  async function readProject(folder: string): Promise<Map<string, boolean>> {
    const result = new Map<string, boolean>();
    let names: string[] = [];
    try {
      names = await readdir(path.join(folder, SESSIONS_DIR));
    } catch {
      return result;
    }
    for (const name of names) {
      const key = keyOfFile(name);
      if (!key) continue;
      try {
        const value = (await readJsonFile(path.join(folder, SESSIONS_DIR, name))) as Record<string, unknown> | undefined;
        if (value && typeof value['review'] === 'boolean') result.set(key, value['review']);
      } catch {
        // A broken file counts as "off".
      }
    }
    return result;
  }

  function view(projectId: string): ProjectReview {
    return {
      visible: !options.pathChosen(projectId),
      sessions: Object.fromEntries(values.get(projectId) ?? []),
    };
  }

  return {
    async load() {
      for (const project of await options.listProjects()) values.set(project.id, await readProject(project.path));
    },
    get: (projectId, key) => values.get(projectId)?.get(key) ?? false,
    async set(projectId, key, on) {
      const file = sessionFileName(key);
      if (!file) throw new ReviewToggleError('bad-session', 'Неверный ключ сессии', 400);
      const project = (await options.listProjects()).find((p) => p.id === projectId);
      if (!project) throw new ReviewToggleError('project-not-found', 'Проект не найден', 404);
      if (options.pathChosen(projectId)) {
        throw new ReviewToggleError('review-closed', 'Путь выполнения уже выбран: переключатель ревью больше не меняется', 409);
      }
      const target = path.join(project.path, SESSIONS_DIR, file);
      const current = ((await readJsonFile(target).catch(() => undefined)) ?? {}) as Record<string, unknown>;
      await writeJsonAtomic(target, { ...current, review: on }, { mode: 0o600, dirMode: 0o700 });
      const map = values.get(projectId) ?? new Map<string, boolean>();
      map.set(key, on);
      values.set(projectId, map);
      return view(projectId);
    },
    section() {
      const projects: Record<string, ProjectReview> = {};
      for (const id of values.keys()) projects[id] = view(id);
      return { projects };
    },
  };
}
