// M39 T007: the started run decides its owner's turns — more than 40 continues, three turns
// without progress, waits that cost no attempt, barriers, a status question of the user — and
// the resume of a working owner sends no second message.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { createAgentChannel, parseHookInput } from '#agent-channel';
import type { KitRunner, WorkflowState } from '#kit-runner';
import { NO_PROGRESS_LIMIT, TURN_TEXTS, createAutopilot, createRunJournal, createRunTurns, hostInputDigest } from '../src/index.ts';
import type { NewRun, RunRecord } from '../src/index.ts';

const tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-run-turns-'));
after(() => rm(tmp, { recursive: true, force: true }));
let n = 0;
const KEY = 'claude:s-1';

const newRun = (over: Partial<NewRun> = {}): NewRun => ({
  projectId: 'p', owner: { key: KEY, client: 'claude', sessionId: 's-1' }, mode: 'after-start', review: false,
  request: { source: 'panel-start', quote: 'start', at: '2026-11-16T10:00:00.000Z', turnId: null, goal: 'g' },
  proposal: null, scopeId: 'auto', authority: null, phase: 'executing', pausedFrom: null, reason: null, nextAction: null, ...over,
});

async function setup(over: Partial<NewRun> = {}) {
  const folder = path.join(tmp, `p${(n += 1)}`);
  const journal = createRunJournal();
  const run = await journal.create(folder, newRun(over));
  const kit = { revision: 1, head: 'h1', progress: true, nextTask: { id: 'T2', kind: 'work', status: 'TODO', title: 't' } as unknown };
  const runner = {
    installed: () => true,
    run: async (_root: string, args: string[]) => {
      if (args[0] !== 'autopilot:status') return { ok: true, result: {} };
      if (kit.progress) kit.revision += 1;
      return { ok: true, result: { head: kit.head, revision: kit.revision, proposalPending: false, scope: 'ACTIVE', delivery: 'IN_PROGRESS', blockedReason: null, transactionPending: false, orchestration: null, paused: false, nextTask: kit.nextTask } };
    },
  } as unknown as KitRunner;
  const view = { plan: { phase: 'running', ownerSession: 's-1' } };
  const workflow = { get: () => view, refresh: async () => view, status: () => ({ execution: { strategy: 'sequential', ownerSession: 's-1' } }) } as unknown as WorkflowState;
  const channel = createAgentChannel({ resolveProject: async () => ({ id: 'p' }) });
  const turns = createRunTurns({ journal, projectPath: async () => folder });
  const autopilot = createAutopilot({ runner, workflow, channel, projectPath: async () => folder, runs: turns, authority: { beforeStart: async () => run.runId, beforeResume: async () => run.runId } });
  channel.setDecider((context) => autopilot.decide(context));
  const stop = async () => {
    const reply = await channel.stop(parseHookInput('claude', { session_id: 's-1', cwd: folder, hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: 'done' })!);
    reply.ack();
    return (reply.answer as { reason?: string } | null)?.reason ?? null;
  };
  const read = async (): Promise<RunRecord> => (await journal.read(folder, run.runId))!;
  return { folder, journal, run, kit, channel, autopilot, stop, read };
}

test('a started run has no limit of 40 continues and survives a restart (no enabled entry needed)', async () => {
  const t = await setup();
  for (let i = 0; i < 45; i += 1) assert.match((await t.stop()) ?? '', /task:start T2/u, `continue ${i + 1}`);
  assert.equal(t.autopilot.get(KEY)?.continues, 45);
});

test('three turns in a row without progress block the run; progress resets the count', async () => {
  const t = await setup();
  assert.match((await t.stop()) ?? '', /task:start T2/u);
  t.kit.progress = false;
  assert.match((await t.stop()) ?? '', /\(1 of 3\)/u);
  t.kit.progress = true;
  assert.match((await t.stop()) ?? '', /task:start T2/u);
  assert.equal((await t.read()).noProgress, 0, 'progress resets the count');
  t.kit.progress = false;
  assert.match((await t.stop()) ?? '', /\(1 of 3\)/u);
  assert.match((await t.stop()) ?? '', /\(2 of 3\)/u);
  assert.equal(await t.stop(), null, 'the third turn without progress releases the Stop');
  const run = await t.read();
  assert.deepEqual([run.phase, run.reason, run.noProgress], ['blocked', 'agent-no-progress', NO_PROGRESS_LIMIT]);
  assert.equal(await t.stop(), null, 'a blocked run keeps the barrier');
});

test('a wait for CI or for an answer releases the Stop without an attempt; a pause keeps the barrier', async () => {
  const waiting = await setup({ phase: 'waiting' });
  await waiting.journal.update(waiting.folder, waiting.run.runId, (r) => ({ ...r, wait: { reason: 'ci', since: 'x', sha: 'a'.repeat(40), detail: 'Ждёт CI' } }));
  waiting.kit.progress = false;
  for (let i = 0; i < 5; i += 1) assert.equal(await waiting.stop(), null);
  assert.equal((await waiting.read()).noProgress ?? 0, 0, 'no attempt spent');
  assert.equal(waiting.autopilot.get(KEY)?.last?.reason, 'waiting-for-ci');
  const paused = await setup({ phase: 'paused' });
  assert.equal(await paused.stop(), null);
  assert.equal(paused.autopilot.get(KEY)?.last?.reason, 'run-paused');
});

test('a status question of the user is answered and the work goes on', async () => {
  const t = await setup();
  const prompt = await t.channel.prompt(parseHookInput('claude', { session_id: 's-1', cwd: t.folder, hook_event_name: 'UserPromptSubmit', prompt: 'Как идёт?' })!);
  prompt.ack();
  t.autopilot.onPrompt(KEY, false); // the service calls it from the prompt hook (session wiring)
  const text = (await t.stop()) ?? '';
  assert.ok(text.includes(TURN_TEXTS.userMessage), text);
  assert.match(text, /wfk session run pause/u);
  assert.match(text, /task:start T2/u);
});

test('Stop + resume of a working owner give one message', async () => {
  const t = await setup();
  assert.match((await t.stop()) ?? '', /task:start T2/u);
  assert.equal(t.channel.get(KEY)?.state, 'working');
  assert.deepEqual(await t.autopilot.resume('p', KEY), { owner: KEY, runId: t.run.runId });
  assert.equal(t.channel.queued(KEY).length, 0, 'the run is the only sender');
});

test('live() sees only the started run of the owner', async () => {
  const t = await setup({ phase: 'preparing' });
  const turns = createRunTurns({ journal: t.journal, projectPath: async () => t.folder });
  assert.equal(await turns.live('p', KEY), null, 'a run before the start');
  await t.journal.update(t.folder, t.run.runId, (r) => ({ ...r, phase: 'executing' }));
  assert.equal((await turns.live('p', KEY))?.barrier, null);
  assert.equal(await turns.live('p', 'codex:other'), null, 'another session');
});

test('a delivery continuation tells how to report the wait for CI with the digest of the frozen policy', async () => {
  const t = await setup();
  const ci = { remote: 'origin', branch: 'ci/auto', requiredChecks: ['Linux x64'], exactSha: true };
  const turns = createRunTurns({ journal: t.journal, projectPath: async () => t.folder });
  const live = (await turns.live('p', KEY))!;
  const status = { nextTask: { id: 'D1', kind: 'delivery', status: 'TODO', title: 'r' }, authorization: { ci } } as never;
  const decision = await turns.turn(live, { action: 'continue', taskId: 'D1', text: 'Go.' }, status, false);
  assert.ok(decision.action === 'continue' && decision.text.includes(TURN_TEXTS.ciWait(t.run.runId, hostInputDigest(ci))));
  assert.equal((await t.read()).phase, 'delivering');
});

test('F001: «Продолжить» of an idle owner with a continuation already queued adds no second message', async () => {
  const t = await setup();
  t.channel.enqueue(KEY, 'Workflow Kit: autopilot run goes on after a restart of the service.', 'panel', 'p');
  assert.deepEqual(await t.autopilot.resume('p', KEY), { owner: KEY, runId: t.run.runId });
  assert.equal(t.channel.queued(KEY).length, 1, 'the run is the only sender');
});
