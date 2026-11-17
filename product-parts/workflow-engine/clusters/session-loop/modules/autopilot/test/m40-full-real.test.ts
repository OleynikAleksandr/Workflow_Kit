// M40 T009, end-to-end scenarios 1 and 8 (validation section 2) with the real Kit bundle and the
// service wired as `wfk serve` wires it: Settings «Полный автопилот», review off, `decisions: host`.
// 1. The user's message → `wfk session plan` registers the run without a card → the proposal →
//    the automatic choice → the tasks → the delivery under the live grant without flags → CI →
//    the automatic acceptance → the close → the verified publication. Every decision in the Kit
//    history has the source `grant` with the run id; the user's message served only the run.
// 8. «Стоп» from the panel while the agent works on the last delivery turn: the run stops at once,
//    no continuation follows the turn, and there is no acceptance, close or push.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { USER_MESSAGE_SOURCE } from '#agent-channel';
import { WORD_TEXTS, WorkflowActionError } from '../src/index.ts';
import { KEY, bootService, openWorld, scriptedAgent } from './m40-world.ts';
import type { Service, World } from './m40-world.ts';

let world: World;
let svc: Service;

before(async () => {
  world = await openWorld('wfk-m40-full-');
  await world.project('full', 'host');
  await world.project('halt', 'host');
});

after(async () => {
  svc.close();
  await world.close();
});

/** The user's instruction, the plan question of the agent, the proposal: the run of the project. */
async function prepare(id: string, words: string): Promise<string> {
  await svc.prompt(id, words);
  const prepared = await svc.runs.authorizePreparation(id, KEY, 'A note about the feature');
  assert.ok(prepared, 'no plan question card: the service prepares');
  assert.deepEqual([prepared.action, prepared.policy, prepared.review], ['prepare', 'full', false]);
  assert.doesNotMatch(prepared.instruction, /--authorized/u);
  // A repeat in the same turn names the same run.
  assert.equal((await svc.runs.authorizePreparation(id, KEY, 'Again'))?.runId, prepared.runId);
  await world.propose(id);
  return prepared.runId!;
}

test('scenario 1: full host pass under the autopilot — every decision by the grant, the message used once, the remote SHA verified', async () => {
  // Each scenario has its own service: the owner session «claude:s-1» belongs to one project.
  svc = await bootService(world, 'full');
  const words = 'Сделай заметку о фиче: спецификация, план и выполнение до публикации';
  const runId = await prepare('full', words);
  // The message registered the run: it is not the source of another decision.
  await assert.rejects(svc.decisions.apply(world.roots['full']!, 'full', { kind: 'accept', origin: { kind: 'message', key: KEY } }), (error: unknown) => error instanceof WorkflowActionError && error.code === 'decision-source-used');
  const said: string[] = [];
  for (let step = 0; step < 40; step += 1) {
    const text = await svc.stop('full');
    if (text) {
      said.push(text);
      await scriptedAgent(world, svc, 'full', text);
      continue;
    }
    const run = await svc.journal.active(world.roots['full']!);
    if (!run) break;
    await svc.waits.pollAll();
    await svc.completion.advance('full');
  }
  const [run] = await svc.journal.list(world.roots['full']!);
  assert.ok(run);
  assert.deepEqual([run.runId, run.phase, run.request.source, run.request.quote], [runId, 'completed', 'user-command', words]);
  const final = world.git('full', 'rev-parse', 'HEAD');
  assert.equal(world.git(world.remotes['full']!, 'rev-parse', 'main'), final, 'main got exactly the verified SHA');
  assert.equal(run.completion?.finalSha, final);
  assert.ok(svc.ciReads.includes(final), 'CI of the final SHA was read before main');
  assert.deepEqual(run.receipts.map((r) => r.type).filter((t) => t !== 'ci-stage'), ['review', 'choose', 'authorize', 'start', 'ci', 'accept', 'close', 'ci', 'publish']);
  // The Kit history: the choice, the delivery start, the acceptance and the close are decisions of the grant.
  const decisions = world.history('full');
  assert.deepEqual(decisions.map((d) => d.kind).sort(), ['accept', 'choose', 'close', 'confirm-delivery']);
  for (const decision of decisions) {
    assert.deepEqual([decision.source?.kind, decision.source?.runId, decision.source?.messageId ?? null], ['grant', runId, null], JSON.stringify(decision));
  }
  // The choice went through a Kit request (before the scope grant existed); the others by the grant.
  assert.ok(decisions.find((d) => d.kind === 'choose')?.decisionId);
  assert.equal((await world.plan('full')).lastClosed?.autopilotRun, runId);
  // The delivery started under the live grant without any flag of the agent.
  const subjects = world.git('full', 'log', '--format=%s').split('\n');
  for (const subject of ['docs: note', 'chore: release', `chore: accept scope auto (autopilot run ${runId})`, `chore: close scope auto (autopilot run ${runId})`]) {
    assert.equal(subjects.filter((line) => line === subject).length, 1, subject);
  }
  assert.ok(said.every((text) => !/--confirmed|accept --note|close --note/u.test(text)), 'no decision form in any text of the service');
  assert.equal(world.git('full', 'status', '--porcelain'), '');
});

test('scenario 8: «Стоп» from the panel while the agent is busy, before the automatic acceptance — no continuation, no acceptance, close or push', async () => {
  svc.close();
  svc = await bootService(world, 'full');
  const runId = await prepare('halt', 'Сделай заметку о фиче и доведи до публикации');
  const remoteBefore = world.git(world.remotes['halt']!, 'rev-parse', 'main');
  let stopped = false;
  for (let step = 0; step < 40 && !stopped; step += 1) {
    const text = await svc.stop('halt');
    if (text && /CI is green/u.test(text)) {
      // The agent works on the last turn before the acceptance; the user presses Enter in the panel.
      assert.equal(svc.channel.get(KEY)?.state, 'working');
      const done = await svc.words.received('halt', KEY, 'Стоп');
      svc.channel.enqueue(KEY, 'Стоп', USER_MESSAGE_SOURCE, 'halt');
      assert.equal((await svc.journal.read(world.roots['halt']!, runId))?.phase, 'stopped', 'stopped while the message waits in the queue');
      await done!.settled;
      await scriptedAgent(world, svc, 'halt', text);
      // The turn ends: the user's message and the context, no continuation of the run.
      const answer = (await svc.stop('halt')) ?? '';
      assert.ok(answer.includes('Стоп') && answer.includes(WORD_TEXTS.stop(runId)), answer);
      assert.doesNotMatch(answer, /task:start|CI is green/u);
      stopped = true;
      continue;
    }
    if (text) {
      await scriptedAgent(world, svc, 'halt', text);
      continue;
    }
    await svc.waits.pollAll();
    await svc.completion.advance('halt');
  }
  assert.ok(stopped, 'the run reached the last delivery turn');
  for (let i = 0; i < 3; i += 1) {
    await svc.waits.pollAll();
    await svc.completion.advance('halt');
    await svc.completion.advanceAll();
  }
  assert.equal(await svc.stop('halt'), null, 'the answer to the user ends the work');
  const run = (await svc.journal.read(world.roots['halt']!, runId))!;
  assert.deepEqual([run.phase, run.reason, run.authority?.revocation?.reason], ['stopped', 'user-stop', 'user-stop']);
  assert.equal(run.receipts.some((r) => ['accept', 'close', 'publish'].includes(r.type)), false);
  const status = await world.kit<{ delivery: string; authorization: { revoked: { reason: string } | null } | null }>('halt', 'autopilot:status');
  assert.equal(status.delivery, 'READY_FOR_ACCEPTANCE', 'not accepted');
  assert.equal(status.authorization?.revoked?.reason, 'user-stop', 'Kit recorded the revocation of the grant');
  assert.deepEqual(world.history('halt').map((d) => d.kind), ['choose', 'confirm-delivery'], 'the delivery started before the word; no acceptance, no close');
  assert.equal(world.git(world.remotes['halt']!, 'rev-parse', 'main'), remoteBefore, 'nothing was published');
});
