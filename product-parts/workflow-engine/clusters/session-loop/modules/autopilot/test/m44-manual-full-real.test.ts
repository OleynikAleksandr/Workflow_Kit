// M44 T001, end-to-end with the real Kit bundle 2.4.6 and the service wired as `wfk serve` wires
// it (Settings «Полный автопилот», review off, `decisions: host`): the plan has a manual
// acceptance criterion (the user's live check), as M43 had. Kit 2.4.5 refused the grant of such a
// full run (AUTOPILOT_MANUAL_REQUIRED) and every delivery, the acceptance and the close waited for
// buttons; now the run gets the grant, starts the delivery itself, waits for «Принять план» and
// then closes and publishes.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { COMPLETE_TEXTS, decisionBy } from '../src/index.ts';
import type { RunRecord } from '../src/index.ts';
import { AUTO_SCOPE, KEY, bootService, openWorld, scriptedAgent } from './m40-world.ts';
import type { Service, World } from './m40-world.ts';

let world: World;
let svc: Service | null = null;

/** AUTO_SCOPE with a second, manual criterion (the user checks the note live). */
const MANUAL_SCOPE = {
  ...AUTO_SCOPE,
  id: 'manual',
  acceptance: [...AUTO_SCOPE.acceptance, 'The user checks the note live'],
  automation: {
    ...AUTO_SCOPE.automation,
    acceptance: [...AUTO_SCOPE.automation.acceptance, { criterion: 1, kind: 'manual', checks: [], evidence: ['docs/evidence/result.md'] }],
  },
};

before(async () => {
  world = await openWorld('wfk-m44-manual-');
  await world.project('manual', 'host');
});

after(async () => {
  svc?.close();
  await world.close();
});

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

test('a full run with a manual criterion gets the grant, delivers itself, waits for «Принять план», then closes and publishes', async () => {
  svc = await bootService(world, 'full');
  await svc.prompt('manual', 'Сделай заметку о фиче; я сам проверю её вживую');
  const prepared = await svc.runs.authorizePreparation('manual', KEY, 'A note about the feature');
  assert.ok(prepared?.runId);
  const runId = prepared.runId;
  await world.propose('manual', MANUAL_SCOPE);

  // The grant does not accept (accept=false): at READY_FOR_ACCEPTANCE the run waits for the user.
  const waiting = await drive('manual', runId, (r) => r.nextAction === COMPLETE_TEXTS.manual || r.phase === 'blocked' || r.phase === 'completed');
  assert.deepEqual([waiting.phase, waiting.nextAction], ['delivering', COMPLETE_TEXTS.manual], JSON.stringify({ phase: waiting.phase, reason: waiting.reason }));
  assert.equal(waiting.authority?.acceptancePolicy, 'manual');
  assert.deepEqual(waiting.receipts.map((r) => r.type).filter((t) => t === 'review' || t === 'choose' || t === 'authorize' || t === 'start'), ['review', 'choose', 'authorize', 'start']);
  // The grant is in the plan: Kit knows the run, the delivery was started by the grant, not a button.
  const plan = (await world.plan('manual')) as unknown as { scope: { authorization?: { runId: string; mode: string; accept: boolean } | null } };
  assert.deepEqual([plan.scope.authorization?.runId, plan.scope.authorization?.mode, plan.scope.authorization?.accept], [runId, 'full', false]);
  assert.deepEqual(world.history('manual').filter((d) => d.kind === 'confirm-delivery').map((d) => [d.source?.kind, d.source?.runId]), [['grant', runId]]);

  // «Принять план» in the panel: the user's decision; the run closes and publishes itself.
  await svc.autopilot.accept('manual', undefined, KEY, decisionBy({ requestId: 'accept-manual' }));
  const run = await drive('manual', runId, (r) => r.phase === 'completed' || r.phase === 'blocked');
  assert.equal(run.phase, 'completed', JSON.stringify({ reason: run.reason }));
  const final = world.git('manual', 'rev-parse', 'HEAD');
  assert.equal(world.git(world.remotes['manual']!, 'rev-parse', 'main'), final, 'the close SHA is published');
  assert.deepEqual(world.history('manual').filter((d) => d.kind === 'accept').map((d) => d.source?.kind), ['button']);
  assert.deepEqual(world.history('manual').filter((d) => d.kind === 'close').map((d) => [d.source?.kind, d.source?.runId]), [['grant', runId]]);
  assert.equal((await world.plan('manual')).lastClosed?.autopilotRun, runId);
});
