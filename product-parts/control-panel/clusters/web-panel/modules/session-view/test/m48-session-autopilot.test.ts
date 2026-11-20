// M48 T005: the autopilot card of a session (mode, review while it may change, the last switch);
// under a run that goes on the panel hides the buttons the run presses itself — the mode choice
// (a line instead), the start of a full run, «Подтвердить выпуск», «Принять план» (but a manual
// acceptance), «Закрыть план»; a paused or stopped run gives them back; a completed run of a plan
// without publication shows its result without control buttons; a press that waits for Kit is told.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SESSION_AUTOPILOT_TEXTS, autopilotPresses, kitWaitsView, liveRun, sessionAutopilotView, sessionRefusal } from '../src/session-autopilot-model.js';
import { planView } from '../src/plan-cards.js';
import { LOCAL_LABEL, LOCAL_RESULT, runView } from '../src/run-model.js';

const KEY = 'claude:s-1';
const GRANT = { accept: true, close: true, publish: true };

function state(over: { run?: Record<string, unknown> | null; plan?: Record<string, unknown> | null; session?: Record<string, unknown> | null; waits?: unknown[]; decisionsMode?: string } = {}) {
  const run = over.run === null ? undefined : { runId: 'run-1', revision: 4, owner: KEY, mode: 'full', phase: 'executing', pausedFrom: null, reason: null, nextAction: null, scopeId: 's1', authorized: true, grant: GRANT, returned: false, manualAcceptance: null, wait: null, publication: null, local: false, ...over.run };
  return {
    autopiloting: { settings: { mode: 'off', review: false, revision: 1 }, projects: run ? { p: run } : {}, sessions: over.session === null ? {} : { p: { [KEY]: { revision: 3, mode: 'full', review: true, source: 'user', reviewState: 'open', effect: null, ...over.session } } } },
    workflow: { projects: { p: { ...(over.plan ? { plan: over.plan } : {}), ...(over.decisionsMode ? { decisionsMode: over.decisionsMode } : {}) } } },
    kitWaits: { projects: { p: over.waits ?? [] } },
  };
}
const plan = (phase: string, actions: string[], more: Record<string, unknown> = {}) => ({ scopeId: 's1', ownerSession: 's-1', phase, phaseLabel: phase, progress: { done: 0, total: 1 }, tasks: [], actions, ...more });

test('the session card: its own mode and review, the review while it may change, the last switch', () => {
  const view = sessionAutopilotView(state({ session: { effect: 'Автопилот сессии включён' } }), 'p', KEY)!;
  assert.deepEqual([view.known, view.revision, view.mode, view.review, view.reviewShown, view.effect], [true, 3, 'full', true, true, 'Автопилот сессии включён']);
  const running = sessionAutopilotView(state({ session: { reviewState: 'running' } }), 'p', KEY)!;
  assert.deepEqual([running.reviewShown, running.reviewLine], [true, SESSION_AUTOPILOT_TEXTS.reviewRunning]);
  const reviewed = sessionAutopilotView(state({ session: { reviewState: 'reviewed' } }), 'p', KEY)!;
  assert.deepEqual([reviewed.reviewShown, reviewed.reviewLine], [false, SESSION_AUTOPILOT_TEXTS.reviewed]);
  assert.equal(sessionAutopilotView(state({ session: { reviewState: 'closed' } }), 'p', KEY)!.reviewShown, false);
  const unknown = sessionAutopilotView(state({ session: null }), 'p', KEY)!;
  assert.deepEqual([unknown.known, unknown.mode, unknown.reviewShown], [false, 'off', false]);
  assert.equal(sessionAutopilotView(state(), 'p', KEY, () => true), null, 'a reviewer session has no card');
  assert.match(SESSION_AUTOPILOT_TEXTS.hint, /только для новых сессий/u);
  assert.match(sessionRefusal({ code: 'settings-stale' }), /другом устройстве/u);
  assert.match(sessionRefusal({ code: 'review-closed' }), /не меняется/u);
});

test('a full run before the start: a line instead of the mode choice, no «Начать выполнение плана»', () => {
  const choosing = state({ run: { phase: 'choosing', authorized: false, grant: { accept: false, close: false, publish: false } }, plan: plan('ready', ['start']) });
  const presses = autopilotPresses(choosing, 'p');
  assert.equal(presses.start, true);
  assert.match(presses.choice ?? '', /сам выберет способ/u);
  const card = planView(choosing, 'p', KEY)!;
  assert.deepEqual([card.buttons.map((b) => b.action), card.autopilotNote], [[], 'План запустит автопилот.']);
  // A01: the proposal without the block went back to its author.
  assert.match(autopilotPresses(state({ run: { phase: 'preparing', returned: true } }), 'p').choice ?? '', /вернул план агенту/u);
  // «После старта»: the user starts the plan and chooses the mode.
  const after = state({ run: null, plan: plan('ready', ['start']), session: { mode: 'after-start' } });
  assert.deepEqual([autopilotPresses(after, 'p').choice, planView(after, 'p', KEY)!.buttons.map((b) => b.action), planView(after, 'p', KEY)!.autopilotingMode], [null, ['start'], 'after-start']);
});

test('a started run with the grant: no «Подтвердить выпуск», «Принять план», «Закрыть план»; a manual acceptance keeps «Принять план»', () => {
  const delivery = state({ run: { phase: 'executing' }, plan: plan('running', ['pause'], { tasks: [{ id: 'T7', kind: 'delivery', status: 'TODO' }] }), decisionsMode: 'host' });
  assert.equal(planView(delivery, 'p', KEY)!.delivery, false);
  const acceptance = state({ run: { phase: 'accepting' }, plan: plan('acceptance', ['accept', 'request-fixes']) });
  const card = planView(acceptance, 'p', KEY)!;
  assert.deepEqual(card.buttons.map((b) => b.action), ['request-fixes']);
  assert.equal(card.autopilotNote, 'Приёмку, закрытие и публикацию выполнит автопилот.');
  const manual = state({ run: { phase: 'accepting', manualAcceptance: { reason: 'ручной критерий 5', since: 'x' } }, plan: plan('acceptance', ['accept', 'request-fixes']) });
  assert.deepEqual(planView(manual, 'p', KEY)!.buttons.map((b) => b.action), ['accept', 'request-fixes']);
  assert.match(planView(manual, 'p', KEY)!.autopilotNote ?? '', /Приёмка — ваша/u);
  assert.deepEqual(planView(state({ run: { phase: 'closing' }, plan: plan('accepted', ['close']) }), 'p', KEY)!.buttons, []);
});

test('without a live run the buttons are as before: a paused, blocked or stopped run, a run without grant', () => {
  for (const phase of ['paused', 'blocked', 'stopped', 'completed', 'finished']) {
    const s = state({ run: { phase }, plan: plan('acceptance', ['accept', 'request-fixes']) });
    assert.equal(liveRun(s, 'p'), null, phase);
    assert.deepEqual(planView(s, 'p', KEY)!.buttons.map((b) => b.action), ['accept', 'request-fixes'], phase);
  }
  const noGrant = state({ run: { phase: 'executing', authorized: false, grant: { accept: false, close: false, publish: false } }, plan: plan('running', ['pause'], { tasks: [{ id: 'T7', kind: 'delivery', status: 'TODO' }] }), decisionsMode: 'host' });
  assert.equal(planView(noGrant, 'p', KEY)!.delivery, true, 'a run without the grant confirms nothing');
});

test('a completed run of a plan without publication: the result, no control buttons', () => {
  const done = runView(state({ run: { phase: 'completed', local: true } }), 'p', KEY)!;
  assert.deepEqual([done.phaseLabel, done.tone, done.buttons, done.publication], [LOCAL_LABEL, 'done', [], { text: LOCAL_RESULT, tone: 'done' }]);
  const published = runView(state({ run: { phase: 'completed', publication: { upstream: 'origin/main', finalSha: 'f'.repeat(40), published: 'f'.repeat(40), commits: 3, already: false } } }), 'p', KEY)!;
  assert.deepEqual([published.buttons, published.publication?.tone], [[], 'done']);
});

test('presses waiting for a busy Kit and those that did not go through', () => {
  const lines = kitWaitsView(state({ waits: [
    { id: 'w1', action: 'confirm-delivery', state: 'waiting', error: null },
    { id: 'w2', action: 'decision:accept', state: 'failed', error: 'Kit был занят 15 минут, нажатие не применено. Нажмите кнопку ещё раз.' },
    { id: 'w3', action: 'run:pause', state: 'done', error: null },
  ] }), 'p');
  assert.deepEqual(lines.map((l) => l.tone), ['waiting', 'warn']);
  assert.match(lines[0]!.text, /^«Подтвердить выпуск» ждёт: агент выполняет команду Kit/u);
  assert.match(lines[1]!.text, /^«Принять план» не применено: Kit был занят 15 минут/u);
});
