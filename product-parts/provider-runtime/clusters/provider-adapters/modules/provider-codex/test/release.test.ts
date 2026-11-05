import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { providerSessionsFile } from '#provider-registry';
import type { Project } from '#provider-registry';
import { createCodexProvider } from '../src/index.ts';
import { createRpcSession, initializeSession } from '../src/rpc.ts';
import { connectUnixWebSocket } from '../src/ws.ts';
import type { FakeDaemon, FakeDaemonOptions } from './fake-daemon.ts';
import { fakeMachine } from './helpers.ts';
import type { FakeMachine } from './helpers.ts';

let machine: FakeMachine;
let project: Project;

before(async () => {
  machine = await fakeMachine();
  project = await machine.project('Release');
  await writeFile(path.join(machine.codexHome, 'config.toml'), `[projects."${project.path}"]\ntrust_level = "trusted"\n`);
});

after(async () => {
  await machine.close();
});

/** Asks the daemon over a fresh connection, as another client (ChatGPT) would. */
async function ask<T>(daemon: FakeDaemon, method: string, params: unknown): Promise<T> {
  const session = createRpcSession(await connectUnixWebSocket(daemon.socketPath, { timeoutMs: 2000 }));
  try {
    await initializeSession(session);
    return await session.request<T>(method, params);
  } finally {
    session.close();
  }
}

const loadedThreads = async (daemon: FakeDaemon): Promise<string[]> => (await ask<{ data: string[] }>(daemon, 'thread/loaded/list', {})).data;

async function create(options: FakeDaemonOptions, title: string): Promise<{ daemon: FakeDaemon; log: string[]; threadId: string }> {
  const daemon = await machine.daemon(options);
  const log: string[] = [];
  const provider = createCodexProvider(machine.context({ log: (line: string) => log.push(line) }), { serviceTurnWaitMs: 100, daemonTtlMs: 0 });
  await provider.refresh!();
  const session = await provider.createSession(project, { title });
  return { daemon, log, threadId: session.localId };
}

test('the fake daemon keeps a thread loaded after its connection closes without thread/unsubscribe (defect D1)', async () => {
  const daemon = await machine.daemon({ threadId: 'thread-held' });
  await ask(daemon, 'thread/start', { cwd: project.path });
  assert.deepEqual(await loadedThreads(daemon), ['thread-held']);
});

test('after createSession the thread is not loaded in the daemon: start, name, turn, then unsubscribe', async () => {
  const { daemon, log, threadId } = await create({ threadId: 'thread-released' }, 'Release · 1');
  assert.deepEqual(await loadedThreads(daemon), []);
  const methods = daemon.calls.map((c) => c.method).filter((m) => m.startsWith('thread/') || m === 'turn/start');
  assert.deepEqual(methods, ['thread/start', 'thread/name/set', 'turn/start', 'thread/unsubscribe', 'thread/loaded/list']);
  assert.deepEqual(daemon.calls.find((c) => c.method === 'thread/unsubscribe')?.params, { threadId });
  assert.ok(log.includes(`codex: thread/unsubscribe ${threadId}: unsubscribed`), log.join('\n'));
});

test('a service turn without turn/completed still ends with thread/unsubscribe and creates the session', async () => {
  const { daemon, threadId } = await create({ threadId: 'thread-silent', silentTurn: true }, 'Release · 2');
  assert.equal(threadId, 'thread-silent');
  assert.equal(daemon.calls.at(-1)?.method, 'thread/unsubscribe');
  assert.deepEqual(await loadedThreads(daemon), []);
});

test('a failed thread/unsubscribe is logged and does not break session creation', async () => {
  const { daemon, log, threadId } = await create({ threadId: 'thread-stuck', unsubscribeError: 'boom' }, 'Release · 3');
  assert.equal(threadId, 'thread-stuck');
  assert.ok(log.some((line) => line.startsWith('codex: thread/unsubscribe thread-stuck failed:') && line.includes('boom')), log.join('\n'));
  const saved = JSON.parse(await readFile(providerSessionsFile(machine.dirs, 'codex'), 'utf8')) as { sessions: Array<{ threadId: string }> };
  assert.ok(saved.sessions.some((s) => s.threadId === 'thread-stuck'));
  assert.deepEqual(await loadedThreads(daemon), ['thread-stuck'], 'the daemon still holds it: only the log tells');
});
