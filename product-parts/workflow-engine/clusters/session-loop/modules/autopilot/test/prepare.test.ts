// M39 T006: the preparation of a full run with a scripted Kit and scripted panel actions:
// review off and on, version binding, refusals, late events and the capability of orchestration.
// The real Kit path is in prepare-real.test.ts.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { createKeyedMutex } from '#data-store';
import { PREPARE_TEXTS, WorkflowActionError, createPreparation, createRunJournal } from '../src/index.ts';
import type { ChooseRequest, NewRun, ReviewFact, RunKit } from '../src/index.ts';

const tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-prepare-'));
after(() => rm(tmp, { recursive: true, force: true }));
let n = 0;
const DIGEST = 'd'.repeat(64);
const KEY = 'claude:s-1';

function run(over: Partial<NewRun> = {}): NewRun {
  return {
    projectId: 'p1', owner: { key: KEY, client: 'claude', sessionId: 's-1' }, mode: 'full', review: true,
    request: { source: 'user-command', quote: 'да', at: '2026-11-16T10:00:00.000Z', turnId: null, goal: 'Docs' },
    proposal: null, scopeId: null, authority: null, phase: 'preparing', pausedFrom: null, reason: null, nextAction: null, ...over,
  };
}

async function setup(options: { review?: boolean; fact?: ReviewFact | null; recommended?: 'sequential' | 'orchestrated'; options?: string[]; orchestration?: boolean; chooseError?: string } = {}) {
  const folder = path.join(tmp, `p${(n += 1)}`);
  const journal = createRunJournal();
  const kit = {
    version: { scopeId: 'auto', generation: 1, proposalDigest: DIGEST, documentDigests: {} } as { scopeId: string; generation: number; proposalDigest: string; documentDigests: object } | null,
    scope: null as { id: string; ownerSession: string | null; automation: null } | null,
    grant: null as { runId: string; revoked: unknown } | null,
  };
  const calls: string[] = [];
  const chosen: ChooseRequest[] = [];
  const runKit = {
    status: async () => ({ revision: 1, head: 'h', capability: {}, authorization: kit.grant }),
    supported: () => ({ ready: true }),
    scope: async () => kit.scope,
    digest: async () => kit.version,
    proposal: async () => ({ recommended: options.recommended ?? 'sequential', options: options.options ?? ['sequential', 'orchestrated', 'refine'] }),
  } as unknown as RunKit;
  const preparation = createPreparation({
    journal,
    kit: runKit,
    projectPath: async () => folder,
    review: () => (options.fact === undefined ? null : options.fact),
    reviewOn: () => options.review ?? false,
    orchestration: async () => ({ available: options.orchestration ?? true, reason: 'no executors' }),
    mutex: createKeyedMutex(),
    actions: () => ({
      choose: async (_id, request) => {
        calls.push('choose');
        chosen.push(request);
        if (options.chooseError) throw new WorkflowActionError(options.chooseError, 'refused');
        kit.scope = { id: 'auto', ownerSession: 's-1', automation: null };
      },
      start: async (_id, session) => {
        calls.push(`start:${session}`);
        const active = await journal.active(folder);
        kit.grant = { runId: active!.runId, revoked: null };
        await journal.update(folder, active!.runId, (r) => ({ ...r, phase: 'executing' }));
        return { owner: session! };
      },
    }),
  });
  return { folder, journal, kit, calls, chosen, preparation };
}

test('review off: the proposal is chosen with its digest and started; the review is recorded as skipped', async () => {
  const t = await setup();
  const created = await t.journal.create(t.folder, run({ review: false }));
  const result = await t.preparation.reconcile('p1');
  assert.deepEqual(t.calls, ['choose', `start:${KEY}`]);
  assert.equal(t.chosen[0]!.expectedDigest, DIGEST);
  assert.equal(t.chosen[0]!.option, 'sequential');
  assert.match(t.chosen[0]!.automatic!.note, new RegExp(`Автоматический выбор по поручению ${created.runId}`, 'u'));
  assert.equal(result?.phase, 'executing');
  assert.equal(result?.scopeId, 'auto');
  assert.deepEqual(result?.receipts.map((r) => [r.type, r.type === 'review' ? r.detail : '']), [['review', 'skipped-by-setting'], ['choose', '']]);
  assert.equal((await t.preparation.reconcile('p1'))?.phase, 'executing', 'a repeat does nothing');
  assert.equal(t.calls.length, 2);
});

test('review on: waits while the review runs, starts only on the agreed digest', async () => {
  const active = await setup({ review: true, fact: { status: 'reviewing', scopeId: 'auto', reason: null, reviewedProposal: null } });
  await active.journal.create(active.folder, run());
  assert.equal((await active.preparation.reconcile('p1'))?.phase, 'reviewing');
  assert.deepEqual(active.calls, []);
  const none = await setup({ review: true, fact: null });
  await none.journal.create(none.folder, run());
  assert.equal((await none.preparation.reconcile('p1'))?.phase, 'reviewing', 'the review has not started yet');
  const agreed = await setup({ review: true, fact: { status: 'agreed', scopeId: 'auto', reason: null, reviewedProposal: { scopeId: 'auto', generation: 1, digest: DIGEST } } });
  await agreed.journal.create(agreed.folder, run());
  assert.equal((await agreed.preparation.reconcile('p1'))?.phase, 'executing');
  assert.equal((await agreed.journal.active(agreed.folder))?.receipts[0]?.detail, 'agreed');
});

test('a changed version, a failed review or a refused choice never start the plan', async () => {
  const changed = await setup({ review: true, fact: { status: 'agreed', scopeId: 'auto', reason: null, reviewedProposal: { scopeId: 'auto', generation: 1, digest: 'e'.repeat(64) } } });
  await changed.journal.create(changed.folder, run());
  const blocked = await changed.preparation.reconcile('p1');
  assert.deepEqual([blocked?.phase, blocked?.reason], ['blocked', PREPARE_TEXTS.changed]);
  for (const status of ['failed', 'disagreed', 'cancelled'] as const) {
    const t = await setup({ review: true, fact: { status, scopeId: 'auto', reason: 'нет ревьюера', reviewedProposal: null } });
    await t.journal.create(t.folder, run());
    const result = await t.preparation.reconcile('p1');
    assert.equal(result?.phase, 'blocked', status);
    assert.match(result!.reason!, new RegExp(status, 'u'));
    assert.deepEqual(t.calls, []);
  }
  const race = await setup({ chooseError: 'PROPOSAL_CHANGED' });
  await race.journal.create(race.folder, run({ review: false }));
  const refused = await race.preparation.reconcile('p1');
  assert.deepEqual([refused?.phase, refused?.reason], ['blocked', PREPARE_TEXTS.changed]);
  assert.deepEqual(race.calls, ['choose']);
});

test('after-start, paused, stopped and late events: nothing is chosen or started', async () => {
  for (const over of [{ mode: 'after-start' as const }, { phase: 'paused' as const }, { phase: 'stopped' as const }, { phase: 'blocked' as const }]) {
    const t = await setup();
    await t.journal.create(t.folder, run({ review: false, ...over }));
    await t.preparation.reconcile('p1');
    assert.deepEqual(t.calls, [], JSON.stringify(over));
  }
  const t = await setup();
  await t.journal.create(t.folder, run({ review: false }));
  await Promise.all([t.preparation.reconcile('p1'), t.preparation.reconcile('p1'), t.preparation.reconcile('p1')]);
  assert.deepEqual(t.calls, ['choose', `start:${KEY}`], 'concurrent events start one plan');
});

test('a plan chosen by another owner is not taken over; a chosen own plan is started once after a restart', async () => {
  const other = await setup();
  await other.journal.create(other.folder, run({ review: false }));
  other.kit.scope = { id: 'auto', ownerSession: 's-9', automation: null };
  const blocked = await other.preparation.reconcile('p1');
  assert.deepEqual([blocked?.phase, blocked?.reason], ['blocked', PREPARE_TEXTS.scopeChanged]);
  const own = await setup();
  await own.journal.create(own.folder, run({ review: false, phase: 'starting', scopeId: 'auto' }));
  own.kit.scope = { id: 'auto', ownerSession: 's-1', automation: null };
  assert.equal((await own.preparation.reconcile('p1'))?.phase, 'executing');
  assert.deepEqual(own.calls, [`start:${KEY}`]);
});

test('orchestration: recommended and available is kept; without the capability sequential is the recorded fallback', async () => {
  const kept = await setup({ recommended: 'orchestrated' });
  await kept.journal.create(kept.folder, run({ review: false }));
  await kept.preparation.reconcile('p1');
  assert.equal(kept.chosen[0]!.option, 'orchestrated');
  const fallback = await setup({ recommended: 'orchestrated', orchestration: false });
  await fallback.journal.create(fallback.folder, run({ review: false }));
  await fallback.preparation.reconcile('p1');
  assert.equal(fallback.chosen[0]!.option, 'sequential');
  assert.match(fallback.chosen[0]!.automatic!.note, /sequential fallback/u);
  const none = await setup({ recommended: 'orchestrated', orchestration: false, options: ['orchestrated', 'refine'] });
  await none.journal.create(none.folder, run({ review: false }));
  assert.equal((await none.preparation.reconcile('p1'))?.reason, PREPARE_TEXTS.noOption);
});
