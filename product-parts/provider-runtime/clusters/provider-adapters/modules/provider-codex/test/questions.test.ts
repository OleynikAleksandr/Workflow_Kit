// Questions of Codex (spec M33 section 2.4, facts T002) on the fake daemon with darwin, linux and
// win32: the stub C0 by the flag, the listener subscribed by the flag (L1: the daemon repeats the
// pending request), the answer once as the result of the request (outcome unknown), the answer in
// ChatGPT, the timeout, a secret part, the end of the turn, a broken connection, the end of the
// subscription without polls, at most 8 threads, a restart with a sent record, and no answer at
// all to requests of the server on the short connections of Kit.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createEventLog } from '#data-store';
import type { ProcessSupervisor } from '#process-supervisor';
import { ProviderError, createQuestionAttempts, questionAttemptsFile, questionKey } from '#provider-registry';
import type { ChatQuestion, Project, Provider, ProviderContext } from '#provider-registry';
import { createCodexProvider } from '../src/index.ts';
import { createQuestionListener } from '../src/question-listener.ts';
import { CODEX_LOST_REASON, CODEX_SECRET_REASON, CODEX_WAITING_REASON, USER_INPUT_METHOD } from '../src/questions.ts';
import { createRpcSession, initializeSession } from '../src/rpc.ts';
import type { RpcSession } from '../src/rpc.ts';
import { createCodexRuntime } from '../src/runtime.ts';
import { connectUnixWebSocket } from '../src/ws.ts';
import { startFakeDaemon } from './fake-daemon.ts';
import type { FakeDaemon, FakeDaemonOptions } from './fake-daemon.ts';

const THREAD = 'thread-q';
const TURNS = [{ id: 'turn-1', status: 'inProgress', startedAt: '2026-11-15T09:00:00.000Z', items: [{ type: 'userMessage', id: 'u1', content: [{ type: 'text', text: 'Спроси меня' }] }] }];
const COLOR = { id: 'color', header: 'Color', question: 'Which color?', isOther: true, isSecret: false, options: [{ label: 'Blue', description: 'cold' }, { label: 'Red', description: 'warm' }] };
const ask = (itemId: string, questions: unknown[] = [COLOR], threadId = THREAD) => ({ threadId, turnId: 'turn-1', itemId, questions });
const TIMING = { afterTurnMs: 200, idleMs: 400, sweepMs: 40, confirmMs: 300, retryMs: [30] };

let tmp = '';
let counter = 0;
before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfkq-'));
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

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const SHARED_OFF = { probePort: async () => false, loginShell: () => '/bin/zsh', userName: () => 'u', appInstalled: async () => false, nodeDir: '/n' };

async function world(platform: NodeJS.Platform, options: FakeDaemonOptions = {}) {
  const dir = path.join(tmp, `w${++counter}`);
  const daemon = await startFakeDaemon(path.join(tmp, `d${counter}.sock`), options);
  daemon.threads.set(THREAD, { status: 'active', activeFlags: ['waitingOnUserInput'], turns: TURNS });
  const context = contextOf(platform, dir);
  const make = (): Provider => createCodexProvider(context, { openDaemon: (_socket, o) => connectUnixWebSocket(daemon.socketPath, o), sharedAccess: SHARED_OFF, questionTiming: TIMING });
  const provider = make();
  const project: Project = { id: 'id-p', name: 'P', path: path.join(dir, 'p'), source: 'created', createdAt: new Date().toISOString() };
  const page = () => provider.readMessages!(project, THREAD, { limit: 100 });
  const questions = async (): Promise<ChatQuestion[]> => (await page()).questions ?? [];
  const until = async (check: (qs: ChatQuestion[]) => boolean): Promise<ChatQuestion[]> => {
    const deadline = Date.now() + 3000;
    for (;;) {
      const qs = await questions();
      if (check(qs)) return qs;
      assert.ok(Date.now() < deadline, `not reached: ${JSON.stringify(qs.map((q) => [q.id, q.state, q.answerable]))}`);
      await sleep(20);
    }
  };
  let commits = 0;
  const commit = async (): Promise<void> => void (commits += 1);
  const answer = (qid: string, answers: Record<string, { selected: string[]; other?: string }>, p: Provider = provider) => p.answerQuestion!(project, THREAD, qid, { id: '00000000-0000-4000-8000-000000000001', answers }, commit);
  return { daemon, context, provider, make, project, page, questions, until, answer, commits: () => commits };
}

const code = (expected: string) => (error: unknown): boolean => error instanceof ProviderError && error.code === expected;

for (const platform of ['darwin', 'linux', 'win32'] as const) {
  test(`${platform}: the flag gives the stub, the listener subscribes by it and the question replaces the stub`, async () => {
    const w = await world(platform);
    const first = await w.questions();
    assert.deepEqual(first.map((q) => [q.id, q.answerable, q.reason]), [[`waiting-${THREAD}`, false, CODEX_WAITING_REASON]]);
    assert.equal(first[0]!.afterMessageId, 'u1');
    assert.ok(w.daemon.calls.some((c) => c.method === 'thread/resume' && (c.params as { excludeTurns?: unknown }).excludeTurns === true));
    w.daemon.ask(THREAD, USER_INPUT_METHOD, ask('item-1'));
    const qs = await w.until((all) => all.some((q) => q.id === 'item-1'));
    assert.deepEqual(qs, [{ id: 'item-1', at: qs[0]!.at, afterMessageId: 'u1', state: 'pending', answerable: true, parts: [{ id: 'color', header: 'Color', question: 'Which color?', options: COLOR.options, multiSelect: false, allowOther: true }] }]);
    // The answer is the result of that request, once; resolved closes it without a winner.
    assert.equal(await w.answer('item-1', { color: { selected: ['Blue'] } }), 'unknown');
    assert.deepEqual(w.daemon.responses, [{ id: 100, result: { answers: { color: { answers: ['Blue'] } } } }]);
    w.daemon.threads.set(THREAD, { status: 'active', turns: TURNS });
    const closed = await w.until((all) => all.every((q) => q.state !== 'pending'));
    assert.deepEqual(closed.map((q) => [q.id, q.state, q.answers]), [['item-1', 'answered', undefined]]);
    await assert.rejects(w.answer('item-1', { color: { selected: ['Red'] } }), code('question-stale'));
    assert.equal(w.daemon.responses.length, 1, 'never a second answer');
    w.provider.refresh?.();
    await w.daemon.close();
  });
}

test('a question asked before the subscription comes again to the listener (L1); own text goes as the answer', async () => {
  const w = await world('darwin');
  w.daemon.ask(THREAD, USER_INPUT_METHOD, ask('item-early', [{ ...COLOR, options: null }]));
  const qs = await w.until((all) => all.some((q) => q.id === 'item-early' && q.answerable));
  assert.equal(qs.find((q) => q.id === 'item-early')!.parts[0]!.allowOther, true, 'no options: own text only');
  assert.equal(await w.answer('item-early', { color: { selected: [], other: 'Зелёный' } }), 'unknown');
  assert.deepEqual(w.daemon.responses[0]!.result, { answers: { color: { answers: ['Зелёный'] } } });
  await w.daemon.close();
});

test('an answer in ChatGPT first: answered without answers, the panel gets stale and sends nothing', async () => {
  const w = await world('linux');
  const id = w.daemon.ask(THREAD, USER_INPUT_METHOD, ask('item-app'));
  await w.until((all) => all.some((q) => q.id === 'item-app' && q.answerable));
  w.daemon.resolve(id);
  const qs = await w.until((all) => all.some((q) => q.id === 'item-app' && q.state === 'answered'));
  assert.equal(qs.find((q) => q.id === 'item-app')!.answers, undefined);
  await assert.rejects(w.answer('item-app', { color: { selected: ['Red'] } }), code('question-stale'));
  assert.equal(w.commits(), 0);
  assert.deepEqual(w.daemon.responses, []);
  await w.daemon.close();
});

test('no resolved in time: question-timeout with delivery sent, no second answer; a later close of another client stays unknown', async () => {
  const w = await world('win32', { silentResolve: true });
  const id = w.daemon.ask(THREAD, USER_INPUT_METHOD, ask('item-slow'));
  await w.until((all) => all.some((q) => q.id === 'item-slow' && q.answerable));
  await assert.rejects(w.answer('item-slow', { color: { selected: ['Blue'] } }), code('question-timeout'));
  const sent = (await w.questions()).find((q) => q.id === 'item-slow')!;
  assert.equal(sent.delivery, 'sent');
  assert.equal(sent.answerable, false);
  await assert.rejects(w.answer('item-slow', { color: { selected: ['Red'] } }), code('question-sent'));
  assert.equal(w.daemon.responses.length, 1);
  // Whoever closes it (another client here), the panel's answer is never attributed to the agent.
  w.daemon.resolve(id);
  const closed = await w.until((all) => all.some((q) => q.id === 'item-slow' && q.state === 'answered'));
  assert.equal(closed.find((q) => q.id === 'item-slow')!.answers, undefined);
  await w.daemon.close();
});

test('a secret part: not answerable, a direct answer sends nothing; the end of the turn cancels', async () => {
  const w = await world('darwin');
  w.daemon.ask(THREAD, USER_INPUT_METHOD, ask('item-secret', [{ ...COLOR, isSecret: true }]));
  const qs = await w.until((all) => all.some((q) => q.id === 'item-secret'));
  const secret = qs.find((q) => q.id === 'item-secret')!;
  assert.deepEqual([secret.answerable, secret.reason], [false, CODEX_SECRET_REASON]);
  await assert.rejects(w.answer('item-secret', { color: { selected: ['Blue'] } }), code('question-unavailable'));
  assert.equal(w.commits(), 0);
  await assert.rejects(w.answer(`waiting-${THREAD}`, { color: { selected: ['Blue'] } }), code('question-unavailable'));
  w.daemon.emit(THREAD, 'turn/completed', { threadId: THREAD, turn: { id: 'turn-1', status: 'interrupted' } });
  const after = await w.until((all) => all.some((q) => q.id === 'item-secret' && q.state === 'cancelled'));
  assert.ok(after.some((q) => q.id === 'item-secret'));
  assert.deepEqual(w.daemon.responses, []);
  await w.daemon.close();
});

test('a broken listener connection: the question is not answerable until the daemon repeats it to the new subscription', async () => {
  const daemon = await startFakeDaemon(path.join(tmp, `d${++counter}.sock`));
  const rt = createCodexRuntime(contextOf('linux', path.join(tmp, `w${counter}`)), { openDaemon: (_s, o) => connectUnixWebSocket(daemon.socketPath, o) });
  const listener = createQuestionListener({ open: (o) => rt.listen(o), log: () => undefined, now: () => Date.now(), timing: TIMING });
  assert.equal(await listener.ensure(THREAD), true);
  daemon.ask(THREAD, USER_INPUT_METHOD, ask('item-cut'));
  await sleep(40);
  assert.equal(listener.questions(THREAD)[0]?.answerable, true);
  daemon.drop();
  await sleep(40);
  const lost = listener.questions(THREAD);
  assert.deepEqual(lost.map((q) => [q.id, q.state, q.answerable, q.reason]), [['item-cut', 'pending', false, CODEX_LOST_REASON]]);
  let commits = 0;
  await assert.rejects(listener.answer(THREAD, 'item-cut', { id: 'a', answers: { color: { selected: ['Red'] } } }, async () => void (commits += 1)), code('question-unavailable'));
  assert.equal(commits, 0);
  assert.equal(await listener.ensure(THREAD), true, 'one new connection, no storm');
  await sleep(40);
  const back = listener.questions(THREAD);
  assert.deepEqual(back.map((q) => [q.id, q.answerable]), [['item-cut', true]], 'the repeat, one question');
  assert.equal(await listener.answer(THREAD, 'item-cut', { id: 'b', answers: { color: { selected: ['Red'] } } }, async () => void (commits += 1)), 'unknown');
  assert.deepEqual(daemon.responses, [{ id: 100, result: { answers: { color: { answers: ['Red'] } } } }]);
  listener.close();
  await daemon.close();
});

test('without polls the subscription ends; the next poll subscribes again and the question comes back', async () => {
  const w = await world('darwin');
  w.daemon.ask(THREAD, USER_INPUT_METHOD, ask('item-idle'));
  await w.until((all) => all.some((q) => q.id === 'item-idle' && q.answerable));
  await sleep(TIMING.idleMs + 150);
  assert.ok(w.daemon.calls.some((c) => c.method === 'thread/unsubscribe'), 'unsubscribed after the idle time');
  const back = await w.until((all) => all.some((q) => q.id === 'item-idle' && q.answerable));
  assert.equal(back.filter((q) => q.id === 'item-idle').length, 1);
  await w.daemon.close();
});

test('a restart after the answer: the repeated question with a sent record gets no second answer', async () => {
  const w = await world('darwin', { silentResolve: true });
  w.daemon.ask(THREAD, USER_INPUT_METHOD, ask('item-restart'));
  await w.until((all) => all.some((q) => q.id === 'item-restart' && q.answerable));
  const attempts = createQuestionAttempts({ file: questionAttemptsFile(w.context.dirs, w.context.platform), platform: w.context.platform });
  await attempts.ready();
  await attempts.begin(questionKey('codex', w.project.id, THREAD, 'item-restart'), '00000000-0000-4000-8000-000000000009');
  const restarted = w.make();
  const page = async () => (await restarted.readMessages!(w.project, THREAD, { limit: 100 })).questions ?? [];
  const deadline = Date.now() + 3000;
  while (!(await page()).some((q) => q.id === 'item-restart')) {
    assert.ok(Date.now() < deadline);
    await sleep(20);
  }
  await assert.rejects(w.answer('item-restart', { color: { selected: ['Blue'] } }, restarted), code('question-sent'));
  assert.deepEqual(w.daemon.responses, []);
  await w.daemon.close();
});

test('at most 8 subscriptions: a thread without a pending question gives way, notifications are not kept', async () => {
  const daemon = await startFakeDaemon(path.join(tmp, `d${++counter}.sock`));
  const rt = createCodexRuntime(contextOf('darwin', path.join(tmp, `w${counter}`)), { openDaemon: (_s, o) => connectUnixWebSocket(daemon.socketPath, o) });
  let opened: RpcSession | null = null;
  const listener = createQuestionListener({ open: async (o) => (opened = await rt.listen(o)), log: () => undefined, now: () => Date.now(), timing: { ...TIMING, idleMs: 60_000 } });
  for (let i = 1; i <= 8; i += 1) assert.equal(await listener.ensure(`t${i}`), true);
  daemon.ask('t2', USER_INPUT_METHOD, ask('item-t2', [COLOR], 't2'));
  await sleep(50);
  assert.equal(await listener.ensure('t9'), true, 'the least recent thread without a question gives way');
  assert.equal(listener.subscribed('t1'), false);
  assert.equal(listener.subscribed('t2'), true);
  daemon.emit('t9', 'thread/status/changed', { threadId: 't9', status: { type: 'active' } });
  await sleep(30);
  assert.equal(opened!.notifications.length, 0, 'the listener keeps no notifications');
  listener.close();
  await daemon.close();
});

test('the short connections of Kit answer no request of the server: an approval and a question during a direct turn stay pending', async () => {
  const daemon = await startFakeDaemon(path.join(tmp, `d${++counter}.sock`));
  const session = createRpcSession(await connectUnixWebSocket(daemon.socketPath, { timeoutMs: 2000 }), { timeoutMs: 2000 });
  await initializeSession(session);
  await session.request('thread/resume', { threadId: THREAD, excludeTurns: true });
  const approval = daemon.ask(THREAD, 'item/commandExecution/requestApproval', { threadId: THREAD, itemId: 'cmd-1' });
  const question = daemon.ask(THREAD, USER_INPUT_METHOD, ask('item-direct'));
  await session.request('turn/start', { threadId: THREAD, input: [{ type: 'text', text: 'x' }] });
  await sleep(50);
  assert.deepEqual(daemon.responses, [], 'neither a result nor an error');
  assert.deepEqual([...daemon.pendingRequests.keys()], [approval, question]);
  session.close();
  await daemon.close();
});

test('a daemon that cannot be reached: one attempt per pause, no storm of reconnects', async () => {
  let opens = 0;
  let now = 1000;
  const listener = createQuestionListener({ open: async () => { opens += 1; throw new Error('connect ECONNREFUSED'); }, log: () => undefined, now: () => now, timing: { ...TIMING, retryMs: [1000, 5000] } });
  assert.equal(await listener.ensure(THREAD), false);
  for (let i = 0; i < 20; i += 1) assert.equal(await listener.ensure(THREAD), false);
  assert.equal(opens, 1, 'within the pause nothing is tried');
  now += 1000;
  await listener.ensure(THREAD);
  now += 1000;
  await listener.ensure(THREAD);
  assert.equal(opens, 2, 'the second pause is longer');
  listener.close();
});
