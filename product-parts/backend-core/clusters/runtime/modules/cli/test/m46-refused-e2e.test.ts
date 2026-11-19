// M46 T003, end to end on a real service (createApp on loopback, the CLI hooks): the S_001 case —
// a panel message to a waiting session whose terminal is not free (the host state says dialog) —
// answers `{ sent: false, undelivered: { reason } }` at once, queues nothing and records no turn;
// once the terminal is free the same text is sent.
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

const REASON = 'Терминал Claude занят или не распознан';
let tmp = ''; let app: App; let env: Record<string, string> = {}; let folder = '';
const lines: string[] = [];
const terminal = { free: false, pasted: [] as string[] };

const refusing = (): Provider => ({
  ...createStubProvider({ id: 'paste', title: 'paste', task: 'T' }),
  marksPanelProcess: true,
  sendDirect: async (_project, sessionId, text) => {
    if (!terminal.free) return { refused: REASON };
    terminal.pasted.push(text);
    setTimeout(() => void hook('prompt', { session_id: sessionId, cwd: folder, hook_event_name: 'UserPromptSubmit', prompt: text }), 20);
    return true;
  },
});

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-m46-e2e-'));
  folder = path.join(tmp, 'Projects', 'S_001');
  await mkdir(folder, { recursive: true });
  app = await createApp({ env: { WFK_DATA_DIR: path.join(tmp, 'data'), WFK_PORT: '0' }, homedir: tmp, providers: [refusing], log: (line) => void lines.push(line) });
  const bound = await app.start();
  env = { WFK_DATA_DIR: path.join(tmp, 'data'), WFK_PORT: String(bound.port) };
  await app.projects.open(folder);
});
after(async () => { await app.stop(); await rm(tmp, { recursive: true, force: true }); });

async function hook(event: string, input: object): Promise<void> {
  await main(['hook', event, '--client', 'paste'], {
    stdout: () => undefined, stderr: () => undefined,
    app: { env: { ...env, WFK_PANEL_SESSION: '1' }, homedir: tmp },
    readStdin: async () => JSON.stringify(input), hookClients: ['paste'],
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

test('a terminal that is not free answers undelivered at once and queues nothing; a free one sends the same text', async () => {
  const key = sessionKey('paste', 's-001');
  await hook('stop', { session_id: 's-001', cwd: folder, hook_event_name: 'Stop', stop_hook_active: false });
  assert.equal(app.channel.get(key)!.state, 'waiting');
  const text = 'Сделай маленькую утилиту на Node.js';
  const started = Date.now();
  assert.deepEqual(await panelMessage(key, text), { sent: false, undelivered: { reason: REASON } });
  assert.ok(Date.now() - started < 4000, 'no wait for a hook');
  assert.deepEqual(app.channel.queued(key), [], 'no queue a waiting session would never take');
  assert.equal(app.channel.get(key)!.state, 'waiting', 'no turn was recorded');
  assert.ok(lines.some((line) => line === `channel: message to ${key} refused, not queued: ${REASON}`), lines.join('\n'));
  terminal.free = true;
  assert.deepEqual(await panelMessage(key, text), { sent: true }, '«Повторить»');
  assert.deepEqual(terminal.pasted, [text]);
});
