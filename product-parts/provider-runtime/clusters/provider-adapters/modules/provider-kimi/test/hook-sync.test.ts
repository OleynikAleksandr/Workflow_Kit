// A Kimi server takes its hooks only when it starts (spec M9 section 1): the server of Kit is
// restarted by the fingerprint of the Kit blocks it started with (GET /api/v1/config shows new
// hooks without running them), and a Kimi Code app started before the hook gets a restart note;
// another server (an orphan of an earlier Kit) never gives it (spec M9 section 8.2).
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { defaultHookHost, kimiHookBlocks, kimiHooksSection } from '#kit-structure';
import type { KimiHookBlock } from '#kit-structure';
import type { CommandRunner, RunResult } from '#process-supervisor';
import { providerSessionsFile } from '#provider-registry';
import type { HookState, Project, Provider } from '#provider-registry';
import { APP_RESTART_NOTE, HOOK_RECORD, REMOVE_HOOK_ACTION } from '../src/hooks.ts';
import type { Liveness } from '../src/locks.ts';
import { createKimiRuntime } from '../src/provider.ts';
import type { KimiRuntime } from '../src/provider.ts';
import { withSessions } from './fake-sessions.ts';
import { fakeKimi } from './helpers.ts';
import type { FakeKimi } from './helpers.ts';

const FAST = { startWaitMs: 2000, stopWaitMs: 500, pollMs: 10 };
const RESTARTED = 'server restarted: the Kit hooks in config.toml changed';
const ORPHAN_PID = 90_001;

interface Bench {
  machine: FakeKimi;
  provider: Provider;
  runtime: KimiRuntime;
  project: Project;
  log: string[];
  /** Pids the liveness counts as running (the fake servers of Kit are found by the supervisor). */
  alive: Set<number>;
  blocks: KimiHookBlock[];
  section: string;
  /** A second service on the same machine (a restart of the service). */
  restart(): { provider: Provider; runtime: KimiRuntime };
  approve(): Promise<HookState>;
  /** A server of the Kimi Code app that answers, in server/instances (it replaces the previous one). */
  app(startedAt: number): Promise<void>;
  /** A live server in server/instances that does not answer (an orphan of an earlier Kit). */
  orphan(startedAt: number): Promise<void>;
}

async function bench(run: (b: Bench) => Promise<void>): Promise<void> {
  const machine = await fakeKimi();
  try {
    await machine.installProgram();
    const ok: RunResult = { code: 0, signal: null, stdout: '', stderr: '', timedOut: false, startError: null };
    let stopApp: (() => Promise<void>) | null = null;
    const runCommand: CommandRunner = async (_command, args) => ({ ...ok, stdout: args[0] === 'doctor' ? '' : `${machine.version}\n` });
    const log: string[] = [];
    const alive = new Set<number>();
    const liveness: Liveness = { pidAlive: (pid) => alive.has(pid), bootTime: () => 0, hostname: () => 'this-host' };
    const context = machine.context({ runCommand, log: (line) => void log.push(line) });
    const create = (): { provider: Provider; runtime: KimiRuntime } => createKimiRuntime(context, { ...FAST, liveness });
    const { runtime, provider } = create();
    const wanted = kimiHookBlocks(defaultHookHost(context.env, context.homedir, context.platform));
    assert.ok(wanted.ok);
    const project = await machine.project('app');
    await run({
      machine, provider, runtime, project, log, alive, blocks: wanted.blocks, section: kimiHooksSection(wanted.blocks),
      restart: create,
      async approve() {
        const shown = await provider.hooks(project);
        return provider.approveHooks!(project, { command: shown.kitHook!.command, hash: shown.kitHook!.hash });
      },
      async app(startedAt) {
        await stopApp?.();
        stopApp = await machine.startApp(startedAt);
        alive.add(process.pid);
      },
      async orphan(startedAt) {
        await mkdir(machine.paths.instances, { recursive: true });
        await writeFile(path.join(machine.paths.instances, 'orphan.json'), JSON.stringify({ server_id: 'orphan', pid: ORPHAN_PID, host: '127.0.0.1', port: 1, started_at: startedAt }));
        alive.add(ORPHAN_PID);
      },
    });
  } finally {
    await machine.close();
  }
}

test('a hook written after the server of Kit started restarts it, also when GET /api/v1/config already lists it', async () => {
  await bench(async (b) => {
    await b.provider.refresh!();
    await b.runtime.requireReady();
    assert.equal(b.machine.spawned.length, 1);
    // Kimi shows the new hooks in /config after a session is created, but it does not run them.
    b.machine.api.config = { ...(b.machine.api.config as object), hooks: b.blocks };

    // A turn runs: its session holds a live lock, so the approval does not cut it.
    await mkdir(b.machine.paths.locks, { recursive: true });
    await writeFile(path.join(b.machine.paths.locks, 'session-1.lock'), JSON.stringify({ pid: 777, hostname: 'this-host', startedAt: Date.now() }));
    b.alive.add(777);
    assert.equal((await b.approve()).kitHook?.status, 'approved');
    assert.equal(await b.provider.maintain!(), null);
    assert.equal(b.machine.spawned.length, 1, 'the running turn is not cut');

    // The turn ended: the next upkeep restarts the server; then it started with the hook.
    b.alive.delete(777);
    assert.equal(await b.provider.maintain!(), RESTARTED);
    assert.equal(b.machine.spawned.length, 2);
    assert.equal(await b.provider.maintain!(), null);

    // Other settings of the file are not a reason; the removal of the Kit blocks is, at once.
    await writeFile(b.machine.paths.config, `default_model = "kimi/k2"\n${await readFile(b.machine.paths.config, 'utf8')}`);
    assert.equal(await b.provider.maintain!(), null);
    await b.provider.runAction(REMOVE_HOOK_ACTION, null);
    assert.equal(b.machine.spawned.length, 3);
    assert.equal(await b.provider.maintain!(), null);
    // The upkeep returns its line to the service log; the removal logs its own.
    assert.deepEqual(b.log.filter((line) => line.startsWith('[kimi]')), [`[kimi] ${RESTARTED}`]);
  });
});

test('a session or a message gets a server with the hook: requireReady restarts a server started before it', async () => {
  await bench(async (b) => {
    await b.provider.refresh!();
    await b.runtime.requireReady();
    // The hook came into the file another way (a hand edit, an earlier run): no live lock.
    await writeFile(b.machine.paths.config, b.section);
    await b.runtime.requireReady();
    assert.equal(b.machine.spawned.length, 2, 'restarted before the client is handed out');
    await b.runtime.requireReady();
    assert.equal(b.machine.spawned.length, 2);
  });
});

test('a server adopted after a restart of the service is restarted when the hook is newer than its start', async () => {
  await bench(async (b) => {
    await b.provider.refresh!();
    await b.runtime.requireReady();
    await writeFile(b.machine.paths.config, b.section);
    const record = providerSessionsFile(b.machine.dirs, HOOK_RECORD);
    await mkdir(path.dirname(record), { recursive: true });

    // Kit changed its blocks before the server started: the adopted server has them.
    await writeFile(record, JSON.stringify({ version: 1, changedAt: Date.now() - 60_000 }));
    const before = b.restart();
    await before.provider.refresh!();
    assert.equal(await before.provider.maintain!(), null);
    assert.equal(b.machine.spawned.length, 1);

    // Kit changed them after the start: the next service restarts it once.
    await writeFile(record, JSON.stringify({ version: 1, changedAt: Date.now() + 60_000 }));
    const after = b.restart();
    await after.provider.refresh!();
    assert.equal(await after.provider.maintain!(), RESTARTED);
    assert.equal(b.machine.spawned.length, 2);
    assert.equal(await after.provider.maintain!(), null);
  });
});

test('the Kimi Code app started before the Kit hook is asked to be restarted; started after it, it is not', async () => {
  await bench(async (b) => {
    await b.app(Date.now() - 60_000);
    assert.doesNotMatch((await b.provider.hooks(b.project)).note ?? '', /Перезапустите приложение/, 'no Kit hook yet: nothing to restart for');
    await b.approve();
    assert.match((await b.provider.hooks(b.project)).note ?? '', new RegExp(APP_RESTART_NOTE));
    assert.match((await b.provider.refresh!()).note ?? '', new RegExp(APP_RESTART_NOTE));
    assert.equal(b.runtime.appRestart(), APP_RESTART_NOTE);
    assert.equal(b.machine.spawned.length, 0, 'the server of the app is never restarted by Kit, and Kit started none');

    // The user restarted the app.
    await b.app(Date.now() + 1000);
    assert.doesNotMatch((await b.provider.hooks(b.project)).note ?? '', /Перезапустите приложение/);
    assert.doesNotMatch((await b.provider.refresh!()).note ?? '', /Перезапустите приложение/);
    // The app was closed: a record of a dead process does not count.
    await b.app(Date.now() - 60_000);
    b.alive.delete(process.pid);
    assert.equal((await b.provider.refresh!(), b.runtime.appRestart()), null);
  });
});

test('a server Kit does not talk to (an orphan of an earlier Kit, older than the hook) gives no restart note', async () => {
  await bench(async (b) => {
    await b.approve();
    await b.orphan(Date.now() - 60_000);
    assert.doesNotMatch((await b.provider.hooks(b.project)).note ?? '', /Перезапустите приложение/);
    assert.equal((await b.provider.refresh!(), b.runtime.appRestart()), null);
    // The app that answers, started after the hook, gives none either.
    await b.app(Date.now() + 1000);
    assert.equal((await b.provider.refresh!(), b.runtime.appRestart()), null);
  });
});

test('Kit blocks written by an earlier version count from the time config.toml was changed, which is then kept', async () => {
  await bench(async (b) => {
    await writeFile(b.machine.paths.config, b.section);
    await b.app(Date.now() - 60_000);
    assert.match((await b.provider.hooks(b.project)).note ?? '', new RegExp(APP_RESTART_NOTE));
    const kept = JSON.parse(await readFile(providerSessionsFile(b.machine.dirs, HOOK_RECORD), 'utf8')) as { changedAt: number };
    assert.ok(Math.abs(kept.changedAt - Date.now()) < 60_000);
    // A later change of other settings (the app writes the file too) does not move it.
    await b.app(Date.now() + 1000);
    await writeFile(b.machine.paths.config, `default_model = "kimi/k2"\n${b.section}`);
    assert.doesNotMatch((await b.provider.hooks(b.project)).note ?? '', /Перезапустите приложение/);
  });
});

test('the sessions of the project carry the restart note while the app runs without the hook', async () => {
  const liveness: Liveness = { pidAlive: (pid) => pid === process.pid, bootTime: () => 0, hostname: () => 'this-host' };
  await withSessions(async ({ machine, api, project, provider, runtime, workspace }) => {
    const host = kimiHookBlocks(defaultHookHost(machine.context().env, machine.home, process.platform));
    assert.ok(host.ok);
    await writeFile(machine.paths.config, kimiHooksSection(host.blocks));
    await machine.startApp(Date.now() - 60_000);
    await provider.refresh!();
    await runtime.requireReady();
    api.add({ workspace: workspace(project.path), cwd: project.path, title: 'Сессия' });
    const [session] = await provider.listSessions(project);
    assert.match(session?.note ?? '', new RegExp(APP_RESTART_NOTE));
  }, { liveness });
});
