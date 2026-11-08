// The per-session review decision and the plan question (spec M4 sections 10 and 12). The values
// live in the project folder, .workflow-kit/local/sessions/<client>.<session id>.json
// ({ "review": true|false, "question": { kind, summary, askedAt } }). The decision can change
// until the execution path is chosen (Kit scope with an execution); the question asks the user
// whether a development task gets a specification and a plan, with or without the review.
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
  /** Session key → its open plan question (spec M4 section 12). */
  questions: Record<string, PlanQuestion>;
}

/** agent: `wfk session plan` before a specification; proposal: a plan came without a decision. */
export type QuestionKind = 'agent' | 'proposal';
/** review / plan: a specification and a plan with or without the review; talk: no plan. */
export type PlanChoice = 'review' | 'plan' | 'talk';

export interface PlanQuestion {
  kind: QuestionKind;
  summary: string;
  askedAt: string;
}

export const SUMMARY_MAX_CHARS = 500;

export type AnswerListener = (projectId: string, key: string, choice: PlanChoice, question: PlanQuestion) => Promise<void> | void;

export interface ReviewSection {
  projects: Record<string, ProjectReview>;
}

/** The toggle can no longer change (the path is chosen) or the session key is invalid. */
export class ReviewToggleError extends Error {
  readonly code: 'review-closed' | 'review-locked' | 'bad-session' | 'project-not-found' | 'no-question' | 'bad-choice';
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
  /** Why the toggle of a session can no longer change (its review ran or runs), else null (M4). */
  locked?: (projectId: string, key: string) => string | null;
  /** After a stored change: the cross review starts or stops (M4 section 10). */
  onChange?: (projectId: string, key: string, on: boolean) => Promise<void>;
  now?: () => Date;
}

export interface ReviewToggles {
  /** Reads the stored values of all projects. */
  load(): Promise<void>;
  get(projectId: string, key: string): boolean;
  set(projectId: string, key: string, on: boolean): Promise<ProjectReview>;
  /** The session has a review decision (an answer or the old toggle). */
  decided(projectId: string, key: string): boolean;
  /** Opens (or replaces) the plan question of a session. */
  ask(projectId: string, key: string, kind: QuestionKind, summary: string): Promise<PlanQuestion>;
  question(projectId: string, key: string): PlanQuestion | null;
  /** Any open question in the project. */
  asking(projectId: string): boolean;
  /** Closes the question with the user's choice; review/plan store the decision. */
  answer(projectId: string, key: string, choice: PlanChoice): Promise<ProjectReview>;
  /** Listener of answers: the agent gets its message and is woken (spec M4 12.1). */
  onAnswer(listener: AnswerListener): () => void;
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

function parseQuestion(value: unknown): PlanQuestion | null {
  if (typeof value !== 'object' || value === null) return null;
  const q = value as Record<string, unknown>;
  if ((q['kind'] !== 'agent' && q['kind'] !== 'proposal') || typeof q['summary'] !== 'string' || typeof q['askedAt'] !== 'string') return null;
  return { kind: q['kind'], summary: q['summary'], askedAt: q['askedAt'] };
}

export function createReviewToggles(options: ReviewTogglesOptions): ReviewToggles {
  const values = new Map<string, Map<string, boolean>>();
  const questions = new Map<string, Map<string, PlanQuestion>>();
  const now = options.now ?? (() => new Date());
  const listeners = new Set<AnswerListener>();

  async function readProject(folder: string, projectId: string): Promise<Map<string, boolean>> {
    const result = new Map<string, boolean>();
    const asked = new Map<string, PlanQuestion>();
    questions.set(projectId, asked);
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
        const question = parseQuestion(value?.['question']);
        if (question) asked.set(key, question);
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
      questions: Object.fromEntries(questions.get(projectId) ?? []),
    };
  }

  /** Validates the key and finds the project; returns the session file. */
  async function target(projectId: string, key: string): Promise<string> {
    const file = sessionFileName(key);
    if (!file) throw new ReviewToggleError('bad-session', 'Неверный ключ сессии', 400);
    const project = (await options.listProjects()).find((p) => p.id === projectId);
    if (!project) throw new ReviewToggleError('project-not-found', 'Проект не найден', 404);
    return path.join(project.path, SESSIONS_DIR, file);
  }

  async function write(file: string, change: (current: Record<string, unknown>) => Record<string, unknown>): Promise<void> {
    const current = ((await readJsonFile(file).catch(() => undefined)) ?? {}) as Record<string, unknown>;
    await writeJsonAtomic(file, change(current), { mode: 0o600, dirMode: 0o700 });
  }

  function remember(projectId: string, key: string, on: boolean): void {
    const map = values.get(projectId) ?? new Map<string, boolean>();
    map.set(key, on);
    values.set(projectId, map);
  }

  return {
    async load() {
      for (const project of await options.listProjects()) values.set(project.id, await readProject(project.path, project.id));
    },
    get: (projectId, key) => values.get(projectId)?.get(key) ?? false,
    decided: (projectId, key) => values.get(projectId)?.has(key) ?? false,
    question: (projectId, key) => questions.get(projectId)?.get(key) ?? null,
    asking: (projectId) => (questions.get(projectId)?.size ?? 0) > 0,
    async ask(projectId, key, kind, summary) {
      const file = await target(projectId, key);
      const question: PlanQuestion = { kind, summary: summary.trim().slice(0, SUMMARY_MAX_CHARS), askedAt: now().toISOString() };
      await write(file, (current) => ({ ...current, question }));
      const map = questions.get(projectId) ?? new Map<string, PlanQuestion>();
      map.set(key, question);
      questions.set(projectId, map);
      return question;
    },
    async answer(projectId, key, choice) {
      if (choice !== 'review' && choice !== 'plan' && choice !== 'talk') throw new ReviewToggleError('bad-choice', 'Ожидается review, plan или talk', 400);
      const file = await target(projectId, key);
      const question = questions.get(projectId)?.get(key);
      if (!question) throw new ReviewToggleError('no-question', 'У сессии нет открытого вопроса о плане', 409);
      if (question.kind === 'proposal' && choice === 'talk') throw new ReviewToggleError('bad-choice', 'План уже предложен: выберите «С ревью» или «Без ревью»', 400);
      // The decision is stored while it can still matter; a chosen path keeps the old one.
      const decide = choice !== 'talk' && !options.pathChosen(projectId);
      await write(file, (current) => {
        const rest = { ...current };
        delete rest['question'];
        return decide ? { ...rest, review: choice === 'review' } : rest;
      });
      questions.get(projectId)?.delete(key);
      if (decide) remember(projectId, key, choice === 'review');
      for (const listener of listeners) await listener(projectId, key, choice, question);
      return view(projectId);
    },
    onAnswer(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    async set(projectId, key, on) {
      const file = await target(projectId, key);
      if (options.pathChosen(projectId)) {
        throw new ReviewToggleError('review-closed', 'Путь выполнения уже выбран: переключатель ревью больше не меняется', 409);
      }
      const locked = options.locked?.(projectId, key) ?? null;
      if (locked) throw new ReviewToggleError('review-locked', locked, 409);
      await write(file, (current) => ({ ...current, review: on }));
      remember(projectId, key, on);
      await options.onChange?.(projectId, key, on);
      return view(projectId);
    },
    section() {
      const projects: Record<string, ProjectReview> = {};
      for (const id of new Set([...values.keys(), ...questions.keys()])) projects[id] = view(id);
      return { projects };
    },
  };
}
