// The Kimi Code server of Workflow Kit (spec M8, section 2.2): `kimi web --no-open --port <free>`
// started through the supervisor without a saved output (the program prints its token), found by
// its pid in <home>/server/instances and adopted again after a restart of the service.
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
import { envWithout } from './paths.ts';
import type { KimiPaths } from './paths.ts';
import { parseInstance } from './shapes.ts';
import type { KimiInstance } from './shapes.ts';

/** Owner of the server process in processes.json. */
export const SERVER_OWNER = { provider: 'kimi', project: null, kind: 'server' } as const;

/** A switch of Kimi that turns session locks off; the server of Kit never gets it. */
export const LOCK_SWITCH = 'KIMI_CODE_SESSION_LOCK';

/** The server of Kit. */
export interface KimiServer {
  /** Client of the running server of Kit, or null; never starts one. */
  current(): Promise<KimiClient | null>;
  /** Client of the server, started when it does not run. */
  ensure(): Promise<KimiClient>;
  /** Asks the server to shut down and ends its process; false when none ran. */
  stop(): Promise<boolean>;
  /** A server was started or adopted in this run of the service. */
  readonly used: boolean;
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
  let active: { id: string; client: KimiClient } | null = null;
  let starting: Promise<KimiClient> | null = null;
  let used = false;

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
  const adopt = async (): Promise<{ id: string; client: KimiClient } | null> => {
    for (const record of await supervisor.list(SERVER_OWNER)) {
      const state = await supervisor.check(record.id).catch(() => 'gone' as const);
      if (state === 'gone' || state === 'mismatch') {
        await supervisor.forget(record.id).catch(() => undefined);
        continue;
      }
      if (state !== 'alive') continue;
      const instance = await instanceOf(record);
      if (instance) return { id: record.id, client: clientOf(instance.port) };
    }
    return null;
  };

  const current = async (): Promise<KimiClient | null> => {
    if (active && !(await alive(active.id))) active = null;
    if (!active) active = await adopt();
    if (active) used = true;
    return active?.client ?? null;
  };

  const failed = (reason: string): ProviderError =>
    new ProviderError('kimi-server', `Сервер Kimi не запустился: ${reason}`, { hint: 'Проверьте `kimi web` в Терминале, затем «Перепроверить».' });

  const start = async (): Promise<KimiClient> => {
    const running = await current();
    if (running) return running;
    const command = deps.program();
    if (!command) throw new ProviderError('not-installed', 'Kimi Code не найден', { hint: 'Установите Kimi Code и нажмите «Перепроверить».' });
    const port = await (deps.freePort ?? freeLocalPort)();
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
          active = { id: record.id, client };
          used = true;
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

  return {
    current,
    ensure: () => (starting ??= start().finally(() => (starting = null))),
    async stop() {
      const client = await current();
      if (!client || !active) return false;
      const { id } = active;
      await client.post('/api/v1/shutdown', {}, { timeoutMs: 3000 }).catch(() => undefined);
      const deadline = Date.now() + (deps.stopWaitMs ?? 5000);
      while (Date.now() < deadline && (await alive(id))) await sleep(pollMs);
      // stop() ends a process that is still there and drops the record either way.
      await supervisor.stop(id).catch(() => undefined);
      active = null;
      context.log('kimi: server stopped');
      return true;
    },
    get used() {
      return used;
    },
  };
}
