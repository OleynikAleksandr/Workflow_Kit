// M40 T005: `wfk decision <kind>` tells the service only the meaning of the user's decision; the
// command has no flag for the user's words. The routes are loopback commands of the calling
// session; a project whose Kit keeps the `agent` mode refuses them.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createStubProvider } from '#provider-registry';
import { COMMANDS, createApp } from '../src/index.ts';
import type { App } from '../src/index.ts';
import { DECISION_KINDS, DECISION_USAGE, decisionFlags, runDecisionCommand } from '../src/decision-command.ts';

let tmp = '';
let app: App;
let base = '';
let folder = '';

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-decision-command-'));
  app = await createApp({
    env: { WFK_DATA_DIR: path.join(tmp, 'data'), WFK_PORT: '0' },
    homedir: tmp,
    getInterfaces: () => ({}),
    providers: ['claude', 'codex'].map((id) => () => createStubProvider({ id, title: id, task: 'T000' })),
  });
  base = `http://127.0.0.1:${(await app.start()).port}`;
  folder = path.join(tmp, 'Projects', 'demo');
  await mkdir(folder, { recursive: true });
  await app.projects.open(folder);
});

after(async () => {
  await app.stop();
  await rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

test('the flags: a kind, the task of a delivery, the option of a choice; no flag carries the user words', () => {
  assert.ok(COMMANDS.includes('decision'));
  assert.deepEqual(decisionFlags(['accept']), { kind: 'accept' });
  assert.deepEqual(decisionFlags(['confirm-delivery', '--task', 'T010']), { kind: 'confirm-delivery', task: 'T010' });
  assert.deepEqual(decisionFlags(['choose', '--option=sequential', '--client', 'codex', '--session', 'x1']), { kind: 'choose', option: 'sequential', client: 'codex', sessionId: 'x1' });
  for (const args of [['accept', '--note', 'the user said yes'], ['accept', '--confirmed', 'yes'], ['accept', 'the user said yes'], ['--task'], [], ['accept', '--task']]) {
    assert.equal(decisionFlags(args), null, args.join(' '));
  }
});

test('wfk decision posts the kind for the calling session and prints what the service recorded', async () => {
  const calls: Array<{ url: string; body: unknown; timeout: number }> = [];
  const out: string[] = [];
  const err: string[] = [];
  const deps = (reply: { status: number; body: unknown }) => ({
    stdout: (t: string) => void out.push(t),
    stderr: (t: string) => void err.push(t),
    env: { WFK_DATA_DIR: path.join(tmp, 'data'), CLAUDE_CODE_SESSION_ID: 'c1' },
    cwd: tmp,
    homedir: tmp,
    request: async (url: string, body: unknown, timeout: number) => (calls.push({ url, body, timeout }), reply),
  });
  assert.equal(await runDecisionCommand(['accept'], deps({ status: 200, body: { kind: 'accept', decisionId: 'dec-0123456789ab', already: false, text: 'Workflow Kit: the user accepted the result.' } })), 0);
  assert.match(calls[0]!.url, /\/api\/sessions\/decision$/u);
  assert.deepEqual(calls[0]!.body, { kind: 'accept', cwd: tmp, projectDir: null, client: 'claude', sessionId: 'c1' });
  assert.ok(calls[0]!.timeout >= 60_000, 'a host operation runs the Kit of the project');
  assert.equal(out.join(''), 'decision: accept\nrecorded: yes\ndecisionId: dec-0123456789ab\nWorkflow Kit: the user accepted the result.\n');
  out.length = 0;
  assert.equal(await runDecisionCommand(['confirm-delivery', '--task', 'T010', '--client', 'codex', '--session', 'x1'], deps({ status: 200, body: { kind: 'confirm-delivery', decisionId: null, already: true, text: '' } })), 0);
  assert.deepEqual(calls[1]!.body, { kind: 'confirm-delivery', task: 'T010', cwd: tmp, projectDir: null, client: 'codex', sessionId: 'x1' });
  assert.match(out.join(''), /recorded: already\ndecisionId: none/u);
  assert.equal(await runDecisionCommand(['choose', '--option', 'orchestrated'], deps({ status: 200, body: {} })), 0);
  assert.deepEqual((calls[2]!.body as { kind: string; option: string }).option, 'orchestrated');
  // A refusal: the message, its code and what to do next.
  assert.equal(await runDecisionCommand(['close'], deps({ status: 409, body: { error: { code: 'decision-source-missing', message: 'Служба не видит сообщения пользователя', nextAction: 'Кнопка на карточке в панели' } } })), 1);
  assert.equal(err.join(''), 'wfk decision close: Служба не видит сообщения пользователя\ncode: decision-source-missing\nКнопка на карточке в панели\n');
  // Usage errors never reach the service.
  const sent = calls.length;
  for (const args of [['later'], ['choose'], ['accept', '--option', 'sequential'], ['accept', '--task', 'T1'], ['accept', '--client', 'codex'], ['accept', '--note', 'yes'], []]) {
    err.length = 0;
    assert.equal(await runDecisionCommand(args, deps({ status: 200, body: {} })), 64, args.join(' '));
    assert.equal(err.join(''), DECISION_USAGE);
  }
  assert.equal(calls.length, sent);
  assert.deepEqual([...DECISION_KINDS].sort(), ['accept', 'adopt-commits', 'approve-install', 'choose', 'close', 'confirm-delivery', 'unblock']);
});

test('the routes: a loopback command of the calling session; a project without host decisions refuses it', async () => {
  const post = async (url: string, body: object) => {
    const reply = await fetch(`${base}${url}`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: reply.status, body: (await reply.json()) as { error?: { code?: string; nextAction?: string } } };
  };
  const session = { cwd: folder, client: 'claude', sessionId: 's-decide' };
  assert.equal((await post('/api/sessions/decision', { ...session, kind: 'later' })).status, 400);
  // The project has no Kit with `decisions: host`: its decisions are Kit commands, as in Kit 2.3.
  const refused = await post('/api/sessions/decision', { ...session, kind: 'accept' });
  assert.deepEqual([refused.status, refused.body.error?.code], [409, 'decisions-agent-mode']);
  assert.ok(refused.body.error?.nextAction);
  const [project] = await app.projects.list();
  const card = await post(`/api/projects/${project!.id}/workflow/decision`, { kind: 'unblock', decision: { id: 'dec-0123456789ab', inputDigest: 'x' } });
  assert.deepEqual([card.status, card.body.error?.code], [409, 'decisions-agent-mode']);
  assert.equal((await post(`/api/projects/${project!.id}/workflow/decision`, { kind: 'publish' })).status, 400);
  assert.equal((await post('/api/projects/nope/workflow/decision', { kind: 'unblock' })).status, 404);
});
