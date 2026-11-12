// wfk hook turn-end end to end: the CLI tells a real service on loopback that a turn ended; the
// service waits for the session to be idle and sends the next message as a prompt through the
// provider (sendMessage). The provider is a stub with a fake session lock.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { sessionKey } from '#agent-channel';
import type { StopEvent } from '#agent-channel';
import { createStubProvider } from '#provider-registry';
import type { Provider } from '#provider-registry';
import { createApp, main } from '../src/index.ts';
import type { App } from '../src/index.ts';

let tmp = '';
let app: App;
let env: Record<string, string> = {};
let folder = '';
/** The fake Kimi: its session lock, its last answer and what it was asked to send. */
const kimi = { idle: false, sent: [] as Array<{ sessionId: string; text: string; id: string; project: string }> };
const events: StopEvent[] = [];

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-hook-turn-end-'));
  folder = path.join(tmp, 'Projects', 'demo');
  await mkdir(folder, { recursive: true });
  const detached = (): Provider => ({
    ...createStubProvider({ id: 'kimi', title: 'Kimi Code', task: 'T' }),
    label: 'Kimi',
    hookDialect: 'kimi',
    lockSwitch: 'KIMI_CODE_SESSION_LOCK',
    sessionIdle: async () => kimi.idle,
    lastAnswer: async () => 'Задача готова.',
    sendMessage: async (project, sessionId, text, delivery) => {
      kimi.sent.push({ sessionId, text, id: delivery.id, project: project.path });
      return true;
    },
  });
  app = await createApp({
    env: { WFK_DATA_DIR: path.join(tmp, 'data'), WFK_PORT: '0' },
    homedir: tmp,
    providers: [() => createStubProvider({ id: 'codex', title: 'codex', task: 'T' }), detached],
  });
  const bound = await app.start();
  env = { WFK_DATA_DIR: path.join(tmp, 'data'), WFK_PORT: String(bound.port) };
  await app.projects.open(folder);
  app.channel.onStop((event) => events.push(event));
});

after(async () => {
  await app.stop();
  await rm(tmp, { recursive: true, force: true });
});

async function hook(event: string, stdin: string, extraEnv: Record<string, string> = {}): Promise<{ code: number; out: string }> {
  let out = '';
  const code = await main(['hook', event, '--client', 'kimi'], {
    stdout: (text) => (out += text),
    stderr: () => undefined,
    app: { env: { ...env, ...extraEnv }, homedir: tmp },
    readStdin: async () => stdin,
    hookClients: ['codex', 'kimi'],
  });
  return { code, out };
}
/** The watcher of the service polls the session lock once a second. */
async function until(check: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 400 && !check(); i += 1) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(check(), what);
}
const turnEnd = (sessionId: string, event = 'Stop'): string => JSON.stringify({ hook_event_name: event, session_id: sessionId, cwd: folder });
const prompt = (sessionId: string, text: string): string =>
  JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: sessionId, cwd: folder, prompt: [{ type: 'text', text }] });

async function post(body: object): Promise<{ status: number; code?: string }> {
  const response = await fetch(`http://127.0.0.1:${env['WFK_PORT']}/api/hooks/turn-end`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${env['WFK_PORT']}` },
    body: JSON.stringify(body),
  });
  const json = (await response.json()) as { error?: { code?: string } };
  return { status: response.status, code: json.error?.code };
}

test('turn-end prints nothing and exits 0, also with a broken input or without the service', async () => {
  assert.deepEqual(await hook('turn-end', turnEnd('session_quiet', 'Interrupt')), { code: 0, out: '' });
  assert.equal(app.channel.get(sessionKey('kimi', 'session_quiet'))!.state, 'waiting');
  assert.deepEqual(await hook('turn-end', 'not json'), { code: 0, out: '' });
  assert.deepEqual(await hook('turn-end', JSON.stringify({ hook_event_name: 'Stop' })), { code: 0, out: '' });
  assert.deepEqual(await hook('turn-end', turnEnd('session_down'), { WFK_PORT: '1' }), { code: 0, out: '' });
  assert.equal(app.channel.get(sessionKey('kimi', 'session_down')), undefined);
});

test('the service refuses a turn end of a provider whose Stop is held and an unknown event', async () => {
  assert.deepEqual(await post({ client: 'codex', sessionId: 's1', cwd: folder, event: 'Stop' }), { status: 400, code: 'bad-hook-input' });
  assert.deepEqual(await post({ client: 'kimi', sessionId: 's1', cwd: folder, event: 'SessionEnd' }), { status: 400, code: 'bad-hook-input' });
  assert.deepEqual(await post({ client: 'kimi', sessionId: '', cwd: folder, event: 'Stop' }), { status: 400, code: 'bad-hook-input' });
  assert.deepEqual(await post({ client: 'ghost', sessionId: 's1', cwd: folder, event: 'Stop' }), { status: 400, code: 'bad-hook-input' });
  assert.equal((await post({ client: 'kimi', sessionId: 's1', cwd: folder, event: 'StopFailure' })).status, 200);
});

test('after a turn end the queued message goes as a prompt, and its hook is the turn of the service', async () => {
  const sessionId = 'session_flow';
  const key = sessionKey('kimi', sessionId);
  kimi.idle = false;
  assert.equal((await hook('prompt', prompt(sessionId, 'сделай задачу'))).out, '');
  assert.equal(app.autopilot.get(key)!.origin, 'user');
  app.channel.enqueue(key, 'Workflow Kit: замечания ревью.', 'review');
  assert.deepEqual(await hook('turn-end', turnEnd(sessionId)), { code: 0, out: '' });
  assert.deepEqual([kimi.sent.length, events.length], [0, 0], 'nothing happens while the session is busy');
  kimi.idle = true;
  await until(() => kimi.sent.length === 1, 'the message is sent once the session is idle');
  const sent = kimi.sent[0]!;
  assert.deepEqual([sent.sessionId, sent.text, sent.project], [sessionId, 'Workflow Kit: замечания ревью.', (await app.projects.list())[0]!.path]);
  assert.deepEqual(events.map((event) => [event.origin, event.lastAssistantMessage]), [['user', 'Задача готова.']]);
  // The prompt hook of the sent message prints nothing and is not a user turn.
  kimi.idle = false;
  assert.equal((await hook('prompt', prompt(sessionId, sent.text))).out, '');
  assert.equal(app.autopilot.get(key)!.origin, 'kit');
  await hook('turn-end', turnEnd(sessionId));
  kimi.idle = true;
  await until(() => events.length === 2, 'the turn end of the delivered prompt is heard');
  assert.deepEqual([events[1]!.origin, events[1]!.sources], ['delivery', ['review']]);
  assert.equal(kimi.sent.length, 1);
  // A panel message for the waiting session goes at once, without a new turn end.
  const response = await fetch(`http://127.0.0.1:${env['WFK_PORT']}/api/projects/${(await app.projects.list())[0]!.id}/sessions/${encodeURIComponent(key)}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${env['WFK_PORT']}` },
    body: JSON.stringify({ text: 'сообщение панели' }),
  });
  assert.equal(response.status, 200);
  await until(() => kimi.sent.length === 2, 'the panel message is sent at once');
  assert.equal(kimi.sent[1]!.text, 'сообщение панели');
});

test('a Stop without a live session lock leaves a note with the name of the switch', async () => {
  const key = sessionKey('kimi', 'session_lockless');
  kimi.idle = false;
  await hook('prompt', prompt('session_lockless', 'задача'));
  kimi.idle = true;
  await hook('turn-end', turnEnd('session_lockless'));
  assert.match(app.channel.get(key)!.note!, /^Kimi запущен без замков сессий \(`KIMI_CODE_SESSION_LOCK`\)/);
  const state = (await (await fetch(`http://127.0.0.1:${env['WFK_PORT']}/api/state`)).json()) as { channel: { sessions: Array<{ key: string; note: string | null }> } };
  assert.match(state.channel.sessions.find((session) => session.key === key)!.note!, /без замков/);
});

test('turn-end carries the panel mark: panelProcess true only for WFK_PANEL_SESSION=1, and external follows it (M19)', async () => {
  const bodies: unknown[] = [];
  for (const mark of ['1', '0', undefined]) {
    await main(['hook', 'turn-end', '--client', 'kimi'], {
      stdout: () => undefined,
      stderr: () => undefined,
      app: { env: { ...env, ...(mark === undefined ? {} : { WFK_PANEL_SESSION: mark }) }, homedir: tmp },
      readStdin: async () => turnEnd('session_mark'),
      hookClients: ['codex', 'kimi'],
      postJson: async (_url, body) => (bodies.push(body), null),
    });
  }
  assert.deepEqual(bodies.map((body) => (body as { panelProcess?: unknown }).panelProcess), [true, false, false]);
  const key = sessionKey('kimi', 'session_mark');
  kimi.idle = false;
  await hook('turn-end', turnEnd('session_mark'));
  assert.equal(app.channel.get(key)!.external, true, 'a hook without the mark');
  await hook('turn-end', turnEnd('session_mark'), { WFK_PANEL_SESSION: '1' });
  assert.equal(app.channel.get(key)!.external, false, 'a hook of a panel process');
});
