import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAgentChannel, parseHookInput, sessionKey } from '../src/index.ts';
import type { HookInput, StopDecision } from '../src/index.ts';

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

const input = (client: 'claude' | 'codex', raw: object, over: Partial<HookInput> = {}): HookInput => ({
  ...parseHookInput(client, raw)!,
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
  assert.equal(parseHookInput('other', CODEX_STOP), null);
  assert.equal(parseHookInput('codex', { cwd: '/x' }), null);
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
