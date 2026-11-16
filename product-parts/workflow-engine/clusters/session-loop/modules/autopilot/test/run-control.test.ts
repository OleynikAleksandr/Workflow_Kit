// M39 T007: pause, resume and stop of exactly one run, the agent's commands, the waits for CI and
// for an answer, and the recovery after a restart — with a scripted Kit and CI.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { CONTROL_TEXTS, RETRY_DELAYS_MS, WAIT_TEXTS, createRunControl, createRunJournal, createRunWaits, hostInputDigest } from '../src/index.ts';
import type { CiReadVerdict, NewRun, RunKit } from '../src/index.ts';

const tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-run-control-'));
after(() => rm(tmp, { recursive: true, force: true }));
let n = 0;
const KEY = 'claude:s-1';
const SHA = 'c'.repeat(40);
const CI = { remote: 'origin', branch: 'ci/auto', requiredChecks: ['Linux x64', 'Windows x64'], exactSha: true };
const authority = { grantRevision: 1, deliveryTaskIds: ['D1'], accept: true, close: true, publication: null, acceptancePolicy: 'automatic' as const, baseHead: 'h', revocation: null };

async function setup(over: Partial<NewRun> = {}) {
  const folder = path.join(tmp, `p${(n += 1)}`);
  const journal = createRunJournal();
  const run = await journal.create(folder, {
    projectId: 'p', owner: { key: KEY, client: 'claude', sessionId: 's-1' }, mode: 'after-start', review: false,
    request: { source: 'panel-start', quote: 'start', at: 'x', turnId: null, goal: 'g' }, proposal: null, scopeId: 'auto',
    authority, phase: 'executing', pausedFrom: null, reason: null, nextAction: null, ...over,
  });
  const calls: string[] = [];
  const sent: string[] = [];
  const kit = { grant: { runId: run.runId, revoked: null as unknown, ci: CI }, nextTask: { id: 'D1', kind: 'delivery', status: 'IN_PROGRESS' }, verdict: { state: 'pending', sha: SHA, missing: [], running: ['Linux x64'] } as CiReadVerdict, deferOk: true };
  const runKit = {
    status: async () => ({ revision: 7, head: 'h7', authorization: kit.grant, nextTask: kit.nextTask }),
    host: async (_root: string, step: { operation: string }) => (calls.push(step.operation), { ok: true, code: null, message: null, result: {}, ticketId: 't1', redeemed: true }),
    command: async (_root: string, args: string[]) => (calls.push(args.join(' ')), kit.deferOk ? { ok: true, result: {} } : { ok: false, code: 'DIRTY_TREE', message: 'dirty' }),
  } as unknown as RunKit;
  let clock = Date.parse('2026-11-16T10:00:00.000Z');
  const actions = { pause: async () => void calls.push('kit-pause'), resume: async (_p: string, session?: string) => (calls.push(`resume:${session}`), { owner: session! }), halt: () => void calls.push('halt') };
  const control = createRunControl({ journal, kit: runKit, projectPath: async () => folder, listProjects: async () => [{ id: 'p', path: folder }], actions: () => actions, activity: () => ({ state: 'waiting' }), send: (_p, _k, text) => void sent.push(text) });
  const waits = createRunWaits({ journal, kit: runKit, ci: { read: async () => kit.verdict }, projectPath: async () => folder, listProjects: async () => [{ id: 'p', path: folder }], send: (_p, _k, text) => void sent.push(text), now: () => new Date(clock) });
  const read = async () => (await journal.read(folder, run.runId))!;
  return { folder, journal, run, kit, calls, sent, control, waits, read, tick: (ms: number) => void (clock += ms) };
}

test('pause, resume and stop act on exactly the run and revision the panel shows', async () => {
  const t = await setup();
  await assert.rejects(t.control.pause('p', { runId: 'run-other1', expectedRevision: 1 }), { code: 'run-not-found' });
  await assert.rejects(t.control.pause('p', { runId: t.run.runId, expectedRevision: 9 }), (error: { code: string; details: { current: { revision: number } } }) => error.code === 'run-stale' && error.details.current.revision === 1);
  const paused = await t.control.pause('p', { runId: t.run.runId, expectedRevision: 1 });
  assert.deepEqual([paused.phase, paused.pausedFrom, paused.nextAction], ['paused', 'executing', CONTROL_TEXTS.paused]);
  assert.deepEqual(t.calls, ['kit-pause'], 'the barrier is written before Kit is asked');
  await t.control.resume('p', { runId: t.run.runId, expectedRevision: paused.revision });
  assert.deepEqual(t.calls.at(-1), `resume:${KEY}`);
  const stopped = await t.control.stop('p', { runId: t.run.runId, expectedRevision: (await t.read()).revision });
  assert.equal(stopped.phase, 'stopped');
  assert.deepEqual(stopped.authority?.revocation && [stopped.authority.revocation.reason, stopped.authority.revocation.resumable], ['user-stop', false]);
  assert.deepEqual(t.calls.slice(-2), ['halt', 'autopilot:revoke']);
  assert.deepEqual(stopped.tickets, ['t1']);
});

test('the agent pauses or stops only its own run; the old pause and the M24 stop set the barrier', async () => {
  const t = await setup();
  await assert.rejects(t.control.byOwner('p', 'codex:x', 'pause'), { code: 'not-owner' });
  await t.control.onPause('p', 'interrupted');
  assert.deepEqual([(await t.read()).phase, (await t.read()).reason], ['paused', 'interrupted']);
  const other = await setup();
  assert.equal((await other.control.byOwner('p', KEY, 'stop')).phase, 'stopped');
});

test('after a restart the idle owner gets one continuation per Kit state; an unreachable owner is named', async () => {
  const t = await setup();
  await t.control.recoverAll();
  await t.control.recoverAll();
  assert.deepEqual(t.sent, [CONTROL_TEXTS.recover(t.run.runId)]);
  const working = await setup();
  const busy = createRunControl({ journal: working.journal, kit: { status: async () => ({ revision: 1, head: 'h', authorization: working.kit.grant }) } as unknown as RunKit, projectPath: async () => working.folder, listProjects: async () => [{ id: 'p', path: working.folder }], actions: () => null, activity: () => ({ state: 'working' }), send: () => assert.fail('no parallel turn') });
  await busy.recoverAll();
  const lost = createRunControl({ journal: working.journal, kit: { status: async () => ({ revision: 1, head: 'h', authorization: working.kit.grant }) } as unknown as RunKit, projectPath: async () => working.folder, listProjects: async () => [{ id: 'p', path: working.folder }], actions: () => null, activity: () => undefined, unreachable: async () => 'сессия в архиве', send: () => assert.fail('no new session') });
  await lost.recoverAll();
  assert.match((await working.read()).reason ?? '', /owner-unreachable: сессия в архиве/u);
});

test('progress: only the owner, only the frozen CI policy; it records a wait, never a result', async () => {
  const t = await setup({ phase: 'delivering' });
  const input = { runId: t.run.runId, actionId: `ci:${SHA}`, stage: 'pushed', targetSha: SHA, ciPolicyDigest: hostInputDigest(CI), waitReason: 'CI of the ci/auto branch' };
  await assert.rejects(t.waits.progress('p', KEY, { ...input, targetSha: 'abc' }), { code: 'bad-request' });
  await assert.rejects(t.waits.progress('p', 'codex:x', input), { code: 'not-owner' });
  const fewer = hostInputDigest({ ...CI, requiredChecks: ['Linux x64'] });
  await assert.rejects(t.waits.progress('p', KEY, { ...input, ciPolicyDigest: fewer }), { code: 'ci-policy-mismatch' });
  const reply = await t.waits.progress('p', KEY, input);
  assert.match(reply.note, /no CI result/u);
  const run = await t.read();
  assert.deepEqual([run.phase, run.pausedFrom, run.wait?.sha], ['waiting', 'delivering', SHA]);
  await t.waits.pollAll();
  assert.equal((await t.read()).phase, 'waiting', 'a pending CI keeps the wait');
  t.kit.verdict = { state: 'success', sha: SHA, jobs: [{ name: 'Linux x64' }, { name: 'Windows x64' }] };
  await t.waits.pollAll();
  const green = await t.read();
  assert.deepEqual([green.phase, green.wait, green.receipts.at(-1)?.type], ['delivering', null, 'ci']);
  assert.equal(t.sent.at(-1), WAIT_TEXTS.green(t.run.runId, SHA, ['Linux x64', 'Windows x64']));
  await assert.rejects(t.waits.progress('p', KEY, input), { code: 'action-done' });
});

test('a red CI defers the started delivery and asks for a fixes round; without a started delivery the run blocks', async () => {
  const t = await setup({ phase: 'waiting', pausedFrom: 'delivering' });
  await t.journal.update(t.folder, t.run.runId, (r) => ({ ...r, wait: { reason: 'ci', since: 'x', sha: SHA, actionId: `ci:${SHA}`, detail: 'w' } }));
  t.kit.verdict = { state: 'failed', sha: SHA, failed: [{ name: 'Windows x64', conclusion: 'failure' }] };
  await t.waits.pollAll();
  assert.match(t.calls.at(-1)!, /^task:defer-delivery D1 --reason CI failed for c{40}: Windows x64: failure --outcome red CI of the pushed commit --expected-revision 7$/u);
  assert.equal((await t.read()).phase, 'executing');
  assert.match(t.sent.at(-1)!, /plan:extend/u);
  const idle = await setup({ phase: 'waiting', pausedFrom: 'delivering' });
  await idle.journal.update(idle.folder, idle.run.runId, (r) => ({ ...r, wait: { reason: 'ci', since: 'x', sha: SHA, detail: 'w' } }));
  idle.kit.verdict = t.kit.verdict;
  idle.kit.nextTask = { id: 'D1', kind: 'delivery', status: 'TODO' };
  await idle.waits.pollAll();
  assert.equal((await idle.read()).phase, 'blocked');
});

test('no gh blocks at once; a GitHub failure is retried 5/15/45 s, then blocks', async () => {
  const t = await setup({ phase: 'waiting', pausedFrom: 'delivering' });
  await t.journal.update(t.folder, t.run.runId, (r) => ({ ...r, wait: { reason: 'ci', since: 'x', sha: SHA, actionId: 'ci:1', detail: 'w' } }));
  t.kit.verdict = { state: 'unavailable', reason: 'HTTP 502', transient: true };
  for (const delay of RETRY_DELAYS_MS) {
    await t.waits.pollAll();
    await t.waits.pollAll(); // before the delay nothing is asked again
    t.tick(delay);
  }
  assert.equal((await t.read()).retries?.['ci:1']?.count, 3);
  await t.waits.pollAll();
  assert.match((await t.read()).reason ?? '', /^ci-unavailable: HTTP 502/u);
  const blocked = await setup({ phase: 'waiting', pausedFrom: 'delivering' });
  await blocked.journal.update(blocked.folder, blocked.run.runId, (r) => ({ ...r, wait: { reason: 'ci', since: 'x', sha: SHA, detail: 'w' } }));
  blocked.kit.verdict = { state: 'unavailable', reason: 'gh не авторизован' };
  await blocked.waits.pollAll();
  assert.equal((await blocked.read()).reason, 'ci-unavailable: gh не авторизован');
});

test('a question of the owner waits; the answer goes on, an expired hook needs data', async () => {
  const t = await setup();
  await t.waits.questionStarted('p', 'codex:x');
  assert.equal((await t.read()).wait, undefined, 'only the owner');
  await t.waits.questionStarted('p', KEY);
  assert.deepEqual([(await t.read()).phase, (await t.read()).wait?.reason], ['waiting', 'question']);
  await t.waits.questionEnded('p', KEY, 'answered');
  assert.deepEqual([(await t.read()).phase, (await t.read()).wait], ['executing', null]);
  await t.waits.questionStarted('p', KEY);
  await t.waits.questionEnded('p', KEY, 'expired');
  const run = await t.read();
  assert.deepEqual([run.phase, run.reason], ['blocked', 'question-expired']);
  assert.match(run.nextAction ?? '', new RegExp(WAIT_TEXTS.expired, 'u'));
});
