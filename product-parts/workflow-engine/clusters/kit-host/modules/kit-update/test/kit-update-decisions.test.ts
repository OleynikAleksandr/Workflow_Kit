// M40 T008 (spec 2.1): «Обновить Kit» to Kit 2.4.0 and newer makes the project a `host` one — only
// the app records the user's decisions; an older bundled Kit gets no key.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRouter, createStateRegistry } from '#http-server';
import type { KitInspect, KitInstall, KitOutcome } from '#kit-runner';
import type { Project } from '#provider-registry';
import { HOST_DECISIONS_SINCE, decisionsOption, registerKitUpdateRoutes } from '../src/index.ts';

const project: Project = { id: 'p1', name: 'Demo', path: '/work/demo', source: 'opened', createdAt: '2026-11-17T00:00:00.000Z' };

test('decisionsOption: host from Kit 2.4.0; older and unreadable versions get no key', () => {
  assert.equal(HOST_DECISIONS_SINCE, '2.4.0');
  for (const version of ['2.4.0', '2.4.4', '2.10.0', '3.0.0']) assert.deepEqual(decisionsOption(version), { decisions: 'host' }, version);
  for (const version of ['2.3.3', '2.3.99', '1.9.0', '', 'dev']) assert.deepEqual(decisionsOption(version), {}, version);
});

async function update(bundled: string, installedVersion: string): Promise<Array<Record<string, unknown>>> {
  const installs: Array<Record<string, unknown>> = [];
  let done = false;
  const inspected = (state: string, version: string): KitOutcome<KitInspect> => ({
    ok: true, command: 'inspect', result: { action: 'open', state, version, path: project.path, git: { repository: true, head: 'abc', identity: null }, transactionPending: false, damaged: [] },
  } as unknown as KitOutcome<KitInspect>);
  const kit = {
    inspect: async () => (done ? inspected('KIT_OK', bundled) : inspected('KIT_OUTDATED', installedVersion)),
    install: async (_root: string, options: Record<string, unknown> = {}): Promise<KitOutcome<KitInstall>> => {
      installs.push(options);
      done = true;
      return { ok: true, command: 'install', result: { version: bundled, previousState: 'KIT_OUTDATED', written: [], commit: { sha: 'c0ffee', role: 'kit-update' }, migrationRequired: false } } as unknown as KitOutcome<KitInstall>;
    },
  };
  const router = createRouter();
  const kitUpdate = registerKitUpdateRoutes({
    router, state: createStateRegistry(), kit, bundled, intervalMs: 0,
    projects: { get: async (id) => (id === 'p1' ? project : undefined), list: async () => [project] },
    providers: { list: () => [] },
    hooks: { sleep: async () => undefined, attempts: 1 },
  });
  await kitUpdate.refresh();
  const route = router.match('POST', '/api/projects/p1/kit/update');
  assert.equal(route.kind, 'found');
  await (route as { handler: (ctx: unknown) => Promise<unknown> }).handler({ params: { id: 'p1' }, body: {} });
  await kitUpdate.settled('p1');
  kitUpdate.stop();
  return installs;
}

test('«Обновить Kit» to Kit 2.4.x installs with decisions host; to Kit 2.3.x without the key', async () => {
  assert.deepEqual(await update('2.4.4', '2.3.3'), [{ update: true, decisions: 'host' }]);
  assert.deepEqual(await update('2.3.3', '2.3.2'), [{ update: true }]);
});
