// Asynchronous questions of Codex (request_user_input_async, spec M33 section 2.7, live check T008)
// on the fake daemon with darwin, linux and win32: the question of an agentMessage of the history,
// pending until a user message follows, then answered without answers; an empty message text, no
// options, several questions, legacy history, the page window, the order with a blocking question,
// a question over the limits, and answerQuestion that refuses and sends nothing.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createEventLog } from '#data-store';
import type { ProcessSupervisor } from '#process-supervisor';
import { ProviderError, QUESTION_BY_MESSAGE_REASON, QUESTION_TOO_LARGE_REASON, questionOut } from '#provider-registry';
import type { ChatQuestion, Project, ProviderContext } from '#provider-registry';
import { createCodexProvider } from '../src/index.ts';
import { USER_INPUT_METHOD } from '../src/questions.ts';
import { connectUnixWebSocket } from '../src/ws.ts';
import { startFakeDaemon } from './fake-daemon.ts';
import type { FakeDaemon, FakeThread } from './fake-daemon.ts';

const THREAD = 'thread-a';
const user = (id: string, text = `вопрос ${id}`) => ({ type: 'userMessage', id, content: [{ type: 'text', text }] });
const asking = (id: string, text: string, questions: unknown) => ({ type: 'agentMessage', id, text, questions });
const COLOR = { title: 'Which color?', options: ['Blue', 'Red'] };
const turn = (id: string, items: unknown[], status = 'completed', startedAt = '2026-11-15T09:00:00.000Z') => ({ id, status, startedAt, items });
const TIMING = { afterTurnMs: 200, idleMs: 400, sweepMs: 40, confirmMs: 300, retryMs: [30] };
const SHARED_OFF = { probePort: async () => false, loginShell: () => '/bin/zsh', userName: () => 'u', appInstalled: async () => false, nodeDir: '/n' };

let tmp = '';
let counter = 0;
before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfka-'));
});
after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

function contextOf(platform: NodeJS.Platform, dir: string): ProviderContext {
  const home = path.join(dir, 'home');
  const data = path.join(dir, 'data');
  return {
    platform, env: { PATH: '/usr/bin:/bin', HOME: home }, homedir: home,
    dirs: { configDir: data, stateDir: data, appDir: data, logsDir: path.join(data, 'logs'), backupsDir: path.join(data, 'backups'), overridden: true },
    config: { port: 0, projectsRoot: home, programs: {} },
    events: createEventLog({ file: path.join(data, 'events.jsonl') }),
    supervisor: {} as ProcessSupervisor,
    runCommand: async () => ({ code: 1, stdout: '', stderr: 'not here', timedOut: false, signal: null, startError: null }),
    now: () => new Date(),
    log: (line) => void logs.push(line),
  };
}
const logs: string[] = [];

async function world(platform: NodeJS.Platform, thread: FakeThread) {
  const dir = path.join(tmp, `w${++counter}`);
  const daemon: FakeDaemon = await startFakeDaemon(path.join(tmp, `d${counter}.sock`));
  daemon.threads.set(THREAD, thread);
  const provider = createCodexProvider(contextOf(platform, dir), { openDaemon: (_socket, o) => connectUnixWebSocket(daemon.socketPath, o), sharedAccess: SHARED_OFF, questionTiming: TIMING });
  const project: Project = { id: 'id-p', name: 'P', path: path.join(dir, 'p'), source: 'created', createdAt: new Date().toISOString() };
  const page = async (limit = 100) => {
    for (let n = 0; n < 6; n += 1) {
      const out = await provider.readMessages!(project, THREAD, { limit });
      if (out.sync?.state !== 'loading') return out;
    }
    throw new Error('still loading');
  };
  const questions = async (limit = 100): Promise<ChatQuestion[]> => (await page(limit)).questions ?? [];
  let commits = 0;
  const answer = (qid: string) => provider.answerQuestion!(project, THREAD, qid, { id: '00000000-0000-4000-8000-000000000001', answers: { q1: { selected: ['Blue'] } } }, async () => void (commits += 1));
  return { daemon, provider, project, page, questions, answer, commits: () => commits };
}

const unavailable = (error: unknown): boolean => error instanceof ProviderError && error.code === 'question-unavailable' && error.message === QUESTION_BY_MESSAGE_REASON;

for (const platform of ['darwin', 'linux', 'win32'] as const) {
  test(`${platform}: the question of an agentMessage is pending until a user message follows; the answer route refuses`, async () => {
    const w = await world(platform, { status: 'idle', turns: [turn('turn-1', [user('u1'), asking('a1', 'Сейчас спрошу.', [COLOR])])] });
    const [q] = await w.questions();
    assert.deepEqual(q, {
      id: 'async:a1', at: q!.at, afterMessageId: 'a1', state: 'pending', answerable: true, reply: 'message',
      parts: [{ id: 'q1', header: '', question: 'Which color?', options: [{ label: 'Blue', description: '' }, { label: 'Red', description: '' }], multiSelect: false, allowOther: true }],
    });
    assert.equal(typeof q!.at, 'string');
    await assert.rejects(w.answer('async:a1'), unavailable);
    assert.equal(w.commits(), 0);
    assert.deepEqual(w.daemon.responses, [], 'nothing is sent to the daemon');
    // The answer is an ordinary message: the next user message closes the question, without answers.
    w.daemon.threads.set(THREAD, { status: 'idle', turns: [turn('turn-1', [user('u1'), asking('a1', 'Сейчас спрошу.', [COLOR])]), turn('turn-2', [user('u2', 'Blue'), { type: 'agentMessage', id: 'a2', text: 'Синий.' }], 'completed', '2026-11-15T09:01:00.000Z')] });
    const closed = await w.questions();
    assert.deepEqual(closed.map((x) => [x.id, x.state, x.answerable, x.answers]), [['async:a1', 'answered', false, undefined]]);
    assert.ok(logs.every((l) => !l.includes('Which color') && !l.includes('Blue')), 'no texts in the log');
    await w.daemon.close();
  });
}

test('an empty message text, no options and two questions in one item; legacy history gives the same', async () => {
  for (const historyMode of ['paginated', 'legacy']) {
    const items = [user('u1'), asking('a1', '', [{ title: 'Any notes?', options: null }, COLOR])];
    const w = await world('darwin', { status: 'idle', historyMode, turns: [turn('turn-1', items)] });
    const [q] = await w.questions();
    assert.equal(q!.afterMessageId, 'u1', `${historyMode}: no own message — after the previous one`);
    assert.deepEqual(q!.parts.map((p) => [p.id, p.question, p.options.length, p.allowOther]), [['q1', 'Any notes?', 0, true], ['q2', 'Which color?', 2, true]]);
    await w.daemon.close();
  }
});

test('the page window: a question of a message left out stays out; plain agent messages give no question', async () => {
  const items = [user('u1'), asking('a1', 'Спрошу.', [COLOR]), { type: 'agentMessage', id: 'a2', text: 'Без вопроса.', questions: [] }, user('u2'), { type: 'agentMessage', id: 'a3', text: 'Готово.' }];
  const w = await world('linux', { status: 'idle', turns: [turn('turn-1', items)] });
  assert.deepEqual((await w.questions(100)).map((q) => [q.id, q.state]), [['async:a1', 'answered']]);
  assert.deepEqual(await w.questions(2), [], 'a1 is outside the newest two messages');
  await w.daemon.close();
});

test('with a blocking question: both on the page, the older first; the stub never replaces an asynchronous one', async () => {
  const items = [user('u1'), asking('a1', 'Спрошу.', [COLOR])];
  const w = await world('win32', { status: 'active', activeFlags: ['waitingOnUserInput'], turns: [turn('turn-1', items, 'inProgress')] });
  w.daemon.ask(THREAD, USER_INPUT_METHOD, { threadId: THREAD, turnId: 'turn-1', itemId: 'item-1', questions: [{ id: 'size', header: 'Size', question: 'Which size?', isOther: false, isSecret: false, options: [{ label: 'S', description: '' }] }] });
  let all: ChatQuestion[] = [];
  for (let n = 0; n < 100 && !all.some((q) => q.id === 'item-1'); n += 1) {
    all = await w.questions();
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.deepEqual(all.map((q) => [q.id, q.reply ?? null]), [['async:a1', 'message'], ['item-1', null]]);
  w.provider.refresh?.();
  await w.daemon.close();
});

test('a question over the limits is shown cut and cannot be answered', () => {
  const many = { ...questionOut({ id: 'async:a1', at: null, afterMessageId: null, state: 'pending', answerable: true, reply: 'message', parts: [{ id: 'q1', header: '', question: 'Q?', options: Array.from({ length: 9 }, (_, i) => ({ label: `o${i}`, description: '' })), multiSelect: false, allowOther: true }] }) };
  assert.equal(many.answerable, false);
  assert.equal(many.reason, QUESTION_TOO_LARGE_REASON);
  assert.equal(many.reply, 'message');
});
