// The cross review wired into the service: the state section and routes, the late decider of the
// autopilot and the toggle lock (spec M4 sections 7 and 10).
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import type { CrossReview, Review } from '#cross-review';
import type { WorkflowState } from '#kit-runner';
import { createStubProvider } from '#provider-registry';
import { createApp } from '../src/index.ts';
import type { App } from '../src/index.ts';
import { deliverToSession, lateReviewDecider, toggleLock } from '../src/review-wiring.ts';
import { PLAN_ASKED, SESSION_USAGE, callingSession, runSessionCommand, sessionFlags } from '../src/session-command.ts';

let tmp = '';
let app: App;
let base = '';
let folder = '';

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-review-'));
  app = await createApp({
    env: { WFK_DATA_DIR: path.join(tmp, 'data'), WFK_PORT: '0' },
    homedir: tmp,
    getInterfaces: () => ({}),
    providers: ['claude', 'codex', 'kimi'].map((id) => () => createStubProvider({ id, title: id, task: 'T000' })),
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

test('the service shows reviews in /api/state and answers for a session without a review', async () => {
  const H = { Origin: base, 'Content-Type': 'application/json' };
  const state = (await (await fetch(`${base}/api/state`, { headers: H })).json()) as Record<string, unknown>;
  assert.deepEqual(state['reviews'], { projects: {} });
  assert.ok(state['review'], 'the toggle section stays');
  assert.equal((await fetch(`${base}/api/projects/p1/reviews/claude:s1`, { headers: H })).status, 404);
  assert.equal((await fetch(`${base}/api/projects/p1/reviews/claude:s1/cancel`, { method: 'POST', headers: H })).status, 409);
});

test('the autopilot asks no review before it is attached', async () => {
  const late = lateReviewDecider();
  const context = { key: 'claude:s', client: 'claude' as const, sessionId: 's', projectId: 'p', stopHookActive: false, lastAssistantMessage: null, woken: false };
  assert.equal(await late.decide(context, true), null);
  assert.equal(late.isReviewer('codex:t'), false);
  late.attach({ decide: async () => ({ kind: 'release' }), isReviewer: () => true } as unknown as CrossReview);
  assert.deepEqual(await late.decide(context, true), { kind: 'release' });
  assert.equal(late.isReviewer('codex:t'), true);
});

test('the toggle is locked while a review runs and for the plan it reviewed, not for a later plan', () => {
  let review: Partial<Review> | null = { status: 'reviewing', scopeId: 's1' };
  let open: string | null = 's1';
  const cross = { get: () => review } as unknown as CrossReview;
  const workflow = { get: () => ({ proposal: open ? { scopeId: open } : null }) } as unknown as WorkflowState;
  assert.match(toggleLock(cross, workflow, 'p', 'k')!, /идёт/);
  review = { status: 'agreed', scopeId: 's1' };
  assert.match(toggleLock(cross, workflow, 'p', 'k')!, /уже прошёл/);
  open = 's2';
  assert.equal(toggleLock(cross, workflow, 'p', 'k'), null);
  open = null;
  assert.equal(toggleLock(cross, workflow, 'p', 'k'), null);
  review = null;
  assert.equal(toggleLock(cross, workflow, 'p', 'k'), null);
});

test('wfk session plan posts the question of the calling session; the route checks the session and the folder (M4 12)', async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const out: string[] = [];
  const code = await runSessionCommand(['plan', 'Склад:', 'две', 'команды'], {
    stdout: (t) => void out.push(t),
    stderr: (t) => void out.push(t),
    env: { WFK_DATA_DIR: path.join(tmp, 'data'), CODEX_THREAD_ID: 't-1' },
    cwd: '/work/sklad',
    homedir: tmp,
    request: async (url, body) => (calls.push({ url, body }), { status: 200, body: {} }),
  });
  assert.equal(code, 0);
  assert.match(calls[0]!.url, /\/api\/sessions\/plan$/);
  assert.deepEqual(calls[0]!.body, { summary: 'Склад: две команды', cwd: '/work/sklad', projectDir: null, client: 'codex', sessionId: 't-1' });
  assert.equal(out.join(''), PLAN_ASKED);
  const H = { Origin: base, 'Content-Type': 'application/json' };
  const post = (body: unknown) => fetch(`${base}/api/sessions/plan`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  assert.equal((await post({ summary: 'x', cwd: tmp })).status, 404, 'not a project folder');
  assert.equal((await post({ summary: 'x', cwd: tmp, client: 'claude', sessionId: 's1' })).status, 404, 'not a project folder');
  assert.equal((await fetch(`${base}/api/projects/p1/sessions/claude:s1/plan-decision`, { method: 'POST', headers: H, body: JSON.stringify({ choice: 'review' }) })).status, 404);
});

test('/api/sessions/plan takes any registered client; without a session it takes the only running turn (M8 5)', async () => {
  const H = { Origin: base, 'Content-Type': 'application/json' };
  const post = async (body: object) => {
    const reply = await fetch(`${base}/api/sessions/plan`, { method: 'POST', headers: H, body: JSON.stringify({ summary: 'Склад', cwd: folder, ...body }) });
    return { status: reply.status, body: (await reply.json()) as { key?: string; error?: { code?: string; message?: string; candidates?: unknown[] } } };
  };
  const named = await post({ client: 'kimi', sessionId: 'session_k1' });
  assert.equal(named.status, 200, JSON.stringify(named.body));
  assert.equal(named.body.key, 'kimi:session_k1');
  const unknown = await post({ client: 'gemini', sessionId: 's1' });
  assert.deepEqual([unknown.status, unknown.body.error?.code], [400, 'bad-session']);
  assert.deepEqual([(await post({ client: 'kimi' })).status, (await post({ sessionId: 's1' })).status], [400, 400], 'the pair is given whole');

  const none = await post({});
  assert.deepEqual([none.status, none.body.error?.code], [409, 'session-ambiguous']);
  assert.ok(Array.isArray(none.body.error?.candidates));
  assert.match(none.body.error!.message!, /--client <id> --session <id>/);

  const turn = (client: string, sessionId: string) =>
    app.channel.prompt({ client, dialect: 'claude', sessionId, turnId: null, cwd: folder, projectDir: null, transcriptPath: null, stopHookActive: false, lastAssistantMessage: null, prompt: 'задача', sessionTitle: null });
  await turn('codex', 't-run');
  const one = await post({});
  assert.deepEqual([one.status, one.body.key], [200, 'codex:t-run']);
  await turn('kimi', 'session_k2');
  const two = await post({});
  assert.deepEqual([two.status, two.body.error?.code], [409, 'session-ambiguous']);
  assert.deepEqual(
    (two.body.error!.candidates as Array<{ client: string; session: string }>).map((c) => `${c.client}:${c.session}`).sort(),
    ['codex:t-run', 'kimi:session_k2'],
  );
});

test('wfk session takes --client and --session before the environment and prints the candidates of a refusal', async () => {
  assert.deepEqual(sessionFlags(['Склад:', '--client', 'kimi', 'остатки', '--session=session_k1']), { text: 'Склад: остатки', client: 'kimi', sessionId: 'session_k1' });
  assert.equal(sessionFlags(['Склад', '--session']), null);
  assert.deepEqual(callingSession({ CLAUDE_CODE_SESSION_ID: 'c1' }), { client: 'claude', sessionId: 'c1' });
  assert.deepEqual(callingSession({ CLAUDE_CODE_SESSION_ID: 'c1', CODEX_THREAD_ID: 't1' }), { client: 'codex', sessionId: 't1' });
  assert.deepEqual(callingSession({}), {});

  const calls: unknown[] = [];
  let err = '';
  const run = (args: string[], reply: { status: number; body: unknown }) =>
    runSessionCommand(args, {
      stdout: () => undefined,
      stderr: (t) => (err += t),
      env: { WFK_DATA_DIR: path.join(tmp, 'data'), CODEX_THREAD_ID: 't-1' },
      cwd: '/work/sklad',
      homedir: tmp,
      request: async (_url, body) => (calls.push(body), reply),
    });
  assert.equal(await run(['title', 'Склад', '--client', 'kimi', '--session', 'session_k1'], { status: 200, body: {} }), 0);
  assert.deepEqual(calls[0], { title: 'Склад', cwd: '/work/sklad', projectDir: null, client: 'kimi', sessionId: 'session_k1' });
  assert.equal(await run(['title', 'Склад', '--client', 'kimi'], { status: 200, body: {} }), 64, 'one flag of the pair');
  assert.equal(err, SESSION_USAGE);
  assert.equal(calls.length, 1);

  err = '';
  const refusal = {
    status: 409,
    body: {
      error: {
        code: 'session-ambiguous',
        message: 'В проекте идут ходы нескольких сессий (2): повторите команду с --client <id> --session <id>',
        candidates: [
          { client: 'codex', session: 't-run', state: 'working', name: 'Склад' },
          { client: 'kimi', session: 'session_k2', state: 'working', name: '' },
        ],
      },
    },
  };
  assert.equal(await run(['plan', 'Склад'], refusal), 1);
  assert.match(err, /нескольких сессий/);
  assert.match(err, /--client codex --session t-run {2}\(working, «Склад»\)\n/);
  assert.match(err, /--client kimi --session session_k2 {2}\(working\)\n/);
});

test('a brief is queued and a reviewer whose provider can wake it is woken at once; the others are only queued (M4 13.9)', async () => {
  const queued: Array<[string, string, string | undefined, string | undefined]> = [];
  const woken: string[] = [];
  const deps = {
    channel: { enqueue: (key: string, text: string, source?: string, projectId?: string) => (queued.push([key, text, source, projectId]), {}) as never },
    providers: { get: (id: string) => (id === 'claude' ? { wakeSession: async (_p: unknown, sid: string) => (woken.push(sid), true) } : id === 'codex' ? {} : undefined) } as never,
    project: async () => ({ id: 'p1' }) as never,
  };
  assert.equal(await deliverToSession(deps, 'claude:hook-9', 'Задание', 'p1'), true);
  assert.deepEqual(queued[0], ['claude:hook-9', 'Задание', 'review', 'p1']);
  assert.deepEqual(woken, ['hook-9']);
  assert.equal(await deliverToSession(deps, 'codex:t1', 'Задание', 'p1'), false);
  assert.equal(queued.length, 2);
  assert.deepEqual(woken, ['hook-9']);
});
