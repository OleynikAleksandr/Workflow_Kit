// M48 T003: the review of a session is one value on its card and on the plan question. It changes
// until the path is chosen; off cancels a running review; a reviewed plan keeps its decision; a
// cancelled review locks nothing; an open proposal question is answered by the card.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CrossReview, Review } from '#cross-review';
import type { WorkflowState } from '#kit-runner';
import type { ReviewToggles } from '#plan-review';
import { CARD_CANCEL_REASON, createSessionReview } from '../src/session-review.ts';
import { toggleLock } from '../src/review-wiring.ts';

const KEY = 'claude:s-1';

function setup() {
  const world = {
    execution: false,
    open: 's1' as string | null,
    review: null as Partial<Review> | null,
    question: null as null | { kind: 'agent' | 'proposal' },
    decided: new Map<string, boolean>(),
  };
  const calls: string[] = [];
  const toggles = {
    get: (_id: string, key: string) => world.decided.get(key) ?? false,
    decided: (_id: string, key: string) => world.decided.has(key),
    question: () => world.question,
    set: async (_id: string, key: string, on: boolean) => (calls.push(`set:${on}`), world.decided.set(key, on)),
    answer: async (_id: string, key: string, choice: string) => (calls.push(`answer:${choice}`), (world.question = null), world.decided.set(key, choice === 'review')),
  } as unknown as ReviewToggles;
  const review = {
    get: () => (world.review ? ({ mainKey: KEY, ...world.review } as Review) : null),
    cancel: async (_id: string, _key: string, reason: string) => (calls.push(`cancel:${reason}`), (world.review = { ...world.review, status: 'cancelled' }), null),
  } as unknown as CrossReview;
  const workflow = { get: () => ({ execution: world.execution ? {} : null, proposal: world.open ? { scopeId: world.open } : null }) } as unknown as WorkflowState;
  return { world, calls, session: createSessionReview({ toggles, review, workflow }) };
}

test('the state of the review: open, running, reviewed, closed; a cancelled review locks nothing', () => {
  const t = setup();
  assert.equal(t.session.state('p', KEY), 'open');
  t.world.review = { status: 'reviewing', scopeId: 's1' };
  assert.equal(t.session.state('p', KEY), 'running');
  t.world.review = { status: 'agreed', scopeId: 's1' };
  assert.equal(t.session.state('p', KEY), 'reviewed');
  t.world.review = { status: 'cancelled', scopeId: 's1' };
  assert.equal(t.session.state('p', KEY), 'open');
  t.world.execution = true;
  assert.equal(t.session.state('p', KEY), 'closed');
});

test('the guard: closed and reviewed refuse with their codes; off over a running review cancels it', async () => {
  const t = setup();
  t.world.execution = true;
  await assert.rejects(t.session.guard('p', KEY, true), { code: 'review-closed', status: 409 });
  t.world.execution = false;
  t.world.review = { status: 'agreed', scopeId: 's1' };
  await assert.rejects(t.session.guard('p', KEY, false), { code: 'review-locked', status: 409 });
  t.world.review = { status: 'answering', scopeId: 's1' };
  await t.session.guard('p', KEY, true);
  assert.deepEqual(t.calls, [], 'on over a running review changes nothing');
  await t.session.guard('p', KEY, false);
  assert.deepEqual(t.calls, [`cancel:${CARD_CANCEL_REASON}`]);
  assert.equal(t.session.state('p', KEY), 'open', 'after the cancellation the toggle can go off');
});

test('apply: the toggle follows the card; an open proposal question is answered; decided is the toggle value or null', async () => {
  const t = setup();
  assert.equal(t.session.decided('p', KEY), null);
  await t.session.apply('p', KEY, true);
  assert.equal(t.session.decided('p', KEY), true);
  t.world.question = { kind: 'proposal' };
  await t.session.apply('p', KEY, false);
  assert.deepEqual(t.calls, ['set:true', 'answer:plan']);
  assert.equal(t.world.question, null);
  t.world.question = { kind: 'agent' };
  await t.session.apply('p', KEY, true);
  assert.deepEqual(t.calls.at(-1), 'set:true', 'the agent question about a plan stays open');
});

test('toggleLock: a cancelled review of the open plan does not lock the toggle', () => {
  const cross = { get: () => ({ status: 'cancelled', scopeId: 's1' }) } as unknown as CrossReview;
  const workflow = { get: () => ({ proposal: { scopeId: 's1' } }) } as unknown as WorkflowState;
  assert.equal(toggleLock(cross, workflow, 'p', KEY), null);
});
