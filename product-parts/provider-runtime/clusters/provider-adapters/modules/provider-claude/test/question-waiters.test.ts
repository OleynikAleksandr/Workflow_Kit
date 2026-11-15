// Answers to AskUserQuestion through the PermissionRequest hook (spec M33 section 2.3, A1): binding
// of a waiter to one call, the decision once and only to a waiting waiter, confirmation by the
// transcript, the endings of a waiter (result, recovery time, hook timeout, displacement), a late
// request of an ended waiter, and a restart of the service with a sent record of the journal.
import assert from 'node:assert/strict';
import { appendFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createEventLog, ensureDataDirs, eventsFile, resolveDataDirs } from '#data-store';
import type { ProcessSupervisor } from '#process-supervisor';
import { ProviderError, createQuestionAttempts, questionAttemptsFile, questionKey } from '#provider-registry';
import type { ChatQuestion, ChatQuestionAnswer, Project, ProviderContext, QuestionHookReply } from '#provider-registry';
import { createRuntime } from '../src/runtime.ts';
import type { ClaudeRuntime } from '../src/runtime.ts';
import { QUESTION_HOOK_ENDED_REASON, QUESTION_OLD_SESSION_REASON, answerQuestion, questionHook, setQuestionTiming, withWaiters } from '../src/question-waiters.ts';

let tmp = '';
let project: Project;
let context: ProviderContext;
const logs: string[] = [];
let counter = 0;

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-claude-waiters-'));
  const home = path.join(tmp, 'home');
  const folder = path.join(home, 'Projects', 'Alpha');
  await mkdir(path.join(folder, '.workflow-kit', 'local'), { recursive: true });
  project = { id: 'p-alpha', name: 'Alpha', path: folder, source: 'created', createdAt: '2026-11-15T07:00:00.000Z' };
  const dirs = resolveDataDirs({ platform: process.platform, env: { WFK_DATA_DIR: path.join(tmp, 'data') }, homedir: home });
  await ensureDataDirs(dirs);
  context = {
    platform: process.platform, env: {}, homedir: home, dirs,
    config: { port: 0, projectsRoot: path.join(home, 'Projects'), programs: {} },
    events: createEventLog({ file: eventsFile(dirs) }),
    supervisor: { quickCheck: async () => 'gone' } as unknown as ProcessSupervisor,
    runCommand: async () => ({ code: 1, signal: null, stdout: '', stderr: '', timedOut: false, startError: null }),
    now: () => new Date(),
    log: (line) => void logs.push(line),
  } as ProviderContext;
});
after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

const COLOR = { question: 'Which color?', header: 'Color', multiSelect: false, options: [{ label: 'Blue', description: '' }, { label: 'Red', description: '' }] };
const FRUIT = { question: 'Which fruits?', header: 'Fruit', multiSelect: true, options: [{ label: 'Apple', description: '' }, { label: 'Plum', description: '' }] };
const now = (): string => new Date().toISOString();
const ask = (id: string, questions: unknown[]): string => JSON.stringify({ type: 'assistant', uuid: `a-${id}`, timestamp: now(), message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'AskUserQuestion', input: { questions } }] } });
const result = (id: string, answers: Record<string, unknown> | string): string =>
  JSON.stringify({ type: 'user', uuid: `r-${id}-${++counter}`, timestamp: now(), toolUseResult: typeof answers === 'string' ? answers : { answers }, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'x', ...(typeof answers === 'string' ? { is_error: true } : {}) }] } });
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** A session of its own: transcript, hook journal row and a runtime with short timing. */
async function session(name: string, timing: Parameters<typeof setQuestionTiming>[1] = {}) {
  const transcript = path.join(tmp, 'home', '.claude', 'projects', 'alpha', `${name}.jsonl`);
  await mkdir(path.dirname(transcript), { recursive: true });
  await writeFile(transcript, '');
  await appendFile(path.join(project.path, '.workflow-kit', 'local', 'sessions.jsonl'), `${JSON.stringify({ time: now(), client: 'claude', session_id: name, transcript_path: transcript, cwd: project.path, source: 'startup' })}\n`);
  const rt = createRuntime(context);
  setQuestionTiming(rt, { holdMs: 2000, recoveryMs: 400, confirmMs: 600, tickMs: 20, graceMs: 0, ...timing });
  const write = (line: string): Promise<void> => appendFile(transcript, `${line}\n`);
  const hook = (waiterId: string, questions: unknown[] = [COLOR], signal: AbortSignal = new AbortController().signal, toolName = 'AskUserQuestion'): Promise<QuestionHookReply> =>
    questionHook(rt, project, { client: 'claude', sessionId: name, transcriptPath: transcript, cwd: project.path, projectDir: project.path, waiterId, toolName, toolInput: { questions } }, signal);
  const questions = async (): Promise<ChatQuestion[]> => withWaiters(rt, transcript, (await rt.chat.read(transcript, 1)).questions) ?? [];
  const question = async (id: string): Promise<ChatQuestion | undefined> => (await questions()).find((q) => q.id === id);
  const until = async (check: () => Promise<boolean>): Promise<void> => {
    const deadline = Date.now() + 2000;
    while (!(await check())) {
      assert.ok(Date.now() < deadline, 'condition not reached');
      await sleep(10);
    }
  };
  return { rt, name, transcript, write, hook, questions, question, until };
}

const commits = (): { commit: () => Promise<void>; count: () => number } => {
  let n = 0;
  return { commit: async () => void (n += 1), count: () => n };
};
const code = (expected: string) => (error: unknown): boolean => error instanceof ProviderError && error.code === expected;

test('the hook makes the question answerable; the panel answer is the decision once and the transcript confirms it', async () => {
  const s = await session('s-accept');
  await s.write(ask('t1', [COLOR, FRUIT]));
  assert.equal((await s.question('t1'))?.reason, QUESTION_OLD_SESSION_REASON, 'no hook: answer in the app');
  const held = s.hook(uuid(1), [COLOR, FRUIT]);
  await s.until(async () => (await s.question('t1'))?.answerable === true);
  const c = commits();
  const answering = answerQuestion(s.rt, project, s.name, 't1', { id: uuid(100), answers: { q1: { selected: ['Red'] }, q2: { selected: ['Apple', 'Plum'] } } }, c.commit);
  const reply = await held;
  assert.deepEqual(reply, { decision: { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow', updatedInput: { questions: [COLOR, FRUIT], answers: { 'Which color?': 'Red', 'Which fruits?': ['Apple', 'Plum'] } } } } } });
  assert.equal(c.count(), 1);
  // A repeated request of the decided waiter gets the same decision (its answer may have been lost).
  assert.deepEqual(await s.hook(uuid(1), [COLOR, FRUIT]), reply);
  await s.write(result('t1', { 'Which color?': 'Red', 'Which fruits?': 'Apple, Plum' }));
  assert.equal(await answering, 'accepted');
  assert.deepEqual(await s.hook(uuid(1), [COLOR, FRUIT]), { release: true }, 'an ended waiter never comes back');
  assert.ok(logs.every((l) => !l.includes('Which color') && !l.includes('Red')), 'no texts in the log');
});

test('own text and an unknown result format; other answers and a cancel after the decision are stale', async () => {
  const own = await session('s-own');
  await own.write(ask('t1', [COLOR]));
  const held = own.hook(uuid(2));
  await own.until(async () => (await own.question('t1'))?.answerable === true);
  const answering = answerQuestion(own.rt, project, own.name, 't1', { id: uuid(101), answers: { q1: { selected: [], other: 'Зелёный' } } }, commits().commit);
  const reply = (await held) as { decision: { hookSpecificOutput: { decision: { updatedInput: { answers: Record<string, unknown> } } } } };
  assert.deepEqual(reply.decision.hookSpecificOutput.decision.updatedInput.answers, { 'Which color?': 'Зелёный' });
  await own.write(result('t1', {}));
  assert.equal(await answering, 'unknown');

  for (const [name, closing] of [['s-other', result('t1', { 'Which color?': 'Blue' })], ['s-cancel', result('t1', 'User rejected tool use')]] as const) {
    const s = await session(name);
    await s.write(ask('t1', [COLOR]));
    const h = s.hook(uuid(name.length + 3));
    await s.until(async () => (await s.question('t1'))?.answerable === true);
    const a = answerQuestion(s.rt, project, s.name, 't1', { id: uuid(102), answers: { q1: { selected: ['Red'] } } }, commits().commit);
    await h;
    await s.write(closing);
    await assert.rejects(a, code('question-stale'));
  }
});

test('an answer in the app first: the waiter ends, the panel gets stale and nothing is handed out', async () => {
  const s = await session('s-app');
  await s.write(ask('t1', [COLOR]));
  const held = s.hook(uuid(3));
  await s.until(async () => (await s.question('t1'))?.answerable === true);
  await s.write(result('t1', { 'Which color?': 'Blue' }));
  assert.deepEqual(await held, { release: true }, 'the hook process is let go (T001 P4)');
  const c = commits();
  await assert.rejects(answerQuestion(s.rt, project, s.name, 't1', { id: uuid(103), answers: { q1: { selected: ['Red'] } } }, c.commit), code('question-stale'));
  assert.equal(c.count(), 0);
});

test('no result in time: question-timeout, no second hand-out; a closed, unanswerable or unknown question hands out nothing', async () => {
  // Recovery longer than the confirmation: the decided waiter outlives the timeout of the answer.
  const s = await session('s-timeout', { recoveryMs: 5000 });
  await s.write(ask('t1', [COLOR]));
  const held = s.hook(uuid(4));
  await s.until(async () => (await s.question('t1'))?.answerable === true);
  const first = commits();
  const answering = answerQuestion(s.rt, project, s.name, 't1', { id: uuid(104), answers: { q1: { selected: ['Red'] } } }, first.commit);
  const decision = await held;
  await assert.rejects(answering, code('question-timeout'));
  assert.equal((await s.question('t1'))?.answerable, false);
  const second = commits();
  await assert.rejects(answerQuestion(s.rt, project, s.name, 't1', { id: uuid(105), answers: { q1: { selected: ['Blue'] } } }, second.commit), code('question-unavailable'));
  assert.equal(second.count(), 0);
  assert.deepEqual(await s.hook(uuid(4)), decision, 'the same decision, never another one');
  const refused: Array<[string, ChatQuestionAnswer, string]> = [['nope', { q1: { selected: ['Red'] } }, 'question-stale'], ['t1', { q1: { selected: ['Green'] } }, 'question-unavailable']];
  for (const [qid, answers, expected] of refused) {
    const c = commits();
    await assert.rejects(answerQuestion(s.rt, project, s.name, qid, { id: uuid(106), answers }, c.commit), code(expected));
    assert.equal(c.count(), 0);
  }
});

test('two identical questions in a row: each waiter is bound to its own call, the late request of the first gets release', async () => {
  const s = await session('s-twice');
  await s.write(ask('t1', [COLOR]));
  const first = s.hook(uuid(5));
  await s.until(async () => (await s.question('t1'))?.answerable === true);
  await s.write(result('t1', { 'Which color?': 'Blue' }));
  assert.deepEqual(await first, { release: true });
  await s.write(ask('t2', [COLOR]));
  const second = s.hook(uuid(6));
  await s.until(async () => (await s.question('t2'))?.answerable === true);
  assert.equal((await s.question('t1'))?.state, 'answered');
  assert.deepEqual(await s.hook(uuid(5)), { release: true }, 'the old hook never gets the new question');
  const answering = answerQuestion(s.rt, project, s.name, 't2', { id: uuid(107), answers: { q1: { selected: ['Red'] } } }, commits().commit);
  assert.ok('decision' in (await second));
  await s.write(result('t2', { 'Which color?': 'Red' }));
  assert.equal(await answering, 'accepted');
});

test('the change of a nine-minute request and a network break keep the waiter; the recovery time ends it', async () => {
  const s = await session('s-break', { holdMs: 60 });
  await s.write(ask('t1', [COLOR]));
  assert.deepEqual(await s.hook(uuid(7)), { wait: true }, 'the hold ends with wait');
  assert.equal((await s.question('t1'))?.answerable, true, 'between two requests the question stays answerable');
  const broken = new AbortController();
  const cut = s.hook(uuid(7), [COLOR], broken.signal);
  broken.abort();
  assert.deepEqual(await cut, { wait: true });
  await sleep(150);
  assert.deepEqual(await s.hook(uuid(7)), { wait: true }, 'back within the recovery time: the same waiter');
  assert.equal((await s.questions()).length, 1, 'no second question');
  await sleep(500);
  const ended = await s.question('t1');
  assert.equal(ended?.answerable, false);
  assert.equal(ended?.reason, QUESTION_HOOK_ENDED_REASON);
  assert.deepEqual(await s.hook(uuid(7)), { release: true }, 'an ended waiter does not come back');
});

test('the hook timeout and a new waiter of the session end a waiter; other tools are released at once', async () => {
  const s = await session('s-ends', { hookMs: 150, holdMs: 1000 });
  await s.write(ask('t1', [COLOR]));
  assert.deepEqual(await s.hook(uuid(8)), { release: true }, 'held until the hook timeout');
  const d = await session('s-displace');
  await d.write(ask('t1', [COLOR]));
  const old = d.hook(uuid(9));
  await d.until(async () => (await d.question('t1'))?.answerable === true);
  await d.write(ask('t2', [FRUIT]));
  const fresh = d.hook(uuid(10), [FRUIT]);
  assert.deepEqual(await old, { release: true }, 'displaced');
  await d.until(async () => (await d.question('t2'))?.answerable === true);
  assert.deepEqual(await d.hook(uuid(11), [COLOR], new AbortController().signal, 'Bash'), { release: true });
  void fresh;
  await d.write(result('t2', { 'Which fruits?': ['Apple'] }));
  assert.deepEqual(await fresh, { release: true });
});

test('a restart: a returning hook of a question with a sent record gets release; without one it waits again', async () => {
  const s = await session('s-restart');
  await s.write(ask('t1', [COLOR]));
  await s.write(ask('t2', [FRUIT]));
  const attempts = createQuestionAttempts({ file: questionAttemptsFile(context.dirs, context.platform), platform: context.platform });
  await attempts.ready();
  await attempts.begin(questionKey('claude', project.id, s.name, 't2'), uuid(200));
  // A new runtime is the service after a restart: no waiter records.
  const restarted = createRuntime(context);
  setQuestionTiming(restarted, { holdMs: 80, tickMs: 20, graceMs: 0 });
  const request = (waiterId: string, questions: unknown[]) => questionHook(restarted, project, { client: 'claude', sessionId: s.name, transcriptPath: s.transcript, cwd: null, projectDir: null, waiterId, toolName: 'AskUserQuestion', toolInput: { questions } }, new AbortController().signal);
  assert.deepEqual(await request(uuid(12), [FRUIT]), { release: true }, 'the answer was handed out before the restart');
  assert.deepEqual(await request(uuid(12), [FRUIT]), { release: true }, 'and stays released');
  assert.deepEqual(await request(uuid(13), [COLOR]), { wait: true }, 'no record: registered again');
  const page = withWaiters(restarted, s.transcript, (await restarted.chat.read(s.transcript, 1)).questions) ?? [];
  assert.deepEqual(page.map((q) => [q.id, q.answerable]), [['t1', true], ['t2', false]]);
});

test('an unbound waiter: released by the closed question of its content, not by an older identical one', async () => {
  // Without the PreToolUse hook the call is written together with its result (live check T008).
  const s = await session('s-unbound', { graceMs: 200 });
  await s.write(`${ask('t0', [COLOR])}\n${result('t0', { 'Which color?': 'Red' })}`);
  await sleep(300);
  const held = s.hook(uuid(20));
  const early = await Promise.race([held, sleep(150).then(() => 'waiting')]);
  assert.equal(early, 'waiting', 'an identical question closed before the registration does not end the waiter');
  await s.write(`${ask('t1', [COLOR])}\n${result('t1', { 'Which color?': 'Blue' })}`);
  assert.deepEqual(await held, { release: true }, 'the question of the hook was answered in the app');
  assert.deepEqual(await s.hook(uuid(20)), { release: true }, 'the ended waiter never comes back');
  assert.equal((await s.question('t1'))?.state, 'answered');

  // The same with a pending line later: the waiter binds and is answerable as before.
  const b = await session('s-unbound-late', { graceMs: 200 });
  const waiting = b.hook(uuid(21));
  await sleep(50);
  await b.write(ask('t1', [COLOR]));
  await b.until(async () => (await b.question('t1'))?.answerable === true);
  await b.write(result('t1', { 'Which color?': 'Blue' }));
  assert.deepEqual(await waiting, { release: true });
});
