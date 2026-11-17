// M40 T008: the decision cards of Kit requests (unblock, approve-install, adopt-commits) are built
// from the pending requests in the panel state, show exactly what the user allows and send the
// request id and digest the card shows; the plan buttons send the request of their kind.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decisionCards } from '../src/decision-card.js';
import { DECISION_CARD_TEXTS, decisionBody, decisionCardsView, decisionFields, hostDecisions, pendingDecisions } from '../src/decision-model.js';

const MAIN = 'claude:s1';
const SHA = 'a'.repeat(40);
const request = (kind: string, params: Record<string, unknown>, more: Record<string, unknown> = {}) => ({
  id: `dec-${kind}`, kind, scopeId: 'S1', taskId: null, proposal: null, params, inputDigest: `digest-${kind}`, revision: 7, createdAt: 'x', state: 'pending', ...more,
});

function state(decisions: unknown[], more: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    workflow: { projects: { p: { decisionsMode: 'host', decisions, plan: { scopeId: 'S1', ownerSession: 's1', phase: 'blocked', blockedReason: 'Нет доступа к GitHub' }, ...more } } },
  };
}

const ALL = [
  request('unblock', { reasonDigest: 'r' }, { taskId: 'T3' }),
  request('approve-install', { install: [{ executable: 'npm', args: ['install', '--save-dev', 'eslint'] }, { executable: 'cargo', args: ['install', 'cargo-audit'] }], profileDigest: 'p' }),
  request('adopt-commits', { commits: [SHA, 'b'.repeat(40)] }),
  request('accept', { head: 'h' }),
];

test('the cards show the reason, the exact install commands and the commits; other kinds use the plan cards', () => {
  const cards = decisionCardsView(state(ALL), 'p', MAIN);
  assert.deepEqual(cards.map((c) => c.kind), ['unblock', 'approve-install', 'adopt-commits']);
  const [unblock, install, adopt] = cards;
  assert.deepEqual([unblock!.title, unblock!.items, unblock!.code, unblock!.button, unblock!.taskId], ['План заблокирован', ['Нет доступа к GitHub'], false, 'Снять блокировку', 'T3']);
  assert.deepEqual([install!.items, install!.code, install!.button], [['npm install --save-dev eslint', 'cargo install cargo-audit'], true, 'Разрешить установку']);
  assert.deepEqual([adopt!.items, adopt!.lead], [[SHA, 'b'.repeat(40)], DECISION_CARD_TEXTS['adopt-commits'].lead]);
  assert.deepEqual([install!.id, install!.inputDigest], ['dec-approve-install', 'digest-approve-install']);
  // Nothing to show: the card says so instead of an empty list.
  const empty = decisionCardsView(state([request('approve-install', { install: [] })]), 'p', MAIN)[0]!;
  assert.deepEqual([empty.items, empty.lead], [[], DECISION_CARD_TEXTS['approve-install'].noReason]);
});

test('only pending requests of a host project, in the owner session; a reviewer and another session get none', () => {
  assert.deepEqual(decisionCardsView(state(ALL, { decisionsMode: 'agent' }), 'p', MAIN), [], 'an agent project');
  assert.deepEqual(decisionCardsView(state(ALL.map((d) => ({ ...d, state: 'stale' }))), 'p', MAIN), [], 'stale requests');
  assert.deepEqual(decisionCardsView(state(ALL), 'p', 'codex:other'), [], 'not the plan owner');
  assert.deepEqual(decisionCardsView(state(ALL), 'p', MAIN, () => true), [], 'a reviewer');
  assert.deepEqual(decisionCardsView(state(ALL), 'other', MAIN), [], 'another project');
  // A plan without an owner: any session sees the cards.
  const free = state(ALL, { plan: { scopeId: 'S1', ownerSession: null, blockedReason: null } });
  assert.equal(decisionCardsView(free, 'p', 'codex:other').length, 3);
  assert.deepEqual(decisionCardsView(free, 'p', 'codex:other')[0]!.items, [], 'no reason in the plan');
  assert.deepEqual(pendingDecisions({ workflow: { projects: { p: { decisionsMode: 'host', decisions: [{ id: 'x', state: 'pending' }] } } } }, 'p'), [], 'a request without a digest');
  assert.equal(hostDecisions(state([]), 'p'), true);
  assert.equal(hostDecisions(state([], { decisionsMode: 'agent' }), 'p'), false);
});

test('a button sends the id and the digest the card shows; plan buttons send the request of their kind', () => {
  const card = decisionCardsView(state(ALL), 'p', MAIN)[2]!;
  assert.deepEqual(decisionBody(card, MAIN), { kind: 'adopt-commits', decision: { id: 'dec-adopt-commits', inputDigest: 'digest-adopt-commits' }, requestId: 'card:dec-adopt-commits', session: MAIN });
  assert.deepEqual(decisionFields(state(ALL), 'p', 'accept'), { decision: { id: 'dec-accept', inputDigest: 'digest-accept' }, requestId: 'card:dec-accept' });
  assert.deepEqual(decisionFields(state(ALL), 'p', 'close'), {}, 'no request of the kind');
  assert.deepEqual(decisionFields(state(ALL, { decisionsMode: 'agent' }), 'p', 'accept'), {}, 'an agent project sends the old form');
  const delivery = [request('confirm-delivery', { taskDigest: 't' }, { taskId: 'T10' })];
  assert.deepEqual(decisionFields(state(delivery), 'p', 'confirm-delivery', 'T11'), {}, 'another task');
  assert.equal((decisionFields(state(delivery), 'p', 'confirm-delivery', 'T10') as { requestId: string }).requestId, 'card:dec-confirm-delivery');
});

interface Node { tag: string; attrs: Record<string, string>; children: Array<Node | string>; listeners: Record<string, () => void> }
const h = (tag: string, attrs: Record<string, string> = {}, children: Array<Node | string | null> = []): Node => ({
  tag, attrs, children: children.filter((c): c is Node | string => c !== null), listeners: {},
});
const textOf = (node: Node | string): string => (typeof node === 'string' ? node : node.children.map(textOf).join(' '));
const find = (node: Node, test: (n: Node) => boolean): Node[] => [...(test(node) ? [node] : []), ...node.children.filter((c): c is Node => typeof c !== 'string').flatMap((c) => find(c, test))];

test('the card markup: a labelled section, the exact items in code, one button described by the title', async () => {
  const posted: Array<[string, string, unknown]> = [];
  const elements: Node[] = [];
  const shell = {
    dom: { h: (tag: string, attrs?: Record<string, string>, children?: Array<Node | string | null>) => {
      const node = h(tag, attrs, children);
      (node as unknown as { addEventListener: (e: string, f: () => void) => void }).addEventListener = (event, listener) => void (node.listeners[event] = listener);
      (node as unknown as { setAttribute: (k: string, v: string) => void }).setAttribute = (k, v) => void (node.attrs[k] = v);
      (node as unknown as { removeAttribute: (k: string) => void }).removeAttribute = (k) => void delete node.attrs[k];
      elements.push(node);
      return node;
    } },
    api: async (method: string, url: string, body: unknown) => void posted.push([method, url, body]),
  };
  let refreshed = 0;
  const ctx = { requestRefresh: () => void (refreshed += 1), say: () => assert.fail('no error expected') };
  const cards = decisionCardsView(state(ALL), 'p', MAIN);
  const root = decisionCards(shell as never, cards, 'p', MAIN, ctx as never) as unknown as Node;
  const sections = find(root, (n) => n.tag === 'section');
  assert.equal(sections.length, 3);
  for (const section of sections) {
    const title = find(section, (n) => n.tag === 'h2')[0]!;
    assert.equal(section.attrs['aria-labelledby'], title.attrs['id']);
    const buttons = find(section, (n) => n.tag === 'button');
    assert.equal(buttons.length, 1);
    assert.deepEqual([buttons[0]!.attrs['type'], buttons[0]!.attrs['aria-describedby']], ['button', title.attrs['id']]);
  }
  assert.deepEqual(find(sections[1]!, (n) => n.tag === 'code').map(textOf), ['npm install --save-dev eslint', 'cargo install cargo-audit']);
  assert.match(textOf(sections[0]!), /Нет доступа к GitHub/u);
  // The press posts the card's request and refreshes the panel.
  find(sections[2]!, (n) => n.tag === 'button')[0]!.listeners['click']!();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(posted, [['POST', '/api/projects/p/workflow/decision', decisionBody(cards[2]!, MAIN)]]);
  assert.equal(refreshed, 1);
});
