// M44 T001: a refused start or grant of a full run is tried again by the next steps (a finished
// turn, the minute tick) and blocks the run with `authorization-missing: <cause>` after
// START_ATTEMPTS; a started plan without the grant of the run writes the grant again.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { PREPARE_TEXTS, START_ATTEMPTS, WorkflowActionError, createPreparation, createRunJournal } from '../src/index.ts';
import type { NewRun, RunKit } from '../src/index.ts';

const tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-prepare-retry-'));
after(() => rm(tmp, { recursive: true, force: true }));
let n = 0;
const KEY = 'claude:s-1';
const AUTOMATION = { acceptance: [], ci: null, delivery: [], publication: null };

const chosenRun = (over: Partial<NewRun> = {}): NewRun => ({
  projectId: 'p1', owner: { key: KEY, client: 'claude', sessionId: 's-1' }, mode: 'full', review: false,
  request: { source: 'user-command', quote: 'да', at: '2026-11-18T10:00:00.000Z', turnId: null, goal: 'Docs' },
  proposal: null, scopeId: 'auto', authority: null, phase: 'starting', pausedFrom: null, reason: null, nextAction: null, ...over,
});

async function setup(options: { startErrors?: number; authorizeErrors?: number; withAuthorize?: boolean } = {}) {
  const folder = path.join(tmp, `p${(n += 1)}`);
  const journal = createRunJournal();
  const lines: string[] = [];
  const calls: string[] = [];
  let grant: { runId: string; revoked: unknown } | null = null;
  let startErrors = options.startErrors ?? 0;
  let authorizeErrors = options.authorizeErrors ?? 0;
  const kit = {
    status: async () => ({ revision: 1, head: 'h', capability: {}, authorization: grant }),
    supported: () => ({ ready: true }),
    scope: async () => ({ id: 'auto', ownerSession: 's-1', automation: AUTOMATION }),
    digest: async () => null,
  } as unknown as RunKit;
  // As the service: a refused grant blocks the run before the error reaches the preparation.
  const refuse = async (code: string) => {
    const active = await journal.active(folder);
    await journal.update(folder, active!.runId, (r) => ({ ...r, phase: 'blocked', pausedFrom: r.phase, reason: `${code}: refused` }));
    throw new WorkflowActionError(code, 'refused');
  };
  const preparation = createPreparation({
    journal, kit, projectPath: async () => folder, review: () => null, reviewOn: () => false,
    log: (line) => lines.push(line),
    actions: () => ({
      choose: async () => assert.fail('no choice expected'),
      start: async (_id, session) => {
        calls.push('start');
        if (startErrors > 0) {
          startErrors -= 1;
          return refuse('AUTOPILOT_MANUAL_REQUIRED');
        }
        grant = { runId: (await journal.active(folder))!.runId, revoked: null };
        return { owner: session! };
      },
    }),
    ...(options.withAuthorize === false ? {} : {
      authorize: async () => {
        calls.push('authorize');
        if (authorizeErrors > 0) {
          authorizeErrors -= 1;
          return refuse('AUTOPILOT_PLAN_CHANGED');
        }
        grant = { runId: (await journal.active(folder))!.runId, revoked: null };
        return null;
      },
    }),
  });
  return { folder, journal, lines, calls, preparation };
}

test('a refused start is tried again by the next step and then the run starts with its grant', async () => {
  const t = await setup({ startErrors: 1 });
  const created = await t.journal.create(t.folder, chosenRun());
  const first = await t.preparation.reconcile('p1');
  assert.deepEqual([first?.phase, first?.reason], ['starting', `AUTOPILOT_MANUAL_REQUIRED: refused (attempt 1/${START_ATTEMPTS})`]);
  assert.ok(t.lines.includes(`autopiloting: ${created.runId} start attempt 1/${START_ATTEMPTS} failed: AUTOPILOT_MANUAL_REQUIRED: refused; the next step retries`), t.lines.join('\n'));
  const second = await t.preparation.reconcile('p1');
  assert.deepEqual([second?.reason, second?.retries], [null, {}]);
  assert.ok(second?.receipts.some((r) => r.type === 'start'));
  assert.deepEqual(t.calls, ['start', 'start']);
  assert.ok(t.lines.some((line) => line.startsWith(`autopiloting: ${created.runId} started scope auto`)), t.lines.join('\n'));
});

test(`after ${START_ATTEMPTS} refused starts the run is blocked authorization-missing with the Kit cause`, async () => {
  const t = await setup({ startErrors: 10 });
  const created = await t.journal.create(t.folder, chosenRun());
  for (let i = 0; i < START_ATTEMPTS + 2; i += 1) await t.preparation.reconcile('p1');
  const run = (await t.journal.read(t.folder, created.runId))!;
  assert.deepEqual([run.phase, run.pausedFrom, run.reason, run.nextAction], ['blocked', 'starting', 'authorization-missing: AUTOPILOT_MANUAL_REQUIRED: refused', PREPARE_TEXTS.retry]);
  assert.equal(t.calls.length, START_ATTEMPTS, 'a blocked run is not started again');
});

test('a started plan without the grant of the run writes the grant again, up to the limit', async () => {
  const restored = await setup({ authorizeErrors: 1 });
  const run = await restored.journal.create(restored.folder, chosenRun());
  await restored.journal.update(restored.folder, run.runId, (r) => ({ ...r, receipts: [{ actionId: 'start:auto', type: 'start', at: 'x', commit: null, detail: 'scope auto' }] }));
  assert.equal((await restored.preparation.reconcile('p1'))?.phase, 'starting');
  const granted = await restored.preparation.reconcile('p1');
  assert.deepEqual([granted?.phase, granted?.reason], ['executing', null]);
  assert.deepEqual(restored.calls, ['authorize', 'authorize'], 'the start message is not sent again');
  assert.ok(restored.lines.includes(`autopiloting: ${run.runId} grant restored for the started scope auto`), restored.lines.join('\n'));

  const refused = await setup({ authorizeErrors: 10 });
  const other = await refused.journal.create(refused.folder, chosenRun());
  await refused.journal.update(refused.folder, other.runId, (r) => ({ ...r, receipts: [{ actionId: 'start:auto', type: 'start', at: 'x', commit: null, detail: 'scope auto' }] }));
  for (let i = 0; i < START_ATTEMPTS + 1; i += 1) await refused.preparation.reconcile('p1');
  const blocked = (await refused.journal.read(refused.folder, other.runId))!;
  assert.deepEqual([blocked.phase, blocked.reason], ['blocked', 'authorization-missing: AUTOPILOT_PLAN_CHANGED: refused']);
});

test('without the authorize link a started plan without the grant stops at once (M40)', async () => {
  const t = await setup({ withAuthorize: false });
  const run = await t.journal.create(t.folder, chosenRun());
  await t.journal.update(t.folder, run.runId, (r) => ({ ...r, receipts: [{ actionId: 'start:auto', type: 'start', at: 'x', commit: null, detail: 'scope auto' }] }));
  const stopped = await t.preparation.reconcile('p1');
  assert.equal(stopped?.phase, 'stopped');
});
