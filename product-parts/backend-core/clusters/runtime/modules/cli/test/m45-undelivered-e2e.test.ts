// M45 T004, end to end on a real service (createApp on loopback, the CLI hooks): the 19.11.2026
// case — a panel message pasted into a waiting session that begins no turn (the terminal of
// Claude held a menu) — answers `{ sent: false, undelivered }` after the confirmation time and
// queues nothing; the same paste followed by its UserPromptSubmit hook answers `{ sent: true }`.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { UNDELIVERED_REASON, sessionKey } from '#agent-channel';
import { createStubProvider } from '#provider-registry';
import type { Provider } from '#provider-registry';
import { createApp, main } from '../src/index.ts';
import { DIRECT_CONFIRM_MS } from '../src/direct-message.ts';
import type { App } from '../src/index.ts';

let tmp = '';
let app: App;
let env: Record<string, string> = {};
let folder = '';
const lines: string[] = [];
/** Whether the fake terminal begins a turn with a paste (sends its prompt hook), and what it got. */
const terminal = { turns: true, pasted: [] as string[] };

const pasting = (): Provider => ({
  ...createStubProvider({ id: 'paste', title: 'paste', task: 'T' }),
  marksPanelProcess: true,
  sendDirect: async (_project, sessionId, text) => {
    terminal.pasted.push(text);
    if (terminal.turns) setTimeout(() => void hook('prompt', { session_id: sessionId, cwd: folder, hook_event_name: 'UserPromptSubmit', prompt: text }), 20);
    return true;
  },
});

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-m45-e2e-'));
  folder = path.join(tmp, 'Projects', 'demo');
  await mkdir(folder, { recursive: true });
  app = await createApp({ env: { WFK_DATA_DIR: path.join(tmp, 'data'), WFK_PORT: '0' }, homedir: tmp, providers: [pasting], log: (line) => void lines.push(line) });
  const bound = await app.start();
  env = { WFK_DATA_DIR: path.join(tmp, 'data'), WFK_PORT: String(bound.port) };
  await app.projects.open(folder);
});
after(async () => {
  await app.stop();
  await rm(tmp, { recursive: true, force: true });
});

async function hook(event: string, input: object): Promise<void> {
  await main(['hook', event, '--client', 'paste'], {
    stdout: () => undefined, stderr: () => undefined,
    app: { env: { ...env, WFK_PANEL_SESSION: '1' }, homedir: tmp },
    readStdin: async () => JSON.stringify(input),
    hookClients: ['paste'],
  });
}

async function panelMessage(key: string, text: string): Promise<Record<string, unknown>> {
  const project = (await app.projects.list())[0]!;
  const response = await fetch(`http://127.0.0.1:${env['WFK_PORT']}/api/projects/${project.id}/sessions/${encodeURIComponent(key)}/message`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${env['WFK_PORT']}` }, body: JSON.stringify({ text }),
  });
  assert.equal(response.status, 200);
  return (await response.json()) as Record<string, unknown>;
}

test('a paste that begins a turn is sent; a paste without its prompt hook is undelivered after the confirmation time and not queued', { timeout: DIRECT_CONFIRM_MS + 15_000 }, async () => {
  const key = sessionKey('paste', 'p-1');
  const stop = { session_id: 'p-1', cwd: folder, hook_event_name: 'Stop', stop_hook_active: false };
  await hook('stop', stop);
  assert.equal(app.channel.get(key)!.state, 'waiting');

  terminal.turns = true;
  assert.deepEqual(await panelMessage(key, 'Готов, пожалуйста, мне короткое задание'), { sent: true });
  assert.equal(app.channel.get(key)!.state, 'working');
  await hook('stop', stop);

  terminal.turns = false;
  const started = Date.now();
  const answer = await panelMessage(key, 'Составь спецификацию и план');
  assert.deepEqual(answer, { sent: false, undelivered: { reason: UNDELIVERED_REASON } });
  assert.ok(Date.now() - started >= DIRECT_CONFIRM_MS - 100, 'the route waited for the hook');
  assert.deepEqual(app.channel.queued(key), [], 'nothing queued: the text may still be in the terminal');
  assert.equal(app.channel.get(key)!.state, 'waiting', 'no turn was recorded');
  assert.deepEqual(terminal.pasted, ['Готов, пожалуйста, мне короткое задание', 'Составь спецификацию и план']);
  assert.ok(lines.some((line) => line.includes(`channel: message to ${key} was pasted, but no prompt hook took it`)), lines.join('\n'));
});
