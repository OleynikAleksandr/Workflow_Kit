// M39 T005 in the service: the autopiloting settings routes and state section, and the direct
// instruction of `wfk session plan --authorized` checked against the words the user wrote.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createStubProvider } from '#provider-registry';
import { createApp } from '../src/index.ts';
import type { App } from '../src/index.ts';
import { SESSION_USAGE, preparedText, runSessionCommand, sessionFlags } from '../src/session-command.ts';
import { locateSession, ownerUnreachable, proposalDigest, reviewFact } from '../src/autopiloting-links.ts';
import { RUN_USAGE, inputFlag } from '../src/session-run-command.ts';
import { writeFile } from 'node:fs/promises';
import type { Review } from '#cross-review';
import type { KitRunner } from '#kit-runner';

let tmp = '';
let app: App;
let base = '';
let folder = '';
const H = () => ({ Origin: base, 'Content-Type': 'application/json' });

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-autopiloting-app-'));
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
  await rm(tmp, { recursive: true, force: true });
});

test('Settings: off by default, saved in the configuration folder with a revision, stale writes refused', async () => {
  const get = async () => (await (await fetch(`${base}/api/settings/autopiloting`, { headers: H() })).json()) as Record<string, unknown>;
  assert.deepEqual(await get(), { version: 1, revision: 0, mode: 'off', review: false, error: null });
  const post = (body: unknown) => fetch(`${base}/api/settings/autopiloting`, { method: 'POST', headers: H(), body: JSON.stringify(body) });
  const saved = await post({ expectedRevision: 0, mode: 'full', review: true });
  assert.equal(saved.status, 200);
  const file = JSON.parse(await readFile(path.join(app.dirs.configDir, 'autopiloting.json'), 'utf8')) as Record<string, unknown>;
  assert.deepEqual(file, { version: 1, revision: 1, mode: 'full', review: true });
  const stale = await post({ expectedRevision: 0, mode: 'off', review: false });
  assert.equal(stale.status, 409);
  const body = (await stale.json()) as { error: { code: string; current: unknown } };
  assert.equal(body.error.code, 'settings-stale');
  assert.deepEqual(body.error.current, file);
  assert.equal((await post({ expectedRevision: 1, mode: 'sometimes', review: false })).status, 400);
  const state = (await (await fetch(`${base}/api/state`, { headers: H() })).json()) as { autopiloting: { settings: unknown } };
  assert.deepEqual(state.autopiloting.settings, file);
});

test('--authorized: refused without the user words, refused for other words, accepted for the words the user typed', async () => {
  const post = async (authorized: string) => {
    const reply = await fetch(`${base}/api/sessions/plan`, { method: 'POST', headers: H(), body: JSON.stringify({ summary: 'Склад', cwd: folder, client: 'claude', sessionId: 's-auth', authorized }) });
    return { status: reply.status, body: (await reply.json()) as Record<string, unknown> & { error?: { code?: string; nextAction?: string } } };
  };
  const missing = await post('да, составляй спецификацию');
  assert.deepEqual([missing.status, missing.body.error?.code], [409, 'authorization-source-missing']);
  assert.match(missing.body.error?.nextAction ?? '', /wfk session plan/u);
  // A message the service queues (a review, a reminder, a Kit message) is no user's word.
  app.channel.enqueue('claude:s-auth', 'Да, составляй спецификацию и план', 'review');
  assert.equal((await post('составляй спецификацию')).body.error?.code, 'authorization-source-missing');
  await app.channel.prompt({ client: 'claude', dialect: 'claude', sessionId: 's-auth', turnId: 'u-1', cwd: folder, projectDir: null, transcriptPath: null, stopHookActive: false, lastAssistantMessage: null, prompt: 'Да, составляй спецификацию и план', sessionTitle: null, panelProcess: false });
  assert.equal((await post('и сразу публикуй')).body.error?.code, 'authorization-quote-mismatch');
  // The demo project has no Kit: the preparation is allowed, the autopilot asks to update Kit.
  const ok = await post('составляй спецификацию и план');
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.deepEqual([ok.body['action'], ok.body['runId'], ok.body['policy']], ['prepare', null, 'kit-update-required']);
  assert.equal(ok.body['key'], 'claude:s-auth');
});

test('wfk session plan --authorized sends the words and prints the run; title refuses the flag', async () => {
  assert.deepEqual(sessionFlags(['Склад', '--authorized', 'да, делай']), { text: 'Склад', authorized: 'да, делай' });
  const out: string[] = [];
  const err: string[] = [];
  const calls: unknown[] = [];
  const deps = (reply: { status: number; body: unknown }) => ({
    stdout: (t: string) => void out.push(t),
    stderr: (t: string) => void err.push(t),
    env: { WFK_DATA_DIR: path.join(tmp, 'data'), CLAUDE_CODE_SESSION_ID: 'c1' },
    cwd: '/work/sklad',
    homedir: tmp,
    request: async (_url: string, body: unknown) => (calls.push(body), reply),
  });
  const body = { action: 'prepare', runId: 'run-abcdef', policy: 'full', instruction: 'Full autopilot: …' };
  assert.equal(await runSessionCommand(['plan', 'Склад', '--authorized=да, делай'], deps({ status: 200, body })), 0);
  assert.deepEqual(calls[0], { summary: 'Склад', cwd: '/work/sklad', projectDir: null, client: 'claude', sessionId: 'c1', authorized: 'да, делай' });
  assert.equal(out.join(''), preparedText(body));
  assert.match(out.join(''), /^action: prepare\nrunId: run-abcdef\npolicy: full\n/u);
  const refused = { status: 409, body: { error: { code: 'authorization-source-missing', message: 'Служба не получила текст', nextAction: 'Покажите вопрос о плане' } } };
  assert.equal(await runSessionCommand(['plan', 'Склад', '--authorized', 'да'], deps(refused)), 1);
  assert.match(err.join(''), /Служба не получила текст\nПокажите вопрос о плане\n/u);
  err.length = 0;
  assert.equal(await runSessionCommand(['title', 'Склад', '--authorized', 'да'], deps({ status: 200, body: {} })), 64);
  assert.equal(err.join(''), SESSION_USAGE);
});

test('T006 links: the proposal version for the review and the review fact of the run owner', async () => {
  const projects = { get: async (id: string) => (id === 'p1' ? ({ id, path: '/p' } as never) : undefined) };
  const kit = (result: unknown, ok = true) => ({ installed: () => true, proposalDigest: async () => (ok ? { ok: true, result } : { ok: false, code: 'USAGE' }) }) as unknown as Pick<KitRunner, 'installed' | 'proposalDigest'>;
  const version = { scopeId: 's', generation: 2, proposalDigest: 'd'.repeat(64), documentDigests: { 'docs/b.md': 'x', 'docs/a.md': null } };
  assert.deepEqual(await proposalDigest(kit(version), projects, 'p1'), { scopeId: 's', generation: 2, digest: 'd'.repeat(64), documents: ['docs/a.md', 'docs/b.md'] });
  assert.equal(await proposalDigest(kit(null), projects, 'p1'), null, 'no open proposal');
  assert.equal(await proposalDigest(kit(version, false), projects, 'p1'), null, 'an old Kit without --digest');
  assert.equal(await proposalDigest(kit(version), projects, 'p2'), null);
  const review = { mainKey: 'claude:a', status: 'agreed', scopeId: 's', reason: null, reviewedProposal: { scopeId: 's', generation: 2, digest: 'd' } } as unknown as Review;
  assert.deepEqual(reviewFact(review, 'claude:a'), { status: 'agreed', scopeId: 's', reason: null, reviewedProposal: { scopeId: 's', generation: 2, digest: 'd' } });
  assert.equal(reviewFact(review, 'codex:reviewer'), null, 'the reviewer\'s side is not its own proposal');
  assert.equal(reviewFact({ ...review, reviewedProposal: undefined } as Review, 'claude:a')?.reviewedProposal, null, 'an older review file');
});

test('T007: wfk session progress sends the JSON as a wait; wfk session run pause|stop; usage errors', async () => {
  assert.deepEqual(inputFlag(['--input', 'p.json', '--client', 'claude']), { input: 'p.json', rest: ['--client', 'claude'] });
  assert.equal(inputFlag(['--input']), null);
  const file = path.join(tmp, 'progress.json');
  await writeFile(file, JSON.stringify({ runId: 'run-abcdef', actionId: 'ci:x' }));
  const calls: Array<{ url: string; body: unknown }> = [];
  const out: string[] = [];
  const err: string[] = [];
  const deps = (reply: { status: number; body: unknown }) => ({
    stdout: (t: string) => void out.push(t),
    stderr: (t: string) => void err.push(t),
    env: { WFK_DATA_DIR: path.join(tmp, 'data'), CLAUDE_CODE_SESSION_ID: 'c1' },
    cwd: tmp,
    homedir: tmp,
    request: async (url: string, body: unknown) => (calls.push({ url, body }), reply),
  });
  assert.equal(await runSessionCommand(['progress', '--input', 'progress.json'], deps({ status: 200, body: { runId: 'run-abcdef', note: 'A wait is no CI result' } })), 0);
  assert.match(calls[0]!.url, /\/api\/sessions\/progress$/u);
  assert.deepEqual(calls[0]!.body, { progress: { runId: 'run-abcdef', actionId: 'ci:x' }, cwd: tmp, projectDir: null, client: 'claude', sessionId: 'c1' });
  assert.match(out.join(''), /recorded: wait for CI \(run run-abcdef\)/u);
  assert.equal(await runSessionCommand(['run', 'stop'], deps({ status: 200, body: { runId: 'run-abcdef', phase: 'stopped' } })), 0);
  assert.deepEqual((calls[1]!.body as { action: string }).action, 'stop');
  for (const args of [['progress'], ['progress', '--input', 'progress.json', 'extra'], ['run', 'later'], ['run', 'pause', '--input', 'x.json']]) {
    err.length = 0;
    assert.equal(await runSessionCommand(args, deps({ status: 200, body: {} })), 64, args.join(' '));
    assert.equal(err.join(''), RUN_USAGE);
  }
  err.length = 0;
  assert.equal(await runSessionCommand(['run', 'pause'], deps({ status: 403, body: { error: { code: 'not-owner', message: 'Управляет запуском только сессия-владелец' } } })), 1);
  assert.match(err.join(''), /только сессия-владелец/u);
});

test('T007: the service routes of the agent are loopback commands of the calling session', async () => {
  const post = async (url: string, body: object) => {
    const reply = await fetch(`${base}${url}`, { method: 'POST', headers: H(), body: JSON.stringify({ cwd: folder, client: 'claude', sessionId: 's-auth', ...body }) });
    return { status: reply.status, body: (await reply.json()) as { error?: { code?: string } } };
  };
  assert.deepEqual([(await post('/api/sessions/run', { action: 'later' })).status], [400]);
  assert.equal((await post('/api/sessions/run', { action: 'pause' })).body.error?.code, 'run-not-found');
  assert.equal((await post('/api/sessions/progress', { progress: {} })).body.error?.code, 'bad-request');
  const control = await fetch(`${base}/api/projects/nope/autopiloting/pause`, { method: 'POST', headers: H(), body: JSON.stringify({ runId: 'run-abcdef', expectedRevision: 1 }) });
  assert.equal(control.status, 404);
});

test('T007 links: the calling session of a command and an unreachable owner', async () => {
  const deps = { resolveFolderProject: async (f: string) => (f === '/p' ? { id: 'p1' } : undefined), isClient: (id: string) => id === 'claude', running: async () => 'codex:run' };
  assert.deepEqual(await locateSession({ cwd: '/p', client: 'claude', sessionId: 's1' }, deps), { projectId: 'p1', key: 'claude:s1' });
  assert.deepEqual(await locateSession({ cwd: '/p' }, deps), { projectId: 'p1', key: 'codex:run' });
  await assert.rejects(locateSession({ cwd: '/x' }, deps), { code: 'project-not-found' });
  assert.equal(ownerUnreachable(undefined, false), 'провайдер сессии не подключён');
  assert.equal(ownerUnreachable({ wakeSession: async () => true } as never, true), 'сессия в архиве или убрана из списка');
  assert.match(ownerUnreachable({} as never, false) ?? '', /не умеет будить/u);
  assert.equal(ownerUnreachable({ sendMessage: async () => true } as never, false), null);
});
