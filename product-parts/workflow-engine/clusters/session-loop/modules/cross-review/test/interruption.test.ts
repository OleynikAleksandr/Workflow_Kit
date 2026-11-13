import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { StopContext, StopEvent } from '#agent-channel';
import { createCrossReview } from '../src/index.ts';

const MAIN = 'claude:main';
const REVIEWER = 'codex:reviewer';
const ctx = (key: string): StopContext => ({ key, client: key.split(':')[0]!, sessionId: key.split(':')[1]!, projectId: 'p', stopHookActive: false, lastAssistantMessage: null, woken: false });
const event = (key: string, text: string): StopEvent => ({ ...ctx(key), lastAssistantMessage: text, origin: key === MAIN ? 'decider' : 'user', sources: [] });

for (const interruptedKey of [MAIN, REVIEWER]) test(`interrupting ${interruptedKey} fails the review; late agreement cannot count; explicit retry delivers a new instruction`, async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'wfk-review-interrupt-'));
  const deliveries: string[] = [];
  const resumed: string[] = [];
  const review = createCrossReview({
    listProjects: async () => [{ id: 'p', name: 'Test', path: folder }],
    createSession: async () => ({ localId: 'reviewer', remoteId: null }),
    resolveReviewer: async () => REVIEWER,
    enqueue: (_key, text) => void deliveries.push(text),
    deliver: (_key, text) => void deliveries.push(text),
    wake: () => undefined,
    resumeDelivery: (key) => void resumed.push(key),
    toggle: () => true,
    proposal: async () => ({ generation: 1, scopeId: 'scope' }),
    sessionTitle: () => null,
  });
  try {
    await review.load();
    await review.decide(ctx(MAIN), true);
    review.onStop(event(MAIN, 'T001 plan'));
    await review.idle();
    assert.equal(review.isReviewer(REVIEWER), true);
    const before = deliveries.length;
    const failed = review.interrupted('p', interruptedKey);
    review.onStop(event(REVIEWER, 'REVIEW: APPROVED'));
    review.onStop(event(MAIN, 'REVIEW: AGREED'));
    await failed;
    await review.idle();
    assert.equal(review.get('p', MAIN)!.status, 'failed');
    assert.equal(review.get('p', MAIN)!.approved, false);
    assert.match(review.get('p', MAIN)!.reason!, /остановлен пользователем/);
    assert.equal(deliveries.length, before);
    assert.equal(await review.decide(ctx(MAIN), true), null, 'no automatic review restart');
    assert.equal(await review.retry('p', MAIN), true);
    assert.deepEqual(resumed, [MAIN]);
    assert.match(deliveries.at(-1)!, /повторить ревью плана после остановки/);
  } finally { await review.idle(); await rm(folder, { recursive: true, force: true }); }
});

test('a barrier arriving during review preparation prevents creating a new active review', async () => {
  let release!: () => void;
  let blocked = false;
  const projectRead = new Promise<void>((resolve) => { release = resolve; });
  const review = createCrossReview({
    listProjects: async () => { await projectRead; return []; },
    createSession: async () => { throw new Error('must not create'); },
    resolveReviewer: async () => null,
    enqueue: () => { throw new Error('must not send'); },
    wake: () => undefined,
    toggle: () => true,
    proposal: async () => ({ generation: 1, scopeId: 'scope' }),
    sessionTitle: () => null,
    continuationBlocked: () => blocked,
  });
  const preparing = review.decide(ctx(MAIN), true);
  await new Promise((resolve) => setImmediate(resolve));
  blocked = true;
  release();
  await preparing;
  assert.equal(review.get('p', MAIN), null);
});
