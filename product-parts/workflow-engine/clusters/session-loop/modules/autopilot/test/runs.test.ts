// M39 T005: autopiloting runs with a scripted Kit (refusals and policies); the grant against the
// real bundle is in runs-real.test.ts.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { createRouter, createStateRegistry } from '#http-server';
import type { UserWords } from '#agent-channel';
import { SUPPORTED_HOST_PROTOCOL } from '#plan-view';
import { POLICY_TEXTS, createHostTickets, createRunJournal, createRuns, createSettingsStore, registerAutopilotingRoutes } from '../src/index.ts';
import type { AutopilotingMode, RunKit, RunKitStatus } from '../src/index.ts';

const tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-runs-'));
after(() => rm(tmp, { recursive: true, force: true }));
const CAPABILITY = { authorization: true, automation: true, complete: true, deferDelivery: true, hostProtocol: SUPPORTED_HOST_PROTOCOL, instructions: true };
const KEY = 'claude:s-1';
let n = 0;

async function setup(mode: AutopilotingMode, status: Partial<RunKitStatus> | null = {}, review = true, sessionDecision?: boolean) {
  const dir = path.join(tmp, `p${(n += 1)}`);
  await mkdir(path.join(dir, 'config'), { recursive: true });
  const settings = createSettingsStore({ configDir: path.join(dir, 'config') });
  if (mode !== 'off' || review) await settings.write({ expectedRevision: 0, mode, review });
  const words = new Map<string, UserWords[]>();
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
    words: (key) => words.get(key) ?? [],
    projectPath: async (id) => (id === 'p1' ? dir : undefined),
    listProjects: async () => [{ id: 'p1', path: dir }],
    decideReview: async (_id, key, on) => {
      decided.push([key, on]);
      return sessionDecision;
    },
  });
  const say = (key: string, text: string, at = '2026-11-16T10:00:00.000Z') => words.set(key, [...(words.get(key) ?? []), { text, at, via: 'prompt', turnId: 't-1' }]);
  return { runs, say, decided, dir, settings, journal };
}

test('no user words: authorization-source-missing; words not in the last message: mismatch', async () => {
  const { runs, say } = await setup('full');
  await assert.rejects(runs.authorizePreparation('p1', KEY, 'Docs', 'да, составляй'), { code: 'authorization-source-missing' });
  say(KEY, 'Да, составляй спецификацию и план');
  say(KEY, 'А сколько это займёт?');
  await assert.rejects(runs.authorizePreparation('p1', KEY, 'Docs', 'Да, составляй спецификацию'), { code: 'authorization-quote-mismatch' });
  await assert.rejects(runs.authorizePreparation('p1', KEY, 'Docs', 'да'), { code: 'bad-request' });
});

test('full: the direct instruction registers one run; a repeat returns it; another session gets run-active', async () => {
  const { runs, say, decided } = await setup('full');
  say(KEY, 'Да,   составляй СПЕЦИФИКАЦИЮ и план, пожалуйста');
  const first = await runs.authorizePreparation('p1', KEY, 'Docs', 'да, составляй спецификацию и план');
  assert.equal(first.action, 'prepare');
  assert.equal(first.policy, 'full');
  assert.match(first.runId!, /^run-/u);
  assert.match(first.instruction, /scope:propose/u);
  assert.deepEqual(decided, [[KEY, true]]);
  const again = await runs.authorizePreparation('p1', KEY, 'Docs', 'составляй спецификацию');
  assert.equal(again.runId, first.runId);
  say('codex:s-2', 'да, составляй спецификацию');
  await assert.rejects(runs.authorizePreparation('p1', 'codex:s-2', 'Other', 'да, составляй спецификацию'), { code: 'run-active' });
  const section = await runs.section();
  assert.equal(section.projects['p1']?.runId, first.runId);
  assert.equal(section.projects['p1']?.source, 'user-command');
  assert.equal(JSON.stringify(section).includes('составляй'), false);
});

test('off and after-start: the preparation is allowed without a run; an old Kit gets the update policy', async () => {
  for (const mode of ['off', 'after-start'] as const) {
    const { runs, say } = await setup(mode);
    say(KEY, 'Да, составляй спецификацию и план');
    const result = await runs.authorizePreparation('p1', KEY, 'Docs', 'составляй спецификацию и план');
    assert.equal(result.runId, null);
    assert.equal(result.policy, mode);
    assert.match(result.instruction, /the user chooses the mode and starts the plan/u);
  }
  const old = await setup('full', { capability: undefined });
  old.say(KEY, 'Да, составляй спецификацию и план');
  const result = await old.runs.authorizePreparation('p1', KEY, 'Docs', 'составляй спецификацию и план');
  assert.equal(result.policy, 'kit-update-required');
  assert.equal(result.runId, null);
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
  const result = await runs.authorizePreparation('p1', KEY, 'Docs', 'составляй спецификацию и план');
  assert.equal(result.review, false);
  assert.match(result.instruction, /without a cross review/u);
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
