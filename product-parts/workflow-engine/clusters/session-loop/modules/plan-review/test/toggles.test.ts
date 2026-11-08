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
  assert.deepEqual(toggles.section().projects['p'], { visible: true, sessions: {} });

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
