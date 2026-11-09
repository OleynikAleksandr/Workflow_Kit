// The cross review wired into the service: the state section and routes, the late decider of the
// autopilot and the toggle lock (spec M4 sections 7 and 10).
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import type { CrossReview, Review } from '#cross-review';
import type { WorkflowState } from '#kit-runner';
import { createStubProvider } from '#provider-registry';
import { createApp } from '../src/index.ts';
import type { App } from '../src/index.ts';
import { lateReviewDecider, toggleLock } from '../src/review-wiring.ts';
import { PLAN_ASKED, runSessionCommand } from '../src/session-command.ts';

let tmp = '';
let app: App;
let base = '';

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-review-'));
  app = await createApp({
    env: { WFK_DATA_DIR: path.join(tmp, 'data'), WFK_PORT: '0' },
    homedir: tmp,
    getInterfaces: () => ({}),
    providers: [() => createStubProvider({ id: 'claude', title: 'Claude', task: 'T000' })],
  });
  base = `http://127.0.0.1:${(await app.start()).port}`;
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
  assert.equal((await post({ summary: 'x', cwd: tmp })).status, 400, 'no session id');
  assert.equal((await post({ summary: 'x', cwd: tmp, client: 'claude', sessionId: 's1' })).status, 404, 'not a project folder');
  assert.equal((await fetch(`${base}/api/projects/p1/sessions/claude:s1/plan-decision`, { method: 'POST', headers: H, body: JSON.stringify({ choice: 'review' }) })).status, 404);
});
