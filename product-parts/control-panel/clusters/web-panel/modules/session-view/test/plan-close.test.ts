// Spec M37 2.4: paths outside commits on the plan card, the review card of a closed plan, texts.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { SESSION_VIEW_ASSETS_DIR } from '../src/index.ts';
import { DIRTY_PATHS, dirtyBlock, dirtyParts, dirtyText } from '../src/plan-dirty.js';
import { REASON_LABELS, activityView, crossReviewView, planView, reviewView } from '../src/session-model.js';
import { showsReview } from '../src/sidebar-view.js';

const MAIN = 'claude:s1';
const REVIEWER = 'codex:rev';

interface Node { tag: string; attrs: Record<string, string>; children: Array<Node | string> }
const h = ((tag: string, attrs: Record<string, string> = {}, children: Array<Node | string> = []) => ({ tag, attrs, children })) as unknown as Parameters<typeof dirtyBlock>[0];
const textOf = (node: Node | string): string => (typeof node === 'string' ? node : node.children.map(textOf).join(''));

function plan(phase: 'acceptance' | 'accepted' | 'running', dirty?: string[], scopeId = 's1'): Record<string, unknown> {
  const actions = { acceptance: ['accept', 'request-fixes'], accepted: ['close'], running: ['pause'] }[phase];
  return { scopeId, objective: 'Список покупок', ownerSession: 's1', phase, phaseLabel: 'p', progress: { done: 2, total: 2 }, progressLabel: 'в main 2 из 2', tasks: [], actions, ...(dirty ? { dirty } : {}) };
}

function state(project: Record<string, unknown>, review: Record<string, unknown> | null = {}): Record<string, unknown> {
  return {
    channel: { sessions: [{ key: MAIN, projectId: 'p', state: 'waiting', holdReason: null }] },
    workflow: { projects: { p: { proposal: null, plan: null, execution: null, ...project } } },
    review: { projects: { p: { visible: true, sessions: { [MAIN]: true } } } },
    reviews: { projects: { p: review ? [{ mainKey: MAIN, reviewerKey: REVIEWER, scopeId: 's1', status: 'agreed', active: false, updatedAt: 'a', entries: [], ...review }] : [] } },
  };
}

test('planView gives the paths outside commits of the plan', () => {
  assert.deepEqual(planView(state({ plan: plan('accepted', ['docs/plans/a.scope.json']) }), 'p', MAIN)?.dirty, ['docs/plans/a.scope.json']);
  assert.deepEqual(planView(state({ plan: plan('acceptance', ['a', 'b']) }), 'p', MAIN)?.dirty, ['a', 'b']);
  assert.deepEqual(planView(state({ plan: plan('acceptance', []) }), 'p', MAIN)?.dirty, []);
  assert.deepEqual(planView(state({ plan: plan('running') }), 'p', MAIN)?.dirty, [], 'a service without the field');
  // The buttons of the phase stay whatever the tree is.
  assert.deepEqual(planView(state({ plan: plan('acceptance', ['a']) }), 'p', MAIN)?.buttons.map((b) => b.action), ['accept', 'request-fixes']);
  assert.deepEqual(planView(state({ plan: plan('accepted', ['a']) }), 'p', MAIN)?.buttons.map((b) => b.action), ['close']);
});

test('the warning names up to five paths, the rest as a count', () => {
  const seven = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  assert.equal(DIRTY_PATHS, 5);
  assert.equal(dirtyText(['docs/plans/a.scope.json']), 'В папке проекта есть файлы вне коммитов: docs/plans/a.scope.json. Пока они есть, план не закроется.');
  assert.equal(dirtyText(seven.slice(0, 5)), 'В папке проекта есть файлы вне коммитов: a, b, c, d, e. Пока они есть, план не закроется.');
  assert.equal(dirtyText(seven), 'В папке проекта есть файлы вне коммитов: a, b, c, d, e (и ещё 2). Пока они есть, план не закроется.');
  assert.deepEqual(dirtyParts(seven), { shown: ['a', 'b', 'c', 'd', 'e'], more: 2 });
});

test('the card block: a warning with the paths as code and the tidy button; nothing on a clean tree', () => {
  const button = { tag: 'button', attrs: {}, children: ['Попросить агента убрать'] } as unknown as HTMLElement;
  assert.equal(dirtyBlock(h, [], button), null);
  for (const paths of [['a.json'], ['a', 'b', 'c', 'd', 'e'], ['a', 'b', 'c', 'd', 'e', 'f', 'g']]) {
    const block = dirtyBlock(h, paths, button) as unknown as Node;
    assert.equal(block.attrs['class'], 'sv-dirty');
    const [warning, row] = block.children as [Node, Node];
    assert.equal(warning.attrs['class'], 'sv-warn');
    assert.equal(textOf(warning), dirtyText(paths), 'the same text as the plain one');
    assert.deepEqual(warning.children.filter((child): child is Node => typeof child !== 'string').map((child) => [child.tag, textOf(child)]), paths.slice(0, 5).map((file) => ['code', file]));
    assert.deepEqual(row.children, [button]);
  }
});

test('the plan card asks the owner to tidy through workflow/tidy', async () => {
  const source = await readFile(path.join(SESSION_VIEW_ASSETS_DIR, 'session-view.js'), 'utf8');
  assert.match(source, /dirtyBlock\(h, plan\.dirty, button\('Попросить агента убрать', \(\) => void send\(ctx, projectId, 'tidy', \{ session: key \}, 'Не удалось попросить агента'\)\)\)/);
  assert.doesNotMatch(await readFile(path.join(SESSION_VIEW_ASSETS_DIR, 'plan-dirty.js'), 'utf8'), /innerHTML/);
});

test('current: the review of the open proposal or the active scope, not of a closed or replaced one', () => {
  const current = (project: Record<string, unknown>, review: Record<string, unknown> = {}) => crossReviewView(state(project, review), 'p', MAIN)?.current;
  assert.equal(current({ proposal: { scopeId: 's1' } }), true, 'the open proposal');
  assert.equal(current({ plan: plan('running') }), true, 'the active scope');
  assert.equal(current({ plan: plan('accepted') }), true, 'accepted, not closed yet');
  assert.equal(current({}), false, 'the scope is closed');
  assert.equal(current({ proposal: { scopeId: 's2' } }), false, 'another proposal');
  assert.equal(current({ plan: plan('running', undefined, 's2') }), false, 'another scope');
  // A proposal without an id is compared as the service compares it.
  assert.equal(current({ proposal: { generation: 1 } }, { scopeId: null }), true);
  assert.equal(current({}, { scopeId: null }), false);
  assert.equal(crossReviewView(state({}, {}), 'p', REVIEWER)?.current, false, 'the same for the reviewer side');
});

test('the review card: a finished review of the main session only without a plan card and while current', () => {
  const data = (project: Record<string, unknown>, review: Record<string, unknown> = {}, key = MAIN) => {
    const st = state(project, review);
    return { review: crossReviewView(st, 'p', key), plan: planView(st, 'p', key) };
  };
  assert.equal(showsReview(data({ proposal: { scopeId: 's1' } })), true, 'reviewed, the path is not chosen yet');
  assert.equal(showsReview(data({})), false, 'after close the card is gone');
  assert.equal(showsReview(data({ proposal: { scopeId: 's2' } })), false, 'another plan is proposed');
  assert.equal(showsReview(data({ plan: plan('accepted') })), false, 'the plan card takes its place');
  // A running review and the reviewer's card stay as before.
  assert.equal(showsReview(data({}, { active: true, status: 'reviewing' })), true);
  assert.equal(showsReview(data({ plan: plan('running') }, { active: true, status: 'answering' })), true);
  assert.equal(showsReview(data({}, {}, REVIEWER)), true, 'the reviewer keeps its journal');
  assert.equal(showsReview(data({ plan: plan('running') }, {}, REVIEWER)), true);
  assert.equal(showsReview({ review: null, plan: null }), false);
});

test('texts: the review decision and the labels of an accepted and a closed plan', () => {
  const st = state({}, null);
  assert.equal(reviewView(st, 'p', MAIN)?.hint, 'Следующий план этой сессии проверит ревьюер — так решено ответом на вопрос о плане.');
  (st['review'] as any).projects.p.sessions[MAIN] = false;
  assert.equal(reviewView(st, 'p', MAIN)?.hint, 'Решено ответом на вопрос о плане: без ревью. Агент спросит снова перед следующим планом.');
  assert.equal(REASON_LABELS.accepted, 'План принят');
  assert.equal(REASON_LABELS.closed, 'План закрыт');
  // The activity line shows the label the service sets.
  for (const [reason, label] of [['accepted', 'План принят'], ['closed', 'План закрыт']]) {
    const labelled = { ...state({}, null), autopilot: { sessions: [{ key: MAIN, last: { action: 'release', reason, label } }] } };
    assert.deepEqual([activityView(labelled, 'p', MAIN).text, activityView(labelled, 'p', MAIN).detail], ['ждёт вашего сообщения', label]);
  }
});
