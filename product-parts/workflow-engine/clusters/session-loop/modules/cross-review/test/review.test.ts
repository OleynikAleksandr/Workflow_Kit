import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { StopContext, StopEvent, TurnOrigin } from '#agent-channel';
import { CHOICE_WAITS_QUESTION, CHOICE_WAITS_REVIEW, CHOICE_WAITS_TURN, NO_REVIEWER, PLAN_REQUEST, QUESTION_REMINDER, REVIEW_PAIRS, createCrossReview, readReviews } from '../src/index.ts';
import type { CrossReviewDeps, ReviewProvider } from '../src/index.ts';

const MAIN = 'claude:main-1';

async function setup(over: Partial<CrossReviewDeps> = {}) {
  const folder = await mkdtemp(path.join(tmpdir(), 'wfk-review-'));
  const sent: Array<{ key: string; text: string }> = [];
  const woken: string[] = [];
  const created: Array<{ provider: ReviewProvider; title: string; firstMessage?: string; detached: true }> = [];
  let toggle = true;
  let proposal: { generation: number; scopeId: string | null } | null = { generation: 1, scopeId: 's1' };
  const deps: CrossReviewDeps = {
    listProjects: async () => [{ id: 'p1', name: 'Склад', path: folder }],
    createSession: async (_p, provider, opts) => {
      created.push({ provider, ...opts });
      return { localId: provider === 'codex' ? 't1' : null, remoteId: provider === 'claude' ? 'session_R' : null };
    },
    resolveReviewer: async () => null,
    providerTitle: (id) => ({ claude: 'Claude', codex: 'ChatGPT', kimi: 'Kimi' })[id] ?? id,
    // Like the registry: only the provider that can wake a session gets its brief by the queue.
    briefByQueue: (provider) => provider === 'claude',
    enqueue: (key, text) => void sent.push({ key, text }),
    wake: (key) => void woken.push(key),
    toggle: () => toggle,
    proposal: async () => proposal,
    sessionTitle: (_p, key) => (key === MAIN ? 'План склада' : null),
    ...over,
  };
  const review = createCrossReview(deps);
  await review.load();
  const settle = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await review.idle();
  };
  const ctx = (key: string): StopContext => ({ key, client: key.split(':')[0]!, sessionId: key.split(':')[1]!, projectId: 'p1', stopHookActive: false, lastAssistantMessage: null, woken: false });
  const stop = (key: string, text: string, origin: TurnOrigin = 'delivery', sources = ['review']): StopEvent => {
    const event: StopEvent = { key, client: ctx(key).client, sessionId: ctx(key).sessionId, projectId: 'p1', lastAssistantMessage: text, origin, sources };
    review.onStop(event);
    return event;
  };
  /** Starts the review: the main turn continues with the plan request, then describes the plan. */
  const begin = async (key = MAIN, plan = 'Спецификация docs/spec.md; T001 «Склад», файлы src/store.ts') => {
    assert.deepEqual(await review.decide(ctx(key), true), { kind: 'continue', text: PLAN_REQUEST });
    assert.equal(review.get('p1', key)!.status, 'preparing');
    stop(key, plan, 'decider', []);
    await settle();
  };
  return {
    folder, review, sent, woken, created, settle, ctx, stop, begin,
    setToggle: (on: boolean) => void (toggle = on),
    setProposal: (value: typeof proposal) => void (proposal = value),
    cleanup: () => rm(folder, { recursive: true, force: true }),
  };
}

test('a proposal with the toggle on starts a ChatGPT reviewer and the ping-pong ends in agreement', async () => {
  const t = await setup();
  assert.equal(await t.review.decide(t.ctx(MAIN)), null, 'no start without canStart');
  await t.begin();
  assert.equal(t.review.get('p1', MAIN)!.entries[0]!.from, 'main', 'the plan description is in the journal');
  assert.equal((await t.review.decide(t.ctx(MAIN)))?.kind, 'hold', 'then the main agent waits for the review');
  assert.equal(t.created[0]!.provider, 'codex');
  assert.equal(t.created[0]!.title, 'План склада — ревью');
  assert.match(t.created[0]!.firstMessage ?? "", /ревьюер плана[\s\S]*T001 «Склад», файлы src\/store.ts/);
  assert.equal(t.created[0]!.detached, true, 'the reviewer is never waited for (M4 11.1)');
  assert.ok(t.review.isReviewer('codex:t1'));
  t.stop('codex:t1', '1. Нет критериев.\nREVIEW: CHANGES', 'user', []);
  await t.settle();
  assert.equal(t.sent.at(-1)!.key, MAIN);
  assert.match(t.sent.at(-1)!.text, /круг 1 из 5[\s\S]*Нет критериев[\s\S]*REVIEW: AGREED/);
  assert.deepEqual(await t.review.decide(t.ctx('codex:t1')), { kind: 'hold', reason: 'waiting-for-main', timeoutAnswer: (await t.review.decide(t.ctx('codex:t1')) as { timeoutAnswer: string }).timeoutAnswer });
  t.stop(MAIN, 'жду', 'reminder', []);
  t.stop(MAIN, 'Исправил критерии, docs/spec.md');
  await t.settle();
  assert.equal(t.sent.at(-1)!.key, 'codex:t1');
  assert.match(t.sent.at(-1)!.text, /Исправил критерии/);
  assert.equal(t.sent.length, 2, 'the reminder turn was not forwarded');
  t.stop('codex:t1', 'Всё хорошо.\nREVIEW: APPROVED');
  await t.settle();
  t.stop(MAIN, 'Согласен.\nREVIEW: AGREED');
  await t.settle();
  const done = t.review.get('p1', MAIN)!;
  assert.equal(done.status, 'agreed');
  assert.equal(done.round, 2);
  assert.match(t.sent.at(-1)!.text, /ревью закончено/);
  assert.ok(t.woken.includes(MAIN));
  assert.equal(await t.review.decide(t.ctx(MAIN), true), null, 'no second review of the same scope');
  assert.deepEqual(await t.review.decide(t.ctx('codex:t1')), { kind: 'release' });
  const stored = await readReviews(t.folder);
  assert.equal(stored[0]!.status, 'agreed');
  await t.cleanup();
});

test('after the last round without agreement the review ends as disagreed', async () => {
  const t = await setup();
  await t.begin();
  t.stop('codex:t1', 'замечание', 'user', []);
  await t.settle();
  for (let round = 1; round <= 5; round += 1) {
    t.stop(MAIN, `ответ ${round}`);
    await t.settle();
    if (round < 5) {
      t.stop('codex:t1', `замечание ${round + 1}\nREVIEW: CHANGES`);
      await t.settle();
    }
  }
  const review = t.review.get('p1', MAIN)!;
  assert.equal(review.status, 'disagreed');
  assert.equal(review.round, 5);
  await t.cleanup();
});

test('a failed start is visible and frees the main session', async () => {
  const t = await setup({ createSession: async () => { throw new Error('демон ChatGPT не на связи'); } });
  await t.begin();
  const review = t.review.get('p1', MAIN)!;
  assert.equal(review.status, 'failed');
  assert.match(review.reason!, /демон/);
  assert.ok(t.woken.includes(MAIN));
  assert.equal(await t.review.decide(t.ctx(MAIN), true), null);
  await t.cleanup();
});

/** Waits until check() holds (the Claude reviewer is looked for outside the review queue). */
async function until(check: () => boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test('a Claude reviewer is found from its hooks and gets the brief by the queue, not typed (M4 13.9)', async () => {
  let hooked = false;
  const delivered: Array<{ key: string; text: string }> = [];
  const t = await setup({
    resolveReviewer: async (_p, _provider, ref) => (hooked && ref.remoteId === 'session_R' ? 'claude:hook-9' : null),
    deliver: (key, text) => void delivered.push({ key, text }),
    findReviewer: { pollMs: 5, timeoutMs: 2000 },
  });
  const codexMain = 'codex:main-2';
  await t.begin(codexMain, 'T001 «Склад»: файлы src/store.ts');
  assert.equal(t.created[0]!.provider, 'claude');
  assert.equal(t.created[0]!.firstMessage, undefined, 'nothing is typed into the Claude terminal');
  hooked = true;
  await until(() => delivered.length === 1);
  assert.equal(delivered[0]!.key, 'claude:hook-9');
  assert.match(delivered[0]!.text, /T001 «Склад»/);
  assert.equal(t.review.get('p1', codexMain)!.reviewerKey, 'claude:hook-9');
  assert.equal(t.review.isReviewer('claude:hook-9'), true);
  t.stop('claude:hook-9', 'Замечаний нет.\nREVIEW: APPROVED');
  await t.settle();
  assert.equal(t.sent.at(-1)!.key, codexMain);
  assert.equal(t.review.get('p1', 'claude:hook-9')!.round, 1);
  await t.cleanup();
});

test('a Claude reviewer without hooks in time fails the review with a reason (M4 13.9)', async () => {
  const t = await setup({ findReviewer: { pollMs: 5, timeoutMs: 30 } });
  const codexMain = 'codex:main-2';
  await t.begin(codexMain);
  await until(() => t.review.get('p1', codexMain)!.status === 'failed');
  assert.match(t.review.get('p1', codexMain)!.reason ?? '', /не отозвалась/);
  await t.cleanup();
});

test('the pairs come from one table: a Kimi plan is reviewed by ChatGPT, Kimi reviews nobody (M8 5)', async () => {
  assert.deepEqual({ ...REVIEW_PAIRS }, { claude: 'codex', codex: 'claude', kimi: 'codex' });
  assert.ok(!Object.values(REVIEW_PAIRS).includes('kimi'));
  const t = await setup({ sessionTitle: () => 'План Kimi' });
  const kimiMain = 'kimi:session_k1';
  await t.begin(kimiMain);
  assert.equal(t.created[0]!.provider, 'codex');
  assert.match(t.created[0]!.firstMessage ?? '', /Основной агент — Kimi/);
  assert.equal(t.review.get('p1', kimiMain)!.mainProvider, 'kimi');
  assert.ok(t.review.isReviewer('codex:t1'));
  t.stop('codex:t1', 'Замечаний нет.\nREVIEW: APPROVED', 'user', []);
  await t.settle();
  assert.equal(t.sent.at(-1)!.key, kimiMain);
  assert.match(t.sent.at(-1)!.text, /ревьюер — ChatGPT/);
  await t.cleanup();
});

test('a reviewer that is not available fails the review at once and frees the mode choice (M8 5)', async () => {
  const t = await setup({ reviewerBlocked: async (provider) => (provider === 'codex' ? 'Codex не установлен' : null) });
  assert.equal(await t.review.decide(t.ctx(MAIN), true), null, 'the turn is not continued with a plan request');
  const failed = t.review.get('p1', MAIN)!;
  assert.equal(failed.status, 'failed');
  assert.equal(failed.reason, 'ChatGPT не может быть ревьюером: Codex не установлен');
  assert.equal(t.created.length, 0);
  assert.equal(await t.review.decide(t.ctx(MAIN), true), null, 'no restart by itself');
  await t.cleanup();
});

test('a provider without a line in the pairs table gets no review (M8 5)', async () => {
  const t = await setup();
  const key = 'gemini:g1';
  assert.equal(await t.review.decide(t.ctx(key), true), null);
  assert.equal(t.review.get('p1', key)!.status, 'failed');
  assert.equal(t.review.get('p1', key)!.reason, NO_REVIEWER);
  assert.equal(t.created.length, 0);
  await t.cleanup();
});

test('a ChatGPT reviewer still gets the brief as its first message', async () => {
  const t = await setup();
  await t.begin();
  assert.equal(t.created[0]!.provider, 'codex');
  assert.match(t.created[0]!.firstMessage ?? '', /ревьюер плана/);
  await t.cleanup();
});

test('the toggle off or a closed proposal cancels the review; a restart keeps it', async () => {
  const t = await setup();
  await t.begin();
  const again = createCrossReview({
    listProjects: async () => [{ id: 'p1', name: 'Склад', path: t.folder }],
    createSession: async () => ({ localId: null, remoteId: null }),
    resolveReviewer: async () => null,
    enqueue: () => undefined,
    wake: () => undefined,
    toggle: () => true,
    proposal: async () => ({ generation: 1, scopeId: 's1' }),
    sessionTitle: () => null,
  });
  await t.review.idle();
  await again.load();
  assert.equal(again.get('p1', MAIN)!.status, 'starting');
  assert.ok(again.isReviewer('codex:t1'));
  await t.review.toggled('p1', MAIN, false);
  assert.equal(t.review.get('p1', MAIN)!.status, 'cancelled');
  assert.match(t.sent.at(-1)!.text, /остановлено/);
  t.setProposal({ generation: 2, scopeId: 's2' });
  await t.begin();
  t.setProposal(null);
  assert.equal(await t.review.decide(t.ctx(MAIN)), null);
  assert.equal(t.review.get('p1', MAIN)!.reason, 'предложение плана закрыто');
  await t.cleanup();
});

test('the section gives whole texts up to the forwarding limit (M4 13.7)', async () => {
  const t = await setup();
  await t.begin();
  t.stop('codex:t1', 'x'.repeat(1000), 'user', []);
  await t.settle();
  t.stop(MAIN, 'y'.repeat(20000));
  await t.settle();
  const [summary] = t.review.section().projects['p1']!;
  assert.equal(summary!.active, true);
  assert.equal(summary!.statusLabel, 'ревьюер смотрит');
  assert.equal(summary!.entries[1]!.text, 'x'.repeat(1000), 'a long answer is whole');
  assert.ok(summary!.entries[2]!.text.length < 12100);
  assert.match(summary!.entries[2]!.text, /обрезано, полный текст — в чате отправителя/);
  await t.cleanup();
});

test('a reviewer that ends its first turn before its creation returns is held, then taken', async () => {
  let release: ((value: { localId: string | null; remoteId: string | null }) => void) | null = null;
  const t = await setup({ createSession: () => new Promise((resolve) => (release = resolve)) });
  await t.review.decide(t.ctx(MAIN), true);
  t.stop(MAIN, 'план', 'decider', []);
  // Wait for the creation itself, not for a fixed time: a busy machine may take longer.
  for (let i = 0; i < 500 && !release; i += 1) await new Promise((resolve) => setTimeout(resolve, 2));
  assert.ok(release, 'the reviewer is being created');
  t.stop('codex:t1', 'ранние замечания', 'user', []);
  assert.deepEqual(await t.review.decide(t.ctx('codex:t1')), { kind: 'hold', reason: 'waiting-for-main' });
  release!({ localId: 't1', remoteId: null });
  await t.settle();
  assert.ok(t.woken.includes('codex:t1'));
  assert.equal(t.sent.at(-1)!.key, MAIN);
  assert.match(t.sent.at(-1)!.text, /ранние замечания/);
  assert.equal((await t.review.decide(t.ctx('codex:t1')))?.kind, 'hold');
  await t.cleanup();
});

test('an empty plan description still starts the reviewer, asked to request the plan', async () => {
  const t = await setup();
  await t.begin(MAIN, '');
  assert.match(t.created[0]!.firstMessage ?? "", /не описал состав плана/);
  assert.equal(t.review.get('p1', MAIN)!.entries[0]!.text, '(агент не описал план)');
  await t.cleanup();
});

test('cancel during the preparation stops the review before any reviewer exists', async () => {
  const t = await setup();
  await t.review.decide(t.ctx(MAIN), true);
  await t.review.toggled('p1', MAIN, false);
  assert.equal(t.review.get('p1', MAIN)!.status, 'cancelled');
  t.stop(MAIN, 'план', 'decider', []);
  await t.settle();
  assert.equal(t.created.length, 0);
  assert.equal(await t.review.decide(t.ctx(MAIN)), null);
  await t.cleanup();
});

test('the mode choice waits while a working session with the toggle on has not reviewed the proposal (M4 11.3)', async () => {
  const t = await setup();
  assert.equal(await t.review.choiceBlocked('p1', [MAIN]), CHOICE_WAITS_TURN);
  assert.equal(await t.review.choiceBlocked('p1', []), null, 'nobody works: the review will not come');
  t.setToggle(false);
  assert.equal(await t.review.choiceBlocked('p1', [MAIN]), null);
  t.setToggle(true);
  await t.begin();
  assert.equal(await t.review.choiceBlocked('p1', []), CHOICE_WAITS_REVIEW);
  t.stop('codex:t1', 'ок\nREVIEW: APPROVED', 'user', []);
  await t.settle();
  t.stop(MAIN, 'REVIEW: AGREED');
  await t.settle();
  assert.equal(t.review.get('p1', MAIN)!.status, 'agreed');
  assert.equal(await t.review.choiceBlocked('p1', [MAIN]), null, 'this scope was reviewed');
  t.setProposal(null);
  assert.equal(await t.review.choiceBlocked('p1', [MAIN]), null);
  await t.cleanup();
});

test('an open plan question holds the Stop; a proposal without a decision asks it first (M4 12)', async () => {
  const questions = new Set<string>();
  const decided = new Set<string>();
  const t = await setup({
    question: (_p, key) => questions.has(key),
    asking: () => questions.size > 0,
    decided: (_p, key) => decided.has(key),
    askProposal: async (_p, key) => void questions.add(key),
  });
  questions.add(MAIN);
  assert.deepEqual(await t.review.decide(t.ctx(MAIN)), { kind: 'hold', reason: 'waiting-for-plan-decision', timeoutAnswer: QUESTION_REMINDER });
  assert.equal(await t.review.choiceBlocked('p1', []), CHOICE_WAITS_QUESTION);
  questions.clear();
  assert.equal(await t.review.choiceBlocked('p1', [MAIN]), CHOICE_WAITS_TURN, 'an undecided working session will be asked');
  const asked = await t.review.decide(t.ctx(MAIN), true);
  assert.equal(asked?.kind === 'hold' && asked.reason, 'waiting-for-plan-decision');
  assert.ok(questions.has(MAIN), 'the proposal question is open');
  assert.equal(t.created.length, 0);
  // The user answered «С ревью»: the decision exists, the toggle is on, the review starts.
  questions.clear();
  decided.add(MAIN);
  await t.begin();
  assert.equal(t.created.length, 1);
  await t.cleanup();
});

test('«Повторить ревью» starts a failed review of the open plan again (M4 13.2)', async () => {
  let fail = true;
  const t = await setup({
    createSession: async (_p, provider) => {
      if (fail) throw new Error('Демон Codex не подключён к ChatGPT');
      return { localId: provider === 'codex' ? 't1' : null, remoteId: null };
    },
  });
  await t.begin();
  assert.equal(t.review.get('p1', MAIN)!.status, 'failed');
  assert.equal(await t.review.decide(t.ctx(MAIN), true), null, 'no restart by itself');
  assert.equal(await t.review.retry('p1', 'claude:nobody'), false);
  fail = false;
  assert.equal(await t.review.retry('p1', MAIN), true);
  assert.ok(t.woken.includes(MAIN), 'the held Stop is asked again');
  await t.begin();
  assert.equal(t.review.get('p1', MAIN)!.status, 'starting');
  assert.ok(t.review.isReviewer('codex:t1'));
  assert.equal(await t.review.retry('p1', MAIN), false, 'nothing to retry while it runs');
  t.setProposal(null);
  await t.cleanup();
});

