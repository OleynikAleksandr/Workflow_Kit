import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import type { SpawnOptions } from 'node:child_process';
import { test } from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { providerSessionsFile } from '#provider-registry';
import { createCodexProvider } from '../src/provider.ts';
import { createCodexRuntime } from '../src/runtime.ts';
import { createInterruptParts } from '../src/interrupt.ts';
import { createChatParts } from '../src/chat.ts';
import { proxyStream } from '../src/proxy.ts';
import { connectUnixWebSocket, connectWebSocket } from '../src/ws.ts';
import { startFakeDaemon } from './fake-daemon.ts';
import { fakeMachine } from './helpers.ts';
import { PROJECT, TARGET, THREAD } from './interrupt-world.ts';
import type { SessionInfo } from '#provider-registry';

for (const platform of ['darwin', 'linux', 'win32'] as const) for (const mode of ['event', 'state'] as const) test(`${platform} ${mode}: real RPC transport, exact turn, next user message and no daemon/thread mutation beyond interrupt`, async () => {
  const machine = await fakeMachine();
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wfki-'));
  const daemon = await startFakeDaemon(path.join(dir, 's.sock'), { interruptMode: mode, tricky: true });
  const proxyCalls: Array<{ command: string; args: readonly string[] }> = [];
  try {
    await mkdir(path.join(machine.codexHome, 'app-server-daemon'), { recursive: true });
    await writeFile(path.join(machine.codexHome, 'app-server-daemon', 'daemon.pid'), JSON.stringify({ pid: process.pid }));
    daemon.threads.set(THREAD, { status: 'active', turns: [{ id: TARGET.nativeTurnId, status: 'inProgress', items: [] }] });
    daemon.loaded.add(THREAD);
    const runtime = createCodexRuntime(machine.context({ platform }), {
      isAlive: () => true,
      openDaemon: async (_socket, options) => {
        if (platform !== 'win32') return connectUnixWebSocket(daemon.socketPath, options);
        const relay = fileURLToPath(new URL('./fixtures/fake-proxy.mjs', import.meta.url));
        const spawnRelay = ((command: string, args: readonly string[], opts: SpawnOptions) => {
          proxyCalls.push({ command: String(command), args: [...args] });
          return spawn(process.execPath, [relay, ...args], opts);
        }) as unknown as typeof spawn;
        return connectWebSocket(proxyStream({ command: 'codex.exe', env: { ...process.env } as Record<string, string>, socketPath: daemon.socketPath }, spawnRelay), options);
      },
    });
    runtime.program = { path: 'codex.exe', installed: true, version: '0.167.2', error: null, unsupported: null, checkedAt: null };
    await runtime.daemon();
    const parts = createInterruptParts(runtime, { interruptWaitMs: 2000, interruptPollMs: 5 });
    parts.sessions(PROJECT, [{ localId: THREAD } as SessionInfo]);
    const chat = createChatParts({ withDaemon: (run, ms) => runtime.withDaemon(run, ms), shared: async () => true, log: () => {}, onThreadRead: parts.observe });
    await chat.readMessages(THREAD, 10);
    const count = daemon.calls.length;
    assert.equal(parts.interruptAvailability(PROJECT, THREAD).available, true);
    assert.equal(daemon.calls.length, count);
    const result = await parts.interruptTurn(PROJECT, THREAD, TARGET);
    assert.equal(result.status, 'interrupted');
    if (result.stopped) assert.equal(result.proof, mode === 'event' ? 'provider-event' : 'provider-state');
    const mutations = daemon.calls.filter((c) => !['initialize', 'initialized', 'thread/read'].includes(c.method));
    assert.deepEqual(mutations, [{ method: 'turn/interrupt', params: { threadId: THREAD, turnId: TARGET.nativeTurnId } }]);
    assert.equal(daemon.loaded.has(THREAD), true);
    assert.equal(daemon.archived.size, 0);
    assert.equal(await chat.sendDirect(THREAD, 'next user message'), true);
    assert.deepEqual(daemon.calls.find((c) => c.method === 'turn/start')?.params, { threadId: THREAD, input: [{ type: 'text', text: 'next user message' }] });
    if (platform === 'win32') {
      assert.ok(proxyCalls.length >= 3);
      for (const call of proxyCalls) assert.deepEqual(call.args, ['app-server', 'proxy', '--sock', daemon.socketPath]);
    }
  } finally { await daemon.close(); await machine.close(); await rm(dir, { recursive: true, force: true }); }
});


test('the registered provider wires listing, existing feed, capability and Stop without a shared-access change', async () => {
  const machine = await fakeMachine();
  const daemon = await machine.daemon({ interruptMode: 'state' });
  try {
    const context = machine.context();
    context.config = { ...context.config, programs: { codex: process.execPath } };
    context.runCommand = async () => ({ code: 0, signal: null, stdout: 'codex-cli 0.167.2', stderr: '', timedOut: false, startError: null });
    const project = await machine.project('Wiring');
    const file = providerSessionsFile(machine.dirs, 'codex');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify({ sessions: [{ threadId: THREAD, projectId: project.id, projectPath: project.path, title: 'Test', createdAt: new Date().toISOString() }] }));
    daemon.threads.set(THREAD, { status: 'active', turns: [{ id: TARGET.nativeTurnId, status: 'inProgress', items: [] }] });
    daemon.loaded.add(THREAD);
    const provider = createCodexProvider(context, {
      openDaemon: (_socket, options) => connectUnixWebSocket(daemon.socketPath, options),
      sharedAccess: { probePort: async () => false, appInstalled: async () => false, loginShell: () => '/bin/sh', userName: () => 'fixture', nodeDir: '/n' },
    });
    await provider.refresh!();
    assert.equal((await provider.capabilities()).interruptTurn?.available, true);
    await provider.listSessions(project);
    assert.equal(provider.interruptAvailability!(project, THREAD).available, false, 'unknown until a normal feed read');
    await provider.readMessages!(project, THREAD, { limit: 10 });
    assert.equal(provider.interruptAvailability!(project, THREAD).available, true);
    assert.equal((await provider.interruptTurn!(project, THREAD, TARGET)).status, 'interrupted');
    assert.equal(daemon.archived.size, 0);
    assert.ok(!daemon.calls.some((c) => c.method === 'thread/delete' || c.method === 'thread/resume'));
  } finally { await machine.close(); }
});
