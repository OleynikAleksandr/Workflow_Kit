// M44 T003: Settings and run changes queued for the agent (no wake): the owner of the active run
// and the owner session of an open plan get «settings changed»; the owner gets «autopilot run <id>:
// <state>» for a grant, a pause, a block, a stop and the end; the same line is not queued twice.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { NOTICE_TEXTS, createAgentNotices, createRunJournal, runNoticeState } from '../src/index.ts';
import type { NewRun, RunKit, RunRecord, SettingsChange } from '../src/index.ts';

const tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-notices-'));
after(() => rm(tmp, { recursive: true, force: true }));
const KEY = 'claude:s-1';
const AUTHORITY = { grantRevision: 1, acceptancePolicy: 'manual', revocation: null } as unknown as RunRecord['authority'];

const newRun = (over: Partial<NewRun> = {}): NewRun => ({
  projectId: 'p1', owner: { key: KEY, client: 'claude', sessionId: 's-1' }, mode: 'full', review: false,
  request: { source: 'user-command', quote: 'да', at: '2026-11-18T10:00:00.000Z', turnId: null, goal: 'g' },
  proposal: null, scopeId: 'auto', authority: null, phase: 'starting', pausedFrom: null, reason: null, nextAction: null, ...over,
});

async function setup(options: { scope?: 'ACTIVE' | 'NONE'; owner?: string | null; sessions?: string[] } = {}) {
  const folder = await mkdtemp(path.join(tmp, 'p-'));
  const journal = createRunJournal();
  const queued: Array<[string, string, string]> = [];
  let listener: ((change: SettingsChange) => Promise<void> | void) | null = null;
  const kit = {
    status: async () => ({ scope: options.scope ?? 'ACTIVE' }),
    scope: async () => ({ id: 'auto', ownerSession: options.owner === undefined ? 's-2' : options.owner, automation: null }),
  } as unknown as RunKit;
  const notices = createAgentNotices({
    journal, kit,
    settings: { onChange: (l) => ((listener = l), () => (listener = null)) },
    listProjects: async () => [{ id: 'p1', path: folder }],
    sessions: () => options.sessions ?? ['codex:s-2', 'claude:s-3'],
    enqueue: (projectId, key, text) => void queued.push([projectId, key, text]),
  });
  const change = (before: Partial<SettingsChange['after']>, afterValue: Partial<SettingsChange['after']>) =>
    listener!({ before: { version: 1, revision: 1, mode: 'full', review: false, ...before } as SettingsChange['before'], after: { version: 1, revision: 2, mode: 'full', review: false, ...afterValue } as SettingsChange['after'] });
  return { folder, journal, queued, change, notices };
}

test('the state of a run the agent is told about', () => {
  const run = (over: Partial<RunRecord>) => ({ runId: 'r', phase: 'executing', reason: null, authority: null, manualAcceptance: null, ...over }) as RunRecord;
  assert.equal(runNoticeState(run({ phase: 'starting' })), null, 'the preparation is no news');
  assert.equal(runNoticeState(run({})), null, 'a run without the grant is not «authorized»');
  assert.equal(runNoticeState(run({ authority: AUTHORITY })), 'authorized: the Kit grant is live');
  assert.equal(runNoticeState(run({ authority: AUTHORITY, phase: 'delivering', manualAcceptance: { head: 'h', reason: 'x', since: 'y' } })), "authorized; waiting for the user's acceptance");
  assert.equal(runNoticeState(run({ phase: 'blocked', reason: 'authorization-missing: AUTOPILOT_PLAN_CHANGED: x' })), 'blocked (authorization-missing: AUTOPILOT_PLAN_CHANGED: x)');
  assert.equal(runNoticeState(run({ phase: 'blocked', reason: 'Ревью плана не согласовано' })), 'blocked (see the Workflow Kit panel)');
  assert.equal(runNoticeState(run({ phase: 'paused' })), 'paused');
  assert.equal(runNoticeState(run({ phase: 'stopped', reason: 'user-stop' })), 'stopped (user-stop)');
  assert.equal(runNoticeState(run({ phase: 'completed' })), 'completed (published)');
  assert.equal(runNoticeState(run({ phase: 'finished' })), 'finished (the plan was closed)');
});

test('run changes are queued for the owner once per state', async () => {
  const t = await setup();
  const run = await t.journal.create(t.folder, newRun());
  await t.journal.update(t.folder, run.runId, (r) => ({ ...r, phase: 'executing', authority: AUTHORITY }));
  await t.journal.update(t.folder, run.runId, (r) => ({ ...r, phase: 'delivering' }));
  await t.journal.update(t.folder, run.runId, (r) => ({ ...r, phase: 'blocked', reason: 'agent-no-progress' }));
  await t.journal.update(t.folder, run.runId, (r) => ({ ...r, phase: 'stopped', reason: 'user-stop' }));
  assert.deepEqual(t.queued.map(([, key, text]) => [key, text]), [
    [KEY, NOTICE_TEXTS.run(run.runId, 'authorized: the Kit grant is live')],
    [KEY, NOTICE_TEXTS.run(run.runId, 'blocked (agent-no-progress)')],
    [KEY, NOTICE_TEXTS.run(run.runId, 'stopped (user-stop)')],
  ]);
  assert.ok(t.queued.every(([, , text]) => /^[\x20-\x7e]+$/u.test(text)), 'ASCII only');
});

test('a Settings change reaches the run owner and the owner of an open plan, once; an unchanged one nothing', async () => {
  const t = await setup();
  await t.journal.create(t.folder, newRun());
  await t.change({}, { mode: 'full', review: false });
  assert.equal(t.queued.length, 0, 'nothing changed');
  await t.change({ mode: 'full' }, { mode: 'after-start' });
  const text = NOTICE_TEXTS.settings({ mode: 'after-start', review: false });
  assert.equal(text, 'Workflow Kit: settings changed: autopilot mode=after-start, review=off.');
  assert.deepEqual(t.queued.map(([, key, line]) => [key, line]), [[KEY, text], ['codex:s-2', text]], 'claude:s-3 owns no plan');
  await t.change({ mode: 'full' }, { mode: 'after-start' });
  assert.equal(t.queued.length, 2, 'the same line is not queued twice');
  // No open plan: only the run owner.
  const closed = await setup({ scope: 'NONE' });
  await closed.change({ review: false }, { review: true });
  assert.deepEqual(closed.queued, [], 'no run and no open plan: nobody to tell');
});
