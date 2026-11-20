// M48 T002: the session card switches the autopilot at any stage of the task (spec M48 3.2) — with
// a scripted Kit and the real run journal and session records: the plan question is closed and the
// agent told; the agent writing the plan is told; a proposal without the automation block goes
// back to its author, one with it is taken by the run; a started plan with the block is taken over,
// without it stays manual; another session's plan or run is left alone; off and on again resume.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { SWITCH_TEXTS, createProposalGate, createRunJournal, createSessionSettings, createSessionSwitch, createSettingsStore, preparationText } from '../src/index.ts';
import type { NewRun, RunKit, RunKitStatus, RunRecord, Runs, StartPolicy } from '../src/index.ts';

const tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-m48-switch-'));
after(() => rm(tmp, { recursive: true, force: true }));
const KEY = 'claude:s-1';
let n = 0;

interface World {
  scope: 'ACTIVE' | 'NONE';
  scopeOwner: string | null;
  scopeAutomation: boolean;
  ready: boolean;
  proposal: null | { automation: boolean };
  question: null | { kind: 'agent' | 'proposal' };
}

async function setup(world: Partial<World> = {}) {
  const w: World = { scope: 'NONE', scopeOwner: 's-1', scopeAutomation: true, ready: true, proposal: null, question: null, ...world };
  const dir = path.join(tmp, `p${(n += 1)}`);
  await mkdir(path.join(dir, 'config'), { recursive: true });
  const settings = createSettingsStore({ configDir: path.join(dir, 'config') });
  const journal = createRunJournal();
  const projectPath = async (id: string) => (id === 'p1' ? dir : undefined);
  const sessions = createSessionSettings({ settings, journal, projectPath });
  const kit = {
    status: async () => ({ revision: 3, head: 'abc', scope: w.scope, proposal: w.scope === 'ACTIVE' ? { digest: 'd', generation: 1 } : null }) as unknown as RunKitStatus,
    scope: async () => (w.scope === 'ACTIVE' ? { id: 'auto', ownerSession: w.scopeOwner, automation: w.scopeAutomation ? { acceptance: [], ci: null, delivery: [], publication: null } : null } : null),
    supported: () => ({ ready: w.ready }),
    proposal: async () => (w.proposal ? { generation: 1, refining: false, automation: w.proposal.automation, recommended: 'sequential', options: ['sequential'] } : null),
  } as unknown as RunKit;
  const calls: string[] = [];
  const sent: Array<[string, string]> = [];
  let granted: RunRecord | null = null;
  const runs = {
    beginExecution: async (_id: string, key: string) => (calls.push(`begin:${key}`), granted),
    resume: async (_id: string, key: string) => (calls.push(`resume:${key}`), null),
    policy: async () => ({ mode: 'full', policy: 'automatic', text: '', manualCriteria: [] }) as StartPolicy,
    planDecision: async () => null,
  } as unknown as Runs;
  const switcher = createSessionSwitch({
    journal, kit, runs, sessions, projectPath,
    gate: createProposalGate({ journal, kit, projectPath }),
    question: () => w.question,
    decideReview: async (_id, key, on) => (calls.push(`review:${key}:${on}`), (w.question = null), on),
    send: (_id, key, text) => void sent.push([key, text]),
    wake: (key) => void calls.push(`wake:${key}`),
    reconcile: async () => void calls.push('reconcile'),
  });
  sessions.onChange((change) => switcher.changed(change));
  const toggle = async (key: string, change: { mode?: 'off' | 'after-start' | 'full'; review?: boolean }) => {
    const record = await sessions.ensure('p1', key);
    await sessions.write('p1', key, { expectedRevision: record.revision, ...change });
    return switcher.effect('p1', key);
  };
  const active = () => journal.active(dir);
  return { w, dir, journal, sessions, switcher, calls, sent, toggle, active, grant: (run: RunRecord | null) => void (granted = run) };
}

const newRun = (over: Partial<NewRun> = {}): NewRun => ({
  projectId: 'p1', owner: { key: KEY, client: 'claude', sessionId: 's-1' }, mode: 'full', review: false,
  request: { source: 'user-command', quote: 'да', at: '2026-11-20T10:00:00.000Z', turnId: null, goal: 'g' },
  proposal: null, scopeId: null, authority: null, phase: 'preparing', pausedFrom: null, reason: null, nextAction: null, ...over,
});

test('the agent still thinks: nothing at once, the stage is idle; after-start waits for the button', async () => {
  const t = await setup();
  assert.equal(await t.switcher.stage('p1', KEY), 'idle');
  assert.equal(await t.toggle(KEY, { mode: 'full' }), SWITCH_TEXTS.idle);
  assert.equal(await t.active(), null);
  assert.deepEqual(t.sent, []);
  const other = await setup();
  assert.equal(await other.toggle(KEY, { mode: 'after-start' }), SWITCH_TEXTS.afterStart);
});

test('an open plan question: it is closed, a run is registered by the press and the agent is told and woken', async () => {
  const t = await setup({ question: { kind: 'agent' } });
  assert.equal(await t.switcher.stage('p1', KEY), 'question');
  assert.equal(await t.toggle(KEY, { mode: 'full', review: true }), SWITCH_TEXTS.question);
  const run = (await t.active())!;
  assert.deepEqual([run.mode, run.phase, run.review, run.request.source, run.owner.key], ['full', 'preparing', true, 'session-card', KEY]);
  assert.deepEqual(t.calls, [`review:${KEY}:true`, `wake:${KEY}`]);
  assert.equal(t.sent.length, 1);
  assert.equal(t.sent[0]![1], preparationText('full', true, run.runId, 'session-card'));
  assert.match(t.sent[0]![1], /registered by the user, who switched the autopilot of this session to full on its card\. Go on without the plan question/u);
  assert.match(t.sent[0]![1], /`automation` block/u);
  assert.equal(await t.switcher.stage('p1', KEY), 'run');
});

test('a Kit that cannot autopilot: no run, the question stays, the card says to update Kit', async () => {
  const t = await setup({ question: { kind: 'agent' }, ready: false });
  assert.equal(await t.toggle(KEY, { mode: 'full' }), SWITCH_TEXTS.kitUpdate);
  assert.equal(await t.active(), null);
  assert.deepEqual([t.sent, t.calls, t.w.question], [[], [], { kind: 'agent' }]);
});

test('the agent writes the plan (the question was answered): a run and the instruction; the mark is cleared', async () => {
  const t = await setup();
  await t.sessions.mark('p1', KEY, '2026-11-20T10:00:00.000Z');
  assert.equal(await t.switcher.stage('p1', KEY), 'writing');
  assert.equal(await t.toggle(KEY, { mode: 'full' }), SWITCH_TEXTS.writing);
  assert.equal((await t.active())?.request.source, 'session-card');
  assert.equal(t.sent.length, 1);
  assert.equal((await t.sessions.get('p1', KEY))?.preparing, undefined);
});

test('a proposal without the automation block goes back to its author; with it the run takes the proposal', async () => {
  const t = await setup({ proposal: { automation: false }, question: { kind: 'proposal' } });
  assert.equal(await t.switcher.stage('p1', KEY), 'proposed');
  assert.equal(await t.toggle(KEY, { mode: 'full' }), SWITCH_TEXTS.returned);
  const run = (await t.active())!;
  assert.equal(run.automationMissing, 1);
  assert.equal(t.sent.length, 1);
  assert.match(t.sent[0]![1], new RegExp(`Full autopilot run ${run.runId} cannot start this plan`, 'u'));
  assert.equal(t.w.question, null, 'the proposal card of the plan question is closed');
  // With the block and without review: the preparation chooses and starts it (after the lock).
  const plain = await setup({ proposal: { automation: true } });
  assert.equal(await plain.toggle(KEY, { mode: 'full' }), SWITCH_TEXTS.proposed);
  assert.deepEqual(plain.calls, [`review:${KEY}:false`, 'reconcile']);
  // With review: the owner is woken, its Stop starts the review.
  const reviewed = await setup({ proposal: { automation: true } });
  assert.equal(await reviewed.toggle(KEY, { mode: 'full', review: true }), SWITCH_TEXTS.proposedReview);
  assert.deepEqual(reviewed.calls, [`review:${KEY}:true`, `wake:${KEY}`]);
});

test('a started plan: with the block the run takes it over (grant), without it the card says so; another owner — nothing', async () => {
  const t = await setup({ scope: 'ACTIVE' });
  t.grant({ runId: 'granted' } as RunRecord);
  assert.equal(await t.switcher.stage('p1', KEY), 'executing');
  assert.equal(await t.toggle(KEY, { mode: 'full' }), SWITCH_TEXTS.adopted);
  const run = (await t.active())!;
  assert.deepEqual([run.request.source, run.scopeId, run.phase], ['session-card', 'auto', 'starting']);
  assert.deepEqual(t.calls, [`begin:${KEY}`]);
  // Kit gives no grant: the registered run does not hang in «starting».
  const refused = await setup({ scope: 'ACTIVE' });
  assert.equal(await refused.toggle(KEY, { mode: 'after-start' }), SWITCH_TEXTS.legacy);
  assert.equal(await refused.active(), null, 'the run stopped');
  const manual = await setup({ scope: 'ACTIVE', scopeAutomation: false });
  assert.equal(await manual.toggle(KEY, { mode: 'full' }), SWITCH_TEXTS.noAutomation);
  assert.equal(await manual.active(), null);
  const foreign = await setup({ scope: 'ACTIVE', scopeOwner: 's-2' });
  assert.equal(await foreign.switcher.stage('p1', KEY), 'other-plan');
  assert.equal(await foreign.toggle(KEY, { mode: 'full' }), SWITCH_TEXTS.otherPlan);
  assert.deepEqual(foreign.calls, []);
});

test('runs: the run of another session is left alone; a run before its start follows the mode; off pauses, on again resumes', async () => {
  const t = await setup();
  await t.journal.create(t.dir, newRun({ owner: { key: 'codex:s-2', client: 'codex', sessionId: 's-2' } }));
  assert.equal(await t.toggle(KEY, { mode: 'full' }), SWITCH_TEXTS.otherRun);
  const own = await setup();
  const run = await own.journal.create(own.dir, newRun());
  // A full run before its start: after-start leaves the choice and the start to the user, full again takes them.
  assert.equal(await own.toggle(KEY, { mode: 'after-start' }), SWITCH_TEXTS.toAfterStart);
  assert.equal((await own.journal.read(own.dir, run.runId))?.mode, 'after-start');
  assert.equal(await own.toggle(KEY, { mode: 'full' }), SWITCH_TEXTS.toFull);
  assert.equal((await own.journal.read(own.dir, run.runId))?.mode, 'full');
  assert.deepEqual(own.calls, ['reconcile']);
  const started = await setup();
  await started.journal.create(started.dir, newRun({ phase: 'executing', mode: 'after-start' }));
  assert.equal(await started.toggle(KEY, { mode: 'full' }), SWITCH_TEXTS.running);
  // A pause of the session card (settings-off): on again resumes it; a pause of the user waits for «Продолжить».
  const paused = await setup();
  await paused.journal.create(paused.dir, newRun({ phase: 'paused', reason: 'settings-off', pausedFrom: 'executing' }));
  assert.equal(await paused.toggle(KEY, { mode: 'off' }), SWITCH_TEXTS.paused);
  assert.equal(await paused.toggle(KEY, { mode: 'full' }), SWITCH_TEXTS.resumed);
  assert.deepEqual(paused.calls, [`resume:${KEY}`]);
  const held = await setup();
  await held.journal.create(held.dir, newRun({ phase: 'paused', reason: 'user-pause' }));
  assert.equal(await held.toggle(KEY, { mode: 'after-start' }), SWITCH_TEXTS.stillPaused);
  const none = await setup();
  assert.equal(await none.toggle(KEY, { mode: 'full' }), SWITCH_TEXTS.idle);
  assert.equal(await none.toggle(KEY, { mode: 'off' }), SWITCH_TEXTS.off);
  assert.equal(await none.toggle(KEY, { review: true }), SWITCH_TEXTS.off, 'a review change alone is no switch of the mode');
});

test('the answer on the plan question: the full mode tells the agent the run; otherwise the session is marked «writing»', async () => {
  const t = await setup();
  await t.switcher.answered('p1', KEY, 'plan', 'Docs');
  assert.ok((await t.sessions.get('p1', KEY))?.preparing, 'marked');
  await t.switcher.answered('p1', 'codex:s-2', 'talk', 'Docs');
  assert.equal((await t.sessions.get('p1', 'codex:s-2'))?.preparing, undefined, 'talk is no plan');
  // The mark goes once Kit shows a proposal.
  t.w.proposal = { automation: true };
  await t.switcher.settle('p1');
  assert.equal((await t.sessions.get('p1', KEY))?.preparing, undefined);
});

test('T003: the review of the card follows into the snapshot of the session run before its start', async () => {
  const t = await setup();
  const run = await t.journal.create(t.dir, newRun({ review: false }));
  await t.toggle(KEY, { review: true });
  assert.equal((await t.journal.read(t.dir, run.runId))?.review, true);
  const started = await setup();
  const going = await started.journal.create(started.dir, newRun({ review: false, phase: 'executing' }));
  await started.toggle(KEY, { review: true });
  assert.equal((await started.journal.read(started.dir, going.runId))?.review, false, 'a started run keeps its snapshot');
});
