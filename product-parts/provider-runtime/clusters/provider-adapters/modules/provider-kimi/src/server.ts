// The Kimi Code server Kit talks to (spec M9 section 2.1): the server of the Kimi Code app (any
// live record of <home>/server/instances that is not Kit's) while it runs, so the app sees the
// sessions of Kit at once; else the server of Kit, `kimi web --no-open --port <free>`, started
// through the supervisor without a saved output (the program prints its token), found by its pid
// in server/instances and adopted again after a restart of the service.
import { readdir } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { readJsonFile } from '#data-store';
import { ProcessError } from '#process-supervisor';
import type { ProcessRecord } from '#process-supervisor';
import { ProviderError } from '#provider-registry';
import type { ProviderContext } from '#provider-registry';
import { createKimiClient } from './client.ts';
import type { KimiClient } from './client.ts';
import { defaultLiveness, liveSessionLockHolders } from './locks.ts';
import type { Liveness } from './locks.ts';
import { envWithout } from './paths.ts';
import type { KimiPaths } from './paths.ts';
import { parseInstance } from './shapes.ts';
import type { KimiInstance } from './shapes.ts';

/** Owner of the server process in processes.json. */
export const SERVER_OWNER = { provider: 'kimi', project: null, kind: 'server' } as const;

/** A switch of Kimi that turns session locks off; the server of Kit never gets it. */
export const LOCK_SWITCH = 'KIMI_CODE_SESSION_LOCK';

/** How long a health answer of the server of the app is reused. */
export const APP_SERVER_CACHE_MS = 5000;

/** Whose server Kit talks to. */
export type KimiServerOwner = 'app' | 'kit';

/** The server Kit talks to. */
export interface KimiServer {
  /** Client of the server of the app, else of the running server of Kit, or null; never starts one. */
  current(): Promise<KimiClient | null>;
  /** Client of the server of the app, else of the server of Kit, started when it does not run. */
  ensure(): Promise<KimiClient>;
  /** Client of the running server of Kit only (hooks, restart), or null. */
  own(): Promise<KimiClient | null>;
  /** The live, answering server of the app (the newest one), or null. */
  app(): Promise<{ client: KimiClient; instance: KimiInstance } | null>;
  /** Whose server the last current() or ensure() gave; null when none. */
  owner(): KimiServerOwner | null;
  /**
   * Stops the server of Kit while the server of the app runs and no turn holds a lock of
   * another process than the app; a log line or null.
   */
  retire(): Promise<string | null>;
  /** Asks the server of Kit to shut down and ends its process; false when none ran. */
  stop(): Promise<boolean>;
  /** A server was started or adopted in this run of the service. */
  readonly used: boolean;
  /**
   * The Kit hooks config.toml had when this run of the service started the server (snapshot);
   * undefined when it is not known (a server adopted after a restart of the service).
   */
  startedWith(): string | null | undefined;
  /** Start of the running server of Kit, ms (its record in server/instances); null when unknown. */
  startedAt(): number | null;
  /** Live records of server/instances that are not a server of Kit: the Kimi Code app, a `kimi web` of the user. */
  foreign(): Promise<KimiInstance[]>;
}

/** Inputs; the waits and the port are injectable for tests. */
export interface KimiServerDeps {
  context: ProviderContext;
  paths: KimiPaths;
  /** Path of the `kimi` program, or null when it is not installed. */
  program: () => string | null;
  fetch?: typeof fetch;
  /** Wait for the server record and its first answer (default 15 s). */
  startWaitMs?: number;
  /** Wait after POST /shutdown before the process is ended (default 5 s). */
  stopWaitMs?: number;
  pollMs?: number;
  freePort?: () => Promise<number>;
  /** Fingerprint of the Kit hooks in config.toml, taken right before a start (Kimi reads hooks only then). */
  snapshot?: () => Promise<string | null>;
  liveness?: Liveness;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** A free port of 127.0.0.1. */
export function freeLocalPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => (typeof address === 'object' && address ? resolve(address.port) : reject(new Error('no port'))));
    });
  });
}

/** Records of <home>/server/instances; unreadable files are skipped. */
export async function readInstances(dir: string): Promise<KimiInstance[]> {
  const names = await readdir(dir).catch(() => [] as string[]);
  const found: KimiInstance[] = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const instance = parseInstance(await readJsonFile(path.join(dir, name)).catch(() => undefined));
    if (instance) found.push(instance);
  }
  return found;
}

function portOf(record: ProcessRecord): number | null {
  const index = record.args.indexOf('--port');
  const port = index < 0 ? Number.NaN : Number(record.args[index + 1]);
  return Number.isInteger(port) && port > 0 ? port : null;
}

/** Creates the server keeper. */
export function createKimiServer(deps: KimiServerDeps): KimiServer {
  const { context, paths } = deps;
  const { supervisor } = context;
  const pollMs = deps.pollMs ?? 200;
  const live = deps.liveness ?? defaultLiveness();
  let active: { id: string; client: KimiClient; pid: number; startedAt: number | null; startedWith: string | null | undefined } | null = null;
  let starting: Promise<KimiClient> | null = null;
  let used = false;
  let last: KimiServerOwner | null = null;
  const health = new Map<string, { at: number; ok: boolean }>();

  const clientOf = (port: number): KimiClient => createKimiClient({ port, tokenFile: paths.token, ...(deps.fetch ? { fetch: deps.fetch } : {}) });

  // The record of this process in server/instances: by pid, else by the port Kit asked for.
  const instanceOf = async (record: ProcessRecord): Promise<KimiInstance | undefined> => {
    const instances = await readInstances(paths.instances);
    const port = portOf(record);
    return instances.find((item) => item.pid === record.pid) ?? instances.find((item) => port !== null && item.port === port);
  };

  const alive = async (id: string): Promise<boolean> => {
    try {
      return (await supervisor.quickCheck(id)) === 'alive';
    } catch {
      return false;
    }
  };

  // A server left by the previous run of the service: its process record and its instance record.
  const adopt = async (): Promise<typeof active> => {
    for (const record of await supervisor.list(SERVER_OWNER)) {
      const state = await supervisor.check(record.id).catch(() => 'gone' as const);
      if (state === 'gone' || state === 'mismatch') {
        await supervisor.forget(record.id).catch(() => undefined);
        continue;
      }
      if (state !== 'alive') continue;
      const instance = await instanceOf(record);
      if (instance) return { id: record.id, client: clientOf(instance.port), pid: record.pid, startedAt: instance.startedAt, startedWith: undefined };
    }
    return null;
  };

  const own = async (): Promise<KimiClient | null> => {
    if (active && !(await alive(active.id))) active = null;
    if (!active) active = await adopt();
    if (active) used = true;
    return active?.client ?? null;
  };

  const foreign = async (): Promise<KimiInstance[]> => {
    const mine = new Set((await supervisor.list(SERVER_OWNER).catch(() => [] as ProcessRecord[])).map((record) => record.pid));
    if (active) mine.add(active.pid);
    return (await readInstances(paths.instances)).filter((item) => !mine.has(item.pid) && live.pidAlive(item.pid));
  };

  // The newest live record that answers healthz; answers are kept a few seconds.
  const app = async (): Promise<{ client: KimiClient; instance: KimiInstance } | null> => {
    const candidates = (await foreign()).sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
    for (const instance of candidates) {
      const client = clientOf(instance.port);
      const key = `${instance.serverId}:${instance.pid}:${instance.port}`;
      const known = health.get(key);
      let ok = known && Date.now() - known.at < APP_SERVER_CACHE_MS ? known.ok : null;
      if (ok === null) {
        ok = await client.get('/api/v1/healthz', { auth: false, timeoutMs: 2000 }).then(() => true, () => false);
        health.set(key, { at: Date.now(), ok });
      }
      if (ok) return { client, instance };
    }
    return null;
  };

  const current = async (): Promise<KimiClient | null> => {
    const found = await app();
    if (found) {
      used = true;
      last = 'app';
      return found.client;
    }
    const client = await own();
    last = client ? 'kit' : null;
    return client;
  };

  const failed = (reason: string): ProviderError =>
    new ProviderError('kimi-server', `Сервер Kimi не запустился: ${reason}`, { hint: 'Проверьте `kimi web` в Терминале, затем «Перепроверить».' });

  const start = async (): Promise<KimiClient> => {
    const running = await current();
    if (running) return running;
    const command = deps.program();
    if (!command) throw new ProviderError('not-installed', 'Kimi Code не найден', { hint: 'Установите Kimi Code и нажмите «Перепроверить».' });
    const port = await (deps.freePort ?? freeLocalPort)();
    const startedWith = deps.snapshot ? await deps.snapshot().catch(() => undefined) : undefined;
    let record: ProcessRecord;
    try {
      record = await supervisor.spawn({
        owner: { ...SERVER_OWNER },
        command,
        args: ['web', '--no-open', '--port', String(port)],
        cwd: context.homedir,
        env: envWithout(context.env, LOCK_SWITCH, context.platform),
        logFile: null,
      });
    } catch (error) {
      throw failed(error instanceof ProcessError ? error.message : String(error));
    }
    const deadline = Date.now() + (deps.startWaitMs ?? 15_000);
    let reason = 'нет записи сервера в server/instances за 15 с';
    for (;;) {
      if (!(await alive(record.id))) {
        await supervisor.forget(record.id).catch(() => undefined);
        throw failed('процесс завершился сразу после запуска');
      }
      const instance = await instanceOf(record);
      if (instance) {
        const client = clientOf(instance.port);
        try {
          await client.get('/api/v1/healthz', { auth: false, timeoutMs: 2000 });
          active = { id: record.id, client, pid: record.pid, startedAt: instance.startedAt, startedWith };
          used = true;
          last = 'kit';
          context.log(`kimi: server started, pid ${record.pid}, port ${instance.port}`);
          return client;
        } catch (error) {
          reason = error instanceof Error ? error.message : String(error);
        }
      }
      if (Date.now() >= deadline) break;
      await sleep(pollMs);
    }
    await supervisor.stop(record.id).catch(() => undefined);
    throw failed(reason);
  };

  const stop = async (): Promise<boolean> => {
    const client = await own();
    if (!client || !active) return false;
    const { id } = active;
    await client.post('/api/v1/shutdown', {}, { timeoutMs: 3000 }).catch(() => undefined);
    const deadline = Date.now() + (deps.stopWaitMs ?? 5000);
    while (Date.now() < deadline && (await alive(id))) await sleep(pollMs);
    // stop() ends a process that is still there and drops the record either way.
    await supervisor.stop(id).catch(() => undefined);
    active = null;
    if (last === 'kit') last = null;
    context.log('kimi: server stopped');
    return true;
  };

  return {
    current,
    own,
    app,
    owner: () => last,
    ensure: () => (starting ??= start().finally(() => (starting = null))),
    stop,
    async retire() {
      const found = await app();
      if (!found || !(await own())) return null;
      // A turn of the server of Kit (or one whose holder is not known) would be cut.
      const holders = await liveSessionLockHolders(paths.locks, live);
      if (holders.some((holder) => holder.pid !== found.instance.pid)) return null;
      await stop();
      return 'server of Kit stopped: the Kimi Code app serves the Kimi sessions';
    },
    get used() {
      return used;
    },
    startedWith: () => active?.startedWith,
    startedAt: () => active?.startedAt ?? null,
    foreign,
  };
}
