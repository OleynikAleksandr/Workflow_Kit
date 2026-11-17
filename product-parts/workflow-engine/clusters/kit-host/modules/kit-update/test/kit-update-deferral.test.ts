// M41 T003: «Обновить Kit» waits while a plan is open (409 scope-open) or an autopiloting run has
// not published its verified SHA (409 run-active). The facts are read again under the project
// lock before the first write, so a run that appears between the request and the lock leaves the
// structure files, Kit and HEAD as they were.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HttpError, createRouter, createStateRegistry } from '#http-server';
import type { KitInspect, KitInstall, KitOutcome } from '#kit-runner';
import type { Project } from '#provider-registry';
import { deferralText, kitDeferral, registerKitUpdateRoutes } from '../src/index.ts';
import type { KitDeferral } from '../src/index.ts';

const project: Project = { id: 'p1', name: 'Demo', path: '/work/demo', source: 'opened', createdAt: '2026-11-17T00:00:00.000Z' };
const inspected = (): KitOutcome<KitInspect> => ({ ok: true, command: 'inspect', result: { action: 'open', state: 'KIT_OUTDATED', version: '2.4.4', path: project.path, git: { repository: true, head: 'abc', identity: null }, transactionPending: false, damaged: [] } });

function setup(facts: { deferral: KitDeferral | null }, lock?: (key: string) => void) {
  const router = createRouter();
  const writes: string[] = [];
  const keys: string[] = [];
  const kit = {
    inspect: async () => inspected(),
    install: async (): Promise<KitOutcome<KitInstall>> => {
      writes.push('kit install');
      return { ok: true, command: 'install', result: { version: '2.4.5', previousState: 'KIT_OUTDATED', written: [], commit: { sha: 'c0ffee', role: 'kit-update' }, migrationRequired: false } };
    },
    status: async () => ({ ok: true, command: 'status', result: { changes: [] } }) as never,
  };
  const structure = {
    check: async () => ({ status: 'outdated', version: 4, installedVersion: 3, fragments: [{ id: 'agents-section', path: 'AGENTS.md', kind: 'section', status: 'outdated' }], warnings: [], notes: [], installable: true }) as never,
    install: async () => {
      writes.push('structure install');
      return { written: [] } as never;
    },
  };
  const mutex = {
    async run<T>(key: string, action: () => Promise<T>): Promise<T> {
      keys.push(key);
      lock?.(key);
      return action();
    },
  };
  const lines: string[] = [];
  const kitUpdate = registerKitUpdateRoutes({
    router, state: createStateRegistry(), projects: { get: async () => project, list: async () => [project] }, kit, providers: { list: () => [] },
    structure, bundled: '2.4.5', intervalMs: 0, now: () => new Date('2026-11-17T12:00:00.000Z'), log: (line) => lines.push(line),
    deferral: async () => facts.deferral, mutex,
  });
  const route = router.match('POST', '/api/projects/p1/kit/update') as { handler: (ctx: unknown) => Promise<unknown> };
  return { kitUpdate, writes, keys, lines, call: () => route.handler({ params: { id: 'p1' }, body: {} }) };
}

const OPEN: KitDeferral = { code: 'scope-open', scopeId: 'M41-autopilot-acceptance', runId: null };
const RUN: KitDeferral = { code: 'run-active', scopeId: 'M41-autopilot-acceptance', runId: 'run-abcdef' };

test('an open plan and an unpublished run: 409 with the reason, nothing starts or is written', async () => {
  for (const deferral of [OPEN, RUN]) {
    const t = setup({ deferral });
    await t.kitUpdate.refresh();
    assert.deepEqual(t.kitUpdate.section().projects['p1']!.deferred, deferral, 'the section tells the panel');
    await assert.rejects(t.call(), (error: unknown) => error instanceof HttpError && error.status === 409 && error.code === deferral.code && error.message === deferralText(deferral));
    assert.deepEqual([t.writes, t.kitUpdate.section().projects['p1']!.running], [[], false]);
  }
  assert.match(deferralText(OPEN), /после закрытия плана «M41-autopilot-acceptance»/u);
  assert.match(deferralText(RUN), /после публикации запуска run-abcdef: .*head-changed/u);
});

test('a run that appears between the request and the lock: no structure file, no Kit commit', async () => {
  const facts = { deferral: null as KitDeferral | null };
  // The completion of a run held the lock and began publishing before the update got it.
  const t = setup(facts, () => void (facts.deferral = RUN));
  assert.equal(((await t.call()) as { status: number }).status, 202);
  await t.kitUpdate.settled('p1');
  assert.deepEqual(t.keys, ['project:p1']);
  assert.deepEqual(t.writes, [], 'the structure is not written and Kit does not commit');
  const entry = t.kitUpdate.section().projects['p1']!;
  assert.deepEqual([entry.error?.code, entry.error?.message, entry.last, entry.running], ['run-active', deferralText(RUN), undefined, false]);
  assert.deepEqual(t.lines, ['kit: update deferred Demo: run-active']);
});

test('no plan and no run: the structure and Kit are written under the project lock', async () => {
  const t = setup({ deferral: null });
  assert.equal(((await t.call()) as { status: number }).status, 202);
  await t.kitUpdate.settled('p1');
  assert.deepEqual([t.keys, t.writes], [['project:p1'], ['structure install', 'kit install']]);
  assert.equal(t.kitUpdate.section().projects['p1']!.last?.to, '2.4.5');
});

test('kitDeferral: the open scope first, then the run that still acts; a Kit failure defers nothing', async () => {
  const status = (scope: { id: string } | null, ok = true) => async () => (ok ? { ok: true, command: 'status', result: { scope } } : { ok: false, command: 'status', code: 'NOT_INSTALLED', message: 'no Kit', nextAction: null }) as never;
  const run = async () => ({ runId: 'run-abcdef', scopeId: 'auto' });
  assert.deepEqual(await kitDeferral({ status: status({ id: 'auto' }), activeRun: run })('/p'), { code: 'scope-open', scopeId: 'auto', runId: null });
  assert.deepEqual(await kitDeferral({ status: status(null), activeRun: run })('/p'), { code: 'run-active', scopeId: 'auto', runId: 'run-abcdef' });
  assert.equal(await kitDeferral({ status: status(null), activeRun: async () => null })('/p'), null);
  assert.equal(await kitDeferral({ status: status(null, false) })('/p'), null);
});
