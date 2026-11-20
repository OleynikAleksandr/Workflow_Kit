// M39 T008: the completion decides each step from facts — a restart after accept, close or push
// repeats nothing; a manual criterion, a revoked grant, a pause, another scope, no upstream,
// refused credentials and a red CI after the close are typed stops; a failing push retries.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { COMPLETE_TEXTS, RETRY_DELAYS_MS, createRunCompletion, createRunJournal, createRunWaits, runBrief, runNoticeState } from '../src/index.ts';
import type { NewRun, RunKit, RunRecord } from '../src/index.ts';

const tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-complete-'));
after(() => rm(tmp, { recursive: true, force: true }));
let n = 0;
const SHA = 'a'.repeat(40);
const FINAL = 'f'.repeat(40);
const CI = { remote: 'origin', branch: 'ci/auto', requiredChecks: ['Linux x64'], exactSha: true };
const PUB = { branch: 'main', upstream: 'origin/main' };

class GitError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function setup(over: Partial<NewRun> & Partial<Pick<RunRecord, 'completion' | 'receipts'>> = {}) {
  const folder = path.join(tmp, `p${(n += 1)}`);
  const journal = createRunJournal();
  const { completion, receipts, ...rest } = over;
  let run = await journal.create(folder, {
    projectId: 'p', owner: { key: 'claude:s-1', client: 'claude', sessionId: 's-1' }, mode: 'after-start', review: false,
    request: { source: 'panel-start', quote: 'start', at: 'x', turnId: null, goal: 'g' }, proposal: null, scopeId: 'auto',
    authority: { grantRevision: 1, deliveryTaskIds: [], accept: true, close: true, publication: PUB, acceptancePolicy: 'automatic', baseHead: null, revocation: null },
    phase: 'executing', pausedFrom: null, reason: null, nextAction: null, ...rest,
  });
  if (completion !== undefined || receipts) run = await journal.update(folder, run.runId, (r) => ({ ...r, ...(completion !== undefined ? { completion } : {}), ...(receipts ? { receipts } : {}) }));
  const kit = {
    status: { revision: 3, head: SHA, scope: 'ACTIVE', delivery: 'READY_FOR_ACCEPTANCE', transactionPending: false, orchestration: null, acceptance: [{ criterion: 0, kind: 'automatic', checks: [], evidence: ['r.md'], evidenceMissing: [] }], authorization: { runId: run.runId, revision: 1, revoked: null, delivery: [], accept: true, close: true, ci: CI } } as Record<string, unknown>,
    hosts: [] as string[],
    hostResult: { ok: true } as { ok: boolean; code?: string; message?: string; details?: Record<string, unknown> },
  };
  const runKit = {
    status: async () => structuredClone(kit.status),
    scope: async () => ({ id: 'auto', ownerSession: 's-1', automation: null }),
    host: async (_root: string, step: { operation: string; input: unknown }) => {
      kit.hosts.push(step.operation);
      const r = kit.hostResult;
      // The real Kit moves on: accepted after accept, no scope (and no grant) after close.
      if (r.ok && step.operation === 'accept') kit.status = { ...kit.status, delivery: 'ACCEPTED' };
      if (r.ok && step.operation === 'close') kit.status = { ...kit.status, scope: 'NONE', delivery: null, authorization: null };
      return r.ok ? { ok: true, code: null, message: null, result: { commit: { sha: step.operation === 'close' ? FINAL : SHA } }, ticketId: 't', redeemed: true } : { ok: false, code: r.code!, message: r.message!, result: null, details: r.details ?? null, ticketId: 't', redeemed: true };
    },
  } as unknown as RunKit;
  const pushes: string[] = [];
  const publisher = {
    fail: null as GitError | null,
    async publish(_f: string, _open: boolean, expected: { sha: string }) {
      pushes.push(`main:${expected.sha}`);
      if (publisher.fail) throw publisher.fail;
      return { sha: expected.sha, already: false };
    },
    async stageCi(_f: string, target: { sha: string }) {
      pushes.push(`ci:${target.sha}`);
      return { sha: target.sha, already: false };
    },
  };
  let clock = Date.parse('2026-11-16T10:00:00.000Z');
  const gitLog = { closed: '' };
  const git = async (_cwd: string, args: string[]) => ({ code: 0, stdout: args[0] === 'log' && args.includes('--fixed-strings') ? gitLog.closed : `${FINAL}\n`, stderr: '' });
  const deps = { journal, kit: runKit, git, projectPath: async () => folder, listProjects: async () => [{ id: 'p', path: folder }], now: () => new Date(clock) };
  const completer = createRunCompletion({ ...deps, publisher });
  const read = async () => (await journal.read(folder, run.runId))!;
  return { folder, journal, run, kit, pushes, publisher, completer, read, gitLog, deps, tick: (ms: number) => void (clock += ms) };
}

test('ready for acceptance: the frozen policy is snapshotted, the candidate goes to CI before the acceptance', async () => {
  const t = await setup();
  const run = await t.completer.advance('p');
  assert.deepEqual([run?.phase, run?.pausedFrom, run?.wait?.stage], ['waiting', 'accepting', 'service']);
  assert.deepEqual(run?.completion, { ci: CI, publication: PUB, finalSha: null });
  assert.deepEqual(t.pushes, [`ci:${SHA}`]);
  assert.deepEqual(t.kit.hosts, [], 'no acceptance before a green CI');
});

test('a green candidate: accept and close by host tickets, then the final SHA waits for its own CI', async () => {
  const t = await setup({ phase: 'accepting', completion: { ci: CI, publication: PUB, finalSha: null }, receipts: [{ actionId: `ci:${SHA}`, type: 'ci', at: 'x', commit: SHA, detail: 'Linux x64' }] });
  const run = await t.completer.advance('p');
  assert.deepEqual(t.kit.hosts, ['accept', 'close']);
  assert.deepEqual([run?.phase, run?.pausedFrom, run?.wait?.sha, run?.completion?.finalSha], ['waiting', 'publishing', FINAL, FINAL]);
  assert.deepEqual(run?.tickets, ['t', 't']);
});

test('a restart after accept or close finds the facts and repeats no Kit step', async () => {
  const accepted = await setup({ phase: 'accepting', completion: { ci: null, publication: PUB, finalSha: null } });
  accepted.kit.status = { ...accepted.kit.status, delivery: 'ACCEPTED' };
  accepted.kit.hostResult = { ok: false, code: 'NOT_READY', message: 'stop here' };
  await accepted.completer.advance('p');
  assert.deepEqual(accepted.kit.hosts, ['close'], 'the accept is a fact, only the close runs');
  const closed = await setup({ phase: 'closing', completion: { ci: null, publication: PUB, finalSha: null } });
  closed.kit.status = { ...closed.kit.status, scope: 'NONE', delivery: null, authorization: null };
  closed.gitLog.closed = `${FINAL}\tchore: close scope auto (autopilot run ${closed.run.runId})\n`;
  const run = await closed.completer.advance('p');
  assert.deepEqual([closed.kit.hosts, run?.phase, run?.completion?.finalSha], [[], 'completed', FINAL]);
  assert.deepEqual(closed.pushes, [`main:${FINAL}`]);
  const elsewhere = await setup({ phase: 'closing', completion: { ci: null, publication: PUB, finalSha: null } });
  elsewhere.kit.status = { ...elsewhere.kit.status, scope: 'NONE' };
  // M40: the user closed the scope by hand — the run ends and publishes nothing.
  const ended = await elsewhere.completer.advance('p');
  assert.deepEqual([ended?.phase, ended?.reason, ended?.pausedFrom, ended?.nextAction, elsewhere.pushes], ['finished', 'closed-manually', 'closing', null, []]);
});

test('typed stops: manual criterion, revoked grant, pause, another scope; missing evidence and a refusal of Kit wait for the user (M41)', async () => {
  const manual = await setup();
  (manual.kit.status['authorization'] as { accept: boolean }).accept = false;
  assert.equal((await manual.completer.advance('p'))?.nextAction, COMPLETE_TEXTS.manual);
  const revoked = await setup();
  (revoked.kit.status['authorization'] as { revoked: unknown }).revoked = { reason: 'settings-off' };
  assert.equal((await revoked.completer.advance('p'))?.phase, 'executing');
  const paused = await setup({ phase: 'paused', pausedFrom: 'publishing', completion: { ci: null, publication: PUB, finalSha: FINAL } });
  await paused.completer.advance('p');
  assert.deepEqual(paused.pushes, [], 'a paused run publishes nothing');
  const other = await setup({ phase: 'publishing', completion: { ci: null, publication: PUB, finalSha: FINAL } });
  assert.equal((await other.completer.advance('p'))?.reason, 'scope-changed');
  const missing = await setup({ phase: 'accepting', completion: { ci: null, publication: PUB, finalSha: null } });
  missing.kit.status = { ...missing.kit.status, acceptance: [{ criterion: 0, kind: 'automatic', checks: [], evidence: ['r.md'], evidenceMissing: ['r.md'] }] };
  const waiting = await missing.completer.advance('p');
  assert.deepEqual([waiting?.phase, waiting?.manualAcceptance?.reason, waiting?.nextAction], ['accepting', COMPLETE_TEXTS.evidence('r.md'), COMPLETE_TEXTS.awaitUser(COMPLETE_TEXTS.evidence('r.md'))]);
  const refused = await setup({ phase: 'accepting', completion: { ci: null, publication: PUB, finalSha: null } });
  refused.kit.hostResult = { ok: false, code: 'AUTOPILOT_EVIDENCE_REQUIRED', message: 'Criterion 1: check x has no passed record', details: { check: 'x' } };
  const refusedRun = await refused.completer.advance('p');
  assert.equal(refusedRun?.phase, 'accepting');
  assert.match(refusedRun?.manualAcceptance?.reason ?? '', /^AUTOPILOT_EVIDENCE_REQUIRED/u);
  // Another refusal of Kit still stops the run with «Продолжить».
  const stale = await setup({ phase: 'accepting', completion: { ci: null, publication: PUB, finalSha: null } });
  stale.kit.hostResult = { ok: false, code: 'REVISION_MISMATCH', message: 'The plan changed' };
  const staleRun = await stale.completer.advance('p');
  assert.deepEqual([staleRun?.phase, staleRun?.reason, staleRun?.nextAction], ['blocked', 'REVISION_MISMATCH: The plan changed', COMPLETE_TEXTS.retry]);
});

test('a CI of another SHA: Kit refuses it and the service checks HEAD itself', async () => {
  const t = await setup({ phase: 'accepting', completion: { ci: CI, publication: PUB, finalSha: null }, receipts: [{ actionId: 'ci:old', type: 'ci', at: 'x', commit: 'b'.repeat(40), detail: '' }] });
  t.kit.hostResult = { ok: false, code: 'AUTOPILOT_EVIDENCE_REQUIRED', message: 'The required CI checks did not pass for the current result.', details: { absent: [], sha: 'b'.repeat(40) } };
  const run = await t.completer.advance('p');
  assert.deepEqual([run?.phase, run?.wait?.sha, t.pushes], ['waiting', SHA, [`ci:${SHA}`]]);
});

test('publishing: a failing push retries 5/15/45 s, refused credentials block at once', async () => {
  const t = await setup({ phase: 'publishing', completion: { ci: null, publication: PUB, finalSha: FINAL } });
  t.kit.status = { ...t.kit.status, scope: 'NONE' };
  t.publisher.fail = new GitError('push-failed', 'git push не выполнен');
  for (const delay of RETRY_DELAYS_MS) {
    await t.completer.advance('p');
    await t.completer.advance('p');
    t.tick(delay);
  }
  assert.equal(t.pushes.length, 3, 'no push before the delay');
  const blocked = await t.completer.advance('p');
  assert.deepEqual([blocked?.phase, blocked?.pausedFrom], ['blocked', 'publishing']);
  const auth = await setup({ phase: 'publishing', completion: { ci: null, publication: PUB, finalSha: FINAL } });
  auth.kit.status = { ...auth.kit.status, scope: 'NONE' };
  auth.publisher.fail = new GitError('push-auth', 'Удалённый репозиторий отклонил учётные данные');
  const run = await auth.completer.advance('p');
  assert.match(run?.reason ?? '', /^push-auth/u);
  assert.match(run?.nextAction ?? '', /учётные данные/u);
});

test('a red CI of the final SHA blocks the closed run: a repair needs a new scope', async () => {
  const t = await setup({ phase: 'waiting', pausedFrom: 'publishing', completion: { ci: CI, publication: PUB, finalSha: FINAL } });
  await t.journal.update(t.folder, t.run.runId, (r) => ({ ...r, wait: { reason: 'ci', since: 'x', sha: FINAL, actionId: `ci:${FINAL}`, stage: 'service', detail: 'w' } }));
  const waits = createRunWaits({ ...t.deps, kit: { status: async () => assert.fail('the closed scope has no grant to read') } as unknown as RunKit, ci: { read: async (_r, sha, policy) => (assert.deepEqual(policy, CI), { state: 'failed', sha, failed: [{ name: 'Linux x64', conclusion: 'failure' }] }) }, send: () => assert.fail('no message') });
  await waits.pollAll();
  const run = await t.read();
  assert.deepEqual([run.phase, run.pausedFrom, run.nextAction], ['blocked', 'publishing', COMPLETE_TEXTS.afterClose]);
  assert.deepEqual(t.pushes, [], 'main is never pushed after a red CI');
});

test('M48 T004: a plan without publication ends after the close — no push, no CI of the final SHA, the result stays local', async () => {
  const local = await setup({ phase: 'publishing', completion: { ci: CI, publication: null, finalSha: FINAL } });
  local.kit.status = { ...local.kit.status, scope: 'NONE' };
  const done = (await local.completer.advance('p'))!;
  assert.deepEqual([done.phase, done.reason, done.nextAction, done.completion?.published, done.completion?.local], ['completed', null, null, null, true]);
  assert.deepEqual(local.pushes, [], 'nothing is pushed: neither the CI branch nor main');
  assert.equal(done.receipts.at(-1)?.actionId, `local:${FINAL}`);
  const brief = runBrief(done);
  assert.deepEqual([brief.local, brief.publication?.published, brief.returned], [true, null, false]);
  // T005: what the grant lets the run press itself; nothing without a grant.
  assert.deepEqual(brief.grant, { accept: true, close: true, publish: true });
  assert.deepEqual(runBrief({ ...done, authority: null }).grant, { accept: false, close: false, publish: false });
  assert.equal(runBrief({ ...done, phase: 'preparing', automationMissing: 1 }).returned, true);
  assert.equal(runNoticeState(done), 'completed (the result stays local: the plan has no publication)');
  assert.equal(COMPLETE_TEXTS.local, 'Результат остаётся локальным: публикация в плане не предусмотрена.');
  // A run of an older version blocked at «no-upstream» for such a plan ends at the next step (B001).
  const old = await setup({ phase: 'blocked', pausedFrom: 'publishing', reason: 'no-upstream', nextAction: COMPLETE_TEXTS.noUpstream, completion: { ci: null, publication: null, finalSha: FINAL } });
  old.kit.status = { ...old.kit.status, scope: 'NONE' };
  const ended = (await old.completer.advance('p'))!;
  assert.deepEqual([ended.phase, ended.reason, ended.nextAction, ended.completion?.local], ['completed', null, null, true]);
  // A plan with publication and a lost upstream still stops with its reason.
  const lost = await setup({ phase: 'blocked', pausedFrom: 'publishing', reason: 'no-upstream', completion: { ci: null, publication: PUB, finalSha: FINAL } });
  lost.kit.status = { ...lost.kit.status, scope: 'NONE' };
  assert.equal((await lost.completer.advance('p'))?.phase, 'blocked');
});
