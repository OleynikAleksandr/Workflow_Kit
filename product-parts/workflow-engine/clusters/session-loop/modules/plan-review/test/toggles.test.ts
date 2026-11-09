import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { ReviewToggleError, SESSIONS_DIR, createReviewToggles, sessionFileName } from '../src/index.ts';

let tmp = '';
let folder = '';
let chosen = false;
const options = () => ({ listProjects: async () => [{ id: 'p', path: folder }], pathChosen: () => chosen });

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-review-'));
  folder = path.join(tmp, 'demo');
  await mkdir(folder);
});
after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

test('off by default; on and off are stored per session and survive a restart', async () => {
  const toggles = createReviewToggles(options());
  await toggles.load();
  assert.equal(toggles.get('p', 'claude:s1'), false);
  assert.deepEqual(toggles.section().projects['p'], { visible: true, sessions: {}, questions: {} });

  await toggles.set('p', 'claude:s1', true);
  await toggles.set('p', 'codex:t-2', true);
  await toggles.set('p', 'codex:t-2', false);
  assert.deepEqual(JSON.parse(await readFile(path.join(folder, SESSIONS_DIR, 'claude.s1.json'), 'utf8')), { review: true });

  const restarted = createReviewToggles(options());
  await restarted.load();
  assert.equal(restarted.get('p', 'claude:s1'), true);
  assert.equal(restarted.get('p', 'codex:t-2'), false);
  assert.deepEqual(restarted.section().projects['p']!.sessions, { 'claude:s1': true, 'codex:t-2': false });
});

test('after the path is chosen the toggle is hidden and refuses changes', async () => {
  const toggles = createReviewToggles(options());
  await toggles.load();
  chosen = true;
  try {
    assert.equal(toggles.section().projects['p']!.visible, false);
    await assert.rejects(toggles.set('p', 'claude:s1', false), (error: unknown) => error instanceof ReviewToggleError && error.code === 'review-closed');
  } finally {
    chosen = false;
  }
});

test('invalid session keys and unknown projects are refused', async () => {
  const toggles = createReviewToggles(options());
  assert.equal(sessionFileName('claude:../x'), null);
  await assert.rejects(toggles.set('p', 'claude:../x', true), { code: 'bad-session' });
  await assert.rejects(toggles.set('nope', 'claude:s1', true), { code: 'project-not-found' });
  // The key takes the id of any provider of the registry, not a fixed pair.
  assert.equal(sessionFileName('kimi:session_k1'), 'kimi.session_k1.json');
  assert.equal(sessionFileName('Kimi:x'), null);
  assert.equal((await toggles.set('p', 'kimi:session_k1', true)).sessions['kimi:session_k1'], true);
});

test('a change reaches the cross review; a locked toggle refuses (M4 section 10)', async () => {
  const changes: Array<[string, boolean]> = [];
  let lock: string | null = null;
  const toggles = createReviewToggles({ ...options(), locked: () => lock, onChange: async (_p, key, on) => void changes.push([key, on]) });
  await toggles.load();
  await toggles.set('p', 'claude:s9', true);
  assert.deepEqual(changes, [['claude:s9', true]]);
  lock = 'Ревью плана этой сессии идёт';
  await assert.rejects(toggles.set('p', 'claude:s9', false), (error: unknown) => error instanceof ReviewToggleError && error.code === 'review-locked' && error.status === 409);
  assert.equal(toggles.get('p', 'claude:s9'), true);
});

test('the plan question: asked, kept over a restart, answered with the decision and the callback (M4 12)', async () => {
  const answers: Array<[string, string, string]> = [];
  let clock = 0;
  const make = () => {
    const made = createReviewToggles({ ...options(), now: () => new Date(Date.UTC(2026, 10, 8, 12, 0, clock++)) });
    made.onAnswer((_p, key, choice, q) => void answers.push([key, choice, q.kind]));
    return made;
  };
  const toggles = make();
  await toggles.load();
  assert.equal(toggles.decided('p', 'claude:q1'), false);
  await toggles.ask('p', 'claude:q1', 'agent', '  Склад: две команды  ');
  assert.equal(toggles.question('p', 'claude:q1')!.summary, 'Склад: две команды');
  assert.ok(toggles.asking('p'));
  const restarted = make();
  await restarted.load();
  assert.equal(restarted.question('p', 'claude:q1')!.kind, 'agent');
  await assert.rejects(restarted.answer('p', 'claude:q1', 'maybe' as never), (e: ReviewToggleError) => e.code === 'bad-choice');
  const after = await restarted.answer('p', 'claude:q1', 'review');
  assert.deepEqual(answers, [['claude:q1', 'review', 'agent']]);
  assert.equal(after.questions['claude:q1'], undefined);
  assert.equal(restarted.get('p', 'claude:q1'), true);
  assert.ok(restarted.decided('p', 'claude:q1'));
  const stored = JSON.parse(await readFile(path.join(folder, SESSIONS_DIR, 'claude.q1.json'), 'utf8')) as Record<string, unknown>;
  assert.equal(stored['review'], true);
  assert.equal(stored['question'], undefined);
  await assert.rejects(restarted.answer('p', 'claude:q1', 'plan'), (e: ReviewToggleError) => e.code === 'no-question' && e.status === 409);
});

test('talk records no decision; a proposal question refuses talk', async () => {
  const toggles = createReviewToggles(options());
  await toggles.load();
  await toggles.ask('p', 'codex:q2', 'agent', 'обсудить алгоритм');
  await toggles.answer('p', 'codex:q2', 'talk');
  assert.equal(toggles.decided('p', 'codex:q2'), false);
  await toggles.ask('p', 'codex:q2', 'proposal', '');
  await assert.rejects(toggles.answer('p', 'codex:q2', 'talk'), (e: ReviewToggleError) => e.code === 'bad-choice');
  await toggles.answer('p', 'codex:q2', 'plan');
  assert.equal(toggles.decided('p', 'codex:q2'), true);
  assert.equal(toggles.get('p', 'codex:q2'), false);
});
