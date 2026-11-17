// M39 T006: the agreement of a cross review is bound to one version of the proposal (the digest
// of Kit `scope:proposal --digest`); a change after the approval sends the final version back to
// the reviewer; every finished review is heard by onFinished.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { StopContext, StopEvent, TurnOrigin } from '#agent-channel';
import { PLAN_REQUEST, createCrossReview, readReviews } from '../src/index.ts';
import type { ProposalDigestRef, Review } from '../src/index.ts';

const MAIN = 'claude:main-1';
const REVIEWER = 'codex:t1';

async function setup(initial: ProposalDigestRef | null) {
  const folder = await mkdtemp(path.join(tmpdir(), 'wfk-review-version-'));
  const sent: Array<{ key: string; text: string }> = [];
  const finished: Review[] = [];
  let version = initial;
  const review = createCrossReview({
    listProjects: async () => [{ id: 'p1', name: 'Склад', path: folder }],
    createSession: async () => ({ localId: 't1', remoteId: null }),
    resolveReviewer: async () => null,
    enqueue: (key, text) => void sent.push({ key, text }),
    wake: () => undefined,
    toggle: () => true,
    proposal: async () => ({ generation: 1, scopeId: 's1' }),
    sessionTitle: () => 'План',
    digest: async () => version,
    onFinished: (done) => void finished.push(done),
  });
  const settle = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await review.idle();
  };
  const ctx = (key: string): StopContext => ({ key, client: key.split(':')[0]!, sessionId: key.split(':')[1]!, projectId: 'p1', stopHookActive: false, lastAssistantMessage: null, woken: false });
  const stop = async (key: string, text: string, origin: TurnOrigin = 'delivery', sources = ['review']) => {
    const event: StopEvent = { key, client: ctx(key).client, sessionId: ctx(key).sessionId, projectId: 'p1', lastAssistantMessage: text, origin, sources };
    review.onStop(event);
    await settle();
  };
  assert.deepEqual(await review.decide(ctx(MAIN), true), { kind: 'continue', text: PLAN_REQUEST });
  await stop(MAIN, 'План: T001', 'decider', []);
  return { folder, review, sent, finished, stop, setVersion: (v: ProposalDigestRef | null) => void (version = v), cleanup: () => rm(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }) };
}

const v = (digest: string, generation = 1): ProposalDigestRef => ({ scopeId: 's1', generation, digest: digest.repeat(64).slice(0, 64), documents: ['docs/spec.md'] });

test('agreement on the approved version records reviewedProposal and is heard once', async () => {
  const t = await setup(v('a'));
  await t.stop(REVIEWER, 'Хорошо.\nREVIEW: APPROVED', 'user', []);
  assert.equal(t.review.get('p1', MAIN)!.approvedDigest, v('a').digest);
  await t.stop(MAIN, 'Согласен.\nREVIEW: AGREED');
  const done = t.review.get('p1', MAIN)!;
  assert.equal(done.status, 'agreed');
  assert.deepEqual(done.reviewedProposal, { scopeId: 's1', generation: 1, digest: v('a').digest });
  assert.deepEqual(t.finished.map((r) => r.status), ['agreed']);
  assert.deepEqual((await readReviews(t.folder))[0]!.reviewedProposal, done.reviewedProposal, 'kept over a restart');
  await t.cleanup();
});

test('a change after the approval (same generation) sends the final version back; agreement only on it', async () => {
  const t = await setup(v('a'));
  await t.stop(REVIEWER, 'Хорошо.\nREVIEW: APPROVED', 'user', []);
  t.setVersion(v('b'));
  await t.stop(MAIN, 'Поправил спецификацию.\nREVIEW: AGREED');
  let current = t.review.get('p1', MAIN)!;
  assert.equal(current.status, 'reviewing');
  assert.equal(current.approved, false);
  assert.equal(t.sent.at(-1)!.key, REVIEWER);
  assert.match(t.sent.at(-1)!.text, /изменились после твоего одобрения \(digest aaaaaaaaaaaa → bbbbbbbbbbbb\)/u);
  assert.match(t.sent.at(-1)!.text, /Версия предложения: generation 1, digest bbbbbbbbbbbb; документы: docs\/spec\.md/u);
  assert.deepEqual(t.finished, []);
  await t.stop(REVIEWER, 'Окончательная версия в порядке.\nREVIEW: APPROVED');
  await t.stop(MAIN, 'REVIEW: AGREED');
  current = t.review.get('p1', MAIN)!;
  assert.equal(current.status, 'agreed');
  assert.equal(current.reviewedProposal?.digest, v('b').digest);
  await t.cleanup();
});

test('a closed proposal after the approval is no agreement; the last round ends as disagreed', async () => {
  const t = await setup(v('a'));
  await t.stop(REVIEWER, 'REVIEW: APPROVED', 'user', []);
  t.setVersion(null);
  await t.stop(MAIN, 'REVIEW: AGREED');
  assert.equal(t.review.get('p1', MAIN)!.status, 'reviewing');
  for (let round = 2; round <= 5; round += 1) {
    await t.stop(REVIEWER, 'REVIEW: APPROVED');
    await t.stop(MAIN, 'REVIEW: AGREED');
  }
  assert.equal(t.review.get('p1', MAIN)!.status, 'disagreed');
  assert.deepEqual(t.finished.map((r) => [r.status, r.reviewedProposal ?? null]), [['disagreed', null]]);
  await t.cleanup();
});

test('an old Kit without the digest keeps the unbound agreement', async () => {
  const t = await setup(null);
  await t.stop(REVIEWER, 'REVIEW: APPROVED', 'user', []);
  await t.stop(MAIN, 'REVIEW: AGREED');
  const done = t.review.get('p1', MAIN)!;
  assert.equal(done.status, 'agreed');
  assert.equal(done.reviewedProposal, null);
  await t.cleanup();
});
