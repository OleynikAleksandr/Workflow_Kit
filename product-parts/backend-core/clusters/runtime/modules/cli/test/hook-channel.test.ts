// wfk hook stop|prompt end to end: the CLI posts the hook input to a real service on loopback and
// prints its answer; the service is createApp with a temporary data dir and no providers.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { sessionKey } from '#agent-channel';
import { createApp, main } from '../src/index.ts';
import type { App } from '../src/index.ts';

let tmp = '';
let app: App;
let env: Record<string, string> = {};
let folder = '';

const CODEX_STOP = {
  session_id: '01a1afe3-05b5-75b0-a8b6-59bad1d1313b',
  turn_id: '01a1afe3-08e4-79b3-b2e3-5f4af0790720',
  hook_event_name: 'Stop',
  stop_hook_active: false,
  last_assistant_message: 'План предложен.',
};

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-hook-channel-'));
  folder = path.join(tmp, 'Projects', 'demo');
  await mkdir(folder, { recursive: true });
  app = await createApp({ env: { WFK_DATA_DIR: path.join(tmp, 'data'), WFK_PORT: '0' }, homedir: tmp, providers: [] });
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
