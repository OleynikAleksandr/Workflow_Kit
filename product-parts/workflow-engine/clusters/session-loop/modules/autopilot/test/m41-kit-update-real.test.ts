// M41 T004 scenario 4, with the real Kit bundle 2.4.5, the service of the M40 world and the real
// «Обновить Kit» routes (kit-update) wired as `wfk serve` wires them: while the plan is open the
// update is 409 scope-open; after the close, while the run waits for the CI of its final SHA, it
// is 409 run-active and HEAD and Kit stay; after the verified publication it starts (202).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { HttpError, createRouter, createStateRegistry } from '#http-server';
import { KIT_VERSION } from '#kit-bundle';
import { kitDeferral, registerKitUpdateRoutes } from '#kit-update';
import type { KitUpdate } from '#kit-update';
import type { Project } from '#provider-registry';
import { KEY, bootService, openWorld, scriptedAgent } from './m40-world.ts';
import type { Service, World } from './m40-world.ts';

let world: World;
let svc: Service;
let kitUpdate: KitUpdate;

before(async () => {
  world = await openWorld('wfk-m41-kit-update-');
  await world.project('kit', 'host');
});

after(async () => {
  kitUpdate?.stop();
  svc?.close();
  await world.close();
});

test('scenario 4: «Обновить Kit» waits for the close of the plan and for the publication of the run', async () => {
  svc = await bootService(world, 'full');
  const project: Project = { id: 'kit', name: 'Kit', path: world.roots['kit']!, source: 'opened', createdAt: '2026-11-17T00:00:00.000Z' };
  const router = createRouter();
  kitUpdate = registerKitUpdateRoutes({
    router, state: createStateRegistry(), projects: { get: async (id) => (id === 'kit' ? project : undefined), list: async () => [project] },
    kit: world.runner, providers: { list: () => [] }, bundled: KIT_VERSION, intervalMs: 0,
    deferral: kitDeferral({
      status: (root) => world.runner.status(root),
      activeRun: async (root) => {
        const run = await svc.journal.active(root);
        return run ? { runId: run.runId, scopeId: run.scopeId } : null;
      },
    }),
    mutex: svc.mutex,
  });
  const route = router.match('POST', '/api/projects/kit/kit/update') as { handler: (ctx: unknown) => Promise<unknown> };
  const call = () => route.handler({ params: { id: 'kit' }, body: {} });
  const refusedWith = (code: string) => (error: unknown) => error instanceof HttpError && error.status === 409 && error.code === code;

  await svc.prompt('kit', 'Сделай заметку о фиче и доведи до публикации');
  const prepared = await svc.runs.authorizePreparation('kit', KEY, 'A note about the feature');
  await world.propose('kit');
  let sawOpen = false;
  let sawRun = false;
  /** Asks for the update at the two moments it must wait; true once the run is completed. */
  const probe = async (): Promise<boolean> => {
    const run = (await svc.journal.read(world.roots['kit']!, prepared!.runId!))!;
    if (run.phase === 'completed') return true;
    const plan = await world.plan('kit');
    if (plan.scope && !sawOpen) {
      // The plan is open: nothing starts.
      const head = world.git('kit', 'rev-parse', 'HEAD');
      await assert.rejects(call(), refusedWith('scope-open'));
      assert.equal(world.git('kit', 'rev-parse', 'HEAD'), head);
      sawOpen = true;
    }
    if (!plan.scope && run.phase === 'waiting' && run.pausedFrom === 'publishing' && !sawRun) {
      // Closed, the CI of the final SHA is pending: a Kit commit now would stop the publication.
      const head = world.git('kit', 'rev-parse', 'HEAD');
      const before = await world.runner.inspect(world.roots['kit']!);
      await assert.rejects(call(), refusedWith('run-active'));
      assert.equal(world.git('kit', 'rev-parse', 'HEAD'), head, 'HEAD stays');
      assert.deepEqual(await world.runner.inspect(world.roots['kit']!), before, 'Kit stays');
      await kitUpdate.refresh('kit');
      assert.deepEqual(kitUpdate.section().projects['kit']?.deferred, { code: 'run-active', scopeId: 'auto', runId: prepared!.runId });
      sawRun = true;
    }
    return false;
  };
  for (let step = 0; step < 40; step += 1) {
    if (await probe()) break;
    const text = await svc.stop('kit');
    if (text) {
      await scriptedAgent(world, svc, 'kit', text);
      continue;
    }
    // The completion after the turn may have closed the plan and staged the final SHA for CI.
    if (await probe()) break;
    await svc.waits.pollAll();
    await svc.completion.advance('kit');
  }
  assert.ok(sawOpen && sawRun, `both refusals were met (open ${sawOpen}, run ${sawRun})`);
  const done = (await svc.journal.read(world.roots['kit']!, prepared!.runId!))!;
  assert.equal(done.phase, 'completed');
  assert.equal(world.git(world.remotes['kit']!, 'rev-parse', 'main'), done.completion?.finalSha, 'the verified SHA was published');
  // After the publication the update starts.
  const started = (await call()) as { status: number };
  assert.equal(started.status, 202);
  await kitUpdate.settled('kit');
  const entry = kitUpdate.section().projects['kit']!;
  assert.equal(entry.deferred, null);
  assert.ok(!['scope-open', 'run-active'].includes(entry.error?.code ?? ''), JSON.stringify(entry.error));
});
