import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildChoiceCard, buildPlanView, choiceOptionsFor } from '../src/index.ts';
import type { KitProposal, KitStatus, KitTask } from '../src/index.ts';

function task(id: string, status: KitTask['status'] = 'TODO', parallelSafe = false): KitTask {
  return { id, kind: id.startsWith('T') ? 'work' : 'quality', title: `title ${id}`, status, roundId: 'R1', parallelSafe, dependencies: [] };
}

function status(over: Partial<KitStatus> = {}): KitStatus {
  return {
    installed: true,
    revision: 4,
    head: 'abc',
    project: { id: 'p', name: 'P' },
    scope: { id: 'demo', objective: 'Склад', status: 'ACTIVE', delivery: 'IN_PROGRESS', blockedReason: null },
    execution: { strategy: 'sequential', ownerSession: 's-1' },
    tasks: [task('QUALITY'), task('T001'), task('T002', 'TODO', true)],
    progress: { done: 0, total: 3 },
    currentTask: null,
    nextTask: null,
    paused: false,
    assignments: [],
    scopeProposal: null,
    transaction: null,
    ...over,
  };
}

test('no plan without Kit or scope', () => {
  assert.equal(buildPlanView(null), null);
  assert.equal(buildPlanView(status({ installed: false })), null);
  assert.equal(buildPlanView(status({ scope: null })), null);
});

test('sequential plan: ready, no parallel labels', () => {
  const view = buildPlanView(status())!;
  assert.equal(view.mode, 'sequential');
  assert.equal(view.phase, 'ready');
  assert.equal(view.phaseLabel, 'План готов');
  assert.deepEqual(view.actions, ['start']);
  assert.equal(view.progressLabel, 'в main 0 из 3');
  assert.equal(view.ownerSession, 's-1');
  assert.ok(view.tasks.every((row) => row.label === null && row.labelText === null));
  assert.deepEqual(view.tasks.map((row) => row.stateLabel), ['Не начата', 'Не начата', 'Не начата']);
});

test('sequential plan running: current task and done tasks', () => {
  const view = buildPlanView(
    status({
      tasks: [task('QUALITY', 'DONE'), task('T001', 'IN_PROGRESS'), task('T002')],
      progress: { done: 1, total: 3 },
      currentTask: { id: 'T001', kind: 'work', title: 't', status: 'IN_PROGRESS', roundId: 'R1' },
    }),
  )!;
  assert.equal(view.phase, 'running');
  assert.deepEqual(view.actions, ['pause']);
  assert.deepEqual(view.tasks.map((row) => [row.state, row.current]), [['done', false], ['run', true], ['todo', false]]);
  assert.equal(view.tasks[0]!.stateLabel, 'В main');
  assert.equal(view.progressLabel, 'в main 1 из 3');
});

test('orchestrated plan: labels and executor rows', () => {
  const view = buildPlanView(
    status({
      execution: { strategy: 'orchestrated', ownerSession: 's-1', maxWorkers: 3 },
      tasks: [task('QUALITY', 'DONE'), task('T001', 'TODO', true), task('T002', 'TODO', true)],
      assignments: [
        { id: 'a1', taskId: 'T001', status: 'ACTIVE', worktree: '/w/a1' },
        { id: 'a0', taskId: 'QUALITY', status: 'INTEGRATED', worktree: '/w/a0' },
      ],
      progress: { done: 1, total: 3 },
    }),
  )!;
  assert.equal(view.mode, 'orchestrated');
  assert.equal(view.phase, 'running');
  assert.deepEqual(view.tasks.map((row) => row.labelText), ['Последовательно', 'Параллельно', 'Параллельно']);
  assert.deepEqual(view.tasks.map((row) => row.state), ['done', 'run', 'todo']);
  assert.equal(view.tasks[1]!.executorWorktree, '/w/a1');
  assert.equal(view.tasks[0]!.current, false);
});

test('phases: paused, blocked, acceptance, accepted', () => {
  const scope = status().scope!;
  assert.equal(buildPlanView(status({ paused: true }))!.phase, 'paused');
  const blocked = buildPlanView(status({ scope: { ...scope, status: 'BLOCKED', blockedReason: 'нет доступа' } }))!;
  assert.equal(blocked.phase, 'blocked');
  assert.equal(blocked.blockedReason, 'нет доступа');
  const acceptance = buildPlanView(status({ scope: { ...scope, delivery: 'READY_FOR_ACCEPTANCE' } }))!;
  assert.equal(acceptance.phaseLabel, 'План выполнен — проверьте результат');
  assert.deepEqual(acceptance.actions, ['accept', 'request-fixes']);
  assert.deepEqual(buildPlanView(status({ scope: { ...scope, delivery: 'ACCEPTED' } }))!.actions, ['close']);
});

const proposal: KitProposal = {
  createdAt: '2026-11-06T00:00:00.000Z',
  generation: 2,
  hasParallelWork: true,
  host: 'harness',
  objective: 'Склад',
  options: ['refine', 'sequential', 'orchestrated'],
  reason: 'части независимы',
  recommended: 'orchestrated',
  refining: false,
  scopeId: 'demo',
};

test('choice card: recommended first, refine last, orchestration only for a provider that has it', () => {
  assert.equal(buildChoiceCard(null), null);
  const card = buildChoiceCard(proposal)!;
  assert.deepEqual(card.options.map((o) => o.option), ['orchestrated', 'sequential', 'refine']);
  assert.equal(card.options[0]!.recommended, true);
  assert.equal(card.options[0]!.title, 'Оркестрация с исполнителями');
  assert.equal(card.options[2]!.title, 'Сначала доработать спецификацию');
  assert.equal(card.generation, 2);
  assert.deepEqual(choiceOptionsFor(card, true).map((o) => o.option), ['orchestrated', 'sequential', 'refine']);
  // A provider without the orchestration capability runs a scope only sequentially (since M10
  // Kimi has it, like Claude and ChatGPT).
  assert.deepEqual(choiceOptionsFor(card, false).map((o) => o.option), ['sequential', 'refine']);
  assert.equal(card.options.length, 3, 'the card itself is not changed');
  const sequential = buildChoiceCard({ ...proposal, recommended: 'sequential' })!;
  assert.deepEqual(sequential.options.map((o) => o.option), ['sequential', 'orchestrated', 'refine']);
});
