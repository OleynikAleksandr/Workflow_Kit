// Spec M33 section 2.1: question normalization, the answer check and the attempt rules of the route.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import { createEventLog, createKeyedMutex, createOperations } from '#data-store';
import { HttpError, createRouter, createStateRegistry } from '#http-server';
import type { Router } from '#http-server';
import { createProjectRegistry } from '#project-registry';
import type { Project, ProjectRegistry } from '#project-registry';
import {
  ATTEMPTS_DONE_TTL_MS, ATTEMPTS_MAX, QUESTIONS_PAGE_MAX, QUESTION_JOURNAL_FULL_REASON, QUESTION_SENT_BEFORE_RESTART_REASON, QUESTION_TOO_LARGE_REASON,
  ProviderError, checkQuestionAnswer, createProviderRegistry, createQuestionAttempts, questionAttemptsFile, questionKey, questionOut, questionsOut, registerProviderRoutes,
} from '../src/index.ts';
import type { ChatQuestion, ChatQuestionAnswer, QuestionAttempts, QuestionOutcome } from '../src/index.ts';
import { createFakeProvider } from './fake-provider.ts';
import type { FakeProvider } from './fake-provider.ts';

const part = (id: string, multi = false) => ({ id, header: 'H', question: `Q ${id}?`, options: [{ label: 'Red', description: 'r' }, { label: 'Blue', description: 'b' }], multiSelect: multi, allowOther: true });
const pending = (id: string, extra: Partial<ChatQuestion> = {}): ChatQuestion => ({ id, at: null, afterMessageId: null, state: 'pending', parts: [part('q1')], answerable: true, ...extra });
const A1 = '11111111-1111-4111-8111-111111111111';
const A2 = '22222222-2222-4222-8222-222222222222';

test('questionOut keeps contract fields, applies limits and makes a too large question not answerable', () => {
  const big = questionOut({ ...pending('x'), parts: [{ ...part('q1'), question: 'x'.repeat(3000) }], extra: 1 });
  assert.equal(big?.answerable, false);
  assert.equal(big?.reason, QUESTION_TOO_LARGE_REASON);
  assert.equal(big?.parts[0]?.question.length, 2001);
  assert.equal('extra' in (big ?? {}), false);
  const many = questionOut({ ...pending('y'), parts: [1, 2, 3, 4, 5].map((n) => part(`q${n}`)) });
  assert.equal(many?.parts.length, 4);
  assert.equal(many?.answerable, false);
  assert.equal(questionOut({ id: '', state: 'pending' }), null);
  assert.equal(questionOut({ id: 'z', state: 'weird' }), null);
  const answered = questionOut({ ...pending('a'), state: 'answered', answers: { q1: { selected: ['Blue'] }, nope: { selected: ['x'] } } });
  assert.deepEqual(answered?.answers, { q1: { selected: ['Blue'] } });
  assert.equal(answered?.answerable, false);
  const sent = questionOut({ ...pending('s'), delivery: 'sent' });
  assert.equal(sent?.answerable, false);
  assert.equal(questionOut({ ...pending('p'), answers: { q1: { selected: ['Red'] } } })?.answers, undefined);
  const page = questionsOut(Array.from({ length: 25 }, (_, n) => pending(`q${n}`)));
  assert.equal(page?.length, QUESTIONS_PAGE_MAX);
  assert.equal(page?.[0]?.id, 'q5');
  assert.equal(questionsOut(undefined), undefined);
});

test('checkQuestionAnswer accepts one, several and own text and refuses everything else', () => {
  const single = pending('s');
  assert.deepEqual(checkQuestionAnswer(single, { q1: { selected: ['Red'] } }), { q1: { selected: ['Red'] } });
  assert.deepEqual(checkQuestionAnswer(single, { q1: { selected: [], other: ' medium\r\n' } }), { q1: { selected: [], other: 'medium' } });
  const multi = pending('m', { parts: [part('q1', true), part('q2')] });
  assert.deepEqual(checkQuestionAnswer(multi, { q1: { selected: ['Red', 'Blue'], other: 'x' }, q2: { selected: ['Blue'] } }), { q1: { selected: ['Red', 'Blue'], other: 'x' }, q2: { selected: ['Blue'] } });
  const code = (fn: () => unknown): string => { try { fn(); return 'ok'; } catch (error) { return (error as ProviderError).code; } };
  for (const bad of [{}, { q1: { selected: [] } }, { q1: { selected: ['Red', 'Blue'] } }, { q1: { selected: ['Green'] } }, { q1: { selected: ['Red'], other: 'x' } },
    { q1: { selected: [], other: '  ' } }, { q1: { selected: ['Red'] }, q9: { selected: ['Red'] } }, { q1: { selected: ['Red'], extra: 1 } }, { q1: { selected: ['Red', 'Red'] } }]) {
    assert.equal(code(() => checkQuestionAnswer(single, bad)), 'question-invalid', JSON.stringify(bad));
  }
  assert.equal(code(() => checkQuestionAnswer(pending('n', { parts: [{ ...part('q1'), allowOther: false }] }), { q1: { selected: [], other: 'x' } })), 'question-invalid');
  assert.equal(code(() => checkQuestionAnswer({ ...single, state: 'answered' }, { q1: { selected: ['Red'] } })), 'question-stale');
  assert.equal(code(() => checkQuestionAnswer({ ...single, answerable: false, reason: 'secret' }, { q1: { selected: ['Red'] } })), 'question-unavailable');
  assert.equal(code(() => checkQuestionAnswer({ ...single, answerable: false, delivery: 'sent' }, { q1: { selected: ['Red'] } })), 'question-sent');
});

// --- route ---------------------------------------------------------------------------------

interface QuestionFake extends FakeProvider {
  questions: ChatQuestion[];
  transfers: string[];
  /** What happens after commit: an outcome, a ProviderError code, or a promise to wait for. */
  next: QuestionOutcome | string | Promise<QuestionOutcome>;
}

let tmp = '';
let journal = '';
let projects: ProjectRegistry;
let alpha: Project;
let router: Router;
let fake: QuestionFake;
let attempts: QuestionAttempts;
let clock = 1_800_000_000_000;

function withQuestions(provider: FakeProvider): QuestionFake {
  const q = provider as QuestionFake;
  q.questions = [];
  q.transfers = [];
  q.next = 'accepted';
  const read = provider.readMessages!.bind(provider);
  q.readMessages = async (project, sid, opts) => ({ ...(await read(project, sid, opts)), questions: q.questions });
  q.capabilities = async () => ({ answerQuestion: { available: true } });
  q.answerQuestion = async (_project, _sid, qid, attempt, commit) => {
    const question = q.questions.find((x) => x.id === qid);
    if (!question) throw new ProviderError('question-stale', 'На вопрос уже ответили', { status: 409 });
    const answers = checkQuestionAnswer(question, attempt.answers);
    await commit();
    q.transfers.push(`${qid}:${attempt.id}:${JSON.stringify(answers)}`);
    const next = q.next;
    if (typeof next === 'object') return next;
    if (next === 'accepted' || next === 'unknown') return next;
    throw new ProviderError(next, next, { status: 409 });
  };
  return q;
}

async function build(file: string, write?: (file: string, value: unknown) => Promise<void>): Promise<void> {
  const events = createEventLog({ file: path.join(tmp, 'data', 'events.jsonl') });
  const mutex = createKeyedMutex();
  router = createRouter();
  const registry = createProviderRegistry({ readTimeoutMs: 100 });
  fake = withQuestions(createFakeProvider('fake'));
  fake.sessions = [{ provider: 'fake', localId: 's1', remoteId: 'r-1', title: 'S', createdAt: '2026-11-15T09:00:00.000Z', origin: 'panel', state: 'running', links: {}, cwd: alpha.path }];
  registry.register(fake);
  attempts = createQuestionAttempts({ file, now: () => clock, ...(write ? { write } : {}) });
  registerProviderRoutes({ router, state: createStateRegistry(), registry, projects, operations: createOperations(), mutex, events, platform: process.platform, questionAttempts: attempts });
}

async function call(method: 'GET' | 'POST', url: string, body?: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const match = router.match(method, url);
  if (match.kind !== 'found') return { status: 404, body: {} };
  try {
    const value = await match.handler({ method, path: url, query: new URLSearchParams(), params: match.params, body, req: {} as IncomingMessage, res: {} as ServerResponse });
    return { status: 200, body: value as Record<string, unknown> };
  } catch (error) {
    if (error instanceof HttpError) return { status: error.status, body: { code: error.code, message: error.message } };
    throw error;
  }
}

const answerUrl = (qid: string): string => `/api/projects/${alpha.id}/providers/fake/sessions/s1/questions/${qid}/answer`;
const feedUrl = (): string => `/api/projects/${alpha.id}/providers/fake/sessions/s1/messages`;
const blue: ChatQuestionAnswer = { q1: { selected: ['Blue'] } };
const post = (qid: string, attemptId: string, answers: unknown = blue) => call('POST', answerUrl(qid), { attemptId, answers });

before(async () => {
  tmp = await realpath(await mkdtemp(path.join(os.tmpdir(), 'wfk-questions-')));
  const events = createEventLog({ file: path.join(tmp, 'data', 'events.jsonl') });
  projects = createProjectRegistry({ file: path.join(tmp, 'data', 'projects.json'), projectsRoot: '~/P', homedir: tmp, platform: process.platform, events, mutex: createKeyedMutex() });
  alpha = await projects.create('Alpha');
});
after(async () => { await rm(tmp, { recursive: true, force: true }); });
let round = 0;
beforeEach(async () => {
  round += 1;
  journal = path.join(tmp, `journal-${round}.json`);
  clock = 1_800_000_000_000;
  await build(journal);
});

test('an accepted answer is handed out once and recorded without texts', async () => {
  fake.questions = [pending('toolu_1')];
  const first = await post('toolu_1', A1);
  assert.deepEqual(first, { status: 200, body: { answered: true, outcome: 'accepted' } });
  assert.equal(fake.transfers.length, 1);
  // A lost HTTP answer: the same attempt gets the same outcome without a new transfer.
  fake.questions = [{ ...pending('toolu_1'), state: 'answered', answerable: false }];
  assert.deepEqual(await post('toolu_1', A1), first);
  // Another client afterwards: stale, nothing handed out.
  assert.equal((await post('toolu_1', A2)).body['code'], 'question-stale');
  assert.equal(fake.transfers.length, 1);
  const text = await readFile(journal, 'utf8');
  assert.equal(text.includes('Blue'), false);
  assert.equal(text.includes(questionKey('fake', alpha.id, 's1', 'toolu_1')), true);
});

test('a direct POST to a secret, too large, closed or sent question hands nothing out', async () => {
  fake.questions = [
    pending('secret', { answerable: false, reason: 'Секретный ответ вводится только в приложении ChatGPT' }),
    questionOut({ ...pending('large'), parts: [{ ...part('q1'), question: 'x'.repeat(3000) }] })!,
    { ...pending('closed'), state: 'answered', answerable: false },
    { ...pending('sent'), answerable: false, delivery: 'sent' },
  ];
  assert.equal((await post('secret', A1)).body['code'], 'question-unavailable');
  assert.equal((await post('large', A1)).body['code'], 'question-unavailable');
  assert.equal((await post('closed', A1)).body['code'], 'question-stale');
  assert.equal((await post('sent', A1)).body['code'], 'question-sent');
  assert.equal(fake.transfers.length, 0);
  // Nothing was handed out, so a new attempt may follow once the question is answerable.
  fake.questions = [pending('secret')];
  assert.equal((await post('secret', A2)).status, 200);
});

test('a wrong body, an unknown question id and a provider without the method are refused', async () => {
  fake.questions = [pending('toolu_1')];
  assert.equal((await call('POST', answerUrl('toolu_1'), { attemptId: 'nope', answers: blue })).body['code'], 'question-invalid');
  assert.equal((await call('POST', answerUrl('toolu_1'), { attemptId: A1, answers: blue, more: 1 })).body['code'], 'question-invalid');
  assert.equal((await post('toolu_1', A1, { q1: { selected: ['Green'] } })).body['code'], 'question-invalid');
  assert.equal((await call('POST', answerUrl('bad id'), { attemptId: A1, answers: blue })).body['code'], 'question-invalid');
  delete (fake as Partial<QuestionFake>).answerQuestion;
  assert.deepEqual((await post('toolu_1', A1)).body['code'], 'unsupported');
  assert.equal(fake.transfers.length, 0);
});

test('a delayed confirmation: the same attempt waits, another one is refused, one transfer', async () => {
  fake.questions = [pending('toolu_1')];
  let resolve: (value: QuestionOutcome) => void = () => undefined;
  fake.next = new Promise<QuestionOutcome>((r) => { resolve = r; });
  const first = post('toolu_1', A1);
  await new Promise((r) => setTimeout(r, 10));
  const again = post('toolu_1', A1);
  assert.equal((await post('toolu_1', A2)).body['code'], 'question-sent');
  const feed = await call('GET', feedUrl());
  const question = (feed.body['questions'] as ChatQuestion[])[0]!;
  assert.equal(question.delivery, 'sent');
  assert.equal(question.answerable, false);
  resolve('unknown');
  assert.deepEqual((await first).body, { answered: true, outcome: 'unknown' });
  assert.deepEqual((await again).body, { answered: true, outcome: 'unknown' });
  assert.equal(fake.transfers.length, 1);
});

test('a timeout keeps the question sent: no second transfer, also after a restart', async () => {
  fake.questions = [pending('toolu_1')];
  fake.next = 'question-timeout';
  assert.equal((await post('toolu_1', A1)).status, 504);
  assert.equal((await post('toolu_1', A1)).body['code'], 'question-timeout');
  assert.equal((await post('toolu_1', A2)).body['code'], 'question-sent');
  // Restart: a new journal instance over the same file.
  await build(journal);
  fake.questions = [pending('toolu_1')];
  const feed = await call('GET', feedUrl());
  const question = (feed.body['questions'] as ChatQuestion[])[0]!;
  assert.equal(question.delivery, 'sent');
  assert.equal(question.reason, QUESTION_SENT_BEFORE_RESTART_REASON);
  assert.equal((await post('toolu_1', A2)).body['code'], 'question-sent');
  assert.equal((await post('toolu_1', A1)).body['code'], 'question-timeout');
  assert.equal(fake.transfers.length, 0);
  // The feed closes the question: the record becomes done, a new attempt is stale.
  fake.questions = [{ ...pending('toolu_1'), state: 'answered', answerable: false }];
  await call('GET', feedUrl());
  assert.equal(attempts.find(questionKey('fake', alpha.id, 's1', 'toolu_1'))?.state, 'done');
  assert.equal((await post('toolu_1', A2)).body['code'], 'question-stale');
});

test('a failed journal write hands nothing out and allows a new attempt', async () => {
  let fail = true;
  await build(journal, async (file, value) => {
    if (fail) throw new Error('disk full');
    const { writeJsonAtomic } = await import('#data-store');
    await writeJsonAtomic(file, value);
  });
  fake.questions = [pending('toolu_1')];
  const refused = await post('toolu_1', A1);
  assert.equal(refused.status, 502);
  assert.equal(refused.body['code'], 'question-failed');
  assert.equal(fake.transfers.length, 0);
  fail = false;
  assert.equal((await post('toolu_1', A2)).status, 200);
  assert.equal(fake.transfers.length, 1);
});

test('a sent record survives the age limit and a full journal refuses new answers', async () => {
  fake.questions = [pending('old')];
  fake.next = 'question-timeout';
  await post('old', A1);
  clock += ATTEMPTS_DONE_TTL_MS * 2;
  fake.next = 'accepted';
  fake.questions = [pending('fresh')];
  await post('fresh', A1);
  assert.equal(fake.transfers.length, 2);
  await build(journal);
  assert.equal(attempts.find(questionKey('fake', alpha.id, 's1', 'old'))?.state, undefined, 'loaded lazily');
  await attempts.ready();
  assert.equal(attempts.find(questionKey('fake', alpha.id, 's1', 'old'))?.state, 'sent');
  fake.questions = [pending('old')];
  assert.equal((await post('old', A2)).body['code'], 'question-sent');
  assert.equal(fake.transfers.length, 0, 'the old sent question is not handed out again');
  // Fill the journal with sent records, restart, then a new question is refused before transfer.
  for (let n = 0; n < ATTEMPTS_MAX; n += 1) await attempts.begin(questionKey('fake', alpha.id, 's1', `q${n}`), A1);
  clock += ATTEMPTS_DONE_TTL_MS * 2;
  await build(journal);
  fake.questions = [pending('new')];
  const full = await post('new', A2);
  assert.equal(full.body['code'], 'question-unavailable');
  assert.equal(full.body['message'], QUESTION_JOURNAL_FULL_REASON);
  assert.equal(fake.transfers.length, 0);
});

test('pruning drops only old done records and keeps every sent record', async () => {
  let now = 1_000;
  const journalInMemory = createQuestionAttempts({ file: null, now: () => now });
  await journalInMemory.ready();
  const key = (n: string): string => questionKey('p', 'x', 's', n);
  await journalInMemory.begin(key('sent'), A1);
  await journalInMemory.begin(key('done'), A1);
  await journalInMemory.finish(key('done'), 'accepted');
  now += ATTEMPTS_DONE_TTL_MS + 1;
  await journalInMemory.begin(key('new'), A2);
  assert.equal(journalInMemory.find(key('done')), undefined);
  assert.equal(journalInMemory.find(key('sent'))?.state, 'sent');
  assert.equal(journalInMemory.sentCount(), 2);
});

test('the journal file lives in stateDir on every OS', () => {
  assert.equal(questionAttemptsFile({ stateDir: 'C:\\Users\\u\\AppData\\Local\\Workflow Kit' }, 'win32'), 'C:\\Users\\u\\AppData\\Local\\Workflow Kit\\question-attempts.json');
  assert.equal(questionAttemptsFile({ stateDir: '/home/u/.local/state/workflow-kit' }, 'linux'), '/home/u/.local/state/workflow-kit/question-attempts.json');
  assert.equal(questionAttemptsFile({ stateDir: '/Users/u/Library/Application Support/Workflow Kit' }, 'darwin'), '/Users/u/Library/Application Support/Workflow Kit/question-attempts.json');
});
