import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { SESSION_VIEW_ASSETS_DIR, SESSION_VIEW_PREFIX, sessionViewMount } from '../src/index.ts';
import { activityView, choiceView, planView, reviewView, timer } from '../src/session-model.js';

function state(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    channel: {
      sessions: [
        { key: 'claude:s1', projectId: 'p', state: 'working', since: '2026-11-06T08:00:00Z', turnStartedAt: '2026-11-06T08:09:45Z', pending: 0, holdReason: null },
        { key: 'codex:t1', projectId: 'p', state: 'holding', since: '2026-11-06T08:05:00Z', pending: 1, holdReason: 'waiting-for-mode-choice' },
      ],
    },
    autopilot: { sessions: [{ key: 'claude:s1', last: { action: 'release', reason: 'paused', label: 'Пауза' } }] },
    workflow: {
      projects: {
        p: {
          execution: null,
          choice: {
            generation: 2,
            reason: 'Задача делится на независимые части',
            options: [
              { option: 'orchestrated', title: 'Оркестрация с исполнителями', description: 'd1', recommended: true, claudeOnly: true },
              { option: 'sequential', title: 'Выполнить самому, последовательно', description: 'd2', recommended: false, claudeOnly: false },
              { option: 'refine', title: 'Сначала доработать спецификацию', description: 'd3', recommended: false, claudeOnly: false },
            ],
          },
          plan: null,
        },
      },
    },
    review: { projects: { p: { visible: true, sessions: { 'claude:s1': true } } } },
    ...extra,
  };
}

const plan = {
  scopeId: 'sklad',
  mode: 'orchestrated',
  ownerSession: 's1',
  phase: 'running',
  phaseLabel: 'План выполняется',
  blockedReason: null,
  progress: { done: 1, total: 4 },
  progressLabel: 'в main 1 из 4',
  tasks: [
    { id: 'T001', title: 'Данные', state: 'done', stateLabel: 'В main', labelText: 'Последовательно', current: false, executorWorktree: null },
    { id: 'T002', title: 'Закупки', state: 'run', stateLabel: 'Выполняется', labelText: 'Параллельно', current: true, executorWorktree: '/w/2' },
  ],
  actions: ['pause'],
};

test('the mount serves the session view under /session-view/', async () => {
  assert.deepEqual(sessionViewMount(), { prefix: SESSION_VIEW_PREFIX, dir: SESSION_VIEW_ASSETS_DIR });
  const source = await readFile(path.join(SESSION_VIEW_ASSETS_DIR, 'session-view.js'), 'utf8');
  assert.match(source, /registerSlot\('sessionBody'/);
  assert.match(source, /registerSlot\('sessionReview'/);
  assert.match(source, /\/workflow\/\$\{route\}/);
  assert.match(source, /\/review`/);
  assert.doesNotMatch(source, /innerHTML/);
});

test('activity: working with the turn timer, holding with the reason, unknown sessions', () => {
  const working = activityView(state(), 'p', 'claude:s1');
  assert.deepEqual([working.state, working.who, working.text, working.since, working.detail], ['working', 'Агент', 'работает над ответом', '2026-11-06T08:09:45Z', 'Пауза']);
  const holding = activityView(state(), 'p', 'codex:t1');
  assert.deepEqual([holding.state, holding.text, holding.detail, holding.pending], ['holding', 'ждёт вашего решения в панели', 'Ждёт выбора пути', 1]);
  assert.equal(activityView(state(), 'p', 'claude:zz').state, 'unknown');
  const orchestrated = state();
  (orchestrated['workflow'] as any).projects.p.plan = plan;
  assert.equal(activityView(orchestrated, 'p', 'claude:s1').who, 'Оркестратор');
  assert.equal(timer('2026-11-06T08:09:45Z', Date.parse('2026-11-06T08:10:00Z')), '0:15');
  assert.equal(timer(null, 0), '');
});

test('the choice card goes to the holding session; Codex sessions get orchestration too', () => {
  const choice = choiceView(state(), 'p', 'codex:t1');
  assert.ok(choice);
  assert.equal(choice.generation, 2);
  assert.deepEqual(choice.options.map((o) => o.option), ['orchestrated', 'sequential', 'refine']);
  assert.equal(choiceView(state(), 'p', 'claude:s1'), null, 'another session holds the choice');
  const free = state({ channel: { sessions: [] } });
  assert.deepEqual(choiceView(free, 'p', 'claude:s1')?.options.map((o) => o.option), ['orchestrated', 'sequential', 'refine']);
});

test('the plan card belongs to the owner session and draws the actions of the phase', () => {
  const s = state();
  (s['workflow'] as any).projects.p.plan = plan;
  const view = planView(s, 'p', 'claude:s1');
  assert.ok(view);
  assert.equal(view.percent, 25);
  assert.equal(view.progressLabel, 'в main 1 из 4');
  assert.deepEqual(view.tasks.map((t) => [t.id, t.stateLabel, t.modeLabel, t.where, t.current]), [
    ['T001', 'В main', 'Последовательно', null, false],
    ['T002', 'Выполняется', 'Параллельно', 'исполнитель · своя рабочая копия', true],
  ]);
  assert.deepEqual(view.buttons.map((b) => [b.label, b.route]), [['Пауза', 'pause']]);
  assert.equal(planView(s, 'p', 'codex:t1'), null, 'not the owner');
  (s['workflow'] as any).projects.p.plan = { ...plan, phase: 'acceptance', actions: ['accept', 'request-fixes'] };
  assert.deepEqual(planView(s, 'p', 'claude:s1')?.buttons.map((b) => b.label), ['Принять план', 'Нужны исправления']);
  (s['autopilot'] as any).sessions[0].last.reason = 'delivery-confirmation';
  assert.equal(planView(s, 'p', 'claude:s1')?.delivery, true);
  assert.equal(planView(state(), 'p', 'claude:s1'), null, 'no plan yet');
});

test('«Ревью плана» shows the session value until the path is chosen', () => {
  assert.equal(reviewView(state(), 'p', 'claude:s1')?.on, true);
  assert.equal(reviewView(state(), 'p', 'codex:t1')?.on, false);
  assert.equal(reviewView(state({ review: { projects: { p: { visible: false, sessions: {} } } } }), 'p', 'claude:s1'), null);
  const chosen = state();
  (chosen['workflow'] as any).projects.p.execution = { strategy: 'sequential' };
  assert.equal(reviewView(chosen, 'p', 'claude:s1'), null);
  assert.equal(reviewView({}, 'p', 'claude:s1')?.on, false);
});
