import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { after, before } from 'node:test';
import { providerSessionsFile } from '#provider-registry';
import type { Project } from '#provider-registry';
import { HELD_NOTE, RELEASING_NOTE, createCodexProvider } from '../src/index.ts';
import { BUSY_NOTE } from '../src/sessions.ts';
import { createRpcSession, initializeSession } from '../src/rpc.ts';
import { connectUnixWebSocket } from '../src/ws.ts';
import type { FakeDaemon, FakeDaemonOptions } from './fake-daemon.ts';
import { POSIX_MACHINE_SKIP, fakeMachine, machineTest as test } from './helpers.ts';
import type { FakeMachine } from './helpers.ts';

let machine: FakeMachine;
let project: Project;

before(async () => {
  if (POSIX_MACHINE_SKIP) return;
  machine = await fakeMachine();
  project = await machine.project('Release');
  await writeFile(path.join(machine.codexHome, 'config.toml'), `[projects."${project.path}"]\ntrust_level = "trusted"\n`);
});

after(async () => {
  await machine?.close();
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

async function create(options: FakeDaemonOptions, title: string, wait: { releaseWaitMs?: number } = {}): Promise<{ daemon: FakeDaemon; log: string[]; threadId: string; note?: string }> {
  const daemon = await machine.daemon(options);
  const log: string[] = [];
  const provider = createCodexProvider(machine.context({ log: (line: string) => log.push(line) }), { serviceTurnWaitMs: 100, daemonTtlMs: 0, releasePollMs: 10, ...wait });
  await provider.refresh!();
  const session = await provider.createSession(project, { title });
  return { daemon, log, threadId: session.localId, ...(session.note ? { note: session.note } : {}) };
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
  // The provider's own release check, then the test's question over a fresh connection.
  assert.deepEqual(methods, ['thread/start', 'thread/name/set', 'turn/start', 'thread/unsubscribe', 'thread/loaded/list', 'thread/loaded/list']);
  assert.deepEqual(daemon.calls.find((c) => c.method === 'thread/unsubscribe')?.params, { threadId });
  assert.ok(log.includes(`codex: thread/unsubscribe ${threadId}: unsubscribed`), log.join('\n'));
});

test('a service turn without turn/completed still ends with thread/unsubscribe and creates the session', async () => {
  const { daemon, threadId } = await create({ threadId: 'thread-silent', silentTurn: true }, 'Release · 2');
  assert.equal(threadId, 'thread-silent');
  assert.deepEqual(daemon.calls.slice(-2).map((c) => c.method), ['thread/unsubscribe', 'thread/loaded/list']);
  assert.deepEqual(await loadedThreads(daemon), []);
});

test('a failed thread/unsubscribe is logged and does not break session creation', async () => {
  const { daemon, log, threadId } = await create({ threadId: 'thread-stuck', unsubscribeError: 'boom' }, 'Release · 3');
  assert.equal(threadId, 'thread-stuck');
  assert.ok(log.some((line) => line.startsWith('codex: thread/unsubscribe thread-stuck failed:') && line.includes('boom')), log.join('\n'));
  const saved = JSON.parse(await readFile(providerSessionsFile(machine.dirs, 'codex'), 'utf8')) as { sessions: Array<{ threadId: string }> };
  assert.ok(saved.sessions.some((s) => s.threadId === 'thread-stuck'));
  assert.deepEqual(await loadedThreads(daemon), [], 'thread/archive unloads it all the same');
  assert.ok(daemon.calls.some((c) => c.method === 'thread/archive'));
});

test('a held thread is unloaded at once by thread/archive and thread/unarchive after the turn', async () => {
  const started = Date.now();
  const { daemon, log, threadId, note } = await create({ threadId: 'thread-fast', idleUnloadPolls: 1_000 }, 'Release · 6', { releaseWaitMs: 60_000 });
  assert.equal(note, undefined);
  assert.ok(Date.now() - started < 5_000, 'no idle minute');
  assert.ok(!daemon.loaded.has(threadId));
  assert.ok(!daemon.archived.has(threadId), 'the chat is back in the lists');
  const methods = daemon.calls.map((c) => c.method).filter((m) => m.startsWith('thread/'));
  assert.deepEqual(methods.slice(-5), ['thread/unsubscribe', 'thread/loaded/list', 'thread/archive', 'thread/unarchive', 'thread/loaded/list']);
  assert.ok(log.includes('codex: thread thread-fast unloaded by thread/archive and thread/unarchive'), log.join('\n'));
  assert.ok(log.includes('codex: thread thread-fast released by the daemon'), log.join('\n'));
});

test('a turn that did not finish is never archived: only the wait releases the thread', async () => {
  const { daemon, note } = await create({ threadId: 'thread-busy', silentTurn: true, idleUnloadPolls: 1_000 }, 'Release · 7', { releaseWaitMs: 50 });
  assert.equal(note, HELD_NOTE);
  assert.ok(!daemon.calls.some((c) => c.method === 'thread/archive'));
});

test('createSession waits until the daemon unloads the idle thread; meanwhile the session has no link', async () => {
  // A daemon without thread/archive: the provider falls back to the idle wait.
  const daemon = await machine.daemon({ threadId: 'thread-idle', idleUnloadPolls: 5, archiveError: 'unknown method' });
  const log: string[] = [];
  const provider = createCodexProvider(machine.context({ log: (line: string) => log.push(line) }), { serviceTurnWaitMs: 100, daemonTtlMs: 0, releasePollMs: 20 });
  await provider.refresh!();
  const creating = provider.createSession(project, { title: 'Release · 4' });
  while (!daemon.calls.some((c) => c.method === 'thread/loaded/list')) await new Promise((resolve) => setTimeout(resolve, 5));
  const during = (await provider.listSessions(project)).find((s) => s.localId === 'thread-idle');
  assert.ok(during, 'the session is listed while the daemon holds the thread');
  assert.deepEqual(during.links, {}, 'no link while ChatGPT would hit "already has an active writer"');
  assert.equal(during.note, RELEASING_NOTE);
  const session = await creating;
  assert.equal(session.note, undefined);
  assert.deepEqual(daemon.loaded.has('thread-idle'), false, 'handed out only after the daemon unloaded it');
  assert.ok(daemon.calls.filter((c) => c.method === 'thread/loaded/list').length >= 5);
  assert.ok(log.includes('codex: thread thread-idle released by the daemon'), log.join('\n'));
  const after = (await provider.listSessions(project)).find((s) => s.localId === 'thread-idle');
  assert.equal(after?.links.desktop, 'codex://threads/thread-idle');
  assert.equal(after?.note, undefined);
});

test('a thread still held when the wait ends gives the session with a note, not an error', async () => {
  const { daemon, log, note } = await create({ threadId: 'thread-long', idleUnloadPolls: 1_000, archiveError: 'unknown method' }, 'Release · 5', { releaseWaitMs: 50 });
  assert.equal(note, HELD_NOTE);
  assert.ok(daemon.loaded.has('thread-long'));
  assert.ok(log.some((line) => line.startsWith('codex: thread thread-long still held by the daemon after')), log.join('\n'));
  assert.ok(log.some((line) => line.startsWith('codex: thread thread-long not unloaded by thread/archive:')), log.join('\n'));
});

test('renameSession names an idle thread without loading it', async () => {
  const daemon = await machine.daemon({ threadId: 'thread-rename' });
  const provider = createCodexProvider(machine.context({}), { serviceTurnWaitMs: 100, daemonTtlMs: 0, releasePollMs: 10 });
  await provider.refresh!();
  assert.deepEqual(await provider.renameSession!(project, 'thread-rename', 'Склад — остатки'), { synced: true });
  const set = daemon.calls.filter((c) => c.method === 'thread/name/set');
  assert.deepEqual(set.map((c) => c.params), [{ threadId: 'thread-rename', name: 'Склад — остатки' }]);
  assert.ok(!daemon.calls.some((c) => c.method === 'thread/resume'), 'the thread is not resumed for a name');
  assert.ok(!daemon.loaded.has('thread-rename'), 'the thread stays unloaded');
  daemon.loaded.add('thread-rename');
  assert.deepEqual(await provider.renameSession!(project, 'thread-rename', 'Склад'), { synced: true });
});

test('renameSession reports a daemon refusal', async () => {
  await machine.daemon({ threadId: 'thread-rename-down', nameError: 'thread not found' });
  const provider = createCodexProvider(machine.context({}), { serviceTurnWaitMs: 100, daemonTtlMs: 0, releasePollMs: 10 });
  await provider.refresh!();
  await assert.rejects(provider.renameSession!(project, 'thread-rename-down', 'Имя'), /thread not found/);
});

test('createSession with a first message starts the turn with it instead of the service text', async () => {
  const daemon = await machine.daemon({ threadId: 'thread-first' });
  const provider = createCodexProvider(machine.context({}), { serviceTurnWaitMs: 100, firstTurnWaitMs: 200, daemonTtlMs: 0, releasePollMs: 10 });
  await provider.refresh!();
  await provider.createSession(project, { title: 'Склад', firstMessage: 'Проект создан. Прочитай AGENTS.md' });
  const turn = daemon.calls.find((c) => c.method === 'turn/start');
  assert.deepEqual((turn?.params as { input: unknown }).input, [{ type: 'text', text: 'Проект создан. Прочитай AGENTS.md' }]);
});

test('a detached session returns right after turn/start: no wait for the turn or the release (M4 11.1)', async () => {
  const daemon = await machine.daemon({ threadId: 'thread-detached', silentTurn: true, idleUnloadPolls: 1_000 });
  const log: string[] = [];
  // Waits that would take a minute each if the provider waited at all.
  const provider = createCodexProvider(machine.context({ log: (line: string) => log.push(line) }), { firstTurnWaitMs: 60_000, releaseWaitMs: 60_000, daemonTtlMs: 0, releasePollMs: 10 });
  await provider.refresh!();
  const started = Date.now();
  const session = await provider.createSession(project, { title: 'Ревью', firstMessage: 'Проверь план', detached: true });
  assert.ok(Date.now() - started < 5_000, 'returned at once');
  assert.equal(session.localId, 'thread-detached');
  assert.equal(session.note, BUSY_NOTE);
  const methods = daemon.calls.map((c) => c.method).filter((m) => m.startsWith('thread/') || m === 'turn/start');
  assert.deepEqual(methods, ['thread/start', 'thread/name/set', 'turn/start', 'thread/unsubscribe'], 'no loaded/list polls, never archived');
  assert.ok(log.includes('codex: thread thread-detached detached, its first turn goes on in the daemon'), log.join('\n'));
  const saved = JSON.parse(await readFile(providerSessionsFile(machine.dirs, 'codex'), 'utf8')) as { sessions: Array<{ threadId: string }> };
  assert.ok(saved.sessions.some((s) => s.threadId === 'thread-detached'), 'the record is written');
});
