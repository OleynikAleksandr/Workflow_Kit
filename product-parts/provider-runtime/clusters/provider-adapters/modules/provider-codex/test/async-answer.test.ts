// The answer of the panel to an asynchronous question of Codex (spec M34 sections 2.2 and 2.3) on
// the fake daemon: the wrapper byte for byte as the ChatGPT app sends it (project 003), its parse,
// turn/steer into the running turn with expectedTurnId, a turn started with the wrapper when the
// thread is idle or not loaded, one more hand-out after a refused steer, and the refusals that
// hand nothing out. The provider routing with the platform injected is in async-questions.test.ts.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { ProviderError } from '#provider-registry';
import type { ChatQuestionPart, Project, QuestionAttempt } from '#provider-registry';
import { CODEX_APP_REASON, createAsyncAnswer } from '../src/async-answer.ts';
import { createChatParts } from '../src/chat.ts';
import type { ChatDeps } from '../src/chat.ts';
import { parseReply, replyText } from '../src/question-reply.ts';
import { createRpcSession, initializeSession } from '../src/rpc.ts';
import type { InitializeResult, RpcSession } from '../src/rpc.ts';
import { connectUnixWebSocket } from '../src/ws.ts';
import { startFakeDaemon } from './fake-daemon.ts';
import type { FakeDaemon, FakeDaemonOptions } from './fake-daemon.ts';

const THREAD = 'thread-ask';
const PROJECT: Project = { id: 'id-p', name: 'P', path: '/p', source: 'created', createdAt: '2026-11-15T00:00:00.000Z' };
const user = (id: string, text = `вопрос ${id}`) => ({ type: 'userMessage', id, content: [{ type: 'text', text }] });
const asking = (id: string, questions: unknown) => ({ type: 'agentMessage', id, text: 'Где хранить список покупок?', questions });
const STORAGE = { title: 'Где хранить список покупок?', options: ['В браузере', 'В файле JSON', 'Без хранения'] };
const turn = (id: string, items: unknown[], status = 'completed') => ({ id, status, startedAt: '2026-11-15T18:34:16.000Z', items });
const ATTEMPT = (answers: QuestionAttempt['answers']): QuestionAttempt => ({ id: '00000000-0000-4000-8000-000000000001', answers });
/** The reply message of ChatGPT in project 003 (facts of Codex, section 9). */
const SAMPLE = '<send_user_message_question_reply>\n[{"questionItemId":"[\\"request_user_input_async\\",\\"call_3a98cf151a8d4e3097a0a8745440e0ac\\",0]","question":"Где хранить список покупок?","answer":"В браузере"}]\n</send_user_message_question_reply>\n';

let tmp = '';
let counter = 0;
before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfkq-'));
});
after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

function withDaemonOf(target: FakeDaemon): ChatDeps['withDaemon'] {
  return async <T>(fn: (session: RpcSession, init: InitializeResult) => Promise<T>): Promise<T> => {
    const session = createRpcSession(await connectUnixWebSocket(target.socketPath, { timeoutMs: 2000 }), { timeoutMs: 2000 });
    try {
      const init = await initializeSession(session);
      return await fn(session, init);
    } finally {
      session.close();
    }
  };
}

async function world(status: string, turns: unknown[], options: FakeDaemonOptions = {}, shared = true) {
  const daemon = await startFakeDaemon(path.join(tmp, `d${++counter}.sock`), options);
  daemon.threads.set(THREAD, { status, turns });
  const lines: string[] = [];
  let prepared = 0;
  let commits = 0;
  const chat = createChatParts({ withDaemon: withDaemonOf(daemon), shared: async () => shared, log: (line) => lines.push(line) });
  const answerer = createAsyncAnswer({
    shared: async () => shared,
    read: async (_project, threadId) => {
      for (let n = 0; n < 6; n += 1) {
        const page = await chat.readMessages(threadId, 100, PROJECT.id);
        if (page.sync?.state !== 'loading') return page;
      }
      throw new Error('still loading');
    },
    withDaemon: withDaemonOf(daemon),
    prepareTurn: async () => void (prepared += 1),
    log: (line) => lines.push(line),
  });
  const answer = (qid: string, answers: QuestionAttempt['answers'], commit = async () => void (commits += 1)) => answerer.answer(PROJECT, THREAD, qid, ATTEMPT(answers), commit);
  const sent = (): string[] => daemon.calls.filter((c) => c.method === 'turn/steer' || c.method === 'turn/start').map((c) => c.method);
  return { daemon, lines, answer, sent, commits: () => commits, prepared: () => prepared };
}

const code = (expected: string, message?: string) => (error: unknown): boolean =>
  error instanceof ProviderError && error.code === expected && (message === undefined || error.message === message);
const part = (id: string, question: string, labels: string[]): ChatQuestionPart => ({ id, header: '', question, options: labels.map((label) => ({ label, description: '' })), multiSelect: false, allowOther: true });

test('replyText gives the wrapper of ChatGPT byte for byte; own text wins over a label; one entry per part', () => {
  const parts = [part('q1', 'Где хранить список покупок?', STORAGE.options)];
  assert.equal(replyText('call_3a98cf151a8d4e3097a0a8745440e0ac', parts, { q1: { selected: ['В браузере'] } }), SAMPLE);
  const two = replyText('call_x', [...parts, part('q2', 'Как назвать?', ['Список'])], { q1: { selected: [], other: 'В облаке' }, q2: { selected: ['Список'] } });
  assert.deepEqual(parseReply(two), [
    { itemId: 'call_x', index: 0, question: 'Где хранить список покупок?', answer: 'В облаке' },
    { itemId: 'call_x', index: 1, question: 'Как назвать?', answer: 'Список' },
  ]);
  assert.ok(!two.includes('\\u'), 'Cyrillic is not escaped');
});

test('parseReply takes only one whole wrapper with a valid questionItemId', () => {
  assert.deepEqual(parseReply(`  ${SAMPLE}\n `), [{ itemId: 'call_3a98cf151a8d4e3097a0a8745440e0ac', index: 0, question: 'Где хранить список покупок?', answer: 'В браузере' }]);
  const entry = (id: unknown, extra: Record<string, unknown> = {}) => `<send_user_message_question_reply>\n${JSON.stringify([{ questionItemId: id, question: 'Q', answer: 'A', ...extra }])}\n</send_user_message_question_reply>`;
  assert.notEqual(parseReply(entry(JSON.stringify(['request_user_input_async', 'c1', 2]))), null);
  for (const bad of [
    'В браузере',
    `Ответ: ${SAMPLE}`,
    SAMPLE.replace(/send_user_message_question_reply/g, 'other_reply'),
    '<send_user_message_question_reply>\n[]\n</send_user_message_question_reply>',
    '<send_user_message_question_reply>\nnot json\n</send_user_message_question_reply>',
    `${SAMPLE}${SAMPLE}`,
    entry(JSON.stringify(['request_user_input', 'c1', 0])),
    entry(JSON.stringify(['request_user_input_async', 'c1', -1])),
    entry(JSON.stringify(['request_user_input_async', 'c1', 0.5])),
    entry(JSON.stringify(['request_user_input_async', '', 0])),
    entry(['request_user_input_async', 'c1', 0]),
    entry(JSON.stringify(['request_user_input_async', 'c1', 0]), { answer: 1 }),
  ]) assert.equal(parseReply(bad), null, bad);
});

test('a running turn: the wrapper goes into it by turn/steer with expectedTurnId, once, after the commit', async () => {
  const w = await world('active', [turn('turn-1', [user('u1')]), turn('turn-2', [user('u2'), asking('a2', [STORAGE])], 'inProgress')]);
  let order = '';
  const outcome = await w.answer('async:a2', { q1: { selected: ['В браузере'] } }, async () => void (order += w.sent().length === 0 ? 'commit-first' : 'late'));
  assert.equal(outcome, 'accepted');
  assert.equal(order, 'commit-first');
  assert.deepEqual(w.sent(), ['turn/steer']);
  const steer = w.daemon.calls.find((c) => c.method === 'turn/steer')!.params as Record<string, unknown>;
  assert.deepEqual(steer, { threadId: THREAD, input: [{ type: 'text', text: replyText('a2', [part('q1', STORAGE.title, STORAGE.options)], { q1: { selected: ['В браузере'] } }) }], expectedTurnId: 'turn-2' });
  assert.equal(w.prepared(), 0, 'no listener for a steer');
  assert.ok(w.lines.some((l) => l === `codex: question answer steered into turn turn-2 of thread ${THREAD}`));
  assert.ok(w.lines.every((l) => !l.includes('браузере') && !l.includes('Где хранить')), 'no texts in the log');
  await w.daemon.close();
});

test('an idle thread: the listener subscribes and turn/start carries the wrapper', async () => {
  const w = await world('idle', [turn('turn-1', [user('u1'), asking('a1', [STORAGE])])]);
  w.daemon.loaded.add(THREAD);
  assert.equal(await w.answer('async:a1', { q1: { selected: [], other: 'В облаке' } }), 'accepted');
  assert.deepEqual(w.sent(), ['turn/start']);
  const start = w.daemon.calls.find((c) => c.method === 'turn/start')!.params as { input: Array<{ text: string }> };
  assert.deepEqual(parseReply(start.input[0]!.text), [{ itemId: 'a1', index: 0, question: STORAGE.title, answer: 'В облаке' }]);
  assert.ok(!w.daemon.calls.some((c) => c.method === 'thread/resume'), 'a loaded thread is not resumed');
  assert.equal(w.prepared(), 1);
  assert.equal(w.commits(), 1);
  await w.daemon.close();
});

test('a thread not loaded is resumed without its turns, then the turn starts with the wrapper', async () => {
  const w = await world('notLoaded', [turn('turn-1', [user('u1'), asking('a1', [STORAGE])])]);
  assert.equal(await w.answer('async:a1', { q1: { selected: ['Без хранения'] } }), 'accepted');
  const methods = w.daemon.calls.map((c) => c.method);
  assert.ok(methods.indexOf('thread/resume') < methods.indexOf('turn/start'));
  assert.deepEqual(w.daemon.calls.find((c) => c.method === 'thread/resume')?.params, { threadId: THREAD, excludeTurns: true });
  await w.daemon.close();
});

test('a steer refused because the turn just ended: one more read, then one turn/start; no third try', async () => {
  const w = await world('active', [turn('turn-2', [user('u2'), asking('a2', [STORAGE])], 'inProgress')], { steerEnds: true });
  w.daemon.loaded.add(THREAD);
  assert.equal(await w.answer('async:a2', { q1: { selected: ['В браузере'] } }), 'accepted');
  assert.deepEqual(w.sent(), ['turn/steer', 'turn/start']);
  assert.equal(w.commits(), 1);
  await w.daemon.close();
});

test('refusals before any hand-out: answered, invalid, unknown, no shared daemon, unknown state', async () => {
  const closed = await world('idle', [turn('turn-1', [user('u1'), asking('a1', [STORAGE]), user('u3', SAMPLE)])]);
  await assert.rejects(closed.answer('async:a1', { q1: { selected: ['В браузере'] } }), code('question-stale'));
  await assert.rejects(closed.answer('async:zz', { q1: { selected: ['В браузере'] } }), code('question-unavailable'));
  await closed.daemon.close();
  const open = await world('active', [turn('turn-2', [user('u2'), asking('a2', [STORAGE])], 'inProgress')]);
  await assert.rejects(open.answer('async:a2', { q1: { selected: ['Зелёный'] } }), code('question-invalid'));
  await assert.rejects(open.answer('async:a2', { q1: { selected: ['В браузере'], other: 'и ещё' } }), code('question-invalid'));
  open.daemon.threads.get(THREAD)!.status = 'systemError';
  await assert.rejects(open.answer('async:a2', { q1: { selected: ['В браузере'] } }), code('question-unavailable', CODEX_APP_REASON));
  assert.deepEqual(open.sent(), []);
  assert.equal(open.commits(), 0);
  await open.daemon.close();
  const alone = await world('active', [turn('turn-2', [user('u2'), asking('a2', [STORAGE])], 'inProgress')], {}, false);
  await assert.rejects(alone.answer('async:a2', { q1: { selected: ['В браузере'] } }), code('question-unavailable', CODEX_APP_REASON));
  assert.deepEqual(alone.daemon.calls, [], 'nothing asked of the daemon');
  await alone.daemon.close();
});

test('a failed journal write hands nothing out; a lost daemon answer is question-timeout without a retry', async () => {
  const w = await world('active', [turn('turn-2', [user('u2'), asking('a2', [STORAGE])], 'inProgress')], { dropOn: 'turn/steer' });
  const journal = async () => { throw new ProviderError('question-failed', 'Журнал ответов не записан', { status: 502 }); };
  await assert.rejects(w.answer('async:a2', { q1: { selected: ['В браузере'] } }, journal), code('question-failed'));
  assert.deepEqual(w.sent(), []);
  await assert.rejects(w.answer('async:a2', { q1: { selected: ['В браузере'] } }), code('question-timeout'));
  assert.deepEqual(w.sent(), ['turn/steer']);
  assert.equal(w.commits(), 1);
  await w.daemon.close();
});
