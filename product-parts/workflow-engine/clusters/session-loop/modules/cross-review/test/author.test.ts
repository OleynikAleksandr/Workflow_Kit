import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { StopContext } from '#agent-channel';
import { CHOICE_WAITS_TURN, PLAN_REQUEST, createCrossReview } from '../src/index.ts';
import type { CrossReviewDeps } from '../src/index.ts';
import { isAuthor } from '../src/author.ts';

// Spec M31 3.2: only the session that wrote the proposal asks about or starts its review.
const PROPOSED = '2026-11-14T10:00:00.000Z';
const BEFORE = '2026-11-14T09:58:00.000Z';
const AFTER = '2026-11-14T10:05:00.000Z';
const OLD = 'claude:old-1';
const NEW = 'codex:new-1';

async function setup(over: Partial<CrossReviewDeps> = {}) {
  const folder = await mkdtemp(path.join(tmpdir(), 'wfk-author-'));
  const asked: string[] = [];
  const created: string[] = [];
  const turns = new Map<string, string | null>();
  const deps: CrossReviewDeps = {
    listProjects: async () => [{ id: 'p1', name: 'Склад', path: folder }],
    createSession: async (_p, provider) => {
      created.push(provider);
      return { localId: 't1', remoteId: null };
    },
    resolveReviewer: async () => null,
    enqueue: () => undefined,
    wake: () => undefined,
    toggle: () => true,
    proposal: async () => ({ generation: 1, scopeId: 's1', createdAt: PROPOSED }),
    turnStartedAt: (key) => turns.get(key) ?? null,
    sessionTitle: () => null,
    decided: () => false,
    askProposal: async (_p, key) => void asked.push(key),
    ...over,
  };
  const review = createCrossReview(deps);
  await review.load();
  const ctx = (key: string, turnStartedAt: string | null): StopContext => ({
    key, client: key.split(':')[0]!, sessionId: key.split(':')[1]!, projectId: 'p1', stopHookActive: false, lastAssistantMessage: null, turnStartedAt, woken: false,
  });
  return { review, asked, created, turns, ctx, cleanup: () => rm(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }) };
}

test('isAuthor: a turn begun no later than the proposal is the author; unknown times count as author', () => {
  assert.equal(isAuthor(BEFORE, PROPOSED), true);
  assert.equal(isAuthor(PROPOSED, PROPOSED), true);
  assert.equal(isAuthor(AFTER, PROPOSED), false);
  assert.equal(isAuthor(null, PROPOSED), true);
  assert.equal(isAuthor(undefined, PROPOSED), true);
  assert.equal(isAuthor(AFTER, null), true);
  assert.equal(isAuthor('not a date', PROPOSED), true);
});

test('a session whose turn began after the proposal is not asked about the review', async () => {
  const t = await setup();
  assert.equal(await t.review.decide(t.ctx(NEW, AFTER), true), null);
  assert.deepEqual(t.asked, []);
  // The author is asked as before.
  const held = await t.review.decide(t.ctx(OLD, BEFORE), true);
  assert.equal(held?.kind === 'hold' && held.reason, 'waiting-for-plan-decision');
  assert.deepEqual(t.asked, [OLD]);
  await t.cleanup();
});

test('a non-author with the review on starts no second review; the author and unknown times still do', async () => {
  const t = await setup({ decided: () => true });
  assert.equal(await t.review.decide(t.ctx(NEW, AFTER), true), null);
  assert.deepEqual(t.created, []);
  assert.deepEqual(await t.review.decide(t.ctx(OLD, null), true), { kind: 'continue', text: PLAN_REQUEST });
  await t.cleanup();
});

test('a working non-author does not block the mode choice; a working author does', async () => {
  const t = await setup({ decided: () => true });
  t.turns.set(NEW, AFTER);
  assert.equal(await t.review.choiceBlocked('p1', [NEW]), null);
  t.turns.set(OLD, BEFORE);
  assert.equal(await t.review.choiceBlocked('p1', [NEW, OLD]), CHOICE_WAITS_TURN);
  await t.cleanup();
});
