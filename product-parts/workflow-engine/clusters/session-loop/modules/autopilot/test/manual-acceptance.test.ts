// M41 T002: when the automatic acceptance cannot prove the result the run never stops with an
// error: it waits in `accepting` for «Принять план», asks Kit again only after a new commit, and
// after the user's acceptance closes and publishes itself; an early notice warns of checks no
// unfinished task can record, once, without stopping the run.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { COMPLETE_TEXTS, createRunCompletion, createRunJournal, runBrief as brief } from '../src/index.ts';
import type { NewRun, RunKit, RunRecord } from '../src/index.ts';

const tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-manual-acceptance-'));
after(() => rm(tmp, { recursive: true, force: true }));
let n = 0;
const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const FINAL = 'f'.repeat(40);
const CI = { remote: 'origin', branch: 'ci/auto', requiredChecks: ['Linux x64'], exactSha: true };
const PUB = { branch: 'main', upstream: 'origin/main' };
type Entry = { criterion: number; kind: 'automatic' | 'manual'; checks: string[]; evidence: string[]; evidenceMissing: string[]; checksPending?: string[]; checksUnreachable?: string[] };
const entry = (fields: Partial<Entry> = {}): Entry => ({ criterion: 0, kind: 'automatic', checks: ['unit'], evidence: ['r.md'], evidenceMissing: [], ...fields });

async function setup(over: Partial<NewRun> & Partial<Pick<RunRecord, 'completion'>> = {}) {
  const folder = path.join(tmp, `p${(n += 1)}`);
  const journal = createRunJournal();
  const { completion, ...rest } = over;
  let run = await journal.create(folder, {
    projectId: 'p', owner: { key: 'claude:s-1', client: 'claude', sessionId: 's-1' }, mode: 'full', review: false,
    request: { source: 'user-command', quote: 'start', at: 'x', turnId: null, goal: 'g' }, proposal: null, scopeId: 'auto',
    authority: { grantRevision: 1, deliveryTaskIds: [], accept: true, close: true, publication: PUB, acceptancePolicy: 'automatic', baseHead: null, revocation: null },
    phase: 'accepting', pausedFrom: null, reason: null, nextAction: null, ...rest,
  });
  run = await journal.update(folder, run.runId, (r) => ({ ...r, completion: completion === undefined ? { ci: null, publication: PUB, finalSha: null } : completion }));
  const kit = {
    status: { revision: 3, head: A, scope: 'ACTIVE', delivery: 'READY_FOR_ACCEPTANCE', transactionPending: false, orchestration: null, acceptance: [entry()], authorization: { runId: run.runId, revision: 1, revoked: null, delivery: [], accept: true, close: true, ci: null } } as Record<string, unknown>,
    hosts: [] as string[],
    acceptResult: { ok: true } as { ok: boolean; code?: string; message?: string; details?: Record<string, unknown> },
  };
  const runKit = {
    status: async () => structuredClone(kit.status),
    scope: async () => ({ id: 'auto', ownerSession: 's-1', automation: null }),
    host: async (_root: string, step: { operation: string }) => {
      kit.hosts.push(step.operation);
      const r = step.operation === 'accept' ? kit.acceptResult : { ok: true };
      if (r.ok && step.operation === 'accept') kit.status = { ...kit.status, delivery: 'ACCEPTED' };
      if (r.ok && step.operation === 'close') kit.status = { ...kit.status, scope: 'NONE', delivery: null, authorization: null };
      return r.ok
        ? { ok: true, code: null, message: null, result: { commit: { sha: step.operation === 'close' ? FINAL : kit.status['head'] } }, ticketId: 't', redeemed: true }
        : { ok: false, code: r.code!, message: r.message!, result: null, details: r.details ?? null, ticketId: 't', redeemed: true };
    },
  } as unknown as RunKit;
  const pushes: string[] = [];
  const publisher = {
    async publish(_f: string, _open: boolean, expected: { sha: string }) {
      pushes.push(`main:${expected.sha}`);
      return { sha: expected.sha, already: false };
    },
    async stageCi(_f: string, target: { sha: string }) {
      pushes.push(`ci:${target.sha}`);
      return { sha: target.sha, already: false };
    },
  };
  const lines: string[] = [];
  const git = async () => ({ code: 0, stdout: `${FINAL}\n`, stderr: '' });
  const completer = createRunCompletion({ journal, kit: runKit, publisher, git, projectPath: async () => folder, listProjects: async () => [{ id: 'p', path: folder }], log: (line) => void lines.push(line) });
  const read = async () => (await journal.read(folder, run.runId))!;
  return { folder, journal, run, kit, pushes, completer, read, lines };
}

test('missing evidence at HEAD: the run waits for the user, never blocked, and does not ask Kit again', async () => {
  const t = await setup();
  t.kit.status = { ...t.kit.status, acceptance: [entry({ evidenceMissing: ['r.md'] })] };
  const waiting = await t.completer.advance('p');
  const reason = COMPLETE_TEXTS.evidence('r.md');
  assert.deepEqual([waiting?.phase, waiting?.manualAcceptance?.head, waiting?.manualAcceptance?.reason, waiting?.nextAction], ['accepting', A, reason, COMPLETE_TEXTS.awaitUser(reason)]);
  assert.match(waiting!.nextAction!, /нажмите «Принять план» — запуск сам закроет план и опубликует/u);
  assert.deepEqual(t.lines, [`autopiloting: ${t.run.runId} awaits the user's acceptance: ${reason}`]);
  const again = await t.completer.advance('p');
  assert.equal(again?.revision, waiting?.revision, 'nothing changes at the same HEAD');
  assert.deepEqual([t.kit.hosts, t.pushes], [[], []]);
  // The panel brief carries the reason while the run waits.
  assert.deepEqual(brief(again!).manualAcceptance, { reason, since: waiting!.manualAcceptance!.since });
});

test('a refusal of the evidence: Kit is asked again only at a new HEAD; then the run accepts, closes and publishes itself', async () => {
  const t = await setup();
  t.kit.acceptResult = { ok: false, code: 'AUTOPILOT_EVIDENCE_REQUIRED', message: 'Criterion 1: check unit has no passed record on the history of HEAD.', details: { check: 'unit' } };
  const waiting = await t.completer.advance('p');
  assert.deepEqual([waiting?.phase, waiting?.manualAcceptance?.head, t.kit.hosts], ['accepting', A, ['accept']]);
  assert.match(waiting?.manualAcceptance?.reason ?? '', /^AUTOPILOT_EVIDENCE_REQUIRED: Criterion 1/u);
  await t.completer.advance('p');
  assert.deepEqual(t.kit.hosts, ['accept'], 'no second attempt at the same HEAD');
  // The agent committed the evidence: a new HEAD, a new automatic attempt that succeeds.
  t.kit.status = { ...t.kit.status, head: B };
  t.kit.acceptResult = { ok: true };
  const done = await t.completer.advance('p');
  assert.deepEqual(t.kit.hosts, ['accept', 'accept', 'close']);
  assert.deepEqual([done?.phase, done?.manualAcceptance, done?.completion?.finalSha, t.pushes], ['completed', null, FINAL, [`main:${FINAL}`]]);
});

test('the user accepts by hand: the run closes, the CI checks exactly the close SHA, and that SHA is published', async () => {
  const t = await setup({ completion: { ci: CI, publication: PUB, finalSha: null } });
  t.kit.acceptResult = { ok: false, code: 'AUTOPILOT_MANUAL_REQUIRED', message: 'Criterion 2 is manual.' };
  // A green CI of A exists, so the service asks Kit and gets the manual refusal.
  await t.journal.update(t.folder, t.run.runId, (r) => ({ ...r, receipts: [{ actionId: `ci:${A}`, type: 'ci', at: 'x', commit: A, detail: 'Linux x64' }] }));
  const waiting = await t.completer.advance('p');
  assert.match(waiting?.manualAcceptance?.reason ?? '', /^AUTOPILOT_MANUAL_REQUIRED/u);
  // «Принять план»: Kit records the acceptance of the user.
  t.kit.status = { ...t.kit.status, delivery: 'ACCEPTED' };
  const closing = await t.completer.advance('p');
  assert.deepEqual(t.kit.hosts, ['accept', 'close']);
  assert.deepEqual([closing?.phase, closing?.pausedFrom, closing?.wait?.sha, closing?.manualAcceptance, closing?.nextAction], ['waiting', 'publishing', FINAL, null, null]);
  assert.deepEqual(t.pushes, [`ci:${FINAL}`], 'the CI runs for the close SHA, main waits for it');
  // The CI of the close SHA is green: the run publishes exactly that SHA.
  await t.journal.update(t.folder, t.run.runId, (r) => ({ ...r, phase: 'publishing', pausedFrom: null, wait: null, receipts: [...r.receipts, { actionId: `ci:${FINAL}`, type: 'ci', at: 'x', commit: FINAL, detail: 'Linux x64' }] }));
  const published = await t.completer.advance('p');
  assert.deepEqual([published?.phase, t.pushes], ['completed', [`ci:${FINAL}`, `main:${FINAL}`]]);
});

test('the early notice: once, while the tasks run, without stopping; an older Kit gives none', async () => {
  const t = await setup({ phase: 'executing' });
  t.kit.status = { ...t.kit.status, delivery: 'IN_PROGRESS', acceptance: [entry({ criterion: 2, checks: ['installed-service', 'unit'], checksPending: ['installed-service', 'unit'], checksUnreachable: ['installed-service'] })] };
  const warned = await t.completer.advance('p');
  const text = COMPLETE_TEXTS.notice('installed-service (критерий 3)');
  assert.deepEqual([warned?.phase, warned?.notice?.text, warned?.notice?.checks, warned?.nextAction], ['executing', text, ['installed-service'], null]);
  assert.equal(text, 'Автоприёмка не сможет доказать: installed-service (критерий 3) — в конце понадобится ваша приёмка.');
  assert.equal(brief(warned!).notice, text);
  const again = await t.completer.advance('p');
  assert.equal(again?.revision, warned?.revision, 'the notice is written once');
  const old = await setup({ phase: 'delivering' });
  old.kit.status = { ...old.kit.status, delivery: 'IN_PROGRESS' };
  const quiet = await old.completer.advance('p');
  assert.equal(quiet?.notice ?? null, null, 'a Kit before 2.4.5 has no checksUnreachable');
});
