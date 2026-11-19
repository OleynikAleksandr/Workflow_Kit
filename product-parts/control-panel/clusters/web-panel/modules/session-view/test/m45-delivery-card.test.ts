// M45 T003: in a `host` project the plan card asks for «Подтвердить выпуск» whenever the next task
// is a delivery not started and no granted run confirms it — also with the autopilot of the session
// switched off (it records no turn decision then; M44 «Нет в панели никаких способов подтверждения»).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deliveryWaits } from '../src/plan-cards.js';
import { planView } from '../src/session-model.js';

const KEY = 'claude:s1';
const tasks = (delivery: string, before = 'DONE') => [
  { id: 'T001', title: 'Код', kind: 'work', status: before, state: 'done' },
  { id: 'T002', title: 'Выпуск', kind: 'delivery', status: delivery, state: 'run', current: true },
];
function state(over: { mode?: string; phase?: string; delivery?: string; before?: string; run?: Record<string, unknown> | null; last?: string | null } = {}) {
  const plan = { scopeId: 'S1', ownerSession: 's1', phase: over.phase ?? 'running', phaseLabel: 'Выполняется', progress: { done: 1, total: 2 }, tasks: tasks(over.delivery ?? 'TODO', over.before), actions: ['pause'] };
  return {
    workflow: { projects: { p: { decisionsMode: over.mode ?? 'host', plan } } },
    autopiloting: { projects: over.run ? { p: over.run } : {} },
    autopilot: { sessions: [{ key: KEY, enabled: false, last: over.last ? { reason: over.last } : null }] },
    reviews: { projects: { p: [] } },
  } as Record<string, unknown>;
}
const plan = (s: Record<string, unknown>) => (s['workflow'] as any).projects.p.plan;

test('the card shows with the autopilot of the session off when the next task is a delivery in TODO', () => {
  const s = state();
  assert.equal(deliveryWaits(s, 'p', plan(s)), true);
  assert.equal(planView(s, 'p', KEY)?.delivery, true);
});

test('no card for a started delivery, a work task next, a plan not running, an agent project or a granted run', () => {
  for (const s of [
    state({ delivery: 'IN_PROGRESS' }),
    state({ before: 'TODO' }),
    state({ phase: 'paused' }),
    state({ phase: 'acceptance' }),
    state({ mode: 'agent' }),
    state({ run: { authorized: true, phase: 'executing' } }),
    state({ run: { authorized: true, phase: 'delivering' } }),
  ]) assert.equal(deliveryWaits(s, 'p', plan(s)), false, JSON.stringify((s['workflow'] as any).projects.p.plan.phase));
});

test('a run without the Kit grant does not confirm the delivery: the card shows', () => {
  const s = state({ run: { authorized: false, phase: 'executing' } });
  assert.equal(deliveryWaits(s, 'p', plan(s)), true);
});

test('the turn decision of the session still shows the card as before', () => {
  const s = state({ mode: 'agent', last: 'delivery-confirmation' });
  assert.equal(planView(s, 'p', KEY)?.delivery, true);
});
