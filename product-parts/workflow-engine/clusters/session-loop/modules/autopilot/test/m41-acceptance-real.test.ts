// M41 T004, end-to-end with the real Kit bundle 2.4.5 and the service wired as `wfk serve` wires
// it (Settings «Полный автопилот», review off, `decisions: host`):
// 1. A delivery check the delivery task names proves a criterion: the hook records it at the
//    commit of the delivery and the run accepts, closes and publishes itself.
// 2. A criterion no task can record is refused at the proposal (AUTOMATION_CHECK_UNRECORDED).
// 3. Evidence missing from HEAD and from the disk, a clean tree: the run waits for the user's
//    acceptance (never `blocked`, Kit is not asked again at the same HEAD); «Принять план» — the
//    run closes, the CI checks exactly the close SHA, and that SHA is published.
// 3a. The evidence file lies uncommitted: the run waits too; after «Принять план» its close gets
//    DIRTY_TREE and stops with the hint, the file stays.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { COMPLETE_TEXTS, decisionBy } from '../src/index.ts';
import type { RunRecord } from '../src/index.ts';
import { AUTO_SCOPE, KEY, bootService, openWorld, scriptedAgent } from './m40-world.ts';
import type { Service, World } from './m40-world.ts';

let world: World;
let svc: Service | null = null;
const exit0 = { executable: 'node', args: ['-e', 'process.exit(0)'] };
const installed = { role: 'installed', stage: 'delivery', evidence: 'The release note of the delivery exists' };
const PROFILE = {
  stacks: ['node'],
  checks: [
    { id: 'lint', role: 'lint', stage: 'commit', required: true, command: exit0 },
    // Passes only once the delivery wrote its note: it runs at the commit of D1.
    { id: 'smoke', ...installed, command: { executable: 'node', args: ['-e', "process.exit(require('fs').existsSync('docs/release.md') ? 0 : 1)"] } },
    { id: 'src-smoke', ...installed, appliesTo: ['src/**'], command: exit0 },
    { id: 'push-guard', role: 'custom', stage: 'push', command: exit0 },
  ],
};
/** AUTO_SCOPE with the criterion checks and evidence of a scenario; D1 names `checks`. */
const scope = (id: string, checks: string[], evidence: string[], deliveryChecks: string[] = []) => ({
  ...AUTO_SCOPE,
  id,
  automation: { ...AUTO_SCOPE.automation, acceptance: [{ criterion: 0, kind: 'automatic', checks, evidence }] },
  tasks: AUTO_SCOPE.tasks.map((task) => (task.id === 'D1' ? { ...task, checks: deliveryChecks } : task)),
});

before(async () => {
  world = await openWorld('wfk-m41-acceptance-');
  for (const id of ['recorded', 'refused', 'missing', 'dirty']) {
    await world.project(id, 'host');
    await world.configure(id, PROFILE);
  }
});

after(async () => {
  svc?.close();
  await world.close();
});

/** The user's instruction and the proposal: the run of the project (as M40 scenario 1). */
async function prepare(id: string, input: Record<string, unknown>): Promise<string> {
  svc?.close();
  svc = await bootService(world, 'full');
  await svc.prompt(id, 'Сделай заметку о фиче и доведи до публикации');
  const prepared = await svc.runs.authorizePreparation(id, KEY, 'A note about the feature');
  assert.ok(prepared?.runId);
  await world.propose(id, input);
  return prepared.runId;
}

/** Turns of the scripted agent, waits and completion steps until `done` holds for the run. */
async function drive(id: string, runId: string, done: (run: RunRecord) => boolean): Promise<RunRecord> {
  for (let step = 0; step < 40; step += 1) {
    const run = (await svc!.journal.read(world.roots[id]!, runId))!;
    if (done(run)) return run;
    const text = await svc!.stop(id);
    if (text) {
      await scriptedAgent(world, svc!, id, text);
      continue;
    }
    await svc!.waits.pollAll();
    await svc!.completion.advance(id);
  }
  return (await svc!.journal.read(world.roots[id]!, runId))!;
}

/** Every phase the run passes, from the journal's change listener. */
function phasesOf(runId: string): string[] {
  const phases: string[] = [];
  svc!.journal.onChange((run) => void (run.runId === runId && phases.push(run.phase)));
  return phases;
}

test('scenario 1: the delivery check of the delivery task proves the criterion — the run accepts, closes and publishes itself', async () => {
  const runId = await prepare('recorded', scope('recorded', ['lint', 'smoke'], ['docs/evidence/result.md'], ['smoke']));
  const run = await drive('recorded', runId, (r) => r.phase === 'completed' || r.phase === 'blocked' || Boolean(r.manualAcceptance));
  assert.deepEqual([run.phase, run.manualAcceptance ?? null], ['completed', null], JSON.stringify({ reason: run.reason, manual: run.manualAcceptance }));
  assert.ok(run.receipts.some((r) => r.type === 'accept' && /automatic acceptance by run/u.test(r.detail)));
  const final = world.git('recorded', 'rev-parse', 'HEAD');
  assert.equal(world.git(world.remotes['recorded']!, 'rev-parse', 'main'), final);
  const accept = world.history('recorded').find((d) => d.kind === 'accept');
  assert.deepEqual([accept?.source?.kind, accept?.source?.runId], ['grant', runId]);
});

test('scenario 2: a criterion no task can record is refused at the proposal', async () => {
  const cases: Array<[string[], string[], string]> = [
    [['push-guard'], [], 'stage-push'],
    [['smoke'], [], 'delivery-unassigned'],
    [['src-smoke'], ['src-smoke'], 'applies-to'],
  ];
  for (const [checks, delivery, reason] of cases) {
    await world.put('refused', '.harness/inputs/scope.json', JSON.stringify(scope('refused', checks, [], delivery)));
    const refusal = await world.refusedKit('refused', 'scope:propose', '--input', '.harness/inputs/scope.json', '--recommended', 'sequential', '--reason', 'One note');
    assert.deepEqual([refusal.code, refusal.details['reason'], refusal.details['check']], ['AUTOMATION_CHECK_UNRECORDED', reason, checks[0]]);
  }
  assert.equal((await world.plan('refused')).scope, null);
});

test('scenario 3: missing evidence, a clean tree — the run waits for «Принять план», then closes, checks the close SHA and publishes it', async () => {
  const runId = await prepare('missing', scope('missing', ['lint'], ['docs/evidence/never.md']));
  const phases = phasesOf(runId);
  const waiting = await drive('missing', runId, (r) => Boolean(r.manualAcceptance) || r.phase === 'blocked' || r.phase === 'completed');
  assert.equal(waiting.phase, 'accepting');
  assert.equal(waiting.manualAcceptance?.reason, COMPLETE_TEXTS.evidence('docs/evidence/never.md'));
  assert.equal(waiting.nextAction, COMPLETE_TEXTS.awaitUser(COMPLETE_TEXTS.evidence('docs/evidence/never.md')));
  assert.equal(world.git('missing', 'status', '--porcelain'), '');
  // Kit is not asked again at the same HEAD.
  for (let i = 0; i < 3; i += 1) await svc!.completion.advance('missing');
  const same = (await svc!.journal.read(world.roots['missing']!, runId))!;
  assert.deepEqual([same.revision, same.tickets], [waiting.revision, waiting.tickets]);
  // «Принять план» in the panel: the user's decision with the source button.
  await svc!.autopilot.accept('missing', undefined, KEY, decisionBy({ requestId: 'accept-missing' }));
  const run = await drive('missing', runId, (r) => r.phase === 'completed' || r.phase === 'blocked');
  assert.equal(run.phase, 'completed', JSON.stringify({ reason: run.reason }));
  assert.ok(!phases.includes('blocked'), `never blocked: ${phases.join(' → ')}`);
  const final = world.git('missing', 'rev-parse', 'HEAD');
  assert.equal(run.completion?.finalSha, final);
  assert.ok(svc!.ciReads.includes(final), 'the CI of the close SHA was read before main');
  assert.equal(world.git(world.remotes['missing']!, 'rev-parse', 'main'), final, 'exactly the close SHA is published');
  assert.deepEqual(world.history('missing').filter((d) => d.kind === 'accept').map((d) => d.source?.kind), ['button']);
  assert.equal((await world.plan('missing')).lastClosed?.autopilotRun, runId);
});

test('scenario 3a: an uncommitted evidence file — the run waits, then its close gets DIRTY_TREE and stops; the file stays', async () => {
  const runId = await prepare('dirty', scope('dirty', ['lint'], ['docs/evidence/late.md']));
  const waiting = await drive('dirty', runId, (r) => Boolean(r.manualAcceptance) || r.phase === 'blocked' || r.phase === 'completed');
  assert.equal(waiting.phase, 'accepting');
  await world.put('dirty', 'docs/evidence/late.md', '# Late\n');
  await svc!.completion.advance('dirty');
  assert.equal((await svc!.journal.read(world.roots['dirty']!, runId))!.phase, 'accepting', 'still waiting: not in HEAD');
  await svc!.autopilot.accept('dirty', undefined, KEY, decisionBy({ requestId: 'accept-dirty' }));
  await svc!.completion.advance('dirty');
  const run = (await svc!.journal.read(world.roots['dirty']!, runId))!;
  assert.deepEqual([run.phase, run.pausedFrom], ['blocked', 'closing']);
  assert.match(run.reason ?? '', /^DIRTY_TREE/u);
  assert.match(run.nextAction ?? '', /незакоммиченные файлы/u);
  assert.ok(existsSync(path.join(world.roots['dirty']!, 'docs', 'evidence', 'late.md')), 'the file is kept');
  assert.equal((await world.plan('dirty')).scope?.delivery, 'ACCEPTED');
});
