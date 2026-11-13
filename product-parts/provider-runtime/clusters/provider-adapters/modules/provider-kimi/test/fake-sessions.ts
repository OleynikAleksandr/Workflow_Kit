// Sessions of the fake Kimi server (see helpers.ts): a small in-memory copy of the session routes
// of Kimi 2.5.2 in the shapes of test/fixtures. Installed as the override of the fake API.
import { rmSync } from 'node:fs';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { hookJournalFile } from '#provider-registry';
import type { Project, Provider, ProviderContext } from '#provider-registry';
import { createKimiRuntime } from '../src/provider.ts';
import type { KimiDeps, KimiRuntime } from '../src/provider.ts';
import { fakeKimi } from './helpers.ts';
import type { FakeKimi, RawAnswer, SeenRequest } from './helpers.ts';

export interface FakeSession {
  id: string;
  workspace: string;
  cwd: string;
  title: string;
  /** Milliseconds, as GET /api/v2/sessions gives them. */
  created: number;
  archived: boolean;
  status: string;
  model: string;
  pending: string;
  lastReason?: string;
  /** Newest first, in the shape of GET …/messages. */
  messages: Array<Record<string, unknown>>;
}

/** A refusal the server answers instead of the route: `times` requests whose "METHOD url" matches. */
export interface FakeFailure {
  on: RegExp;
  code: number;
  times: number;
}

export interface FakeSessions {
  sessions: Map<string, FakeSession>;
  failures: FakeFailure[];
  /** Page size the server uses whatever the request asks (to test paging); 0 follows the request. */
  pageSize: number;
  /** Status of the next accepted prompts. */
  promptStatus: string;
  /** Bodies of the accepted prompts with their session. */
  prompts: Array<{ sessionId: string; body: Record<string, unknown> }>;
  /** Remote Control of the server: POST sets enabled; a server without the route has supported false. */
  remote: { supported: boolean; enabled: boolean; url: string; conflict: boolean };
  add(session: Partial<FakeSession> & { workspace: string }): FakeSession;
  /** Refuses the matching requests `times` times (default: always). */
  fail(on: RegExp, code: number, times?: number): void;
  /** A message in the shape of Kimi: origin is user, injection or undefined (assistant). */
  message(session: FakeSession, role: 'user' | 'assistant', text: string, origin?: string): void;
  /** Writes the lock file of a turn (default holder: this process, now). */
  lock(sessionId: string, holder?: Record<string, unknown>): Promise<void>;
}

const ok = (data: unknown): RawAnswer => ({ body: JSON.stringify({ code: 0, msg: 'success', data, request_id: 'test' }) });
const refusal = (code: number): RawAnswer => ({ status: Math.floor(code / 100), body: JSON.stringify({ code, msg: `refused ${code}`, data: null }) });

const full = (session: FakeSession): Record<string, unknown> => ({
  id: session.id,
  workspace_id: session.workspace,
  title: session.title,
  created_at: new Date(session.created).toISOString(),
  busy: session.status === 'running',
  main_turn_active: session.status === 'running',
  pending_interaction: session.pending,
  last_turn_reason: session.lastReason,
  archived: session.archived,
  metadata: { cwd: session.cwd },
  agent_config: { model: session.model },
});

const listed = (session: FakeSession): Record<string, unknown> => ({
  id: session.id,
  workspace: { id: session.workspace, cwd: session.cwd },
  meta: { title: session.title, created_at: session.created, updated_at: session.created, archived: session.archived, archived_at: null },
  activity: { status: session.status, model: session.model },
});

/** Installs the session routes on the fake machine. */
export function fakeSessions(machine: FakeKimi): FakeSessions {
  let count = 0;
  const state: FakeSessions = {
    sessions: new Map(),
    failures: [],
    pageSize: 0,
    promptStatus: 'running',
    prompts: [],
    remote: { supported: true, enabled: false, url: 'https://code-rc.kimi.com/devices/dev_1/', conflict: false },
    add(session) {
      count += 1;
      const item: FakeSession = { id: `session_${count}`, cwd: '/nowhere', title: `Session ${count}`, created: Date.now() - 60_000 + count, archived: false, status: 'idle', model: 'fake/fake', pending: 'none', messages: [], ...session };
      state.sessions.set(item.id, item);
      return item;
    },
    fail(on, code, times = Number.POSITIVE_INFINITY) {
      state.failures.push({ on, code, times });
    },
    message(session, role, text, origin) {
      const id = `msg_${session.id}_${String(session.messages.length).padStart(6, '0')}`;
      session.messages.unshift({ id, session_id: session.id, role, content: [{ type: 'text', text }], ...(origin ? { metadata: { origin: { kind: origin } } } : {}) });
    },
    async lock(sessionId, holder = { pid: process.pid, startedAt: Date.now() }) {
      await mkdir(machine.paths.locks, { recursive: true });
      await writeFile(path.join(machine.paths.locks, `${sessionId}.lock`), JSON.stringify(holder));
    },
  };

  const route = (request: SeenRequest): RawAnswer | undefined => {
    const [route = '', query = ''] = request.url.split('?');
    const params = new URLSearchParams(query);
    const failure = state.failures.find((item) => item.times > 0 && item.on.test(`${request.method} ${request.url}`));
    if (failure) {
      failure.times -= 1;
      return refusal(failure.code);
    }
    if (route === '/api/v1/remote-control' && state.remote.supported && (request.method === 'GET' || request.method === 'POST')) {
      if (request.method === 'POST') state.remote.enabled = (request.body as { enabled: boolean }).enabled;
      const { enabled, url, conflict } = state.remote;
      return ok({ enabled, state: enabled ? 'on' : 'off', ...(enabled ? { url, device_id: 'dev_1', device_name: 'test' } : {}), ...(conflict ? { conflict: { device_name: 'other' } } : {}) });
    }
    if (request.method === 'GET' && route === '/api/v2/sessions') {
      const archived = params.get('meta.archived');
      const all = [...state.sessions.values()]
        .filter((item) => item.workspace === params.get('workspace.id') && (archived === 'all' || String(item.archived) === (archived ?? 'false')))
        .sort((a, b) => b.created - a.created);
      const size = state.pageSize || Number(params.get('page_size') ?? 20);
      const start = Number(params.get('page_token') ?? 0);
      const more = start + size < all.length;
      return ok({ items: all.slice(start, start + size).map(listed), total: all.length, has_more: more, next_page_token: more ? String(start + size) : null });
    }
    if (request.method === 'POST' && route === '/api/v1/sessions') {
      const body = request.body as { workspace_id: string; title?: string; metadata?: { cwd?: string } };
      return ok(full(state.add({ workspace: body.workspace_id, title: body.title ?? '', cwd: body.metadata?.cwd ?? '', created: Date.now(), model: '' })));
    }
    const batch = /^\/api\/v2\/sessions:(archive|restore)$/.exec(route);
    if (request.method === 'POST' && batch) {
      const results = (request.body as { ids: string[] }).ids.map((id) => {
        const session = state.sessions.get(id);
        if (!session) return { id, ok: false, error: { code: 40401, message: 'session not found' } };
        session.archived = batch[1] === 'archive';
        return { id, ok: true };
      });
      return ok({ results, succeeded: results.filter((item) => item.ok).length, failed: results.filter((item) => !item.ok).length });
    }
    const one = /^\/api\/v1\/sessions\/([^/:]+)(\/profile|\/prompts|\/messages|:delete|:reload|:abort)?$/.exec(route);
    if (!one) return undefined;
    const session = state.sessions.get(one[1] ?? '');
    if (!session) return refusal(40401);
    const action = one[2] ?? '';
    if (request.method === 'GET' && action === '') return ok(full(session));
    if (request.method === 'GET' && action === '/messages') {
      const before = params.get('before_id');
      const from = before ? session.messages.findIndex((item) => item['id'] === before) + 1 : 0;
      const size = Number(params.get('page_size') ?? 50);
      return ok({ items: session.messages.slice(from, from + size), has_more: from + size < session.messages.length });
    }
    if (request.method !== 'POST') return undefined;
    if (action === '/profile') session.title = (request.body as { title: string }).title;
    if (action === ':abort') {
      const aborted = session.status === 'running';
      session.status = 'idle';
      if (aborted) session.lastReason = 'interrupted';
      rmSync(path.join(machine.paths.locks, `${session.id}.lock`), { force: true });
      return ok({ aborted });
    }
    if (action === ':delete') {
      state.sessions.delete(session.id);
      return ok({ deleted: true });
    }
    if (action === '/prompts') {
      const body = request.body as Record<string, unknown>;
      if (state.prompts.some((item) => item.body['prompt_id'] === body['prompt_id'])) return refusal(40927);
      state.prompts.push({ sessionId: session.id, body });
      return ok({ prompt_id: body['prompt_id'], user_message_id: body['prompt_id'], status: state.promptStatus, content: body['content'] });
    }
    return ok(full(session));
  };
  machine.api.override = route;
  return state;
}

/** Short waits of the server and of the retries after 40931. */
export const FAST = { startWaitMs: 2000, stopWaitMs: 500, pollMs: 10, retryDelaysMs: [1, 1, 1] };

/** A fake machine with the program installed, the session routes, one project and a provider (the app counts as installed). */
export interface SessionSetup {
  machine: FakeKimi;
  api: FakeSessions;
  project: Project;
  provider: Provider;
  runtime: KimiRuntime;
  /** Moves the clock of the provider context forward. */
  advance(ms: number): void;
  /** A second provider on the same directories: the service after a restart. */
  restart(): Provider;
  /** Adds a workspace of a folder to the server; resolves to its id. */
  workspace(folder: string): string;
  /** Appends a SessionStart line of a Kimi session to the hook journal of the project. */
  journal(sessionId: string, cwd?: string | null): Promise<void>;
  /** Requests whose "METHOD url" matches. */
  seen(on: RegExp): SeenRequest[];
  /** Types of the events written so far. */
  events(): Promise<string[]>;
}

export async function withSessions(run: (setup: SessionSetup) => Promise<void>, deps: KimiDeps = {}, context: Partial<ProviderContext> = {}): Promise<void> {
  const machine = await fakeKimi();
  try {
    await machine.installProgram();
    const api = fakeSessions(machine);
    const project = await machine.project('app');
    let shift = 0;
    const create = (): { runtime: KimiRuntime; provider: Provider } => createKimiRuntime(machine.context({ now: () => new Date(Date.now() + shift), ...context }), { ...FAST, appFound: async () => true, ...deps });
    const { runtime, provider } = create();
    let count = 0;
    await run({
      machine,
      api,
      project,
      provider,
      runtime,
      advance: (ms) => void (shift += ms),
      restart: () => create().provider,
      workspace(folder) {
        count += 1;
        const id = `wm_ext-${count}`;
        machine.api.workspaces.push({ id, root: folder, name: path.basename(folder), kind: 'managed', additional_dirs: [], session_count: 0 });
        return id;
      },
      async journal(sessionId, cwd = project.path) {
        const file = hookJournalFile(project.path);
        await mkdir(path.dirname(file), { recursive: true });
        await appendFile(file, `${JSON.stringify({ time: new Date(Date.now() - 120_000).toISOString(), client: 'kimi', event: 'SessionStart', session_id: sessionId, source: 'startup', ...(cwd ? { cwd } : {}) })}\n`);
      },
      seen: (on) => machine.api.requests.filter((request) => on.test(`${request.method} ${request.url}`)),
      async events() {
        await new Promise((resolve) => setTimeout(resolve, 30)); // Events are appended without waiting.
        const text = await readFile(path.join(machine.dirs.stateDir, 'events.jsonl'), 'utf8').catch(() => '');
        return text.split('\n').filter(Boolean).map((line) => String((JSON.parse(line) as { type?: unknown }).type));
      },
    });
  } finally {
    await machine.close();
  }
}
