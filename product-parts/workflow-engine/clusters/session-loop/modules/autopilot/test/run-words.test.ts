// M40 T006: the service reads the user's «стоп» and «пауза» itself. The word acts when the
// message is received — while the agent is busy, before the automatic acceptance and before
// the publication; another first word, another session and a project without a live run change
// nothing. A step that already runs ends with its result recorded.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { createAgentChannel, parseHookInput } from '#agent-channel';
import { createKeyedMutex } from '#data-store';
import type { KitRunner, WorkflowState } from '#kit-runner';
import { CONTROL_TEXTS, WORD_TEXTS, createAutopilot, createRunCompletion, createRunControl, createRunJournal, createRunTurns, createRunWords, runWord } from '../src/index.ts';
import type { NewRun, RunKit, RunRecord } from '../src/index.ts';

const tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-run-words-'));
after(() => rm(tmp, { recursive: true, force: true, maxRetries: 5 }));
let n = 0;
const KEY = 'claude:s-1';
const SHA = 'a'.repeat(40);
const FINAL = 'f'.repeat(40);
const PUB = { branch: 'main', upstream: 'origin/main' };
const authority = { grantRevision: 1, deliveryTaskIds: [], accept: true, close: true, publication: PUB, acceptancePolicy: 'automatic' as const, baseHead: null, revocation: null };

const newRun = (over: Partial<NewRun> = {}): NewRun => ({
  projectId: 'p', owner: { key: KEY, client: 'claude', sessionId: 's-1' }, mode: 'after-start', review: false,
  request: { source: 'panel-start', quote: 'start', at: '2026-11-17T10:00:00.000Z', turnId: null, goal: 'g' },
  proposal: null, scopeId: 'auto', authority, phase: 'executing', pausedFrom: null, reason: null, nextAction: null, ...over,
});

/** A project with a run (or without one), the run control, the words and the completion. */
async function setup(over: Partial<NewRun> | null = {}, completion?: RunRecord['completion']) {
  const folder = path.join(tmp, `p${(n += 1)}`);
  const journal = createRunJournal();
  let run = over ? await journal.create(folder, newRun(over)) : null;
  if (run && completion) run = await journal.update(folder, run.runId, (r) => ({ ...r, completion }));
  const calls: string[] = [];
  const kit = { status: { revision: 3, head: SHA, scope: 'ACTIVE' as string, delivery: 'READY_FOR_ACCEPTANCE' as string | null, transactionPending: false, orchestration: null, acceptance: [{ criterion: 0, kind: 'automatic', checks: [], evidence: ['r.md'], evidenceMissing: [] }], authorization: run ? { runId: run.runId, revoked: null, accept: true, close: true, ci: null } : null } as Record<string, unknown> };
  const hooks = { beforeHost: null as null | ((operation: string) => Promise<void>), beforePublish: null as null | (() => Promise<void>) };
  const runKit = {
    status: async () => structuredClone(kit.status),
    scope: async () => ({ id: 'auto', ownerSession: 's-1', automation: null }),
    host: async (_root: string, step: { operation: string }) => {
      await hooks.beforeHost?.(step.operation);
      calls.push(step.operation);
      if (step.operation === 'accept') kit.status = { ...kit.status, delivery: 'ACCEPTED' };
      if (step.operation === 'close') kit.status = { ...kit.status, scope: 'NONE', delivery: null, authorization: null };
      return { ok: true, code: null, message: null, result: { commit: { sha: step.operation === 'close' ? FINAL : SHA } }, ticketId: `t-${step.operation}`, redeemed: true };
    },
  } as unknown as RunKit;
  const publisher = {
    async publish(_f: string, _open: boolean, expected: { sha: string }) {
      await hooks.beforePublish?.();
      calls.push(`push:${expected.sha}`);
      return { sha: expected.sha, already: false };
    },
    async stageCi(_f: string, target: { sha: string }) {
      calls.push(`ci:${target.sha}`);
      return { sha: target.sha, already: false };
    },
  };
  const actions = { pause: async () => void calls.push('kit-pause'), resume: async (_p: string, session?: string) => ({ owner: session! }), halt: () => void calls.push('halt') };
  const projectPath = async (id: string) => (id === 'p' ? folder : undefined);
  // The queue of the project, as in the service: Kit gets one command at a time.
  const mutex = createKeyedMutex();
  const control = createRunControl({ journal, kit: runKit, mutex, projectPath, listProjects: async () => [{ id: 'p', path: folder }], actions: () => actions, activity: () => ({ state: 'working' }), send: () => undefined });
  const told: string[] = [];
  const words = createRunWords({ control, tell: (_p, _k, text) => void told.push(text) });
  const git = async (_cwd: string, args: string[]) => ({ code: 0, stdout: args[0] === 'log' ? '' : `${FINAL}\n`, stderr: '' });
  const completer = createRunCompletion({ journal, kit: runKit, git, publisher, mutex, projectPath, listProjects: async () => [{ id: 'p', path: folder }] });
  const read = async (): Promise<RunRecord> => (await journal.read(folder, run!.runId))!;
  return { folder, journal, run: run!, kit, calls, hooks, control, words, told, completer, read };
}

test('the word: NFC, lower case without a locale, the first word without the punctuation around it', () => {
  const stop = ['Стоп', 'СТОП!', 'Stop.', '  stop  ', 'стоп, хватит', 'Останови', 'остановись.', 'Остановить запуск', '«Стоп»', 'STOP\nсейчас'];
  const pause = ['пауза, посмотрю', 'Пауза', 'PAUSE', 'pause…', 'Приостанови!'];
  for (const text of stop) assert.equal(runWord(text), 'stop', text);
  for (const text of pause) assert.equal(runWord(text), 'pause', text);
  // A decomposed «й» (и + U+0306) is the same word after NFC; «İ» is not lowered by a locale.
  assert.equal(runWord('ОСТАНОВЙ'.normalize('NFD').replace('Й', 'ИТЬ')), 'stop');
  assert.equal(runWord('STOP'.replace('O', 'Ó')), null, 'another letter is another word');
  for (const text of ['а когда стоп?', 'не останавливай', 'стопка', 'stops', 'паузы не надо', 'Как идёт?', '', '   ', '?!', 'constructor', 'toString']) assert.equal(runWord(text), null, text);
});

test('«стоп» and «пауза» act on the live run of the owner at once; the agent is told what happened', async () => {
  const stop = await setup();
  const stopped = await stop.words.received('p', KEY, 'Стоп');
  assert.deepEqual([stopped?.action, stopped?.runId], ['stop', stop.run.runId]);
  // The barrier is there before Kit records the revocation.
  assert.deepEqual([(await stop.read()).phase, (await stop.read()).reason, (await stop.read()).nextAction], ['stopped', 'user-stop', CONTROL_TEXTS.stopped]);
  assert.deepEqual(stop.told, [WORD_TEXTS.stop(stop.run.runId)]);
  await stopped!.settled;
  assert.deepEqual(stop.calls, ['halt', 'autopilot:revoke']);
  const after = await stop.read();
  assert.deepEqual([after.authority?.revocation?.reason, after.authority?.revocation?.resumable, after.tickets], ['user-stop', false, ['t-autopilot:revoke']]);
  assert.equal(await stop.words.received('p', KEY, 'стоп'), null, 'a stopped run is no live run');

  const pause = await setup();
  const paused = await pause.words.received('p', KEY, 'пауза, посмотрю');
  assert.equal(paused?.action, 'pause');
  assert.deepEqual([(await pause.read()).phase, (await pause.read()).pausedFrom, (await pause.read()).reason], ['paused', 'executing', 'user-pause']);
  await paused!.settled;
  assert.deepEqual(pause.calls, ['kit-pause']);
  assert.deepEqual(pause.told, [WORD_TEXTS.pause(pause.run.runId)]);
  assert.equal(await pause.words.received('p', KEY, 'Пауза'), null, 'a paused run is paused already');
  // «Стоп» of a paused run stops it for good.
  const then = await pause.words.received('p', KEY, 'Stop.');
  await then!.settled;
  assert.deepEqual([(await pause.read()).phase, (await pause.read()).pausedFrom], ['stopped', 'executing']);
});

test('another first word, another session and a project without a live run change nothing', async () => {
  const t = await setup();
  assert.equal(await t.words.received('p', KEY, 'а когда стоп?'), null);
  assert.equal(await t.words.received('p', 'codex:other', 'стоп'), null, 'not the owner');
  assert.equal(await t.words.received('unknown', KEY, 'стоп'), null, 'no such project');
  assert.deepEqual([(await t.read()).phase, (await t.read()).revision, t.calls, t.told], ['executing', 1, [], []]);
  const none = await setup(null);
  assert.equal(await none.words.received('p', KEY, 'стоп'), null, 'no run');
  assert.deepEqual([none.calls, none.told], [[], []]);
});

test('«стоп» before the automatic acceptance: no acceptance, no close, no push', async () => {
  const t = await setup();
  const done = await t.words.received('p', KEY, 'Стоп');
  await done!.settled;
  await t.completer.advance('p');
  await t.completer.advanceAll();
  assert.deepEqual(t.calls, ['halt', 'autopilot:revoke']);
  assert.equal((await t.read()).phase, 'stopped');
  // The same for a pause: the run waits for «Продолжить».
  const paused = await setup();
  await (await paused.words.received('p', KEY, 'пауза'))!.settled;
  await paused.completer.advance('p');
  assert.deepEqual([paused.calls, (await paused.read()).phase], [['kit-pause'], 'paused']);
});

test('«стоп» before the publication: nothing is pushed', async () => {
  const t = await setup({ phase: 'publishing' }, { ci: null, publication: PUB, finalSha: FINAL });
  t.kit.status = { ...t.kit.status, scope: 'NONE', delivery: null, authorization: null };
  await (await t.words.received('p', KEY, 'stop'))!.settled;
  await t.completer.advance('p');
  await t.completer.advanceAll();
  assert.deepEqual(t.calls, ['halt', 'autopilot:revoke'], 'nothing is pushed');
  assert.equal((await t.read()).phase, 'stopped');
});

test('a step that runs when «стоп» comes ends with its result recorded and nothing follows it', async () => {
  // The word comes while Kit records the acceptance: the acceptance is kept, the close never starts.
  const accepting = await setup();
  let settled: Promise<void> = Promise.resolve();
  accepting.hooks.beforeHost = async (operation) => {
    if (operation !== 'accept') return;
    accepting.hooks.beforeHost = null;
    settled = (await accepting.words.received('p', KEY, 'стоп'))!.settled;
  };
  await accepting.completer.advance('p');
  await settled;
  const run = await accepting.read();
  assert.deepEqual(accepting.calls, ['halt', 'accept', 'autopilot:revoke']);
  assert.deepEqual([run.phase, run.reason, run.receipts.map((r) => r.type)], ['stopped', 'user-stop', ['accept']]);
  assert.ok(run.tickets.includes('t-accept'), 'the redeemed ticket of the acceptance is recorded');
  await accepting.completer.advance('p');
  assert.equal(accepting.calls.includes('close'), false);

  // The word comes during the push: the push ends, its receipt is written, the run stays stopped.
  const pushing = await setup({ phase: 'publishing' }, { ci: null, publication: PUB, finalSha: FINAL });
  pushing.kit.status = { ...pushing.kit.status, scope: 'NONE', delivery: null, authorization: null };
  pushing.hooks.beforePublish = async () => void (settled = (await pushing.words.received('p', KEY, 'Стоп'))!.settled);
  await pushing.completer.advance('p');
  await settled;
  const pushed = await pushing.read();
  assert.deepEqual(pushing.calls, ['halt', `push:${FINAL}`, 'autopilot:revoke']);
  assert.deepEqual([pushed.phase, pushed.reason, pushed.receipts.map((r) => r.type), pushed.completion?.published?.sha], ['stopped', 'user-stop', ['publish'], FINAL]);

  // A pause during the acceptance: the run goes on from the close after «Продолжить».
  const paused = await setup();
  paused.hooks.beforeHost = async (operation) => {
    if (operation !== 'accept') return;
    paused.hooks.beforeHost = null;
    await paused.words.received('p', KEY, 'пауза');
  };
  await paused.completer.advance('p');
  const kept = await paused.read();
  assert.deepEqual([kept.phase, kept.pausedFrom, kept.reason, kept.receipts.map((r) => r.type)], ['paused', 'closing', 'user-pause', ['accept']]);
  assert.equal(paused.calls.includes('close'), false);
});

test('«стоп» from the panel while the agent is busy: no continuation after the end of the turn', async () => {
  const folder = path.join(tmp, `p${(n += 1)}`);
  const journal = createRunJournal();
  const run = await journal.create(folder, newRun());
  const kit = { revision: 1 };
  const runner = {
    installed: () => true,
    run: async (_root: string, args: string[]) =>
      args[0] === 'autopilot:status'
        ? { ok: true, result: { head: 'h1', revision: (kit.revision += 1), proposalPending: false, scope: 'ACTIVE', delivery: 'IN_PROGRESS', blockedReason: null, transactionPending: false, orchestration: null, paused: false, nextTask: { id: 'T2', kind: 'work', status: 'TODO', title: 't' } } }
        : { ok: true, result: {} },
  } as unknown as KitRunner;
  const view = { plan: { phase: 'running', ownerSession: 's-1' } };
  const workflow = { get: () => view, refresh: async () => view, status: () => ({ execution: { strategy: 'sequential', ownerSession: 's-1' } }) } as unknown as WorkflowState;
  const channel = createAgentChannel({ resolveProject: async () => ({ id: 'p' }) });
  const turns = createRunTurns({ journal, projectPath: async () => folder });
  const autopilot = createAutopilot({ runner, workflow, channel, projectPath: async () => folder, runs: turns, authority: { beforeStart: async () => run.runId, beforeResume: async () => run.runId } });
  channel.setDecider((context) => autopilot.decide(context));
  const runKit = { status: async () => null, host: async () => ({ ok: true, code: null, message: null, result: {}, ticketId: 't1', redeemed: true }) } as unknown as RunKit;
  const control = createRunControl({ journal, kit: runKit, projectPath: async () => folder, listProjects: async () => [], actions: () => ({ pause: async () => undefined, resume: async () => ({ owner: KEY }), halt: (p) => autopilot.halt(p) }), activity: (key) => channel.get(key), send: () => undefined });
  const words = createRunWords({ control, tell: (projectId, key, text) => void channel.enqueue(key, text, 'panel', projectId) });
  const stop = async () => {
    const reply = await channel.stop(parseHookInput('claude', { session_id: 's-1', cwd: folder, hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: 'done' })!);
    reply.ack();
    return (reply.answer as { reason?: string } | null)?.reason ?? null;
  };
  // The run continues its owner: the agent is in a turn.
  assert.match((await stop()) ?? '', /task:start T2/u);
  assert.equal(channel.get(KEY)?.state, 'working');
  // The panel message is checked when the service receives it, then queued behind the turn.
  const done = await words.received('p', KEY, 'Стоп');
  channel.enqueue(KEY, 'Стоп', 'user', 'p');
  assert.equal((await journal.read(folder, run.runId))?.phase, 'stopped', 'stopped while the agent works');
  await done!.settled;
  // The end of the turn delivers the user's message with the context; no continuation of the run.
  const delivered = (await stop()) ?? '';
  assert.ok(delivered.includes('Стоп') && delivered.includes(WORD_TEXTS.stop(run.runId)), delivered);
  assert.doesNotMatch(delivered, /task:start/u);
  assert.equal(await stop(), null, 'the answer to the user ends the work: nothing is continued');
  assert.equal(await turns.live('p', KEY), null);
});
