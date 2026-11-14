// Spec M31 3.4: the unstarted plan shows in every main session of the project.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { choiceView, foreignPlanView, planView } from '../src/session-model.js';

const PROPOSED = '2026-11-14T10:00:00.000Z';
const OLD = 'claude:old-1';
const NEW = 'codex:new-1';

function state(over: { plan?: Record<string, unknown> | null; channel?: unknown[]; titles?: Record<string, unknown>; reviews?: unknown[] } = {}): Record<string, unknown> {
  return {
    generatedAt: '2026-11-14T10:30:00.000Z',
    providers: {
      projects: { p: { claude: { sessions: [{ localId: 'old-1', title: 'Склад' }] }, codex: { sessions: [{ localId: 'new-1' }] } } },
    },
    channel: { sessions: over.channel ?? [
      { key: OLD, projectId: 'p', state: 'holding', holdReason: 'waiting-for-mode-choice', lastStopAt: '2026-11-14T10:01:00.000Z' },
      { key: NEW, projectId: 'p', state: 'waiting', holdReason: null },
    ] },
    workflow: {
      projects: {
        p: {
          proposal: over.plan ? null : { scopeId: 's1', createdAt: PROPOSED },
          choice: over.plan ? null : { generation: 1, reason: 'r', options: [{ option: 'sequential', title: 'Последовательно', recommended: true }] },
          execution: over.plan ? { strategy: 'sequential', ownerSession: 'old-1' } : null,
          plan: over.plan ?? null,
        },
      },
    },
    review: { projects: { p: { visible: true, sessions: { [OLD]: true, [NEW]: true } } } },
    reviews: { projects: { p: over.reviews ?? [{ mainKey: OLD, reviewerKey: 'codex:rev', scopeId: 's1', status: 'agreed', active: false }] } },
    titles: { projects: { p: over.titles ?? {} } },
  };
}

const ready = { scopeId: 's1', objective: 'Склад', ownerSession: 'old-1', phase: 'ready', phaseLabel: 'План готов', progress: { done: 0, total: 3 }, progressLabel: 'в main 0 из 3', tasks: [], actions: ['start'] };

test('the choice card of an open proposal shows in a new session and in the holder', () => {
  assert.equal(choiceView(state(), 'p', NEW)?.generation, 1);
  assert.equal(choiceView(state(), 'p', OLD)?.generation, 1);
  assert.equal(choiceView(state({ titles: { [NEW]: { archivedAt: '2026-11-14T10:10:00Z' } } }), 'p', NEW), null, 'an archived session shows no card');
  assert.equal(choiceView(state(), 'p', 'codex:rev'), null, 'the reviewer shows no card');
});

test('a working new session does not hide the choice card; a working author does', () => {
  const talking = state({ channel: [{ key: NEW, projectId: 'p', state: 'working', turnStartedAt: '2026-11-14T10:20:00.000Z' }] });
  assert.equal(choiceView(talking, 'p', NEW)?.generation, 1, 'the new turn did not write the proposal');
  const author = state({ channel: [{ key: OLD, projectId: 'p', state: 'working', turnStartedAt: '2026-11-14T09:50:00.000Z' }], reviews: [] });
  assert.equal(choiceView(author, 'p', NEW), null, 'the author may still bring a review');
});

test('the ready plan card with «Начать выполнение плана» shows in every main session', () => {
  const s = state({ plan: ready });
  assert.deepEqual(planView(s, 'p', NEW)?.buttons.map((b) => b.label), ['Начать выполнение плана']);
  assert.deepEqual(planView(s, 'p', OLD)?.buttons.map((b) => b.label), ['Начать выполнение плана']);
  assert.equal(planView(s, 'p', 'codex:rev'), null);
  assert.equal(planView(state({ plan: ready, titles: { [NEW]: { archivedAt: 'x' } } }), 'p', NEW), null);
  assert.equal(foreignPlanView(s, 'p', NEW), null, 'a ready plan is no foreign card');
});

test('a started plan stays with its owner; other sessions get the short card with «Открыть сессию»', () => {
  const running = { ...ready, phase: 'running', progress: { done: 1, total: 3 }, progressLabel: 'в main 1 из 3', actions: ['pause'] };
  const s = state({ plan: running });
  assert.equal(planView(s, 'p', NEW), null);
  assert.ok(planView(s, 'p', OLD));
  assert.deepEqual(foreignPlanView(s, 'p', NEW), {
    scopeId: 's1',
    objective: 'Склад',
    progressLabel: 'в main 1 из 3',
    percent: 33,
    ownerKey: OLD,
    ownerLine: 'План выполняет сессия «Склад»',
  });
  assert.equal(foreignPlanView(s, 'p', OLD), null, 'the owner sees its own card');
  const named = state({ plan: running, titles: { [OLD]: { name: 'План склада' } } });
  assert.equal(foreignPlanView(named, 'p', NEW)?.ownerLine, 'План выполняет сессия «План склада»');
  const gone = state({ plan: { ...running, ownerSession: 'lost' } });
  assert.deepEqual([foreignPlanView(gone, 'p', NEW)?.ownerKey, foreignPlanView(gone, 'p', NEW)?.ownerLine], [null, 'План выполняет другая сессия']);
});
