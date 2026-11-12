// Conversation of ChatGPT sessions (spec M18 section 2.3) on the fake daemon: the feed from
// thread/read with turns, the item time, a chat that stays not loaded, the refusals, every branch
// of sendDirect, and the provider with the platform injected (the Windows proxy transport is
// replaced by a direct connection to the fake daemon, which listens on a named pipe on Windows).
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { ProviderError } from '#provider-registry';
import type { Project, ProviderContext } from '#provider-registry';
import type { ProcessSupervisor } from '#process-supervisor';
import { createEventLog } from '#data-store';
import { CHAT_PAGE_LIMIT } from '#provider-registry';
import { chatPage, createChatParts, createCodexProvider, threadMessages, threadStatus } from '../src/index.ts';
import type { ChatDeps } from '../src/index.ts';
import { createRpcSession, initializeSession } from '../src/rpc.ts';
import type { RpcSession } from '../src/rpc.ts';
import { connectUnixWebSocket } from '../src/ws.ts';
import { startFakeDaemon } from './fake-daemon.ts';
import type { FakeDaemon } from './fake-daemon.ts';

const THREAD = 'thread-chat';
const T0 = Date.UTC(2026, 10, 12, 9, 0, 0);

const TURNS = [
  {
    id: 'turn-1',
    status: 'completed',
    startedAt: T0 / 1000,
    completedAt: T0 / 1000 + 30,
    items: [
      { type: 'userMessage', id: 'u1', content: [{ type: 'text', text: 'Привет' }, { type: 'image', url: 'x' }, { type: 'text', text: 'вторая строка' }], startedAtMs: T0, completedAtMs: T0 },
      { type: 'reasoning', id: 'r1', summary: ['думаю'], startedAtMs: T0 + 1000 },
      { type: 'commandExecution', id: 'c1', command: 'ls', startedAtMs: T0 + 2000 },
      { type: 'agentMessage', id: 'a1', text: 'Здравствуйте', phase: 'final', startedAtMs: T0 + 5000, completedAtMs: T0 + 6000 },
    ],
  },
  {
    id: 'turn-2',
    status: 'inProgress',
    startedAt: '2026-11-12T09:10:00.000Z',
    items: [
      { type: 'userMessage', id: 'u2', content: [{ type: 'text', text: 'Ещё' }] },
      { type: 'agentMessage', id: 'a2', text: '   ' },
    ],
  },
];

let tmp = '';
let daemon: FakeDaemon;

before(async () => {
  // Unix socket names are limited to 104 bytes on macOS: keep the directory short.
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfkm-'));
  daemon = await startFakeDaemon(path.join(tmp, 'a.sock'));
});

after(async () => {
  await daemon.close();
  await rm(tmp, { recursive: true, force: true });
});

/** CodexRuntime.withDaemon over a fake daemon. */
function withDaemonOf(target: FakeDaemon): ChatDeps['withDaemon'] {
  return async <T>(fn: (session: RpcSession) => Promise<T>): Promise<T> => {
    const session = createRpcSession(await connectUnixWebSocket(target.socketPath, { timeoutMs: 2000 }), { timeoutMs: 2000 });
    try {
      await initializeSession(session);
      return await fn(session);
    } finally {
      session.close();
    }
  };
}

function parts(shared: boolean, target: FakeDaemon = daemon, lines: string[] = []) {
  return createChatParts({ withDaemon: withDaemonOf(target), shared: async () => shared, log: (line) => lines.push(line) });
}

const methods = (): string[] => daemon.calls.map((c) => c.method).filter((m) => m !== 'initialize' && m !== 'initialized');

function reset(status?: string): void {
  daemon.calls.length = 0;
  daemon.loaded.clear();
  daemon.threads.clear();
  if (status) daemon.threads.set(THREAD, { status, turns: TURNS });
}

test('thread/read turns become messages: user and agent items only, item time, turn time as fallback', () => {
  const messages = threadMessages({ thread: { turns: TURNS } });
  assert.deepEqual(messages, [
    { id: 'u1', role: 'user', text: 'Привет\nвторая строка', at: new Date(T0).toISOString() },
    { id: 'a1', role: 'assistant', text: 'Здравствуйте', at: new Date(T0 + 5000).toISOString() },
    { id: 'u2', role: 'user', text: 'Ещё', at: '2026-11-12T09:10:00.000Z' },
  ]);
  assert.deepEqual(threadMessages({ thread: { turns: [{ items: [{ type: 'agentMessage', text: 'без id' }] }] } }), [
    { id: 'turn:0', role: 'assistant', text: 'без id', at: null },
  ]);
  // A turn time in epoch seconds stands in for an item without startedAtMs.
  assert.equal(threadMessages({ thread: { turns: [{ id: 't', startedAt: T0 / 1000, items: [{ type: 'agentMessage', id: 'x', text: 'ok' }] }] } })[0]?.at, new Date(T0).toISOString());
  assert.deepEqual(threadMessages(null), []);
  assert.deepEqual(threadMessages({ thread: { turns: 'x' } }), []);
});

test('the page keeps the newest messages and says when older ones were left out', () => {
  const all = threadMessages({ thread: { turns: TURNS } });
  assert.deepEqual(chatPage(all, CHAT_PAGE_LIMIT), { messages: all, truncated: false });
  assert.deepEqual(chatPage(all, 2), { messages: all.slice(1), truncated: true });
  assert.deepEqual(chatPage(all, 0), { messages: [], truncated: true });
  assert.deepEqual(chatPage([], 5), { messages: [], truncated: false });
});

test('readMessages reads a not loaded chat with turns and leaves it not loaded', async () => {
  reset('notLoaded');
  const page = await parts(false).readMessages(THREAD, CHAT_PAGE_LIMIT);
  assert.deepEqual(page.messages.map((m) => m.id), ['u1', 'a1', 'u2']);
  assert.equal(page.truncated, false);
  assert.deepEqual(methods(), ['thread/read']);
  assert.deepEqual(daemon.calls.find((c) => c.method === 'thread/read')?.params, { threadId: THREAD, includeTurns: true });
  assert.equal(daemon.loaded.has(THREAD), false);
  const limited = await parts(false).readMessages(THREAD, 1);
  assert.deepEqual(limited, { messages: [page.messages[2]], truncated: true });
});

test('readMessages: a thread without turns is an empty page', async () => {
  reset();
  assert.deepEqual(await parts(false).readMessages('thread-empty', CHAT_PAGE_LIMIT), { messages: [], truncated: false });
});

test('readMessages: a refusal of the daemon, no daemon or a bad id is chat-unavailable', async () => {
  const refusing = await startFakeDaemon(path.join(tmp, 'b.sock'), { readError: 'thread not found' });
  try {
    await assert.rejects(parts(false, refusing).readMessages(THREAD, 10), (error: unknown) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.code, 'chat-unavailable');
      assert.match(error.message, /^Codex не отдал переписку: .*thread not found/);
      return true;
    });
  } finally {
    await refusing.close();
  }
  const none = createChatParts({ withDaemon: async () => Promise.reject(new Error('connect ENOENT')), shared: async () => true, log: () => undefined });
  await assert.rejects(none.readMessages(THREAD, 10), /Codex не отдал переписку: connect ENOENT/);
  await assert.rejects(parts(false).readMessages('bad id/..', 10), (error: unknown) => error instanceof ProviderError && error.code === 'chat-unavailable');
});

test('threadStatus reads the status without turns; null when the daemon refuses', async () => {
  reset('active');
  assert.equal(await withDaemonOf(daemon)((session) => threadStatus(session, THREAD)), 'active');
  assert.deepEqual(daemon.calls.find((c) => c.method === 'thread/read')?.params, { threadId: THREAD });
  const refusing = await startFakeDaemon(path.join(tmp, 'c.sock'), { readError: 'boom' });
  try {
    assert.equal(await withDaemonOf(refusing)((session) => threadStatus(session, THREAD)), null);
  } finally {
    await refusing.close();
  }
});

test('sendDirect outside the shared daemon mode is false and asks the daemon nothing', async () => {
  reset('idle');
  assert.equal(await parts(false).sendDirect(THREAD, 'Сделай задачу'), false);
  assert.deepEqual(daemon.calls, []);
});

test('sendDirect on an idle chat starts a turn with the text itself', async () => {
  reset('idle');
  daemon.loaded.add(THREAD);
  assert.equal(await parts(true).sendDirect(THREAD, 'Строка 1\nСтрока 2'), true);
  assert.deepEqual(methods(), ['thread/read', 'thread/loaded/list', 'turn/start', 'thread/unsubscribe']);
  assert.deepEqual(daemon.calls.find((c) => c.method === 'turn/start')?.params, { threadId: THREAD, input: [{ type: 'text', text: 'Строка 1\nСтрока 2' }] });
});

test('sendDirect on a not loaded chat resumes it and starts a turn with the text', async () => {
  reset('notLoaded');
  assert.equal(await parts(true).sendDirect(THREAD, 'Привет'), true);
  assert.deepEqual(methods(), ['thread/read', 'thread/loaded/list', 'thread/resume', 'turn/start', 'thread/unsubscribe']);
});

test('sendDirect while a turn runs is false and never calls turn/start', async () => {
  reset('active');
  const lines: string[] = [];
  assert.equal(await parts(true, daemon, lines).sendDirect(THREAD, 'Привет'), false);
  assert.deepEqual(methods(), ['thread/read']);
  assert.match(lines.join('\n'), /status active/);
});

test('sendDirect: another status, an unreadable status, no daemon or an empty text is false', async () => {
  reset('systemError');
  assert.equal(await parts(true).sendDirect(THREAD, 'x'), false);
  assert.ok(!methods().includes('turn/start'));
  const refusing = await startFakeDaemon(path.join(tmp, 'd.sock'), { readError: 'boom' });
  try {
    assert.equal(await parts(true, refusing).sendDirect(THREAD, 'x'), false);
    assert.ok(!refusing.calls.some((c) => c.method === 'turn/start'));
  } finally {
    await refusing.close();
  }
  const lines: string[] = [];
  const none = createChatParts({ withDaemon: async () => Promise.reject(new Error('gone')), shared: async () => true, log: (line) => lines.push(line) });
  assert.equal(await none.sendDirect(THREAD, 'x'), false);
  assert.match(lines.join('\n'), /failed: gone/);
  reset('idle');
  assert.equal(await parts(true).sendDirect(THREAD, '  \n '), false);
  assert.equal(await parts(true).sendDirect('bad id', 'x'), false);
  assert.deepEqual(daemon.calls, []);
});

/** A provider context of the given platform; external programs all fail. */
function contextOf(platform: NodeJS.Platform, root: string): ProviderContext {
  const data = path.join(root, `data-${platform}`);
  const home = path.join(root, `home-${platform}`);
  return {
    platform,
    env: platform === 'win32' ? { PATH: path.join(root, 'bin'), USERPROFILE: home, LOCALAPPDATA: path.join(home, 'L') } : { PATH: path.join(root, 'bin'), HOME: home },
    homedir: home,
    dirs: { configDir: data, stateDir: data, appDir: data, logsDir: path.join(data, 'logs'), backupsDir: path.join(data, 'backups'), overridden: true },
    config: { port: 0, projectsRoot: home, programs: {} },
    events: createEventLog({ file: path.join(data, 'events.jsonl') }),
    supervisor: {} as ProcessSupervisor,
    runCommand: async () => ({ code: 1, stdout: '', stderr: 'not here', timedOut: false, signal: null, startError: null }),
    now: () => new Date(),
    log: () => undefined,
  };
}

for (const platform of ['darwin', 'linux', 'win32'] as const) {
  test(`the provider on ${platform}: readMessages through the daemon transport, sendDirect false without shared access`, async () => {
    reset('notLoaded');
    const project: Project = { id: 'id-p', name: 'P', path: path.join(tmp, 'p'), source: 'created', createdAt: new Date().toISOString() };
    const opened: string[] = [];
    const provider = createCodexProvider(contextOf(platform, tmp), {
      openDaemon: (socket, options) => {
        opened.push(socket);
        return connectUnixWebSocket(daemon.socketPath, options);
      },
      sharedAccess: { probePort: async () => false, loginShell: () => '/bin/zsh', userName: () => 'u', appInstalled: async () => false, nodeDir: '/n' },
    });
    const page = await provider.readMessages!(project, THREAD, { limit: CHAT_PAGE_LIMIT });
    assert.deepEqual(page.messages.map((m) => m.role), ['user', 'assistant', 'user']);
    assert.equal(opened.length, 1);
    assert.equal(daemon.loaded.has(THREAD), false);
    daemon.calls.length = 0;
    assert.equal(await provider.sendDirect!(project, THREAD, 'Привет'), false);
    assert.ok(!daemon.calls.some((c) => c.method === 'turn/start'));
  });
}
