// M40 T004A (docs/planning/M40-autopilot-run-end.md): the full run names the automation block
// ahead, returns a proposal without it to its author once and stops on the second one, starts a
// plan once per scope, stops when the grant cannot be recorded and ends with its scope when the
// user accepted and closed it by hand. Scripted Kit, the real journal and the real channel.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { createAgentChannel, parseHookInput } from '#agent-channel';
import type { StopContext, StopDecision } from '#agent-channel';
import { createKeyedMutex } from '#data-store';
import type { KitRunner, WorkflowState } from '#kit-runner';
import { AUTOMATION_REQUIRED, RUN_STOP_NEXT, automationReturnText, createAutopilot, createHostTickets, createPreparation, createProposalGate, createRunCompletion, createRunJournal, createRunTurns, createRuns, createSettingsStore, preparationText, runBrief } from '../src/index.ts';
import type { NewRun, RunKit, RunRecord } from '../src/index.ts';

const tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-run-end-'));
after(() => rm(tmp, { recursive: true, force: true, maxRetries: 5 }));
let n = 0;
const KEY = 'claude:s-1';
const DIGEST = 'd'.repeat(64);
const AUTOMATION = { acceptance: [], ci: null, delivery: [], publication: null };

const newRun = (over: Partial<NewRun> = {}): NewRun => ({
  projectId: 'p', owner: { key: KEY, client: 'claude', sessionId: 's-1' }, mode: 'full', review: true,
  request: { source: 'user-command', quote: 'да', at: '2026-11-17T10:00:00.000Z', turnId: null, goal: 'Docs' },
  proposal: null, scopeId: null, authority: null, phase: 'preparing', pausedFrom: null, reason: null, nextAction: null, ...over,
});

/** A scripted project: the proposal, the chosen scope and the grant as Kit would report them. */
async function setup(over: Partial<NewRun> = {}) {
  const folder = path.join(tmp, `p${(n += 1)}`);
  const journal = createRunJournal();
  const run = await journal.create(folder, newRun(over));
  const kit = {
    proposal: { generation: 1, automation: false as boolean | undefined, refining: false } as { generation: number; automation: boolean | undefined; refining: boolean } | null,
    scope: null as { id: string; ownerSession: string | null; automation: object | null } | null,
    scopeState: undefined as 'ACTIVE' | 'NONE' | undefined,
    grant: null as { runId: string; revoked: unknown } | null,
    answers: true,
    grants: true,
  };
  const calls: string[] = [];
  const runKit = {
    status: async () => (kit.answers ? { revision: 7, head: 'h', capability: {}, authorization: kit.grant, ...(kit.scopeState ? { scope: kit.scopeState } : {}) } : null),
    supported: () => ({ ready: true }),
    scope: async () => kit.scope,
    digest: async () => (kit.proposal ? { scopeId: 'auto', generation: kit.proposal.generation, proposalDigest: DIGEST, documentDigests: {} } : null),
    proposal: async () => (kit.proposal ? { ...kit.proposal, recommended: 'sequential', options: ['sequential', 'refine'] } : null),
  } as unknown as RunKit;
  const preparation = createPreparation({
    journal, kit: runKit, projectPath: async () => folder, review: () => null, reviewOn: () => false, mutex: createKeyedMutex(),
    actions: () => ({
      choose: async () => {
        calls.push('choose');
        kit.scope = { id: 'auto', ownerSession: 's-1', automation: kit.proposal?.automation === false ? null : AUTOMATION };
        kit.proposal = null;
      },
      start: async (_id, session) => {
        calls.push('start');
        if (kit.grants) {
          kit.grant = { runId: run.runId, revoked: null };
          await journal.update(folder, run.runId, (r) => ({ ...r, phase: 'executing' }));
        }
        return { owner: session! };
      },
    }),
  });
  const read = async (): Promise<RunRecord> => (await journal.read(folder, run.runId))!;
  return { folder, journal, run, kit, runKit, calls, preparation, read };
}

test('the preparation text of the full mode names the automation block; an old Kit is told to update', () => {
  const full = preparationText('full', true, 'run-abcdef');
  assert.ok(full.includes(AUTOMATION_REQUIRED));
  assert.match(full, /`automation` block .*`scripts\/workflow schema scope:propose`.*does not start a plan without it/u);
  assert.match(full, /run run-abcdef is registered by the user's message of this turn/u);
  const propose = 'write the specification and the plan, then run `scripts/workflow scope:propose --input <file.json> --recommended <mode> --reason "<why>"`';
  assert.equal(
    preparationText('kit-update-required', true, null),
    `Full autopilot is on in Settings, but the project's Kit cannot autopilot (update Kit). Continue this turn without the plan question: ${propose}, then end the turn; the user chooses the mode and starts the plan in the panel. The plan gets a cross review before it starts.`,
  );
  assert.equal(preparationText('kit-update-required', false, null).includes('automation'), false);
});

test('full: a proposal without automation goes back to its author once — no review, no choice, no start; the second one stops the run', async () => {
  const t = await setup();
  const asked: string[] = [];
  const review = {
    decide: async (context: StopContext): Promise<StopDecision | null> => (asked.push(context.key), { kind: 'release' }),
    isReviewer: () => false,
  };
  const runner = { installed: () => true, run: async () => ({ ok: true, result: { head: 'h', revision: 7, proposalPending: true, scope: 'NONE', delivery: null, nextTask: null, paused: false } }) } as unknown as KitRunner;
  const workflow = { get: () => ({ plan: null }), refresh: async () => ({ plan: null }), status: () => null } as unknown as WorkflowState;
  const channel = createAgentChannel({ resolveProject: async () => ({ id: 'p' }) });
  const gate = createProposalGate({ journal: t.journal, kit: t.runKit, projectPath: async () => t.folder });
  const autopilot = createAutopilot({ runner, workflow, channel, projectPath: async () => t.folder, review, runs: { ...createRunTurns({ journal: t.journal, projectPath: async () => t.folder }), proposal: gate.check } });
  channel.setDecider((context) => autopilot.decide(context));
  const stop = async () => {
    const reply = await channel.stop(parseHookInput('claude', { session_id: 's-1', cwd: t.folder, hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: 'proposed' })!);
    reply.ack();
    return (reply.answer as { reason?: string } | null)?.reason ?? null;
  };

  // The first proposal: one message with the requirement; the service reviews and chooses nothing.
  assert.equal(await stop(), `Workflow Kit: autopilot. ${automationReturnText(t.run.runId)}`);
  assert.match(automationReturnText(t.run.runId), /no `automation` block.*scripts\/workflow schema scope:propose/u);
  assert.deepEqual(asked, [], 'no review');
  for (let i = 0; i < 3; i += 1) assert.equal((await t.preparation.reconcile('p'))?.phase, 'preparing');
  assert.deepEqual(t.calls, [], 'no choice and no start');
  let run = await t.read();
  assert.deepEqual([run.phase, run.automationMissing, run.receipts.map((r) => r.actionId)], ['preparing', 1, ['automation-missing:1']]);

  // The second proposal without the block stops the run; the usual review and cards go on.
  t.kit.proposal = { generation: 2, automation: false, refining: false };
  assert.equal(await stop(), null);
  run = await t.read();
  assert.deepEqual([run.phase, run.reason, run.nextAction, run.automationMissing], ['stopped', 'automation-missing', RUN_STOP_NEXT['automation-missing'], 2]);
  assert.match(run.nextAction!, /вручную/u);
  assert.deepEqual(asked, [KEY], 'the review of a session without a run is asked as before');
  assert.equal(await t.journal.active(t.folder), null);
  await t.preparation.reconcile('p');
  assert.deepEqual(t.calls, []);
});

test('the gate keeps away from a proposal with the block, an old Kit, another session and a started run', async () => {
  const withBlock = await setup();
  withBlock.kit.proposal = { generation: 1, automation: true, refining: false };
  const gate = (t: Awaited<ReturnType<typeof setup>>) => createProposalGate({ journal: t.journal, kit: t.runKit, projectPath: async () => t.folder });
  assert.equal(await gate(withBlock).check('p', KEY), null);
  const oldKit = await setup();
  oldKit.kit.proposal = { generation: 1, automation: undefined, refining: false };
  assert.equal(await gate(oldKit).check('p', KEY), null, 'Kit before 2.4.4 reports no block: checked after the choice');
  const other = await setup();
  assert.equal(await gate(other).check('p', 'codex:reviewer'), null, 'only the owner of the run');
  assert.equal((await other.read()).automationMissing, undefined);
  for (const over of [{ mode: 'after-start' as const }, { phase: 'executing' as const }, { phase: 'paused' as const }]) {
    const t = await setup(over);
    assert.equal(await gate(t).check('p', KEY), null, JSON.stringify(over));
  }
});

test('the plan is started once per scope: repeated steps send no second start; without a grant the run stops with the reason', async () => {
  const granted = await setup({ review: false });
  granted.kit.proposal = { generation: 1, automation: true, refining: false };
  for (let i = 0; i < 4; i += 1) assert.equal((await granted.preparation.reconcile('p'))?.phase, 'executing');
  assert.deepEqual(granted.calls, ['choose', 'start']);
  const receipt = (await granted.read()).receipts.find((r) => r.actionId === 'start:auto');
  assert.deepEqual([receipt?.type, receipt?.detail], ['start', 'scope auto, plan revision 7']);

  // Kit records no grant (the start went through, the authorization did not): one start, then a stop.
  const refused = await setup({ review: false });
  refused.kit.proposal = { generation: 1, automation: true, refining: false };
  refused.kit.grants = false;
  assert.equal((await refused.preparation.reconcile('p'))?.phase, 'starting');
  const stopped = await refused.preparation.reconcile('p');
  assert.deepEqual([stopped?.phase, stopped?.reason, stopped?.nextAction], ['stopped', 'authorization-missing', RUN_STOP_NEXT['authorization-missing']]);
  for (let i = 0; i < 3; i += 1) await refused.preparation.reconcile('p');
  assert.deepEqual(refused.calls, ['choose', 'start'], 'the start message is sent once');

  // A chosen plan without the block (a Kit that could not tell before the choice): never started.
  const legacy = await setup({ review: false, phase: 'starting', scopeId: 'auto' });
  legacy.kit.proposal = null;
  legacy.kit.scope = { id: 'auto', ownerSession: 's-1', automation: null };
  for (let i = 0; i < 3; i += 1) await legacy.preparation.reconcile('p');
  const run = await legacy.read();
  assert.deepEqual([run.phase, run.reason, run.pausedFrom, legacy.calls], ['stopped', 'automation-missing', 'starting', []]);
});

test('a run whose scope the user accepted and closed by hand is finished: no card, no publication', async () => {
  for (const phase of ['starting', 'executing', 'paused', 'blocked', 'waiting'] as const) {
    const t = await setup({ phase, scopeId: 'auto' });
    t.kit.proposal = null;
    t.kit.scopeState = 'NONE';
    const ended = await t.preparation.reconcile('p');
    assert.deepEqual([ended?.phase, ended?.reason, ended?.pausedFrom, ended?.nextAction, ended?.wait ?? null], ['finished', 'closed-manually', phase, null, null], phase);
    assert.equal(await t.journal.active(t.folder), null, 'a finished run is no active run');
    assert.deepEqual(t.calls, []);
  }
  // Another scope took its place: the old run ends too.
  const replaced = await setup({ phase: 'executing', scopeId: 'auto' });
  replaced.kit.scopeState = 'ACTIVE';
  replaced.kit.scope = { id: 'next', ownerSession: 's-9', automation: AUTOMATION };
  assert.equal((await replaced.preparation.reconcile('p'))?.phase, 'finished');

  // The completion (the timer and every finished turn) ends it as well and pushes nothing.
  const t = await setup({ mode: 'after-start', phase: 'executing', scopeId: 'auto', authority: { grantRevision: 1, deliveryTaskIds: [], accept: true, close: true, publication: { branch: 'main', upstream: 'origin/main' }, acceptancePolicy: 'automatic', baseHead: null, revocation: null } });
  t.kit.scopeState = 'NONE';
  const pushes: string[] = [];
  const completion = createRunCompletion({
    journal: t.journal, kit: t.runKit, projectPath: async () => t.folder, listProjects: async () => [{ id: 'p', path: t.folder }],
    git: async () => ({ code: 0, stdout: '', stderr: '' }),
    publisher: { publish: async (_f, _o, e) => (pushes.push(e.sha), { sha: e.sha, already: false }), stageCi: async (_f, target) => (pushes.push(target.sha), { sha: target.sha, already: false }) },
  });
  assert.equal((await completion.advance('p'))?.phase, 'finished');
  await completion.advanceAll();
  assert.deepEqual(pushes, []);
  assert.equal(runBrief(await t.read()).phase, 'finished');
});

test('the run end leaves alone a run without a scope, its own scope, a silent Kit and a run that closed the scope itself', async () => {
  const preparing = await setup();
  preparing.kit.proposal = null;
  preparing.kit.scopeState = 'NONE';
  for (let i = 0; i < 3; i += 1) assert.equal((await preparing.preparation.reconcile('p'))?.phase, 'preparing', 'no scope before the choice is the usual state');
  const open = await setup({ phase: 'executing', scopeId: 'auto' });
  open.kit.scopeState = 'ACTIVE';
  open.kit.scope = { id: 'auto', ownerSession: 's-1', automation: AUTOMATION };
  assert.equal((await open.preparation.reconcile('p'))?.phase, 'executing');
  const silent = await setup({ phase: 'executing', scopeId: 'auto' });
  silent.kit.answers = false;
  assert.equal((await silent.preparation.reconcile('p'))?.phase, 'executing', 'no answer of Kit is no fact');
  const own = await setup({ phase: 'waiting', pausedFrom: 'publishing', scopeId: 'auto' });
  own.kit.scopeState = 'NONE';
  await own.journal.update(own.folder, own.run.runId, (r) => ({ ...r, completion: { ci: null, publication: null, finalSha: 'f'.repeat(40) } }));
  assert.equal((await own.preparation.reconcile('p'))?.phase, 'waiting', 'the run closed its scope itself: the publication is ahead');
});

test('the panel state has no run that ended with its scope; a run the service stopped stays with its reason', async () => {
  const dir = path.join(tmp, `runs${(n += 1)}`);
  await mkdir(path.join(dir, 'config'), { recursive: true });
  const journal = createRunJournal();
  const kit = { status: async () => null, supported: () => ({ ready: false }), scope: async () => null } as unknown as RunKit;
  const runs = createRuns({ settings: createSettingsStore({ configDir: path.join(dir, 'config') }), journal, kit, tickets: createHostTickets(), userSource: () => null, projectPath: async () => dir, listProjects: async () => [{ id: 'p', path: dir }] });
  const run = await journal.create(dir, newRun({ phase: 'starting', scopeId: 'auto' }));
  assert.equal((await runs.section()).projects['p']?.phase, 'starting');
  await journal.update(dir, run.runId, (r) => ({ ...r, phase: 'finished', reason: 'closed-manually' }));
  assert.deepEqual((await runs.section()).projects, {});
  const again = createRuns({ settings: createSettingsStore({ configDir: path.join(dir, 'config') }), journal, kit, tickets: createHostTickets(), userSource: () => null, projectPath: async () => dir, listProjects: async () => [{ id: 'p', path: dir }] });
  await again.load();
  assert.deepEqual((await again.section()).projects, {}, 'after a restart of the service too');
  const stopped = await journal.create(dir, newRun());
  await journal.update(dir, stopped.runId, (r) => ({ ...r, phase: 'stopped', reason: 'automation-missing', nextAction: RUN_STOP_NEXT['automation-missing'] }));
  const brief = (await runs.section()).projects['p'];
  assert.deepEqual([brief?.runId, brief?.phase, brief?.reason], [stopped.runId, 'stopped', 'automation-missing']);
});
