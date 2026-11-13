import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { SESSION_VIEW_ASSETS_DIR, SESSION_VIEW_PREFIX, sessionViewMount } from '../src/index.ts';
import { activityView, choiceView, crossReviewView, planQuestionView, planView, reviewView, reviewerChatLinks, timer } from '../src/session-model.js';

/** The "providers" section as the service reports it: the panel takes the names from it. */
const PROVIDERS = { providers: [{ id: 'codex', title: 'ChatGPT (Codex)', label: 'ChatGPT' }, { id: 'claude', title: 'Claude', label: 'Claude' }, { id: 'kimi', title: 'Kimi Code' }] };

function state(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    providers: PROVIDERS,
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
  assert.match(source, /installSidebarSlot\(shell/);
  const sidebar = await readFile(path.join(SESSION_VIEW_ASSETS_DIR, 'sidebar-view.js'), 'utf8');
  assert.match(sidebar, /registerSlot\('sessionSidebar'/);
  assert.match(source, /registerSlot\('sessionReview'/);
  assert.match(source, /\/workflow\/\$\{route\}/);
  assert.match(source, /\/plan-decision`/);
  assert.doesNotMatch(source, /innerHTML/);
});

test('activity: working with the turn timer, holding with the reason, unknown sessions', () => {
  const working = activityView(state(), 'p', 'claude:s1');
  assert.deepEqual([working.state, working.who, working.text, working.since, working.detail], ['working', 'Агент', 'работает над ответом', '2026-11-06T08:09:45Z', null], 'a stale autopilot label is not shown');
  const holding = activityView(state(), 'p', 'codex:t1');
  assert.deepEqual([holding.state, holding.text, holding.detail, holding.pending], ['holding', 'ждёт, когда вы выберете путь в карточке выше', null, 1]);
  assert.equal(activityView(state(), 'p', 'claude:zz').state, 'unknown');
  const orchestrated = state();
  (orchestrated['workflow'] as any).projects.p.plan = plan;
  assert.equal(activityView(orchestrated, 'p', 'claude:s1').who, 'Оркестратор');
  assert.equal(timer('2026-11-06T08:09:45Z', Date.parse('2026-11-06T08:10:00Z')), '0:15');
  assert.equal(timer(null, 0), '');
});

test('the choice card goes to the holding session; Codex sessions get orchestration too', () => {
  // claude:s1 works without the plan review: nothing is ahead of the choice.
  const noReview = { review: { projects: { p: { visible: true, sessions: { 'claude:s1': false } } } } };
  assert.equal(choiceView(state(), 'p', 'codex:t1'), null, 'the review of the working claude:s1 is ahead (M7 remark 3)');
  const choice = choiceView(state(noReview), 'p', 'codex:t1');
  assert.ok(choice);
  assert.equal(choice.generation, 2);
  assert.deepEqual(choice.options.map((o) => o.option), ['orchestrated', 'sequential', 'refine']);
  assert.equal(choiceView(state(noReview), 'p', 'claude:s1'), null, 'another session holds the choice');
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
    providers: PROVIDERS,
  };
  const st = { ...base, reviews: { projects: { p: [review] } } };
  const main = crossReviewView(st, 'p', 'claude:s1')!;
  assert.equal(main.role, 'main');
  assert.equal(main.turn, 'отвечает агент (Claude)');
  assert.equal(main.reviewerName, 'ChatGPT');
  assert.match(main.note ?? '', /Ревью идёт само/, 'M4 13.3');
  assert.equal(main.canOpenOther, false, 'the reviewer chat is never offered (M4 13.4)');
  assert.equal(crossReviewView(st, 'p', 'codex:r1')!.canOpenOther, true, 'the reviewer may open the main session');
  assert.deepEqual(main.entries.map((e) => e.who), ['Ревьюер (ChatGPT)', 'Агент (Claude)', 'Ревьюер (ChatGPT)']);
  assert.equal(crossReviewView(st, 'p', 'codex:r1')!.role, 'reviewer');
  const preparing = { ...st, reviews: { projects: { p: [{ ...review, status: 'preparing', reviewerKey: null, round: 0, entries: [] }] } } };
  assert.equal(crossReviewView(preparing, 'p', 'claude:s1')!.turn, 'агент (Claude) описывает план', 'M4 11.2');
  assert.equal(choiceView(preparing, 'p', 'claude:s1'), null, 'no mode choice while the plan is described');
  assert.equal(crossReviewView(st, 'p', 'claude:other'), null);
  const kimi = crossReviewView({ ...st, reviews: { projects: { p: [{ ...review, reviewerProvider: 'kimi', mainProvider: 'none' }] } } }, 'p', 'claude:s1')!;
  assert.deepEqual([kimi.reviewerName, kimi.turn], ['Kimi Code', 'отвечает агент (агент)'], 'names come from the state: the title without a label, a neutral word for an unknown id');
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

test('the choice card is hidden while the plan review is ahead of the toggled working session (M4 11.3, M7 remark 3)', () => {
  const st = {
    workflow: { projects: { p: { choice: { generation: 1, reason: 'r', options: [{ option: 'sequential', title: 'Сам', description: '' }] }, proposal: { scopeId: 's1' } } } },
    review: { projects: { p: { visible: true, sessions: { 'claude:s1': true } } } },
    channel: { sessions: [{ key: 'claude:s1', projectId: 'p', state: 'working' }] },
    reviews: { projects: { p: [] } },
  };
  assert.equal(choiceView(st, 'p', 'claude:s1'), null, 'no card without buttons');
  const idle = { ...st, channel: { sessions: [{ key: 'claude:s1', projectId: 'p', state: 'waiting' }] } };
  assert.equal(choiceView(idle, 'p', 'claude:s1')!.options.length, 1);
  const off = { ...st, review: { projects: { p: { visible: true, sessions: { 'claude:s1': false } } } } };
  assert.ok(choiceView(off, 'p', 'claude:s1'));
  const reviewed = { ...st, reviews: { projects: { p: [{ mainKey: 'claude:s1', scopeId: 's1', status: 'agreed', active: false }] } } };
  assert.ok(choiceView(reviewed, 'p', 'claude:s1'));
});

test('a working session its provider does not list for the project does not hide the choice card (M16 2.1)', () => {
  const stray = { key: 'codex:stray', projectId: 'p', state: 'working' };
  const st = {
    workflow: { projects: { p: { choice: { generation: 1, reason: 'r', options: [{ option: 'sequential', title: 'Сам', description: '' }] }, proposal: { scopeId: 's1' } } } },
    review: { projects: { p: { visible: true, sessions: {} } } },
    channel: { sessions: [{ key: 'claude:s1', projectId: 'p', state: 'holding', holdReason: 'waiting-for-mode-choice' }, stray] },
    reviews: { projects: { p: [] } },
    providers: { projects: { p: { codex: { sessions: [{ localId: 'rev', remoteId: 'thread-r' }] } } } },
  };
  assert.ok(choiceView(st, 'p', 'claude:s1'), 'the stray session is not a review source');
  const listed = { ...st, channel: { sessions: [st.channel.sessions[0], { ...stray, key: 'codex:thread-r' }] } };
  assert.equal(choiceView(listed, 'p', 'claude:s1'), null, 'a listed working session still hides the card');
  const unknown = { ...st, providers: { projects: { p: {} } } };
  assert.equal(choiceView(unknown, 'p', 'claude:s1'), null, 'before the provider list arrives the session counts');
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
  assert.equal(choiceView(undecided, 'p', 'claude:s1'), null, 'an undecided working session will be asked at its Stop');
});

test('a failed review of the open plan shows its reason on the choice card (M4 13.2)', () => {
  const st = {
    workflow: { projects: { p: { choice: { generation: 1, reason: 'r', options: [{ option: 'sequential', title: 'Сам', description: '' }] }, proposal: { scopeId: 's1' } } } },
    review: { projects: { p: { visible: true, sessions: { 'claude:s1': true }, questions: {} } } },
    channel: { sessions: [{ key: 'claude:s1', projectId: 'p', state: 'holding', holdReason: 'waiting-for-mode-choice' }] },
    reviews: { projects: { p: [{ mainKey: 'claude:s1', scopeId: 's1', status: 'failed', active: false, reason: 'Демон Codex не подключён к ChatGPT', updatedAt: 'b' }] } },
  };
  assert.equal(choiceView(st, 'p', 'claude:s1')!.failedReview, 'Демон Codex не подключён к ChatGPT');
  const other = { ...st, workflow: { projects: { p: { ...st.workflow.projects.p, proposal: { scopeId: 's2' } } } } };
  assert.equal(choiceView(other, 'p', 'claude:s1')!.failedReview, null, 'a failure of an earlier plan is not shown');
});

test('the choice card does not flash between the Stop and the review decision (M4 13.6)', () => {
  const base = {
    generatedAt: '2026-11-08T17:00:05Z',
    workflow: { projects: { p: { choice: { generation: 1, reason: 'r', options: [{ option: 'sequential', title: 'Сам', description: '' }] }, proposal: { scopeId: 's1', createdAt: '2026-11-08T16:59:50Z' } } } },
    review: { projects: { p: { visible: true, sessions: { 'claude:s1': true }, questions: {} } } },
    reviews: { projects: { p: [] } },
  };
  const deciding = { ...base, channel: { sessions: [{ key: 'claude:s1', projectId: 'p', state: 'waiting', lastStopAt: '2026-11-08T17:00:03Z' }] } };
  assert.equal(choiceView(deciding, 'p', 'claude:s1'), null, 'the service is deciding: no card');
  const later = { ...deciding, generatedAt: '2026-11-08T17:01:00Z' };
  assert.ok(choiceView(later, 'p', 'claude:s1'), 'no decision came: the card returns');
  const asked = { ...base, channel: { sessions: [{ key: 'claude:s1', projectId: 'p', state: 'holding', holdReason: 'waiting-for-plan-decision', lastStopAt: '2026-11-08T17:00:03Z' }] } };
  assert.equal(choiceView(asked, 'p', 'claude:s1'), null);
  const choosing = { ...base, channel: { sessions: [{ key: 'claude:s1', projectId: 'p', state: 'holding', holdReason: 'waiting-for-mode-choice', lastStopAt: '2026-11-08T17:00:03Z' }] } };
  assert.ok(choiceView(choosing, 'p', 'claude:s1'), 'the service holds for the choice: buttons');
  const before = { ...deciding, channel: { sessions: [{ key: 'claude:s1', projectId: 'p', state: 'waiting', lastStopAt: '2026-11-08T16:59:40Z' }] } };
  assert.ok(choiceView(before, 'p', 'claude:s1'), 'a Stop before the proposal does not count');
});


test('activity during a review tells its step; service waits are not the user\'s decision (M4 13.8)', () => {
  const st = state();
  (st['channel'] as any).sessions = [
    { key: 'claude:s1', state: 'holding', holdReason: 'waiting-for-review', since: '2026-11-06T08:09:00Z', pending: 0 },
    { key: 'codex:t1', state: 'working', turnStartedAt: '2026-11-06T08:09:30Z', pending: 0 },
  ];
  st['reviews'] = { projects: { p: [{ mainKey: 'claude:s1', reviewerKey: 'codex:t1', reviewerProvider: 'codex', mainProvider: 'claude', status: 'reviewing', active: true, round: 2, maxRounds: 5, entries: [] }] } };
  const main = activityView(st, 'p', 'claude:s1');
  assert.deepEqual([main.state, main.who, main.text, main.detail], ['working', 'Ревьюер ChatGPT', 'проверяет план', 'Ревью плана · круг 2 из 5']);
  (st['reviews'] as any).projects.p[0].status = 'answering';
  assert.equal(activityView(st, 'p', 'claude:s1').text, 'отвечает на замечания ревьюера');
  (st['reviews'] as any).projects.p[0].status = 'preparing';
  assert.equal(activityView(st, 'p', 'claude:s1').text, 'описывает план для ревьюера');
  (st['reviews'] as any).projects.p[0].active = false;
  const after = activityView(st, 'p', 'claude:s1');
  assert.deepEqual([after.state, after.text, after.detail], ['holding', 'ждёт ответа ревьюера', null]);
  (st['channel'] as any).sessions[0].holdReason = 'waiting-for-mode-choice';
  assert.equal(activityView(st, 'p', 'claude:s1').text, 'ждёт, когда вы выберете путь в карточке выше');
  (st['channel'] as any).sessions[0].holdReason = 'waiting-for-plan-start';
  assert.equal(activityView(st, 'p', 'claude:s1').text, 'ждёт, когда вы нажмёте «Начать выполнение плана»');
  (st['channel'] as any).sessions[0].holdReason = 'paused';
  assert.deepEqual([activityView(st, 'p', 'claude:s1').text, activityView(st, 'p', 'claude:s1').detail], ['остановлен', 'Пауза']);
});

test('a plan start under way: the spinner instead of the button, then «Начать заново» after a problem (M11)', () => {
  const plan = { scopeId: 's1', phase: 'ready', phaseLabel: 'План готов', ownerSession: 's1', progress: { done: 0, total: 2 }, tasks: [], actions: ['start'] };
  const s = state();
  (s['workflow'] as any).projects.p.plan = plan;
  const pilot = (s['autopilot'] as any).sessions[0];
  assert.equal(planView(s, 'p', 'claude:s1')?.starting, null, 'nothing pressed yet');
  assert.deepEqual(planView(s, 'p', 'claude:s1')?.buttons.map((b) => b.label), ['Начать выполнение плана']);

  pilot.start = { at: '2026-11-10T10:00:00Z', messageId: 'm1', step: 'sending', slow: false, problem: null };
  let view = planView(s, 'p', 'claude:s1')!;
  assert.deepEqual(view.starting, { step: 'sending', stepText: 'команда ждёт отправки агенту', since: '2026-11-10T10:00:00Z', slow: false, problem: null });
  assert.equal(view.heading, 'План запускается');
  assert.deepEqual(view.buttons, [], 'no start button while it runs');

  pilot.start = { ...pilot.start, step: 'delivered', slow: true };
  view = planView(s, 'p', 'claude:s1')!;
  assert.equal(view.starting?.stepText, 'агент получил команду и готовится к первой задаче');
  assert.equal(view.starting?.slow, true);

  pilot.start = { ...pilot.start, problem: { code: 'turn-ended', text: 'Агент закончил ход, не начав первую задачу.' } };
  view = planView(s, 'p', 'claude:s1')!;
  assert.equal(view.starting?.problem, 'Агент закончил ход, не начав первую задачу.');
  assert.equal(view.heading, 'План готов');
  assert.deepEqual(view.buttons.map((b) => [b.label, b.route]), [['Начать заново', 'start']]);

  (s['workflow'] as any).projects.p.plan = { ...plan, phase: 'running', phaseLabel: 'План выполняется', actions: ['pause'] };
  view = planView(s, 'p', 'claude:s1')!;
  assert.equal(view.starting, null, 'Kit recorded the work: the card is the usual one');
  assert.deepEqual(view.buttons.map((b) => b.label), ['Пауза']);
});

test('the reviewer chat is offered only while its provider shares the chats (M12), and only to the main session', () => {
  const links = { desktop: 'codex://threads/r1?hostId=remote-ssh-discovered%3Awfk-local', mobile: 'codex://threads/r1' };
  const state = (sharedState: string | null): Record<string, unknown> => ({
    providers: {
      providers: [{ id: 'codex', label: 'ChatGPT', status: { details: sharedState ? { sharedAccess: { state: sharedState } } : {} } }],
      projects: { p1: { codex: { sessions: [{ localId: 'r1', links }] } } },
    },
    reviews: { projects: { p1: [{ mainKey: 'claude:m1', reviewerKey: 'codex:r1', reviewerProvider: 'codex', mainProvider: 'claude', status: 'reviewing', active: true, updatedAt: '1', entries: [] }] } },
  });
  assert.deepEqual(reviewerChatLinks(state('active'), 'p1', 'codex:r1'), links);
  assert.equal(reviewerChatLinks(state('broken'), 'p1', 'codex:r1'), null);
  assert.equal(reviewerChatLinks(state(null), 'p1', 'codex:r1'), null);
  assert.equal(reviewerChatLinks(state('active'), 'p1', 'codex:other'), null);
  assert.equal(reviewerChatLinks(state('active'), 'p1', 'bad'), null);
  assert.deepEqual(crossReviewView(state('active'), 'p1', 'claude:m1')?.reviewerLinks, links);
  assert.equal(crossReviewView(state('active'), 'p1', 'codex:r1')?.reviewerLinks, null, 'the reviewer screen does not offer itself');
  assert.equal(crossReviewView(state('needs-connection'), 'p1', 'claude:m1')?.reviewerLinks, null);
});
