// M40 T006 in the service: the user's «стоп» and «пауза» are read where the service receives the
// message — the panel route (also while the agent is busy and the message is queued) and the
// UserPromptSubmit hook (a text typed in the provider's app). Real service, stub providers.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { WORD_TEXTS, createRunJournal } from '#autopilot';
import type { RunRecord } from '#autopilot';
import { createStubProvider } from '#provider-registry';
import { createApp, main } from '../src/index.ts';
import type { App } from '../src/index.ts';

let tmp = '';
let app: App;
let base = '';
let env: Record<string, string> = {};
let folder = '';
let projectId = '';
const journal = createRunJournal();
const KEY = 'claude:s-own';

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-run-words-app-'));
  folder = path.join(tmp, 'Projects', 'demo');
  await mkdir(folder, { recursive: true });
  app = await createApp({
    env: { WFK_DATA_DIR: path.join(tmp, 'data'), WFK_PORT: '0' },
    homedir: tmp,
    getInterfaces: () => ({}),
    providers: ['claude', 'codex'].map((id) => () => createStubProvider({ id, title: id, task: 'T000' })),
  });
  const bound = await app.start();
  base = `http://127.0.0.1:${bound.port}`;
  env = { WFK_DATA_DIR: path.join(tmp, 'data'), WFK_PORT: String(bound.port) };
  await app.projects.open(folder);
  projectId = (await app.projects.list())[0]!.id;
});

after(async () => {
  await app.stop();
  await rm(tmp, { recursive: true, force: true, maxRetries: 5 });
});

/** A started run of the owner session, written where the service reads its runs. */
const newRun = (): Promise<RunRecord> =>
  journal.create(folder, {
    projectId, owner: { key: KEY, client: 'claude', sessionId: 's-own' }, mode: 'after-start', review: false,
    request: { source: 'panel-start', quote: 'start', at: new Date().toISOString(), turnId: null, goal: 'g' },
    proposal: null, scopeId: 'auto', authority: null, phase: 'executing', pausedFrom: null, reason: null, nextAction: null,
  });
const phase = async (run: RunRecord) => (await journal.read(folder, run.runId))?.phase;

async function prompt(sessionId: string, text: string, client = 'claude'): Promise<string> {
  let out = '';
  const code = await main(['hook', 'prompt', '--client', client], {
    stdout: (chunk) => (out += chunk),
    stderr: () => undefined,
    app: { env, homedir: tmp },
    readStdin: async () => JSON.stringify({ session_id: sessionId, cwd: folder, hook_event_name: 'UserPromptSubmit', prompt: text }),
    hookClients: ['claude', 'codex'],
  });
  assert.equal(code, 0);
  return out;
}

async function panel(sessionKey: string, text: string): Promise<{ status: number; body: { queued?: string; sent?: boolean } }> {
  const reply = await fetch(`${base}/api/projects/${projectId}/sessions/${encodeURIComponent(sessionKey)}/message`, {
    method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
  });
  return { status: reply.status, body: (await reply.json()) as { queued?: string; sent?: boolean } };
}

test('a panel «Стоп» stops the run when the service receives it, while the agent is busy and the message is queued', async () => {
  // Both sessions are in a turn: the channel knows them and the agent of the owner is busy.
  await prompt('s-own', 'Сделай задачу');
  await prompt('s-other', 'Привет', 'codex');
  assert.equal(app.channel.get(KEY)?.state, 'working');
  const run = await newRun();
  // Another first word and a message to another session change nothing.
  assert.equal((await panel(KEY, 'а когда стоп?')).status, 200);
  assert.equal((await panel('codex:s-other', 'стоп')).status, 200);
  assert.equal(await phase(run), 'executing');
  const reply = await panel(KEY, 'Стоп');
  assert.equal(typeof reply.body.queued, 'string', 'the busy agent gets the message later');
  assert.equal(await phase(run), 'stopped', 'the run is stopped before the message is delivered');
  const queued = app.channel.queued(KEY).map((message) => message.text);
  assert.deepEqual(queued.slice(-2), [WORD_TEXTS.stop(run.runId), 'Стоп'], 'the context goes with the user\'s message');
  assert.equal((await journal.read(folder, run.runId))?.reason, 'user-stop');
});

test('a text typed in the provider\'s app is read in the UserPromptSubmit hook', async () => {
  await prompt('s-own', 'Понял'); // delivers what the first test left in the queue
  // Without a live run the word is an ordinary prompt.
  const plain = await prompt('s-own', 'пауза');
  assert.doesNotMatch(plain, /autopilot run/u);
  const run = await newRun();
  await prompt('s-other', 'стоп', 'codex');
  await prompt('s-own', 'Как идёт? Не стоп ли?');
  assert.equal(await phase(run), 'executing', 'not the owner; another first word');
  const out = await prompt('s-own', 'Пауза, посмотрю');
  assert.equal(await phase(run), 'paused');
  assert.ok(out.includes(WORD_TEXTS.pause(run.runId)), `the agent reads the context with the prompt: ${out}`);
  const stopped = await prompt('s-own', 'STOP!');
  assert.equal(await phase(run), 'stopped');
  assert.ok(stopped.includes(WORD_TEXTS.stop(run.runId)), stopped);
});
