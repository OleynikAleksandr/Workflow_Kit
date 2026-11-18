// M44 T001: the grant of a run with a scripted Kit — a refusal is logged and keeps its cause, a
// second block keeps the phase the run came from, and «Продолжить» of a run whose chosen plan
// never got the grant asks Kit again (it used to put the run back to work without a grant).
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { SUPPORTED_HOST_PROTOCOL } from '#plan-view';
import { createHostTickets, createRunJournal, createRuns, createSettingsStore } from '../src/index.ts';
import type { HostStep, RunKit, RunKitStatus } from '../src/index.ts';

const tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-runs-grant-'));
after(() => rm(tmp, { recursive: true, force: true }));
const CAPABILITY = { authorization: true, automation: true, complete: true, deferDelivery: true, hostProtocol: SUPPORTED_HOST_PROTOCOL, instructions: true };
const KEY = 'claude:s-1';
const AUTOMATION = {
  acceptance: [{ criterion: 0, kind: 'automatic', checks: [], evidence: [] }, { criterion: 1, kind: 'manual', checks: [], evidence: [] }],
  delivery: [{ taskId: 'D1', effects: ['install'] }],
  ci: null,
  publication: { branch: 'main', upstream: 'origin/main' },
};
let n = 0;

async function setup(answers: HostStep[]) {
  const dir = path.join(tmp, `p${(n += 1)}`);
  await mkdir(path.join(dir, 'config'), { recursive: true });
  const settings = createSettingsStore({ configDir: path.join(dir, 'config') });
  await settings.write({ expectedRevision: 0, mode: 'full', review: false });
  const inputs: Array<Record<string, unknown>> = [];
  const lines: string[] = [];
  const kit = {
    status: async () => ({ revision: 3, head: 'abc', capability: CAPABILITY, proposal: { generation: 1, digest: 'd1' }, authorization: null, acceptance: [{ criterion: 0, kind: 'automatic' }, { criterion: 1, kind: 'manual' }] }) as unknown as RunKitStatus,
    supported: () => ({ ready: true }),
    scope: async () => ({ id: 'auto', ownerSession: 's-1', automation: AUTOMATION }),
    host: async (_root: string, step: { input: Record<string, unknown> }) => {
      inputs.push(step.input);
      return answers.shift() ?? assert.fail('no more host steps');
    },
  } as unknown as RunKit;
  const journal = createRunJournal();
  const runs = createRuns({
    settings, journal, kit, tickets: createHostTickets(),
    userSource: () => null,
    projectPath: async (id) => (id === 'p1' ? dir : undefined),
    listProjects: async () => [{ id: 'p1', path: dir }],
    log: (line) => lines.push(line),
  });
  const run = await journal.create(dir, {
    projectId: 'p1', owner: { key: KEY, client: 'claude', sessionId: 's-1' }, mode: 'full', review: false,
    request: { source: 'user-command', quote: 'Сделай заметку', at: 'x', turnId: null, goal: 'g' }, proposal: null, scopeId: 'auto',
    authority: null, phase: 'starting', pausedFrom: null, reason: null, nextAction: null,
  });
  return { runs, journal, dir, run, inputs, lines };
}

const refused: HostStep = { ok: false, code: 'AUTOPILOT_MANUAL_REQUIRED', message: 'Acceptance criteria 2 need the user\'s manual check.', result: null, ticketId: 't1', redeemed: true };
const written: HostStep = { ok: true, code: null, message: null, result: { grant: { revision: 1 }, commit: { sha: 'c0ffee' } }, ticketId: 't2', redeemed: true };

test('a refused grant is logged, blocks once with the Kit code and keeps the phase the run came from', async () => {
  const { runs, journal, dir, run, inputs, lines } = await setup([refused]);
  await assert.rejects(runs.beginExecution('p1', KEY), (error: unknown) => (error as { code?: string }).code === 'AUTOPILOT_MANUAL_REQUIRED');
  const blocked = (await journal.read(dir, run.runId))!;
  assert.deepEqual([blocked.phase, blocked.pausedFrom, blocked.reason, blocked.authority], ['blocked', 'starting', `AUTOPILOT_MANUAL_REQUIRED: ${refused.message}`, null]);
  assert.ok(lines.some((line) => line === `autopiloting: ${run.runId} grant refused for scope auto: AUTOPILOT_MANUAL_REQUIRED: ${refused.message}`), lines.join('\n'));
  // The service asks for the manual acceptance of a full run (Kit 2.4.6 grants it).
  assert.deepEqual([inputs[0]?.['mode'], inputs[0]?.['accept'], inputs[0]?.['acceptancePolicy']], ['full', false, 'manual']);
});

test('«Продолжить» of a run that never got the grant asks Kit again and starts it with the grant', async () => {
  const { runs, journal, dir, run, inputs, lines } = await setup([refused, written]);
  await assert.rejects(runs.beginExecution('p1', KEY));
  const resumed = await runs.resume('p1', KEY);
  assert.equal(resumed?.runId, run.runId);
  const after = (await journal.read(dir, run.runId))!;
  assert.deepEqual([after.phase, after.reason, after.authority?.acceptancePolicy, after.authority?.grantRevision], ['executing', null, 'manual', 1]);
  assert.ok(after.receipts.some((r) => r.type === 'authorize'));
  assert.equal(inputs.length, 2, 'Kit was asked again');
  assert.notEqual(inputs[1]?.['source'], 'panel-resume', 'a resume is only for a granted run in Kit');
  assert.ok(lines.some((line) => line.startsWith(`autopiloting: ${run.runId} grant written for scope auto: revision 1`)), lines.join('\n'));
});

test('a second refusal on «Продолжить» keeps the run blocked with the new cause and the first phase', async () => {
  const { runs, journal, dir, run } = await setup([refused, { ...refused, code: 'AUTOPILOT_PLAN_CHANGED', message: 'The digest differs.' }]);
  await assert.rejects(runs.beginExecution('p1', KEY));
  await assert.rejects(runs.resume('p1', KEY), (error: unknown) => (error as { code?: string }).code === 'AUTOPILOT_PLAN_CHANGED');
  const blocked = (await journal.read(dir, run.runId))!;
  assert.deepEqual([blocked.phase, blocked.pausedFrom, blocked.reason], ['blocked', 'starting', 'AUTOPILOT_PLAN_CHANGED: The digest differs.']);
});

test('M44 T004: «Повторить» of a working run without the grant asks Kit; a granted run is not asked again; a stale card is refused', async () => {
  const { runs, journal, dir, run, inputs } = await setup([written]);
  await journal.update(dir, run.runId, (r) => ({ ...r, phase: 'executing' }));
  const current = (await journal.read(dir, run.runId))!;
  await assert.rejects(runs.retryGrant('p1', { runId: run.runId, expectedRevision: current.revision - 1 }), (error: unknown) => (error as { code?: string }).code === 'run-stale');
  await assert.rejects(runs.retryGrant('p1', { runId: 'run-other', expectedRevision: current.revision }), (error: unknown) => (error as { code?: string }).code === 'run-not-found');
  const granted = await runs.retryGrant('p1', { runId: run.runId, expectedRevision: current.revision });
  assert.deepEqual([granted.phase, granted.authority?.grantRevision, inputs.length], ['executing', 1, 1]);
  const section = (await runs.section()).projects['p1'];
  assert.equal(section?.authorized, true, 'the panel brief says the grant is there');
  const again = await runs.retryGrant('p1', { runId: run.runId, expectedRevision: granted.revision });
  assert.deepEqual([again.already, inputs.length], [true, 1]);
});
