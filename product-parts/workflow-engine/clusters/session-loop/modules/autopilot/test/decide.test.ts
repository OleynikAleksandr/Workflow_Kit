import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decideAutopilot, executorHowto, nextAutopilotState } from '../src/index.ts';
import type { AutopilotProjectStatus, AutopilotState, AutopilotTurn } from '../src/index.ts';

const state: AutopilotState = { enabled: true, continues: 0, maxContinues: 40, orchestrationKey: null };
const status = (over: Partial<AutopilotProjectStatus> = {}): AutopilotProjectStatus => ({
  blockedReason: null,
  delivery: 'IN_PROGRESS',
  head: 'h2',
  nextTask: { id: 'T002', kind: 'work', status: 'TODO', title: 't' },
  orchestration: null,
  paused: false,
  proposalPending: false,
  revision: 5,
  scope: 'ACTIVE',
  transactionPending: false,
  ...over,
});
const turn = (over: Partial<AutopilotTurn> = {}): AutopilotTurn => ({ before: { head: 'h1', revision: 4 }, outcome: 'completed', userMessage: false, ...over });

test('progress continues with the next task', () => {
  const decision = decideAutopilot(state, status(), turn());
  assert.equal(decision.action, 'continue');
  assert.match((decision as { text: string }).text, /task:start T002/);
  assert.equal(nextAutopilotState(state, decision).continues, 1);
});

test('stops: no progress, limit, delivery, acceptance, paused, user message, proposal', () => {
  const reason = (s: AutopilotProjectStatus, t = turn(), st = state): string | undefined => {
    const d = decideAutopilot(st, s, t);
    return d.action === 'stop' ? d.reason : undefined;
  };
  assert.equal(reason(status(), turn({ before: { head: 'h2', revision: 5 } })), 'no-progress');
  assert.equal(reason(status(), turn(), { ...state, continues: 40 }), 'limit');
  assert.equal(reason(status({ nextTask: { id: 'T009', kind: 'delivery', status: 'TODO', title: 'd' } })), 'delivery-confirmation');
  assert.equal(reason(status({ delivery: 'READY_FOR_ACCEPTANCE', nextTask: null })), 'ready-for-acceptance');
  assert.equal(reason(status({ paused: true })), 'paused');
  assert.equal(reason(status(), turn({ userMessage: true })), 'user-message');
  assert.equal(reason(status({ proposalPending: true })), 'waiting-for-mode-choice');
  assert.equal(reason(status({ scope: 'BLOCKED', blockedReason: 'нет ключа' })), 'blocked');
});

test('a user message resets the continue counter', () => {
  const decision = decideAutopilot({ ...state, continues: 7 }, status(), turn({ userMessage: true }));
  assert.equal(nextAutopilotState({ ...state, continues: 7 }, decision).continues, 0);
});

test('orchestration runs with the subagents of the session app: Claude Agent with a worktree, Codex spawn_agent in a worktree it makes', () => {
  assert.match(executorHowto('claude:s1'), /Agent tool and isolation: "worktree"/);
  assert.match(executorHowto('codex:t1'), /git worktree add --detach \.workflow-kit\/local\/worktrees\/<assignment id> <baseCommit>/);
  assert.match(executorHowto('codex:t1'), /spawn_agent/);
  assert.match(executorHowto('codex:t1'), /integration:start/);
});
