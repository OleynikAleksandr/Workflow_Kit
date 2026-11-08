import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { SESSION_VIEW_ASSETS_DIR, SESSION_VIEW_PREFIX, sessionViewMount } from '../src/index.ts';
import { activityView, choiceView, crossReviewView, planQuestionView, planView, reviewView, timer } from '../src/session-model.js';

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
  assert.match(source, /\/plan-decision`/);
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

test('«Ревью плана» shows the decided value until the path is chosen; undecided shows nothing', () => {
  assert.equal(reviewView(state(), 'p', 'claude:s1')?.on, true);
  assert.equal(reviewView(state(), 'p', 'codex:t1'), null, 'no decision yet');
  assert.equal(reviewView(state({ review: { projects: { p: { visible: false, sessions: {} } } } }), 'p', 'claude:s1'), null);
  const chosen = state();
  (chosen['workflow'] as any).projects.p.execution = { strategy: 'sequential' };
  assert.equal(reviewView(chosen, 'p', 'claude:s1'), null);
  assert.equal(reviewView({}, 'p', 'claude:s1'), null);
});

test('the cross review: card data for both sides; the choice and the toggle hide while it runs (M4)', () => {
  const review = {
    mainKey: 'claude:s1', reviewerKey: 'codex:r1', mainProvider: 'claude', reviewerProvider: 'codex', mainTitle: 'План склада', scopeId: 's1',
    status: 'answering', statusLabel: 'агент отвечает на замечания', active: true, round: 2, maxRounds: 5, reason: null, updatedAt: '2026-11-08T10:00:00Z',
    entries: [{ from: 'reviewer', round: 1, text: 'замечание', at: 'a' }, { from: 'main', round: 1, text: 'исправил', at: 'b' }, { from: 'reviewer', round: 2, text: 'ещё', at: 'c' }],
  };
  const base = {
    workflow: { projects: { p: { choice: { generation: 1, reason: 'r', options: [{ option: 'sequential', title: 'Сам', description: '' }] }, proposal: { scopeId: 's1' } } } },
    review: { projects: { p: { visible: true, sessions: { 'claude:s1': true } } } },
    channel: { sessions: [] },
  };
  const st = { ...base, reviews: { projects: { p: [review] } } };
  const main = crossReviewView(st, 'p', 'claude:s1')!;
  assert.equal(main.role, 'main');
  assert.equal(main.turn, 'отвечает агент (Claude)');
  assert.equal(main.reviewerName, 'ChatGPT');
  assert.deepEqual(main.entries.map((e) => e.who), ['Ревьюер (ChatGPT)', 'Агент (Claude)', 'Ревьюер (ChatGPT)']);
  assert.equal(crossReviewView(st, 'p', 'codex:r1')!.role, 'reviewer');
  const preparing = { ...st, reviews: { projects: { p: [{ ...review, status: 'preparing', reviewerKey: null, round: 0, entries: [] }] } } };
  assert.equal(crossReviewView(preparing, 'p', 'claude:s1')!.turn, 'агент (Claude) описывает план', 'M4 11.2');
  assert.equal(choiceView(preparing, 'p', 'claude:s1'), null, 'no mode choice while the plan is described');
  assert.equal(crossReviewView(st, 'p', 'claude:other'), null);
  assert.equal(choiceView(st, 'p', 'claude:s1'), null, 'no mode choice while the review runs');
  assert.equal(reviewView(st, 'p', 'claude:s1'), null, 'the toggle is gone while the review runs');
  assert.equal(reviewView(st, 'p', 'codex:r1'), null, 'a reviewer has no toggle');
  const done = { ...st, reviews: { projects: { p: [{ ...review, status: 'agreed', statusLabel: 'ревьюер и агент согласны', active: false }] } } };
  assert.ok(choiceView(done, 'p', 'claude:s1'), 'the choice comes after the agreement');
  assert.equal(reviewView(done, 'p', 'claude:s1'), null, 'the reviewed plan keeps no toggle');
  assert.equal(choiceView(done, 'p', 'codex:r1'), null, 'the reviewer gets no choice card');
  const later = { ...done, workflow: { projects: { p: { proposal: { scopeId: 's2' } } } } };
  assert.ok(reviewView(later, 'p', 'claude:s1'), 'a later plan shows the toggle again');
  assert.ok(reviewView(base, 'p', 'claude:s1'));
});

test('the choice card waits for the plan review while the toggled session still works (M4 11.3)', () => {
  const st = {
    workflow: { projects: { p: { choice: { generation: 1, reason: 'r', options: [{ option: 'sequential', title: 'Сам', description: '' }] }, proposal: { scopeId: 's1' } } } },
    review: { projects: { p: { visible: true, sessions: { 'claude:s1': true } } } },
    channel: { sessions: [{ key: 'claude:s1', projectId: 'p', state: 'working' }] },
    reviews: { projects: { p: [] } },
  };
  assert.match(choiceView(st, 'p', 'claude:s1')!.waiting ?? '', /Сначала ревью плана/);
  const idle = { ...st, channel: { sessions: [{ key: 'claude:s1', projectId: 'p', state: 'waiting' }] } };
  assert.equal(choiceView(idle, 'p', 'claude:s1')!.waiting, null);
  const off = { ...st, review: { projects: { p: { visible: true, sessions: { 'claude:s1': false } } } } };
  assert.equal(choiceView(off, 'p', 'claude:s1')!.waiting, null);
  const reviewed = { ...st, reviews: { projects: { p: [{ mainKey: 'claude:s1', scopeId: 's1', status: 'agreed', active: false }] } } };
  assert.equal(choiceView(reviewed, 'p', 'claude:s1')!.waiting, null);
});

test('the plan question card: agent question with three answers, proposal question with two; the choice waits (M4 12)', () => {
  const st = {
    workflow: { projects: { p: { choice: { generation: 1, reason: 'r', options: [{ option: 'sequential', title: 'Сам', description: '' }] }, proposal: { scopeId: 's1' } } } },
    review: { projects: { p: { visible: true, sessions: {}, questions: { 'claude:s1': { kind: 'agent', summary: 'Склад: две команды', askedAt: '2026-11-08T12:00:00Z' } } } } },
    channel: { sessions: [] },
    reviews: { projects: { p: [] } },
  };
  const card = planQuestionView(st, 'p', 'claude:s1')!;
  assert.equal(card.heading, 'Агент предлагает спецификацию и план');
  assert.equal(card.summary, 'Склад: две команды');
  assert.deepEqual(card.options.map((o) => o.choice), ['review', 'plan', 'talk']);
  assert.equal(planQuestionView(st, 'p', 'claude:other'), null);
  assert.equal(choiceView(st, 'p', 'claude:s1'), null, 'the mode choice waits for the answer');
  const proposal = { ...st, review: { projects: { p: { visible: true, sessions: {}, questions: { 'claude:s1': { kind: 'proposal', summary: '', askedAt: 'x' } } } } } };
  assert.deepEqual(planQuestionView(proposal, 'p', 'claude:s1')!.options.map((o) => o.choice), ['review', 'plan']);
  const undecided = { ...st, review: { projects: { p: { visible: true, sessions: {}, questions: {} } } }, channel: { sessions: [{ key: 'claude:s1', projectId: 'p', state: 'working' }] } };
  assert.match(choiceView(undecided, 'p', 'claude:s1')!.waiting ?? '', /Сначала ревью/, 'an undecided working session will be asked at its Stop');
});

