// The reply message of an asynchronous question in the feed (spec M34 section 2.4) on the fake
// daemon with darwin, linux and win32: the wrapper shows as its answer (or "question — answer"
// lines), the question gets the answers of a reply to it (a label or own text), a reply to another
// question or a plain message closes it without answers, a broken wrapper stays text, an empty
// answer keeps the raw text, the same in legacy history, and the text is stable on a second read.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createEventLog } from '#data-store';
import type { ProcessSupervisor } from '#process-supervisor';
import type { ChatPage, ChatQuestionPart, Project, ProviderContext } from '#provider-registry';
import { createCodexProvider } from '../src/index.ts';
import { replyText } from '../src/question-reply.ts';
import { connectUnixWebSocket } from '../src/ws.ts';
import { startFakeDaemon } from './fake-daemon.ts';
import type { FakeThread } from './fake-daemon.ts';

const THREAD = 'thread-r';
const user = (id: string, text: string) => ({ type: 'userMessage', id, content: [{ type: 'text', text }] });
const asking = (id: string, questions: unknown) => ({ type: 'agentMessage', id, text: 'Где хранить список?', questions });
const STORAGE = { title: 'Где хранить список?', options: ['В браузере', 'В файле JSON'] };
const NAME = { title: 'Как назвать?', options: ['Список покупок'] };
const part = (id: string, ask: { title: string; options: string[] }): ChatQuestionPart => ({ id, header: '', question: ask.title, options: ask.options.map((label) => ({ label, description: '' })), multiSelect: false, allowOther: true });
const turn = (id: string, items: unknown[]) => ({ id, status: 'completed', startedAt: '2026-11-15T18:34:16.000Z', items });
const SHARED_OFF = { probePort: async () => false, loginShell: () => '/bin/zsh', userName: () => 'u', appInstalled: async () => false, nodeDir: '/n' };

let tmp = '';
let counter = 0;
before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfkr-'));
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
    log: () => undefined,
  };
}

async function pageOf(platform: NodeJS.Platform, thread: FakeThread): Promise<{ first: ChatPage; second: ChatPage }> {
  const dir = path.join(tmp, `w${++counter}`);
  const daemon = await startFakeDaemon(path.join(tmp, `d${counter}.sock`));
  daemon.threads.set(THREAD, thread);
  const provider = createCodexProvider(contextOf(platform, dir), { openDaemon: (_socket, o) => connectUnixWebSocket(daemon.socketPath, o), sharedAccess: SHARED_OFF });
  const project: Project = { id: 'id-p', name: 'P', path: path.join(dir, 'p'), source: 'created', createdAt: '2026-11-15T00:00:00.000Z' };
  const read = async (): Promise<ChatPage> => {
    for (let n = 0; n < 6; n += 1) {
      const out = await provider.readMessages!(project, THREAD, { limit: 100 });
      if (out.sync?.state !== 'loading') return out;
    }
    throw new Error('still loading');
  };
  try {
    return { first: await read(), second: await read() };
  } finally {
    await daemon.close();
  }
}

const one = replyText('a1', [part('q1', STORAGE)], { q1: { selected: ['В браузере'] } });
const own = replyText('a1', [part('q1', STORAGE)], { q1: { selected: [], other: 'В облаке' } });
const both = replyText('a2', [part('q1', STORAGE), part('q2', NAME)], { q1: { selected: ['В файле JSON'] }, q2: { selected: [], other: 'За покупками' } });

for (const platform of ['darwin', 'linux', 'win32'] as const) {
  test(`${platform}: a reply shows as its answer and gives the question its answers; stable on a second read`, async () => {
    const { first, second } = await pageOf(platform, { status: 'idle', turns: [turn('turn-1', [user('u1', 'Задача'), asking('a1', [STORAGE]), user('u2', one)])] });
    assert.deepEqual(first.messages.map((m) => [m.id, m.role, m.text]), [['u1', 'user', 'Задача'], ['a1', 'assistant', 'Где хранить список?'], ['u2', 'user', 'В браузере']]);
    assert.deepEqual(first.questions?.map((q) => [q.id, q.state, q.answers]), [['async:a1', 'answered', { q1: { selected: ['В браузере'] } }]]);
    assert.deepEqual(second.messages, first.messages);
    assert.deepEqual(second.questions, first.questions);
  });
}

test('own text, several questions, a reply to another question and a plain message', async () => {
  for (const historyMode of ['paginated', 'legacy']) {
    const { first } = await pageOf('darwin', { status: 'idle', historyMode, turns: [
      turn('turn-1', [asking('a1', [STORAGE]), user('u1', own)]),
      turn('turn-2', [asking('a2', [STORAGE, NAME]), user('u2', both)]),
      turn('turn-3', [asking('a3', [STORAGE]), user('u3', one)]),
      turn('turn-4', [asking('a4', [STORAGE]), user('u4', 'Просто текст')]),
    ] });
    const text = (id: string) => first.messages.find((m) => m.id === id)?.text;
    assert.equal(text('u1'), 'В облаке', historyMode);
    assert.equal(text('u2'), 'Где хранить список? — В файле JSON\nКак назвать? — За покупками');
    assert.equal(text('u3'), 'В браузере', 'a reply to a1 still reads as text');
    const answers = Object.fromEntries((first.questions ?? []).map((q) => [q.id, [q.state, q.answers ?? null]]));
    assert.deepEqual(answers, {
      'async:a1': ['answered', { q1: { selected: [], other: 'В облаке' } }],
      'async:a2': ['answered', { q1: { selected: ['В файле JSON'] }, q2: { selected: [], other: 'За покупками' } }],
      'async:a3': ['answered', null],
      'async:a4': ['answered', null],
    }, historyMode);
  }
});

test('a broken wrapper stays text; an empty answer keeps the raw text so the question still closes', async () => {
  const broken = one.replace('request_user_input_async', 'other_tool');
  const empty = replyText('a2', [part('q1', STORAGE)], { q1: { selected: [], other: ' ' } });
  const { first } = await pageOf('linux', { status: 'idle', turns: [
    turn('turn-1', [asking('a1', [STORAGE]), user('u1', broken)]),
    turn('turn-2', [asking('a2', [STORAGE]), user('u2', empty)]),
  ] });
  assert.equal(first.messages.find((m) => m.id === 'u1')?.text, broken);
  assert.ok(first.messages.find((m) => m.id === 'u2')?.text.includes('<send_user_message_question_reply>'));
  assert.deepEqual(first.questions?.map((q) => [q.id, q.state, q.answers ?? null]), [['async:a1', 'answered', null], ['async:a2', 'answered', null]]);
});
