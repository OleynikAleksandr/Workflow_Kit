// M39: one stop logic in the Kit core (workflow-autopilot) and in the service port (decide.ts).
// The same matrix of inputs goes through both; the decisions must be equal. The core file has only
// type imports, so the test loads its source directly (a check of the port, not a dependency).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decideAutopilot as core } from '../../../../../../kit-core/clusters/project-workflow/modules/workflow-autopilot/src/autopilot-decision.ts';
import { decideAutopilot as port } from '../src/index.ts';
import type { AutopilotOrchestration, AutopilotProjectStatus, AutopilotState, AutopilotTurn } from '../src/index.ts';

const grant = (over: Record<string, unknown> = {}) => ({ runId: 'run-1', accept: true, close: true, delivery: [{ taskId: 'D1' }], proposalDigest: 'p', revoked: null, ...over });
const base: AutopilotProjectStatus = {
  blockedReason: null, delivery: 'IN_PROGRESS', head: 'h2', nextTask: { id: 'T2', kind: 'work', status: 'TODO', title: 't' },
  orchestration: null, paused: false, proposalPending: false, revision: 5, scope: 'ACTIVE', transactionPending: false,
};
const delivery = { id: 'D1', kind: 'delivery', status: 'TODO' as const, title: 'release' };
const orchestration = (over: Partial<AutopilotOrchestration> = {}): AutopilotOrchestration => ({ assignments: [], integration: null, readyTasks: [], ...over });
const state: AutopilotState = { enabled: true, continues: 0, maxContinues: 40, orchestrationKey: null };
const turn: AutopilotTurn = { before: { head: 'h1', revision: 4 }, outcome: 'completed', userMessage: false };

const cases: Array<[string, Partial<AutopilotProjectStatus>, Partial<AutopilotState>?, Partial<AutopilotTurn>?]> = [
  ['work task continues', {}],
  ['delivery without a grant waits for the user', { nextTask: delivery }],
  ['delivery granted in advance', { nextTask: delivery, authorization: grant(), proposal: { digest: 'p' } }],
  ['delivery: revoked grant', { nextTask: delivery, authorization: grant({ revoked: { reason: 'settings-off' } }), proposal: { digest: 'p' } }],
  ['delivery: grant of another proposal', { nextTask: delivery, authorization: grant(), proposal: { digest: 'other' } }],
  ['delivery: task not in the grant', { nextTask: { ...delivery, id: 'D2' }, authorization: grant(), proposal: { digest: 'p' } }],
  ['ready for acceptance, accept granted', { delivery: 'READY_FOR_ACCEPTANCE', nextTask: null, authorization: grant(), proposal: { digest: 'p' } }],
  ['ready for acceptance, manual criterion', { delivery: 'READY_FOR_ACCEPTANCE', nextTask: null, authorization: grant({ accept: false }), proposal: { digest: 'p' } }],
  ['accepted, close granted', { delivery: 'ACCEPTED', nextTask: null, authorization: grant(), proposal: { digest: 'p' } }],
  ['accepted without a grant', { delivery: 'ACCEPTED', nextTask: null }],
  ['no progress', { revision: 4, head: 'h1' }],
  ['limit', {}, { continues: 40 }],
  ['user message', {}, {}, { userMessage: true }],
  ['paused', { paused: true }],
  ['proposal pending', { proposalPending: true }],
  ['blocked scope', { scope: 'BLOCKED', blockedReason: 'why' }],
  ['transaction pending', { transactionPending: true }],
  ['orchestration: granted delivery when idle', { nextTask: delivery, authorization: grant(), proposal: { digest: 'p' }, orchestration: orchestration() }],
  ['orchestration: delivery waits for executors', { nextTask: delivery, authorization: grant(), proposal: { digest: 'p' }, orchestration: orchestration({ assignments: [{ id: 'a', taskId: 'T3', status: 'RUNNING' }] as never }) }],
  ['orchestration: delivery without a grant', { nextTask: delivery, orchestration: orchestration() }],
  ['orchestration: ready tasks', { orchestration: orchestration({ readyTasks: ['T2', 'T3'] }) }],
];

test('the service port decides like the Kit core on the shared matrix', () => {
  for (const [name, status, over = {}, turnOver = {}] of cases) {
    const input = [{ ...state, ...over }, { ...base, ...status }, { ...turn, ...turnOver }] as const;
    assert.deepEqual(port(...input), core(...(input as unknown as Parameters<typeof core>)), name);
  }
});

test('the matrix covers the M39 transitions', () => {
  const reasons = cases.map(([, status, over = {}, turnOver = {}]) => port({ ...state, ...over }, { ...base, ...status }, { ...turn, ...turnOver }));
  const texts = reasons.map((d) => (d.action === 'continue' ? d.text : d.reason));
  assert.ok(texts.some((t) => /--autopilot-run run-1/u.test(t)));
  assert.equal(texts.filter((t) => t === 'host-transition').length, 2);
});
