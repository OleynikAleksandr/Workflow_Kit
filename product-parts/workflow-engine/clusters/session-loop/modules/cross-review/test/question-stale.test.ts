// M36: a plan question the plan has already answered is closed instead of holding the session.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { StopContext } from '#agent-channel';
import { CHOICE_WAITS_QUESTION, QUESTION_REMINDER, createCrossReview } from '../src/index.ts';
import type { CrossReviewDeps, OpenQuestion } from '../src/index.ts';
import { staleReason } from '../src/question-stale.ts';

const MAIN = 'claude:main-1';
const OTHER = 'codex:t-9';
const ASKED = '2026-11-16T10:00:00.000Z';
const BEFORE = '2026-11-16T09:00:00.000Z';
const AFTER = '2026-11-16T11:00:00.000Z';
const agent = (scopeId: string | null = null): OpenQuestion => ({ kind: 'agent', askedAt: ASKED, scopeId });
const HOLD = { kind: 'hold', reason: 'waiting-for-plan-decision', timeoutAnswer: QUESTION_REMINDER };

test('staleReason follows the table of spec M36 2.2', () => {
  const plan = (createdAt: string | null | undefined, scopeId: string | null = null) => ({ proposal: createdAt === undefined ? null : { createdAt }, scopeId });
  assert.equal(staleReason(agent(), plan(AFTER)), 'a newer proposal');
  assert.equal(staleReason(agent(), plan(BEFORE)), null, 'an older proposal of the project (M31) is no answer');
  assert.equal(staleReason(agent(), plan(null)), null, 'a proposal without its time cannot be compared');
  assert.equal(staleReason(agent(), plan(undefined)), null);
  assert.equal(staleReason(agent('S1'), plan(undefined, 'S2')), 'another scope');
  assert.equal(staleReason(agent(null), plan(undefined, 'S2')), 'another scope', 'a scope appeared after the question');
  assert.equal(staleReason({ kind: 'agent', askedAt: ASKED }, plan(undefined, 'S2')), 'another scope', 'an older file has no scopeId');
  assert.equal(staleReason(agent('S1'), plan(undefined, 'S1')), null, 'the question was asked during this scope');
  assert.equal(staleReason({ kind: 'proposal', askedAt: ASKED, scopeId: null }, plan(BEFORE)), null);
  assert.equal(staleReason({ kind: 'proposal', askedAt: ASKED, scopeId: null }, plan(undefined, 'S2')), 'no open proposal');
});

async function setup(over: Partial<CrossReviewDeps> = {}) {
  const folder = await mkdtemp(path.join(tmpdir(), 'wfk-stale-'));
  const open = new Map<string, OpenQuestion>();
  const decided = new Set<string>();
  const lines: string[] = [];
  const plan: { proposal: { generation: number; scopeId: string | null; createdAt: string } | null; scope: string | null } = { proposal: null, scope: null };
  const deps: CrossReviewDeps = {
    listProjects: async () => [{ id: 'p1', name: 'Demo', path: folder }],
    createSession: async () => ({ localId: null, remoteId: null }),
    resolveReviewer: async () => null,
    enqueue: () => undefined,
    wake: () => undefined,
    toggle: () => false,
    proposal: async () => plan.proposal,
    sessionTitle: () => null,
    question: (_p, key) => open.get(key) ?? null,
    asking: () => open.size > 0,
    questions: () => [...open].map(([key, question]) => ({ key, question })),
    dismissQuestion: async (_p, key) => void open.delete(key),
    scope: () => plan.scope,
    decided: (_p, key) => decided.has(key),
    askProposal: async (_p, key) => void open.set(key, { kind: 'proposal', askedAt: AFTER, scopeId: null }),
    log: (line) => void lines.push(line),
    ...over,
  };
  const review = createCrossReview(deps);
  await review.load();
  const ctx: StopContext = { key: MAIN, client: 'claude', sessionId: 'main-1', projectId: 'p1', stopHookActive: false, lastAssistantMessage: null, woken: false, turnStartedAt: AFTER };
  return { review, open, decided, lines, plan, ctx, cleanup: () => rm(folder, { recursive: true, force: true }) };
}

test('answered in the chat: the proposal closes the agent question, then the proposal question asks for the review (M4 12.2)', async () => {
  const t = await setup();
  t.open.set(MAIN, agent());
  assert.deepEqual(await t.review.decide(t.ctx, true), HOLD, 'no plan yet: the question waits for the user');
  assert.equal(await t.review.choiceBlocked('p1', []), CHOICE_WAITS_QUESTION);

  t.plan.proposal = { generation: 1, scopeId: 'S1', createdAt: AFTER };
  assert.deepEqual(await t.review.decide(t.ctx, true), HOLD, 'the session is asked about the review of its proposal');
  assert.equal(t.open.get(MAIN)?.kind, 'proposal', 'the agent question was replaced by the proposal question');
  assert.deepEqual(t.lines, [`review: plan question of ${MAIN} closed: a newer proposal`]);

  // The mode was chosen (scope:choose): there is no open proposal, the question is stale.
  t.plan.proposal = null;
  t.plan.scope = 'S1';
  assert.equal(await t.review.decide(t.ctx, true), null, 'the session is not held any more');
  assert.equal(t.open.size, 0);
  assert.equal(t.lines[1], `review: plan question of ${MAIN} closed: no open proposal`);
  await t.cleanup();
});

test('a choice closes the stale questions of the project and still waits for a live one', async () => {
  const t = await setup();
  t.plan.proposal = { generation: 1, scopeId: 'S1', createdAt: AFTER };
  t.open.set(MAIN, agent());
  t.open.set(OTHER, { kind: 'agent', askedAt: '2026-11-16T12:00:00.000Z', scopeId: null });
  assert.equal(await t.review.choiceBlocked('p1', []), CHOICE_WAITS_QUESTION, 'the question asked after the proposal waits');
  assert.deepEqual([...t.open.keys()], [OTHER]);
  t.open.delete(OTHER);
  t.decided.add(MAIN);
  assert.equal(await t.review.choiceBlocked('p1', []), null);
  await t.cleanup();
});

test('a scope created without a proposal closes the agent question; a question asked during the scope waits', async () => {
  const t = await setup();
  t.plan.scope = 'S2';
  t.open.set(MAIN, agent('S1'));
  assert.equal(await t.review.decide(t.ctx, true), null);
  assert.equal(t.open.size, 0);
  t.open.set(MAIN, agent('S2'));
  assert.deepEqual(await t.review.decide(t.ctx, true), HOLD);
  await t.cleanup();
});

test('without dismissQuestion (older wiring) an open question holds as before M36', async () => {
  const t = await setup({ dismissQuestion: undefined });
  t.plan.proposal = { generation: 1, scopeId: 'S1', createdAt: AFTER };
  t.open.set(MAIN, agent());
  assert.deepEqual(await t.review.decide(t.ctx, true), HOLD);
  assert.equal(await t.review.choiceBlocked('p1', []), CHOICE_WAITS_QUESTION);
  assert.equal(t.open.get(MAIN)?.kind, 'agent');
  assert.deepEqual(t.lines, []);
  await t.cleanup();
});
