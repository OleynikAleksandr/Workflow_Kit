// The provider: the status table, the server of Kit (start on demand, adoption after a restart of
// the service, restart action). The fake machine works on every OS.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ProviderError } from '#provider-registry';
import type { ProviderStatus } from '#provider-registry';
import { LOCK_SWITCH } from '../src/server.ts';
import { LOGIN_NOTE, MODEL_NOTE, ON_DEMAND_NOTE, RESTART_ACTION, UNTESTED_OS_NOTE, createKimiProvider, createKimiRuntime } from '../src/provider.ts';
import { fakeKimi } from './helpers.ts';
import type { FakeKimi } from './helpers.ts';

const FAST = { startWaitMs: 2000, stopWaitMs: 500, pollMs: 10 };
// Linux and Windows carry the "not checked on this OS" note in every status.
const osNote = process.platform === 'darwin' ? [] : [UNTESTED_OS_NOTE];
const note = (...parts: string[]): string | undefined => [...parts, ...osNote].join('; ') || undefined;

async function withMachine(run: (machine: FakeKimi) => Promise<void>): Promise<void> {
  const machine = await fakeKimi();
  try {
    await run(machine);
  } finally {
    await machine.close();
  }
}

const brief = (status: ProviderStatus): [string, string, string | undefined] => [status.state, status.label, status.note];

test('the provider is Kimi Code with the kimi hook dialect; the OS note is on Linux and Windows only', async () => {
  await withMachine(async (machine) => {
    const provider = createKimiProvider(machine.context());
    assert.deepEqual([provider.id, provider.title, provider.label, provider.mark, provider.hookDialect], ['kimi', 'Kimi Code', 'Kimi', 'K', 'kimi']);
    assert.deepEqual(brief(await provider.status()), ['unknown', 'не проверялся', note()]);
    for (const platform of ['linux', 'win32'] as const) {
      assert.equal((await createKimiProvider(machine.context({ platform })).status()).note, UNTESTED_OS_NOTE);
    }
    assert.equal((await createKimiProvider(machine.context({ platform: 'darwin' })).status()).note, undefined);
    const capabilities = await provider.capabilities();
    assert.equal(capabilities['trust']?.available, true);
    assert.equal(capabilities['orchestration']?.available, false);
    assert.equal(capabilities['reviewer']?.available, false);
  });
});

test('status: not installed, an old version, ready on demand without starting the server', async () => {
  await withMachine(async (machine) => {
    const provider = createKimiProvider(machine.context(), FAST);
    assert.deepEqual(brief(await provider.refresh!()), ['not-installed', 'Kimi Code не найден', note()]);
    assert.equal((await provider.capabilities())['trust']?.reason, 'Kimi Code не найден');
    await machine.installProgram();
    machine.version = '2.5.1';
    assert.deepEqual(brief(await provider.refresh!()), ['unavailable', 'нужна версия Kimi Code не ниже 2.5.2', note()]);
    assert.deepEqual((await provider.actions(null)).map((action) => [action.enabled, action.reason]), [...Array.from({ length: 3 }, () => [false, 'нужна версия Kimi Code не ниже 2.5.2']), [false, 'хука Kit в config.toml Kimi нет']]);
    machine.version = '2.5.2';
    const status = await provider.refresh!();
    assert.deepEqual(brief(status), ['ready', 'готов', note(ON_DEMAND_NOTE)]);
    assert.deepEqual([status.installed, status.version, status.path], [true, '2.5.2', machine.paths.program]);
    assert.equal(await provider.autostart!(), null);
    assert.equal(await provider.maintain!(), null);
    assert.equal(machine.spawned.length, 0);
  });
});

test('status with the server: login, model, backend, an unknown shape, an untested version', async () => {
  await withMachine(async (machine) => {
    await machine.installProgram();
    await machine.keepSession();
    const provider = createKimiProvider(machine.context(), FAST);
    assert.equal(await provider.autostart!(), 'server started');
    assert.deepEqual(brief(await provider.status()), ['ready', 'готов', note()]);
    assert.equal(machine.spawned.length, 1);

    const original = { auth: machine.api.auth, config: machine.api.config, meta: machine.api.meta };
    machine.api.auth = { models_ready: false, providers_count: 0, managed_provider: null };
    assert.deepEqual(brief(await provider.refresh!()), ['unavailable', LOGIN_NOTE, note()]);
    machine.api.auth = original.auth;
    machine.api.override = (request) => (request.url === '/api/v1/auth' ? { body: JSON.stringify({ code: 40110, msg: 'no provider', data: null }) } : undefined);
    assert.deepEqual(brief(await provider.refresh!()), ['unavailable', LOGIN_NOTE, note()]);
    delete machine.api.override;

    machine.api.config = { providers: {}, models: {} };
    assert.deepEqual(brief(await provider.refresh!()), ['unavailable', MODEL_NOTE, note()]);
    machine.api.config = original.config;

    machine.api.meta = { ...(original.meta as object), backend: 'v1' };
    assert.deepEqual(brief(await provider.refresh!()), ['error', 'сервер Kimi работает с backend v1, нужен v2', note()]);
    machine.api.meta = { server_version: '2.5.2' };
    const unknown = await provider.refresh!();
    assert.equal(unknown.state, 'error');
    assert.match(unknown.label, /^неизвестный ответ Kimi 2\.5\.2 \(meta\.server_id\)$/);
    machine.api.meta = original.meta;

    // A version outside 2.5.x with the known shapes stays ready, with a note.
    machine.version = '2.6.0';
    assert.deepEqual(brief(await provider.refresh!()), ['ready', 'готов', note('версия 2.6.0 не проверялась с Workflow Kit')]);
    assert.equal(machine.spawned.length, 1);
  });
});

test('the server starts through the supervisor without a saved output and without the lock switch', async () => {
  await withMachine(async (machine) => {
    await machine.installProgram();
    const { runtime, provider } = createKimiRuntime(machine.context(), FAST);
    await provider.refresh!();
    assert.equal(await runtime.server.current(), null);
    const [first, second] = await Promise.all([runtime.requireReady(), runtime.requireReady()]);
    assert.equal(first, second);
    assert.equal(machine.spawned.length, 1);
    const spec = machine.spawned[0]!;
    assert.equal(spec.logFile, null);
    assert.equal(spec.command, machine.paths.program);
    assert.deepEqual(spec.args.slice(0, 3), ['web', '--no-open', '--port']);
    assert.equal(Number(spec.args[3]), first.port);
    assert.deepEqual(spec.owner, { provider: 'kimi', project: null, kind: 'server' });
    assert.equal(LOCK_SWITCH in spec.env, false);
    assert.equal(spec.env['HOME'], machine.home);
    // The first question needs no token, the rest carry it in the header only.
    assert.equal(machine.api.requests[0]?.url, '/api/v1/healthz');
    assert.equal(machine.api.requests[0]?.authorization, undefined);
    for (const request of machine.api.requests.slice(1)) assert.equal(request.authorization, 'Bearer test-token');
    assert.deepEqual(brief(await provider.status()), ['ready', 'готов', note()]);
  });
});

test('a server left by the previous run of the service is adopted by its pid, not started again', async () => {
  await withMachine(async (machine) => {
    await machine.installProgram();
    await machine.keepSession();
    const before = createKimiRuntime(machine.context(), FAST);
    const port = (await before.runtime.requireReady()).port;
    // The service restarts: a new provider over the same processes.json and Kimi home.
    const after = createKimiRuntime(machine.context(), FAST);
    assert.deepEqual(brief(await after.provider.refresh!()), ['ready', 'готов', note()]);
    assert.equal((await after.runtime.server.current())?.port, port);
    assert.equal(await after.provider.autostart!(), null);
    assert.equal(machine.spawned.length, 1);
  });
});

test('a server that died is started again by the upkeep; a failed start is the error status', async () => {
  await withMachine(async (machine) => {
    await machine.installProgram();
    const { runtime, provider } = createKimiRuntime(machine.context(), FAST);
    await provider.refresh!();
    await runtime.requireReady();
    await machine.crash();
    assert.equal(await provider.maintain!(), 'server started again');
    assert.equal(machine.spawned.length, 2);
    assert.deepEqual(brief(await provider.status()), ['ready', 'готов', note()]);

    await machine.crash();
    machine.failSpawn = 'exit';
    assert.match((await provider.maintain!()) ?? '', /^server not started: Сервер Kimi не запустился: процесс завершился/);
    const failed = await provider.status();
    assert.deepEqual([failed.state, failed.label], ['error', 'сервер Kimi не запустился']);
    machine.failSpawn = 'throw';
    await assert.rejects(runtime.requireReady(), (error: unknown) => error instanceof ProviderError && error.code === 'kimi-server' && /ENOENT/.test(error.message));
    // The next upkeep brings it back.
    assert.equal(await provider.maintain!(), 'server started again');
    assert.deepEqual(brief(await provider.status()), ['ready', 'готов', note()]);
  });
});

test('operations refuse outside ready with the note of the status', async () => {
  await withMachine(async (machine) => {
    const { runtime, provider } = createKimiRuntime(machine.context(), FAST);
    await assert.rejects(runtime.requireReady(), (error: unknown) => error instanceof ProviderError && error.code === 'not-installed');
    await machine.installProgram();
    machine.api.auth = { models_ready: false };
    await assert.rejects(runtime.requireReady(), (error: unknown) => error instanceof ProviderError && error.code === 'kimi-not-ready' && error.message.includes(LOGIN_NOTE));
    assert.deepEqual(brief(await provider.status()), ['unavailable', LOGIN_NOTE, note()]);
    await assert.rejects(provider.runAction('other', null), (error: unknown) => error instanceof ProviderError && error.code === 'unknown-action');
  });
});

test('the restart action: starts a stopped server, then shuts the running one down and starts a new one', async () => {
  await withMachine(async (machine) => {
    await machine.installProgram();
    const { runtime, provider } = createKimiRuntime(machine.context(), FAST);
    await provider.refresh!();
    const stopped = (await provider.actions(null))[0]!;
    assert.deepEqual([stopped.id, stopped.title, stopped.scope, stopped.enabled, stopped.confirm], [RESTART_ACTION, 'Запустить сервер Kimi', 'provider', true, undefined]);
    assert.deepEqual(await provider.actions(await machine.project('app')), []);
    assert.deepEqual(brief((await provider.runAction(RESTART_ACTION, null)) as ProviderStatus), ['ready', 'готов', note()]);
    const firstPort = (await runtime.server.current())!.port;

    const running = (await provider.actions(null))[0]!;
    assert.equal(running.title, 'Перезапустить сервер Kimi');
    assert.match(running.confirm ?? '', /прервутся/);
    assert.deepEqual(brief((await provider.runAction(RESTART_ACTION, null)) as ProviderStatus), ['ready', 'готов', note()]);
    assert.equal(machine.seen('POST', '/api/v1/shutdown').length, 1);
    assert.equal(machine.spawned.length, 2);
    const client = await runtime.server.current();
    assert.ok(client);
    assert.equal(Number(machine.spawned[1]!.args[3]), client.port);
    assert.equal(typeof firstPort, 'number');
  });
});
