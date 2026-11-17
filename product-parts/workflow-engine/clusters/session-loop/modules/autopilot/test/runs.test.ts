// M39 T005: autopiloting runs with a scripted Kit (refusals and policies); the grant against the
// real bundle is in runs-real.test.ts.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { createRouter, createStateRegistry } from '#http-server';
import { USER_MESSAGE_SOURCE, createAgentChannel, parseHookInput } from '#agent-channel';
import type { StopDecision, TurnUserSource } from '#agent-channel';
import { SUPPORTED_HOST_PROTOCOL } from '#plan-view';
import { POLICY_TEXTS, createHostTickets, createRunJournal, createRuns, createSettingsStore, registerAutopilotingRoutes } from '../src/index.ts';
import type { AutopilotingMode, RunKit, RunKitStatus } from '../src/index.ts';

const tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-runs-'));
after(() => rm(tmp, { recursive: true, force: true }));
const CAPABILITY = { authorization: true, automation: true, complete: true, deferDelivery: true, hostProtocol: SUPPORTED_HOST_PROTOCOL, instructions: true };
const KEY = 'claude:s-1';
let n = 0;

async function setup(mode: AutopilotingMode, status: Partial<RunKitStatus> | null = {}, review = true, sessionDecision?: boolean, userSource?: (key: string) => TurnUserSource | null) {
  const dir = path.join(tmp, `p${(n += 1)}`);
  await mkdir(path.join(dir, 'config'), { recursive: true });
  const settings = createSettingsStore({ configDir: path.join(dir, 'config') });
  if (mode !== 'off' || review) await settings.write({ expectedRevision: 0, mode, review });
  const sources = new Map<string, TurnUserSource | null>();
  const decided: Array<[string, boolean]> = [];
  const kit = {
    status: async () => (status === null ? null : ({ revision: 3, head: 'abc', capability: CAPABILITY, proposal: null, authorization: null, acceptance: null, ...status } as RunKitStatus)),
    supported: (value: RunKitStatus | null) => (value?.capability ? { ready: true } : { ready: false }),
    scope: async () => null,
    host: async () => assert.fail('no host step expected'),
  } as unknown as RunKit;
  const journal = createRunJournal();
  const runs = createRuns({
    settings,
    journal,
    kit,
    tickets: createHostTickets(),
    userSource: userSource ?? ((key) => sources.get(key) ?? null),
    projectPath: async (id) => (id === 'p1' ? dir : undefined),
    listProjects: async () => [{ id: 'p1', path: dir }],
    decideReview: async (_id, key, on) => {
      decided.push([key, on]);
      return sessionDecision;
    },
  });
  let ids = 0;
  // The user's message that began the current turn of the session (a new one per call).
  const say = (key: string, text: string, at = '2026-11-16T10:00:00.000Z') => {
    ids += 1;
    sources.set(key, { id: `m-${ids}`, text, at, via: 'prompt', turnRef: `g-${ids}` });
  };
  // A turn the user did not begin (a continuation, a reminder, a review): no source.
  const service = (key: string) => sources.set(key, null);
  return { runs, say, service, decided, dir, settings, journal };
}

test('M40: full and a message of the user in this turn: a run without the plan question, review from Settings', async () => {
  const { runs, say, decided, journal, dir } = await setup('full');
  say(KEY, 'Сделай учёт склада: спецификация, план и выполнение');
  const first = (await runs.authorizePreparation('p1', KEY, 'Docs'))!;
  assert.deepEqual([first.action, first.policy, first.mode, first.review], ['prepare', 'full', 'full', true]);
  assert.match(first.runId!, /^run-/u);
  assert.match(first.instruction, /scope:propose/u);
  assert.match(first.instruction, /registered by the user's message of this turn/u);
  assert.deepEqual(decided, [[KEY, true]]);
  const run = (await journal.read(dir, first.runId!))!;
  // The note of the run is the user's message itself; the agent passed no quote.
  assert.deepEqual([run.request.source, run.request.quote, run.request.turnId, run.request.goal], ['user-command', 'Сделай учёт склада: спецификация, план и выполнение', 'm-1', 'Docs']);
  const section = await runs.section();
  assert.equal(section.projects['p1']?.source, 'user-command');
  assert.equal(JSON.stringify(section).includes('склада'), false, 'the panel brief quotes no words');
});

test('M40: a repeat in the same turn returns the same run; another message or session gets run-active', async () => {
  const { runs, say } = await setup('full');
  say(KEY, 'Да, делай план');
  const first = (await runs.authorizePreparation('p1', KEY, 'Docs'))!;
  assert.equal((await runs.authorizePreparation('p1', KEY, 'Docs again'))?.runId, first.runId);
  say(KEY, 'И ещё одну задачу');
  await assert.rejects(runs.authorizePreparation('p1', KEY, 'Other'), { code: 'run-active' });
  say('codex:s-2', 'Сделай другое');
  await assert.rejects(runs.authorizePreparation('p1', 'codex:s-2', 'Other'), { code: 'run-active' });
});

test('M40: no message of the user in this turn — the usual question card (null), no run', async () => {
  const { runs, say, service, journal, dir } = await setup('full');
  assert.equal(await runs.authorizePreparation('p1', KEY, 'Docs'), null, 'no message at all');
  service(KEY);
  assert.equal(await runs.authorizePreparation('p1', KEY, 'Docs'), null, 'a continuation, a reminder or a review');
  say(KEY, 'Workflow Kit: autopilot. Continue the workflow');
  assert.equal(await runs.authorizePreparation('p1', KEY, 'Docs'), null, 'a service text is no user message');
  assert.deepEqual(await journal.list(dir), []);
});

test('M40: off and after-start — the question card; full with an old Kit — kit-update-required', async () => {
  for (const mode of ['off', 'after-start'] as const) {
    const { runs, say, journal, dir } = await setup(mode);
    say(KEY, 'Да, составляй спецификацию и план');
    assert.equal(await runs.authorizePreparation('p1', KEY, 'Docs'), null, mode);
    assert.deepEqual(await journal.list(dir), []);
  }
  const old = await setup('full', { capability: undefined });
  for (const said of [true, false]) {
    if (said) old.say(KEY, 'Да, составляй спецификацию и план');
    else old.service(KEY);
    const result = (await old.runs.authorizePreparation('p1', KEY, 'Docs'))!;
    assert.deepEqual([result.policy, result.runId], ['kit-update-required', null]);
    assert.match(result.instruction, /update Kit/u);
  }
  assert.deepEqual(await old.journal.list(old.dir), []);
});

test('M40 with the agent channel: a continuation, a queued message and an old turn are no source; the delivered message is', async () => {
  const channel = createAgentChannel({ resolveProject: async () => ({ id: 'p1' }) });
  let next: StopDecision = { kind: 'continue', text: 'Workflow Kit: autopilot. Continue the workflow.' };
  channel.setDecider(async () => next);
  const prompt = (text: string) => parseHookInput('claude', { session_id: 's-1', hook_event_name: 'UserPromptSubmit', prompt: text, cwd: '/p' })!;
  const stop = async () => (await channel.stop(parseHookInput('claude', { session_id: 's-1', hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: 'done', cwd: '/p' })!)).ack();
  const { runs, journal, dir } = await setup('full', {}, true, undefined, (key) => channel.userSource(key));
  (await channel.prompt(prompt('Как дела?'))).ack();
  // The autopilot continued the session: the user's message belongs to the old turn.
  await stop();
  assert.equal(channel.get(KEY)?.state, 'working');
  assert.equal(await runs.authorizePreparation('p1', KEY, 'Docs'), null, 'a continuation of the autopilot');
  // A panel message of the user waits in the queue while the agent works: not delivered yet.
  channel.enqueue(KEY, 'Сделай план склада', USER_MESSAGE_SOURCE, 'p1');
  assert.equal(await runs.authorizePreparation('p1', KEY, 'Docs'), null, 'a queued message');
  // The end of the turn delivers it: now it is the user's message of the current turn.
  next = { kind: 'release' };
  await stop();
  const prepared = (await runs.authorizePreparation('p1', KEY, 'Docs'))!;
  assert.equal(prepared.policy, 'full');
  assert.equal((await journal.read(dir, prepared.runId!))?.request.quote, 'Сделай план склада');
  channel.close();
});

test('plan decision: talk never starts a run; review/plan in full mode register one with the answer as source', async () => {
  const off = await setup('after-start');
  assert.equal(await off.runs.planDecision('p1', KEY, 'review', 'Docs'), null);
  const { runs } = await setup('full', {}, false);
  assert.equal(await runs.planDecision('p1', KEY, 'talk', 'Docs'), null);
  const run = await runs.planDecision('p1', KEY, 'review', 'Docs');
  assert.equal(run?.request.source, 'plan-decision');
  assert.equal(run?.review, true);
  assert.equal((await runs.planDecision('p1', KEY, 'plan', 'Docs'))?.runId, run?.runId);
  assert.equal(await runs.planDecision('p1', 'codex:s-2', 'plan', 'Docs'), null);
});

test('policy before the start: off, legacy, manual acceptance, automatic and Kit update', async () => {
  assert.equal((await (await setup('off')).runs.policy('p1')).policy, 'off');
  const legacy = await (await setup('after-start', { acceptance: null })).runs.policy('p1');
  assert.deepEqual([legacy.policy, legacy.text], ['legacy', POLICY_TEXTS.legacy]);
  const manual = await (await setup('after-start', { acceptance: [{ criterion: 0, kind: 'automatic' }, { criterion: 2, kind: 'manual' }] })).runs.policy('p1');
  assert.equal(manual.policy, 'manual-acceptance');
  assert.deepEqual(manual.manualCriteria, [3]);
  assert.equal(manual.text, 'Остановится на приёмке: требуется ручная проверка критерия 3. После вашей приёмки Kit закроет план и опубликует результат.');
  const automatic = await (await setup('full', { acceptance: [{ criterion: 0, kind: 'automatic' }] })).runs.policy('p1');
  assert.deepEqual([automatic.policy, automatic.text], ['automatic', POLICY_TEXTS.full]);
  const update = await (await setup('after-start', { capability: undefined })).runs.policy('p1');
  assert.equal(update.policy, 'kit-update-required');
  assert.match(update.text, /Обновите Kit/u);
});

test('a manual start gets no M39 authority when off, on a legacy plan or with an old Kit', async () => {
  for (const [mode, status] of [['off', {}], ['after-start', { acceptance: null }], ['after-start', { capability: undefined }]] as const) {
    const { runs } = await setup(mode, status);
    assert.equal(await runs.beginExecution('p1', KEY), null, `${mode}`);
  }
});

test('T006: a review decision the session already has wins over the Settings default in the run snapshot', async () => {
  const { runs, say } = await setup('full', {}, true, false);
  say(KEY, 'Да, составляй спецификацию и план');
  const result = (await runs.authorizePreparation('p1', KEY, 'Docs'))!;
  assert.equal(result.review, false);
  assert.match(result.instruction, /without a cross review/u);
});

test('F001: «Продолжить» of a run that is going on joins it unchanged; a final run is not resumed', async () => {
  const { runs, journal, dir } = await setup('after-start');
  const run = await journal.create(dir, {
    projectId: 'p1', owner: { key: KEY, client: 'claude', sessionId: 's-1' }, mode: 'after-start', review: false,
    request: { source: 'panel-start', quote: 'start', at: 'x', turnId: null, goal: 'g' }, proposal: null, scopeId: 'auto',
    authority: null, phase: 'executing', pausedFrom: null, reason: null, nextAction: null,
  });
  for (const phase of ['executing', 'delivering', 'waiting', 'publishing'] as const) {
    await journal.update(dir, run.runId, (r) => ({ ...r, phase }));
    const before = (await journal.read(dir, run.runId))!;
    const joined = await runs.resume('p1', KEY);
    assert.deepEqual([joined?.runId, joined?.phase, joined?.revision], [run.runId, phase, before.revision], phase);
  }
  await journal.update(dir, run.runId, (r) => ({ ...r, phase: 'stopped' }));
  assert.equal(await runs.resume('p1', KEY), null);
});

test('T009: the panel brief follows every write of the journal and never quotes the user', async () => {
  const { runs, journal, dir } = await setup('after-start', { scope: 'ACTIVE' } as Partial<RunKitStatus>);
  const run = await journal.create(dir, {
    projectId: 'p1', owner: { key: KEY, client: 'claude', sessionId: 's-1' }, mode: 'after-start', review: false,
    request: { source: 'panel-start', quote: 'secret words of the user', at: 'x', turnId: null, goal: 'g' }, proposal: null, scopeId: 'auto',
    authority: { grantRevision: 1, deliveryTaskIds: [], accept: true, close: true, publication: { branch: 'main', upstream: 'origin/main' }, acceptancePolicy: 'automatic', baseHead: null, revocation: null },
    phase: 'executing', pausedFrom: null, reason: null, nextAction: null,
  });
  // A write of another part of the service (waits, completion) reaches the section at once.
  await journal.update(dir, run.runId, (r) => ({ ...r, phase: 'waiting', pausedFrom: 'publishing', wait: { reason: 'ci', since: 's', sha: 'f'.repeat(40), detail: 'Ждёт CI' }, completion: { ci: null, publication: { branch: 'main', upstream: 'origin/main' }, finalSha: 'f'.repeat(40) } }));
  const brief = (await runs.section()).projects['p1']!;
  assert.deepEqual([brief.phase, brief.pausedFrom, brief.owner, brief.revision, brief.wait?.reason, brief.publication?.finalSha], ['waiting', 'publishing', KEY, 2, 'ci', 'f'.repeat(40)]);
  assert.doesNotMatch(JSON.stringify(brief), /secret words/u);
  await journal.update(dir, run.runId, (r) => ({ ...r, phase: 'completed', wait: null, completion: { ...r.completion!, published: { sha: 'f'.repeat(40), upstream: 'origin/main', commits: 2, already: false, at: 'x' } }, receipts: [...r.receipts, { actionId: 'publish:f', type: 'publish', at: 'x', commit: 'f'.repeat(40), detail: 'pushed' }] }));
  assert.deepEqual((await runs.section()).projects['p1']!.publication, { upstream: 'origin/main', finalSha: 'f'.repeat(40), published: 'f'.repeat(40), commits: 2, already: false, detail: 'pushed' });
});

test('T009: GET /api/projects/:id/autopiloting/policy tells the effective policy before the start', async () => {
  const { runs, settings } = await setup('after-start', { acceptance: [{ criterion: 0, kind: 'manual' }] });
  const router = createRouter();
  registerAutopilotingRoutes({ router, state: createStateRegistry(), settings, runs });
  const route = router.match('GET', '/api/projects/p1/autopiloting/policy') as unknown as { handler(input: unknown): Promise<{ policy: string; text: string }>; params: unknown };
  const answer = await route.handler({ params: route.params, body: {} });
  assert.deepEqual([answer.policy, answer.text], ['manual-acceptance', POLICY_TEXTS.manual([1])]);
});
