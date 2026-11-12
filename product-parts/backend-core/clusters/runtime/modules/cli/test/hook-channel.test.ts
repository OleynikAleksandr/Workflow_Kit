// wfk hook stop|prompt end to end: the CLI posts the hook input to a real service on loopback and
// prints its answer; the service is createApp with a temporary data dir and stub providers (a hook
// is taken only from a registered provider).
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { sessionKey } from '#agent-channel';
import { createStubProvider } from '#provider-registry';
import type { Provider } from '#provider-registry';
import { createApp, main } from '../src/index.ts';
import type { App } from '../src/index.ts';

let tmp = '';
let app: App;
let env: Record<string, string> = {};
let folder = '';
/** What the providers with a direct path and a wake were asked to do (M19). */
const reach = { direct: [] as string[], woken: [] as string[], accept: false };

const CODEX_STOP = {
  session_id: '01a1afe3-05b5-75b0-a8b6-59bad1d1313b',
  turn_id: '01a1afe3-08e4-79b3-b2e3-5f4af0790720',
  hook_event_name: 'Stop',
  stop_hook_active: false,
  last_assistant_message: 'План предложен.',
};

/** A provider with sendDirect and wakeSession; marks says whether it marks the panel's processes. */
const reaching = (id: string, marks: boolean) => (): Provider => ({
  ...createStubProvider({ id, title: id, task: 'T' }),
  ...(marks ? { marksPanelProcess: true } : {}),
  sendDirect: async (_project, sessionId) => (reach.direct.push(`${id}:${sessionId}`), reach.accept),
  wakeSession: async (_project, sessionId) => (reach.woken.push(`${id}:${sessionId}`), true),
});

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-hook-channel-'));
  folder = path.join(tmp, 'Projects', 'demo');
  await mkdir(folder, { recursive: true });
  // The Claude stub takes session names in the prompt hook answer, like the real provider.
  const stub = (id: string, extra: { hookDialect?: 'kimi'; promptTitle?: boolean } = {}) => () => ({ ...createStubProvider({ id, title: id, task: 'T' }), ...extra });
  app = await createApp({
    env: { WFK_DATA_DIR: path.join(tmp, 'data'), WFK_PORT: '0' },
    homedir: tmp,
    providers: [stub('claude', { promptTitle: true }), stub('codex'), stub('kimi', { hookDialect: 'kimi' }), reaching('mark', true), reaching('plain', false)],
  });
  const bound = await app.start();
  env = { WFK_DATA_DIR: path.join(tmp, 'data'), WFK_PORT: String(bound.port) };
  await app.projects.open(folder);
});

after(async () => {
  await app.stop();
  await rm(tmp, { recursive: true, force: true });
});

async function hook(event: string, input: object, extraEnv: Record<string, string> = {}, client = 'codex'): Promise<{ code: number; out: string }> {
  let out = '';
  const code = await main(['hook', event, '--client', client], {
    stdout: (text) => (out += text),
    stderr: () => undefined,
    app: { env: { ...env, ...extraEnv }, homedir: tmp },
    readStdin: async () => JSON.stringify(input),
    hookClients: ['claude', 'codex', 'kimi', 'ghost', 'mark', 'plain'],
  });
  return { code, out };
}

test('stop prints the queued message as a block answer, once', async () => {
  const key = sessionKey('codex', CODEX_STOP.session_id);
  app.channel.enqueue(key, 'Workflow Kit: выбран путь «последовательно».');
  const first = await hook('stop', { ...CODEX_STOP, cwd: path.join(folder, 'src') });
  assert.equal(first.code, 0);
  assert.deepEqual(JSON.parse(first.out), { decision: 'block', reason: 'Workflow Kit: выбран путь «последовательно».' });
  const second = await hook('stop', { ...CODEX_STOP, cwd: folder, stop_hook_active: true });
  assert.equal(second.out, '');
  const activity = app.channel.get(key)!;
  const project = (await app.projects.list())[0]!;
  assert.equal(activity.projectId, project.id);
  const state = (await (await fetch(`http://127.0.0.1:${env['WFK_PORT']}/api/state`)).json()) as { channel: { sessions: Array<{ key: string }> } };
  assert.ok(state.channel.sessions.some((s) => s.key === key));
});

test('a held stop answers when the user decides', async () => {
  const key = sessionKey('codex', 'held-session');
  app.channel.setDecider(() => ({ kind: 'hold', reason: 'waiting-for-mode-choice' }));
  try {
    const pending = hook('stop', { ...CODEX_STOP, session_id: 'held-session', cwd: folder });
    for (let i = 0; i < 100 && app.channel.get(key)?.state !== 'holding'; i += 1) await new Promise((r) => setTimeout(r, 20));
    assert.equal(app.channel.get(key)?.state, 'holding');
    app.channel.enqueue(key, 'Workflow Kit: пользователь выбрал путь.');
    const result = await pending;
    assert.equal(JSON.parse(result.out).decision, 'block');
    assert.equal(app.channel.queued(key).length, 0);
  } finally {
    app.channel.setDecider(() => ({ kind: 'release' }));
  }
});

test('prompt carries a message that missed the Stop', async () => {
  const key = sessionKey('codex', 'late-session');
  app.channel.enqueue(key, 'Workflow Kit: продолжай.');
  const result = await hook('prompt', { session_id: 'late-session', cwd: folder, hook_event_name: 'UserPromptSubmit', prompt: 'продолжай' });
  assert.deepEqual(JSON.parse(result.out), {
    hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: 'Workflow Kit: продолжай.' },
  });
  assert.equal(app.channel.get(key)!.state, 'working');
});

test('no service: no output and exit 0', async () => {
  const result = await hook('stop', CODEX_STOP, { WFK_PORT: '1' });
  assert.deepEqual(result, { code: 0, out: '' });
  const broken = await main(['hook', 'prompt', '--client', 'claude'], {
    stdout: () => assert.fail('no output'),
    stderr: () => undefined,
    app: { env, homedir: tmp },
    readStdin: async () => 'not json',
  });
  assert.equal(broken, 0);
});

test('wfk session title names the session whose turn is running', async () => {
  const run = async (args: string[]) => {
    let out = '';
    let err = '';
    const code = await main(args, {
      stdout: (t) => (out += t),
      stderr: (t) => (err += t),
      app: { env, homedir: tmp },
      cwd: path.join(folder, 'src'),
    });
    return { code, out, err };
  };
  // Two sessions are in a turn: ambiguous.
  await hook('prompt', { session_id: 'title-1', cwd: folder, hook_event_name: 'UserPromptSubmit', prompt: 'задача' });
  await hook('prompt', { session_id: 'title-2', cwd: folder, hook_event_name: 'UserPromptSubmit', prompt: 'задача' });
  const ambiguous = await run(['session', 'title', 'Анализ', 'остатков']);
  assert.equal(ambiguous.code, 1);
  assert.match(ambiguous.err, /нескольких сессий/);
  for (const id of ['title-2', 'late-session', CODEX_STOP.session_id, 'held-session']) await hook('stop', { ...CODEX_STOP, session_id: id, cwd: folder });
  const named = await run(['session', 'title', 'Анализ', 'остатков']);
  assert.equal(named.code, 0, named.err);
  assert.match(named.out, /Анализ остатков/);
  const project = (await app.projects.list())[0]!;
  assert.equal(app.titles.name(project.id, 'codex:title-1').name, 'Анализ остатков');
  assert.equal((await run(['session', 'title'])).code, 64);
});

test('wfk session title names the calling session by CODEX_THREAD_ID even when other turns run', async () => {
  let err = '';
  await hook('prompt', { session_id: 'thread-a', cwd: folder, hook_event_name: 'UserPromptSubmit', prompt: 'задача' });
  await hook('prompt', { session_id: 'helper-fork', cwd: folder, hook_event_name: 'UserPromptSubmit', prompt: 'служебный ход' });
  const code = await main(['session', 'title', 'Склад:', 'анализ', 'остатков'], {
    stdout: () => undefined,
    stderr: (t) => (err += t),
    app: { env: { ...env, CODEX_THREAD_ID: 'thread-a' }, homedir: tmp },
    cwd: folder,
  });
  assert.equal(code, 0, err);
  const project = (await app.projects.list())[0]!;
  assert.equal(app.titles.name(project.id, 'codex:thread-a').name, 'Склад: анализ остатков');
});

test('the Claude prompt hook gives the Kit session name to the app, with queued messages', async () => {
  const project = (await app.projects.list())[0]!;
  const key = sessionKey('claude', 'claude-named');
  const prompt = (title: string) =>
    hook('prompt', { session_id: 'claude-named', cwd: folder, hook_event_name: 'UserPromptSubmit', prompt: 'задача', session_title: title }, {}, 'claude');
  await app.titles.setManual(project.id, key, 'Склад — остатки');
  const first = await prompt('Старое имя');
  assert.deepEqual(JSON.parse(first.out), { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', sessionTitle: 'Склад — остатки' } });
  assert.equal((await prompt('Склад — остатки')).out, '');
  assert.equal(app.titles.name(project.id, key).synced, true);
  await app.titles.setManual(project.id, key, 'Склад');
  app.channel.enqueue(key, 'Workflow Kit: продолжай.');
  const both = await prompt('Склад — остатки');
  assert.deepEqual(JSON.parse(both.out), {
    hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: 'Workflow Kit: продолжай.', sessionTitle: 'Склад' },
  });
  // Let the background rename retries of the turn finish before the folder is removed.
  await new Promise((resolve) => setTimeout(resolve, 200));
});

test('wfk session title is refused during the panel greeting turn', async () => {
  await hook('prompt', { session_id: 'greeting', cwd: folder, hook_event_name: 'UserPromptSubmit', prompt: 'Проект «demo» создан панелью Workflow Kit. Прочитай AGENTS.md' });
  let err = '';
  const code = await main(['session', 'title', 'Подготовка'], {
    stdout: () => undefined,
    stderr: (t) => (err += t),
    app: { env: { ...env, CODEX_THREAD_ID: 'greeting' }, homedir: tmp },
    cwd: folder,
  });
  assert.equal(code, 1);
  assert.match(err, /служебное сообщение/);
  await hook('stop', { ...CODEX_STOP, session_id: 'greeting', cwd: folder });
});

test('a kimi-dialect client gets queued messages as { message } and its prompt parts are read', async () => {
  const key = sessionKey('kimi', 'session_k1');
  const input = { session_id: 'session_k1', cwd: folder, hook_event_name: 'UserPromptSubmit', prompt: [{ type: 'text', text: 'задача' }] };
  assert.equal((await hook('prompt', input, {}, 'kimi')).out, '');
  assert.equal(app.channel.get(key)!.state, 'working');
  app.channel.enqueue(key, 'Workflow Kit: продолжай.');
  const reply = await hook('prompt', input, {}, 'kimi');
  assert.deepEqual(JSON.parse(reply.out), { message: 'Workflow Kit: продолжай.' });
  assert.equal(app.channel.queued(key).length, 0);
});

test('a hook of a client that is not a provider is refused by the CLI and by the service', async () => {
  const input = { session_id: 'ghost-1', cwd: folder, hook_event_name: 'UserPromptSubmit', prompt: 'x' };
  // The CLI knows only the service's providers: nothing is posted.
  let posted = 0;
  const code = await main(['hook', 'prompt', '--client', 'ghost'], {
    stdout: () => assert.fail('no output'),
    stderr: () => undefined,
    app: { env, homedir: tmp },
    readStdin: async () => JSON.stringify(input),
    postJson: async () => {
      posted += 1;
      return null;
    },
  });
  assert.deepEqual([code, posted], [0, 0]);
  // A CLI that lets the client through is still refused by the registry of the service.
  assert.deepEqual(await hook('prompt', input, {}, 'ghost'), { code: 0, out: '' });
  assert.equal(app.channel.get(sessionKey('ghost', 'ghost-1')), undefined);
  const response = await fetch(`http://127.0.0.1:${env['WFK_PORT']}/api/hooks/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${env['WFK_PORT']}` },
    body: JSON.stringify({ client: 'ghost', input }),
  });
  assert.equal(response.status, 400);
  assert.equal(((await response.json()) as { error?: { code?: string } }).error?.code, 'bad-hook-input');
});

async function panelMessage(key: string, text: string): Promise<{ sent?: boolean; queued?: string }> {
  const project = (await app.projects.list())[0]!;
  const response = await fetch(`http://127.0.0.1:${env['WFK_PORT']}/api/projects/${project.id}/sessions/${encodeURIComponent(key)}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${env['WFK_PORT']}` },
    body: JSON.stringify({ text }),
  });
  assert.equal(response.status, 200);
  return (await response.json()) as { sent?: boolean; queued?: string };
}

async function stateExternal(key: string): Promise<unknown> {
  const state = (await (await fetch(`http://127.0.0.1:${env['WFK_PORT']}/api/state`)).json()) as { channel: { sessions: Array<{ key: string; external?: unknown }> } };
  return state.channel.sessions.find((s) => s.key === key)?.external;
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 50));

test('the hooks carry the panel mark: a marked session keeps the direct path and the wake (M19)', async () => {
  const key = sessionKey('mark', 'm-panel');
  const stop = { session_id: 'm-panel', cwd: folder, hook_event_name: 'Stop', stop_hook_active: false };
  await hook('stop', stop, { WFK_PANEL_SESSION: '1' }, 'mark');
  assert.equal(app.channel.get(key)!.external, false);
  assert.equal(await stateExternal(key), false, '/api/state shows external');
  reach.accept = true;
  assert.deepEqual(await panelMessage(key, 'прямо'), { sent: true });
  assert.deepEqual(reach.direct, [key]);
  reach.accept = false;
  const queued = await panelMessage(key, 'в очередь');
  assert.ok(queued.queued, 'a refused direct path queues');
  await settle();
  assert.deepEqual(reach.woken, [key], 'the waiting session is woken as in 0.9.0');
});

test('a session whose last hook came without the mark gets panel messages only from the queue (M19)', async () => {
  reach.direct = [];
  reach.woken = [];
  reach.accept = true;
  const key = sessionKey('mark', 'm-outside');
  const stop = { session_id: 'm-outside', cwd: folder, hook_event_name: 'Stop', stop_hook_active: false };
  await hook('stop', stop, {}, 'mark');
  assert.equal(app.channel.get(key)!.external, true);
  assert.equal(await stateExternal(key), true);
  const reply = await panelMessage(key, 'Workflow Kit: продолжай.');
  assert.ok(reply.queued);
  await settle();
  assert.deepEqual([reach.direct, reach.woken], [[], []], 'nothing is typed or woken');
  const next = await hook('prompt', { session_id: 'm-outside', cwd: folder, hook_event_name: 'UserPromptSubmit', prompt: 'дальше' }, {}, 'mark');
  assert.equal(JSON.parse(next.out).hookSpecificOutput.additionalContext, 'Workflow Kit: продолжай.', 'the next hook takes the queue');
  // A later hook of a panel process makes the session the panel's again.
  await hook('stop', stop, { WFK_PANEL_SESSION: '1' }, 'mark');
  assert.equal(app.channel.get(key)!.external, false);
});

test('a provider without marksPanelProcess keeps the direct path and the wake without the mark (M19)', async () => {
  reach.direct = [];
  reach.woken = [];
  reach.accept = true;
  const key = sessionKey('plain', 'p-1');
  await hook('stop', { session_id: 'p-1', cwd: folder, hook_event_name: 'Stop', stop_hook_active: false }, {}, 'plain');
  assert.equal(app.channel.get(key)!.external, true);
  assert.deepEqual(await panelMessage(key, 'прямо'), { sent: true });
  reach.accept = false;
  assert.ok((await panelMessage(key, 'в очередь')).queued);
  await settle();
  assert.deepEqual([reach.direct, reach.woken], [[key, key], [key]]);
});
