// Test setup of the Kimi provider: a temporary home with a Kimi Code home in it, a fake `kimi`
// program file, a fake supervisor whose spawn starts a fake Kimi server (node:http, answers from
// test/fixtures) and writes its record to server/instances. Works on every OS.
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createEventLog } from '#data-store';
import type { DataDirs } from '#data-store';
import { ProcessError } from '#process-supervisor';
import type { ProcessRecord, ProcessSupervisor, RunResult, SpawnSpec } from '#process-supervisor';
import type { Project, ProviderContext } from '#provider-registry';
import { providerSessionsFile } from '#provider-registry';
import { kimiPaths } from '../src/paths.ts';
import type { KimiPaths } from '../src/paths.ts';

/** `data` of a captured answer of Kimi 2.5.2 (docs/evidence/M8-kimi-captures.md). */
export async function fixture(name: string): Promise<unknown> {
  const text = await readFile(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8');
  return (JSON.parse(text) as { data: unknown }).data;
}

/** One request the fake server received. */
export interface SeenRequest {
  method: string;
  url: string;
  authorization: string | undefined;
  body: unknown;
}

/** A raw answer of the fake server. */
export interface RawAnswer {
  status?: number;
  headers?: Record<string, string>;
  body: string;
}

/** What the fake Kimi server answers; tests change the fields between calls. */
export interface FakeApi {
  token: string;
  meta: unknown;
  auth: unknown;
  config: unknown;
  workspaces: Array<Record<string, unknown>>;
  /** Answers before the normal routes (after the token check); undefined falls through. */
  override?: (request: SeenRequest) => RawAnswer | undefined;
  /** POST …/trust answers trusted but writes no file. */
  skipTrustFile: boolean;
  requests: SeenRequest[];
}

/** One fake machine. */
export interface FakeKimi {
  root: string;
  home: string;
  paths: KimiPaths;
  dirs: DataDirs;
  api: FakeApi;
  supervisor: ProcessSupervisor;
  /** Specs given to spawn, in order. */
  spawned: SpawnSpec[];
  /** The next spawn fails: 'throw' (the program does not start) or 'exit' (it ends at once). */
  failSpawn: 'throw' | 'exit' | null;
  /** Version printed by the fake `kimi --version`. */
  version: string;
  context(overrides?: Partial<ProviderContext>): ProviderContext;
  /** Creates the program file `<kimi home>/bin/kimi[.exe]`. */
  installProgram(): Promise<void>;
  /** Writes <state>/sessions/kimi.json with one record: Kit keeps Kimi sessions. */
  keepSession(): Promise<void>;
  project(name: string): Promise<Project>;
  /** Ends the fake server process as a crash would (no shutdown request). */
  crash(): Promise<void>;
  /** Requests of one route. */
  seen(method: string, url: string): SeenRequest[];
  close(): Promise<void>;
}

const envelope = (data: unknown): RawAnswer => ({ body: JSON.stringify({ code: 0, msg: 'success', data, request_id: 'test' }) });
const refused: RawAnswer = { status: 401, body: JSON.stringify({ code: 40101, msg: 'Unauthorized', data: null }) };

function route(machine: FakeKimi, request: SeenRequest, stop: () => void): RawAnswer {
  const { api, paths } = machine;
  if (request.url === '/api/v1/healthz') return envelope({ ok: true });
  if (request.authorization !== `Bearer ${api.token}`) return refused;
  const custom = api.override?.(request);
  if (custom) return custom;
  const key = `${request.method} ${request.url}`;
  if (key === 'GET /api/v1/meta') return envelope(api.meta);
  if (key === 'GET /api/v1/auth') return envelope(api.auth);
  if (key === 'GET /api/v1/config') return envelope(api.config);
  if (key === 'GET /api/v1/workspaces') return envelope({ items: api.workspaces });
  if (key === 'POST /api/v1/workspaces') {
    const body = request.body as { root: string; idempotency_key?: string };
    const known = api.workspaces.find((item) => item['key'] !== undefined && item['key'] === body.idempotency_key);
    if (known) return envelope(known);
    const created = { id: `wm_test-${api.workspaces.length + 1}`, root: body.root, name: path.basename(body.root), kind: 'managed', additional_dirs: [], session_count: 0, key: body.idempotency_key };
    api.workspaces.push(created);
    return envelope(created);
  }
  if (key === 'POST /api/v1/shutdown') {
    setTimeout(stop, 10);
    return envelope({ ok: true });
  }
  const trust = /^\/api\/v1\/workspaces\/([^/]+)\/trust$/.exec(request.url);
  const workspace = trust && api.workspaces.find((item) => item['id'] === decodeURIComponent(trust[1] ?? ''));
  if (trust && !workspace) return { body: JSON.stringify({ code: 40001, msg: 'workspace not found', data: null, details: { secret: 'DETAILS' } }) };
  if (workspace && request.method === 'POST') {
    const root = String(workspace['root']);
    const file = path.join(paths.trustDir, `wd_${path.basename(root)}_${createHash('sha256').update(root).digest('hex').slice(0, 12)}`);
    if (!api.skipTrustFile) {
      mkdirSync(paths.trustDir, { recursive: true });
      writeFileSync(file, JSON.stringify({ root, trustedAt: Date.now() }));
    }
    return envelope({ trusted: true });
  }
  if (workspace) return envelope({ trusted: false });
  return { status: 404, body: JSON.stringify({ code: 40401, msg: 'not found', data: null }) };
}

/** Creates a fake machine in a temporary directory. */
export async function fakeKimi(): Promise<FakeKimi> {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'wfkk-')));
  const home = path.join(root, 'home');
  const paths = kimiPaths(path.join(home, '.kimi-code'), process.platform);
  const data = path.join(root, 'data');
  const dirs: DataDirs = { configDir: data, stateDir: data, appDir: data, logsDir: path.join(data, 'logs'), backupsDir: path.join(data, 'backups'), overridden: true };
  await mkdir(paths.home, { recursive: true });
  await writeFile(paths.token, 'test-token\n', { mode: 0o600 });
  const servers = new Map<string, { record: ProcessRecord; server: http.Server; instance: string }>();
  let count = 0;
  // A closed machine starts nothing: late work of a service that outlives its test must not
  // leave a listening server behind (the test process would never exit).
  let closed = false;

  const end = async (id: string): Promise<void> => {
    const entry = servers.get(id);
    if (!entry) return;
    servers.delete(id);
    entry.server.closeAllConnections();
    await new Promise<void>((resolve) => entry.server.close(() => resolve()));
    await rm(entry.instance, { force: true });
  };

  const supervisor: ProcessSupervisor = {
    file: path.join(data, 'processes.json'),
    async spawn(spec) {
      machine.spawned.push(spec);
      const failure = machine.failSpawn;
      machine.failSpawn = null;
      if (failure === 'throw') throw new ProcessError('start-failed', `${spec.command}: ENOENT`);
      if (closed) throw new ProcessError('start-failed', `${spec.command}: the fake machine is closed`);
      count += 1;
      const id = `proc-${count}`;
      const pid = 40_000 + count;
      const port = Number(spec.args[spec.args.indexOf('--port') + 1]);
      const record: ProcessRecord = {
        id, owner: spec.owner, pid, pgid: pid, command: spec.command, args: [...spec.args], cwd: spec.cwd, logFile: spec.logFile,
        startToken: 'token', startedAt: new Date().toISOString(), commandLine: [spec.command, ...spec.args].join(' '), bootId: null, children: [],
      };
      if (failure === 'exit') return record;
      const server = http.createServer((request, response) => {
        const chunks: Buffer[] = [];
        request.on('data', (chunk: Buffer) => chunks.push(chunk));
        request.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          const seen: SeenRequest = { method: request.method ?? '', url: request.url ?? '', authorization: request.headers.authorization, body: text === '' ? undefined : JSON.parse(text) };
          machine.api.requests.push(seen);
          const answer = route(machine, seen, () => void end(id));
          response.writeHead(answer.status ?? 200, { 'content-type': 'application/json', ...answer.headers });
          response.end(answer.body);
        });
      });
      await new Promise<void>((resolve, reject) => server.once('error', reject).listen(port, '127.0.0.1', () => resolve()));
      if (closed) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
        throw new ProcessError('start-failed', `${spec.command}: the fake machine is closed`);
      }
      const instance = path.join(paths.instances, `server-${count}.json`);
      await mkdir(paths.instances, { recursive: true });
      await writeFile(instance, JSON.stringify({ server_id: `server-${count}`, pid, host: '127.0.0.1', port, started_at: Date.now(), heartbeat_at: Date.now(), host_version: machine.version }));
      servers.set(id, { record, server, instance });
      return record;
    },
    track: async (id) => servers.get(id)!.record,
    get: async (id) => servers.get(id)?.record,
    list: async (filter = {}) =>
      [...servers.values()].map((entry) => entry.record).filter((record) => Object.entries(filter).every(([key, value]) => record.owner[key as keyof ProcessRecord['owner']] === value)),
    check: async (id) => (servers.has(id) ? 'alive' : 'gone'),
    quickCheck: async (id) => (servers.has(id) ? 'alive' : 'gone'),
    async stop(id) {
      const record = servers.get(id)?.record;
      if (!record) throw new ProcessError('not-found', id);
      await end(id);
      return { outcome: 'stopped', record };
    },
    forget: async () => undefined,
    reconcile: async () => ({ removed: [] }),
  };

  const machine: FakeKimi = {
    root,
    home,
    paths,
    dirs,
    api: { token: 'test-token', meta: await fixture('meta'), auth: await fixture('auth'), config: await fixture('config'), workspaces: [], skipTrustFile: false, requests: [] },
    supervisor,
    spawned: [],
    failSpawn: null,
    version: '2.5.2',
    context(overrides = {}) {
      const result = (stdout: string): RunResult => ({ code: 0, signal: null, stdout, stderr: '', timedOut: false, startError: null });
      return {
        platform: process.platform,
        env: { PATH: '/usr/bin:/bin', HOME: home, KIMI_CODE_SESSION_LOCK: '0' },
        homedir: home,
        dirs,
        config: { port: 0, projectsRoot: home, programs: {} },
        events: createEventLog({ file: path.join(data, 'events.jsonl') }),
        supervisor,
        runCommand: async () => result(`${machine.version}\n`),
        now: () => new Date(),
        log: () => undefined,
        ...overrides,
      };
    },
    async installProgram() {
      await mkdir(path.dirname(paths.program), { recursive: true });
      await writeFile(paths.program, '');
    },
    async keepSession() {
      const file = providerSessionsFile(dirs, 'kimi');
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify({ version: 1, sessions: [{ localId: 'kept' }] }));
    },
    async project(name) {
      const folder = path.join(home, name);
      await mkdir(folder, { recursive: true });
      return { id: `p-${name}`, name, path: folder, source: 'created', createdAt: new Date().toISOString() };
    },
    async crash() {
      for (const id of [...servers.keys()]) await end(id);
    },
    seen: (method, url) => machine.api.requests.filter((request) => request.method === method && request.url === url),
    async close() {
      closed = true;
      await machine.crash();
      // Events are appended without waiting: a late write may land while the folder is removed.
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    },
  };
  return machine;
}
