import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MESSAGE_MAX_CHARS, QUEUED_TEXT_MAX, QUEUED_VIEW_MAX, USER_MESSAGE_SOURCE, createAgentChannel, parseHookInput, queueSessionMessage, sessionKey } from '../src/index.ts';
import type { HookDialects, HookInput, StopDecision } from '../src/index.ts';

// Inputs as Claude 2.1.318 and codex-cli 0.166.0 send them (spec section 3).
const CLAUDE_STOP = {
  session_id: 'cd718965-ec3f-44fe-93e8-33d1c6848a88',
  transcript_path: '/home/u/.claude/projects/p/cd718965.jsonl',
  cwd: '/home/u/Projects/demo',
  prompt_id: '8e2d7d32',
  permission_mode: 'default',
  hook_event_name: 'Stop',
  stop_hook_active: false,
  last_assistant_message: 'APPLE',
};
const CODEX_STOP = {
  session_id: '01a1afe3-05b5-75b0-a8b6-59bad1d1313b',
  turn_id: '01a1afe3-08e4-79b3-b2e3-5f4af0790720',
  transcript_path: '/home/u/.codex/sessions/rollout.jsonl',
  cwd: '/home/u/Projects/demo/src',
  hook_event_name: 'Stop',
  model: 'gpt',
  stop_hook_active: false,
  last_assistant_message: 'APPLE',
};

// The hook clients as the service builds them from the provider registry.
const DIALECTS: HookDialects = (client) => (client === 'kimi' ? 'kimi' : client === 'claude' || client === 'codex' ? 'claude' : undefined);

const input = (client: 'claude' | 'codex' | 'kimi', raw: object, over: Partial<HookInput> = {}): HookInput => ({
  ...parseHookInput(client, raw, undefined, DIALECTS)!,
  ...over,
});

function channel(decide?: (calls: number) => StopDecision, holdMs = 5_000) {
  let calls = 0;
  return createAgentChannel({
    resolveProject: async (folder) => (folder.startsWith('/home/u/Projects/demo') ? { id: 'p1' } : undefined),
    decide: decide ? () => decide(++calls) : undefined,
    holdMs,
  });
}

test('parseHookInput reads Claude and Codex Stop inputs', () => {
  const claude = parseHookInput('claude', CLAUDE_STOP, '/home/u/Projects/demo')!;
  assert.equal(claude.sessionId, CLAUDE_STOP.session_id);
  assert.equal(claude.turnId, null);
  assert.equal(claude.projectDir, '/home/u/Projects/demo');
  const codex = parseHookInput('codex', { ...CODEX_STOP, stop_hook_active: true })!;
  assert.equal(codex.turnId, CODEX_STOP.turn_id);
  assert.equal(codex.stopHookActive, true);
  assert.equal(parseHookInput('other', CODEX_STOP, undefined, DIALECTS), null);
  assert.equal(parseHookInput('Bad Id', CODEX_STOP), null);
  assert.equal(claude.dialect, 'claude');
  assert.equal(parseHookInput('codex', { cwd: '/x' }), null);
  assert.equal(claude.sessionTitle, null);
  const prompt = parseHookInput('claude', { session_id: 's', hook_event_name: 'UserPromptSubmit', prompt: 'x', session_title: 'Склад' })!;
  assert.equal(prompt.sessionTitle, 'Склад');
});

test('without a decision the Stop is released at once; activity is recorded', async () => {
  const ch = channel();
  const reply = await ch.stop(input('codex', CODEX_STOP));
  assert.equal(reply.answer, null);
  const activity = ch.get(sessionKey('codex', CODEX_STOP.session_id))!;
  assert.equal(activity.projectId, 'p1');
  assert.equal(activity.state, 'waiting');
  assert.equal(activity.lastAssistantMessage, 'APPLE');
  assert.ok(activity.lastStopAt);
  await ch.prompt(input('codex', CODEX_STOP));
  assert.equal(ch.get(activity.key)!.state, 'working');
  assert.ok(ch.get(activity.key)!.turnStartedAt);
});

test('a queued message is a block answer delivered once', async () => {
  const ch = channel();
  const key = sessionKey('claude', CLAUDE_STOP.session_id);
  ch.enqueue(key, 'Workflow Kit: выбран режим «последовательно».');
  const first = await ch.stop(input('claude', CLAUDE_STOP));
  assert.deepEqual(first.answer, { decision: 'block', reason: 'Workflow Kit: выбран режим «последовательно».' });
  first.ack();
  const again = await ch.stop(input('claude', { ...CLAUDE_STOP, stop_hook_active: true }));
  assert.equal(again.answer, null, 'no repeated delivery and no loop on stop_hook_active');
});

test('an unsent answer goes back to the queue (nack)', async () => {
  const ch = channel();
  const key = sessionKey('claude', CLAUDE_STOP.session_id);
  ch.enqueue(key, 'first');
  const lost = await ch.stop(input('claude', CLAUDE_STOP));
  ch.enqueue(key, 'second');
  lost.nack();
  assert.deepEqual(ch.queued(key).map((m) => m.text), ['first', 'second']);
  const retry = await ch.stop(input('claude', CLAUDE_STOP));
  assert.deepEqual(retry.answer, { decision: 'block', reason: 'first\n\nsecond' });
});

test('a held Stop waits for the user and answers with the queued message', async () => {
  const ch = channel(() => ({ kind: 'hold', reason: 'waiting-for-mode-choice' }));
  const key = sessionKey('codex', CODEX_STOP.session_id);
  const pending = ch.stop(input('codex', CODEX_STOP));
  await new Promise((resolve) => setTimeout(resolve, 20));
  const held = ch.get(key)!;
  assert.equal(held.state, 'holding');
  assert.equal(held.holdReason, 'waiting-for-mode-choice');
  assert.ok(held.holdUntil);
  ch.enqueue(key, 'Workflow Kit: пользователь выбрал «Выполнить самому, последовательно».');
  const reply = await pending;
  assert.equal((reply.answer as { decision: string }).decision, 'block');
  reply.ack();
  assert.equal(ch.get(key)!.state, 'working');
});

test('a held Stop is released after the hold time and the message goes with the next prompt', async () => {
  const ch = channel(() => ({ kind: 'hold', reason: 'waiting-for-mode-choice' }), 60);
  const key = sessionKey('claude', CLAUDE_STOP.session_id);
  const reply = await ch.stop(input('claude', CLAUDE_STOP));
  assert.equal(reply.answer, null);
  assert.equal(ch.get(key)!.state, 'waiting');
  ch.enqueue(key, 'Workflow Kit: продолжай по плану.');
  const prompt = await ch.prompt(input('claude', CLAUDE_STOP));
  assert.deepEqual(prompt.answer, {
    hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: 'Workflow Kit: продолжай по плану.' },
  });
  prompt.ack();
  assert.equal(ch.queued(key).length, 0);
});

test('a hold ends when the hook goes away (abort)', async () => {
  const ch = channel(() => ({ kind: 'hold', reason: 'x' }));
  const abort = new AbortController();
  const pending = ch.stop(input('claude', CLAUDE_STOP), abort.signal);
  await new Promise((resolve) => setTimeout(resolve, 10));
  abort.abort();
  assert.equal((await pending).answer, null);
});

test('wake asks the decider again; continue answers with its text', async () => {
  let ready = false;
  const ch = channel(() => (ready ? { kind: 'continue', text: 'Workflow Kit: продолжай T002.' } : { kind: 'hold', reason: 'paused' }));
  const pending = ch.stop(input('codex', CODEX_STOP));
  await new Promise((resolve) => setTimeout(resolve, 10));
  ready = true;
  ch.wake(sessionKey('codex', CODEX_STOP.session_id));
  assert.deepEqual((await pending).answer, { decision: 'block', reason: 'Workflow Kit: продолжай T002.' });
});

test('close releases every held Stop', async () => {
  const ch = channel(() => ({ kind: 'hold', reason: 'x' }));
  const pending = ch.stop(input('codex', CODEX_STOP));
  await new Promise((resolve) => setTimeout(resolve, 10));
  ch.close();
  assert.equal((await pending).answer, null);
});

test('a panel message is queued only for a known session of the project, non-empty and not too long', async () => {
  const c = channel();
  const key = sessionKey('claude', CLAUDE_STOP.session_id);
  assert.throws(() => queueSessionMessage(c, 'p1', key, 'hello'), { code: 'unknown-session' });
  (await c.stop(input('claude', CLAUDE_STOP))).ack();
  assert.throws(() => queueSessionMessage(c, 'p2', key, 'hello'), { code: 'unknown-session' });
  assert.throws(() => queueSessionMessage(c, 'p1', key, '   '), { code: 'empty-message' });
  assert.throws(() => queueSessionMessage(c, 'p1', key, 7), { code: 'empty-message' });
  assert.throws(() => queueSessionMessage(c, 'p1', key, 'x'.repeat(MESSAGE_MAX_CHARS + 1)), { code: 'message-too-long' });
  const message = queueSessionMessage(c, 'p1', key, '  do the task  ');
  assert.equal(message.text, 'do the task');
  assert.equal(message.source, USER_MESSAGE_SOURCE);
  assert.deepEqual(c.queued(key).map((m) => m.text), ['do the task']);
  c.close();
});

test('M28: the activity shows only the user queue, at most 20, cut texts; delivery empties it', async () => {
  const c = channel();
  const key = sessionKey('claude', CLAUDE_STOP.session_id);
  (await c.stop(input('claude', CLAUDE_STOP))).ack();
  c.enqueue(key, 'Workflow Kit: service reminder', 'panel', 'p1');
  const long = queueSessionMessage(c, 'p1', key, 'x'.repeat(QUEUED_TEXT_MAX + 50));
  for (let i = 0; i < QUEUED_VIEW_MAX; i += 1) queueSessionMessage(c, 'p1', key, `message ${i}`);
  const shown = c.section().sessions.find((s) => s.key === key)!.queued;
  assert.equal(shown.length, QUEUED_VIEW_MAX);
  assert.ok(!shown.some((m) => m.text.includes('service')), 'service messages stay out');
  assert.equal(shown[0]!.id, long.id);
  assert.equal(shown[0]!.text.length, QUEUED_TEXT_MAX);
  assert.equal(shown[0]!.at, long.createdAt);
  assert.equal(c.get(key)!.pending, QUEUED_VIEW_MAX + 2, 'pending still counts every message');
  const reply = await c.stop(input('claude', CLAUDE_STOP));
  reply.ack();
  assert.deepEqual(c.get(key)!.queued, [], 'a delivered message leaves the view');
  c.close();
});

test('a session the channel has not seen yet takes a panel message when the provider lists it for the project', () => {
  const c = channel();
  const key = sessionKey('claude', 'after-restart');
  assert.throws(() => queueSessionMessage(c, 'p1', key, 'hello'), { code: 'unknown-session' });
  const message = queueSessionMessage(c, 'p1', key, 'hello', true);
  assert.equal(message.text, 'hello');
  assert.equal(c.get(key)!.projectId, 'p1', 'the new slot belongs to the project');
  assert.equal(c.get(key)!.state, 'waiting');
  assert.throws(() => queueSessionMessage(c, 'p2', key, 'other', false), { code: 'unknown-session' });
  c.close();
});

test('a hold with a timeout answer reminds the agent instead of a silent release (M4 section 4)', async () => {
  const ch = channel(() => ({ kind: 'hold', reason: 'waiting-for-review', timeoutAnswer: 'Workflow Kit: ревью идёт.' }), 30);
  const key = sessionKey('codex', CODEX_STOP.session_id);
  const reply = await ch.stop(input('codex', CODEX_STOP));
  assert.deepEqual(reply.answer, { decision: 'block', reason: 'Workflow Kit: ревью идёт.' });
  assert.equal(ch.get(key)!.state, 'working');
});

test('stop listeners hear the whole last message and what started the turn', async () => {
  const ch = channel(() => ({ kind: 'continue', text: 'дальше' }));
  const key = sessionKey('claude', CLAUDE_STOP.session_id);
  const events: import('../src/index.ts').StopEvent[] = [];
  const off = ch.onStop((event) => events.push(event));
  const long = 'x'.repeat(500);
  await ch.prompt(input('claude', CLAUDE_STOP));
  (await ch.stop(input('claude', CLAUDE_STOP, { lastAssistantMessage: long }))).ack();
  ch.enqueue(key, 'замечания', 'review');
  (await ch.stop(input('claude', CLAUDE_STOP))).ack();
  await ch.stop(input('claude', CLAUDE_STOP));
  off();
  await ch.stop(input('claude', CLAUDE_STOP));
  assert.deepEqual(events.map((e) => [e.origin, e.sources]), [['user', []], ['decider', []], ['delivery', ['review']]]);
  assert.equal(events[0]!.lastAssistantMessage, long);
  assert.equal(events[0]!.projectId, 'p1');
});

test('a reminder turn is reported as such', async () => {
  const ch = channel(() => ({ kind: 'hold', reason: 'waiting-for-review', timeoutAnswer: 'жди' }), 20);
  const origins: string[] = [];
  ch.onStop((event) => origins.push(event.origin));
  (await ch.stop(input('codex', CODEX_STOP))).ack();
  await ch.stop(input('codex', CODEX_STOP));
  assert.deepEqual(origins, ['unknown', 'reminder']);
});

// Input as Kimi Code 2.5.2 sends it (docs/evidence/M8-kimi-captures.md, hooks-last.log).
const KIMI_PROMPT = {
  hook_event_name: 'UserPromptSubmit',
  session_id: 'session_c4db56ed-538b-40b0-9c61-32467d766652',
  cwd: '/home/u/Projects/demo',
  client_type: 'kimi_code_cli',
  session_title: 'Kit test 2',
  prompt: [{ type: 'text', text: 'first part' }, { type: 'image', url: 'x' }, { type: 'text', text: 'second part' }],
  is_steer: false,
};

test('a prompt given as an array of parts is read as the text of its parts', () => {
  const kimi = parseHookInput('kimi', KIMI_PROMPT, undefined, DIALECTS)!;
  assert.equal(kimi.dialect, 'kimi');
  assert.equal(kimi.prompt, 'first part\nsecond part');
  assert.equal(kimi.sessionTitle, 'Kit test 2');
  assert.equal(parseHookInput('kimi', { ...KIMI_PROMPT, prompt: [] }, undefined, DIALECTS)!.prompt, null);
  assert.equal(parseHookInput('kimi', { ...KIMI_PROMPT, prompt: 'plain' }, undefined, DIALECTS)!.prompt, 'plain');
});

test('UserPromptSubmit of a kimi-dialect client is answered with { message }; claude keeps additionalContext', async () => {
  const ch = channel();
  const key = sessionKey('kimi', KIMI_PROMPT.session_id);
  ch.enqueue(key, 'один');
  ch.enqueue(key, 'два');
  assert.equal(ch.get(key)!.client, 'kimi');
  const reply = await ch.prompt(input('kimi', KIMI_PROMPT));
  assert.deepEqual(reply.answer, { message: 'один\n\nдва' });
  reply.ack();
  assert.equal(ch.queued(key).length, 0);
  assert.equal((await ch.prompt(input('kimi', KIMI_PROMPT))).answer, null);
  const claudeKey = sessionKey('claude', CLAUDE_STOP.session_id);
  ch.enqueue(claudeKey, 'три');
  const claude = await ch.prompt(input('claude', { ...CLAUDE_STOP, hook_event_name: 'UserPromptSubmit', prompt: 'x' }));
  assert.deepEqual(claude.answer, { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: 'три' } });
});

test('waiting tells a message on its way from a delivered one (spec M11)', async () => {
  const ch = channel();
  try {
    const input = parseHookInput('claude', CLAUDE_STOP)!;
    const key = sessionKey('claude', CLAUDE_STOP.session_id);
    const message = ch.enqueue(key, 'go');
    assert.equal(ch.waiting(key, message.id), true);
    assert.equal(ch.waiting(key, 'other'), false);
    const unsent = await ch.stop(input);
    unsent.nack();
    assert.equal(ch.waiting(key, message.id), true, 'an answer that was not sent puts it back');
    const sent = await ch.stop(input);
    sent.ack();
    assert.equal(ch.waiting(key, message.id), false);
    assert.equal(ch.waiting('claude:nobody', message.id), false);
  } finally {
    ch.close();
  }
});

test('parseHookInput takes the panel mark only as true (M19)', () => {
  assert.equal(parseHookInput('claude', CLAUDE_STOP, undefined, DIALECTS, true)!.panelProcess, true);
  for (const mark of [undefined, false, 'true', 1]) assert.equal(parseHookInput('claude', CLAUDE_STOP, undefined, DIALECTS, mark)!.panelProcess, false);
});

test('external follows the last hook of the session; a session made by enqueue starts as the panel one (M19)', async () => {
  const ch = channel();
  const key = sessionKey('claude', CLAUDE_STOP.session_id);
  ch.enqueue(sessionKey('claude', 'queued-first'), 'hello', 'panel', 'p1');
  assert.equal(ch.get(sessionKey('claude', 'queued-first'))!.external, false, 'no hook yet');
  await ch.stop(input('claude', CLAUDE_STOP, { panelProcess: true }));
  assert.equal(ch.get(key)!.external, false);
  await ch.prompt(input('claude', { ...CLAUDE_STOP, prompt: 'x' }));
  assert.equal(ch.get(key)!.external, true, 'a prompt hook without the mark');
  await ch.stop(input('claude', CLAUDE_STOP));
  assert.equal(ch.get(key)!.external, true);
  await ch.prompt(input('claude', { ...CLAUDE_STOP, prompt: 'x' }, { panelProcess: true }));
  assert.equal(ch.get(key)!.external, false);
  assert.equal(ch.section().sessions.find((s) => s.key === key)!.external, false, 'the section carries it');
  ch.close();
});
