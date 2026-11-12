import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HttpError, createRouter, createStateRegistry } from '#http-server';
import { defaultHookHost, kitHookEntry } from '#kit-structure';
import type { KitInspect, KitInstall, KitOutcome } from '#kit-runner';
import type { HookState, Project, Provider } from '#provider-registry';
import { approveKitHooks, compareVersions, kitAction, registerKitUpdateRoutes } from '../src/index.ts';

const project: Project = { id: 'p1', name: 'Demo', path: '/work/demo', source: 'opened', createdAt: '2026-11-12T00:00:00.000Z' };
const archived: Project = { ...project, id: 'p2', name: 'Old', path: '/work/old', archivedAt: '2026-11-12T01:00:00.000Z' };
const KIT_COMMAND = 'wfk hook session-start --client codex';
const noSleep = { sleep: async () => undefined, attempts: 3 };

function inspected(state: string, version: string | null): KitOutcome<KitInspect> {
  return { ok: true, command: 'inspect', result: { action: 'open', state, version, path: project.path, git: { repository: true, head: 'abc', identity: null }, transactionPending: false, damaged: [] } };
}

interface FakeHooks {
  trusted?: boolean | null;
  /** Answers of hooks(), one per call; the last one repeats. */
  reads: HookState[];
  /** Errors approveHooks throws before it succeeds, one per call. */
  failures?: Array<Error & { code?: string }>;
  approve?: boolean;
}

/** A provider like Codex: it records an approval, its hooks are read from a list. */
function fakeProvider(spec: FakeHooks, extra: Partial<Provider> = {}) {
  const approved: Array<{ command: string; hash: string }> = [];
  let read = 0;
  const provider = {
    id: 'codex',
    title: 'ChatGPT (Codex)',
    label: 'ChatGPT',
    trust: async () => ({ trusted: spec.trusted ?? true }),
    hooks: async () => spec.reads[Math.min(read++, spec.reads.length - 1)]!,
    ...(spec.approve === false
      ? {}
      : {
          approveHooks: async (_project: Project, expected: { command: string; hash: string }) => {
            approved.push(expected);
            const failure = spec.failures?.shift();
            if (failure) throw failure;
            return { kitHook: { command: expected.command, hash: expected.hash, kit: true, status: 'approved' }, hooks: [], complete: true } satisfies HookState;
          },
        }),
    ...extra,
  } as unknown as Provider;
  return { provider, approved, reads: () => read };
}

const hookState = (command: string, hash: string, status: 'approved' | 'pending' | 'modified' = 'modified'): HookState => ({
  kitHook: { command, hash, kit: true, status },
  hooks: [{ command: 'echo foreign', hash: 'f00', kit: false, status: 'pending' }],
  complete: false,
});

test('versions compare as numbers and only an older Kit is offered an update', () => {
  assert.ok(compareVersions('2.2.3', '2.2.4') < 0);
  assert.ok(compareVersions('2.10.0', '2.9.9') > 0);
  assert.equal(compareVersions('2.2', '2.2.0'), 0);
  assert.equal(kitAction({ state: 'KIT_OUTDATED', version: '2.2.3' }, '2.2.4'), 'update');
  assert.equal(kitAction({ state: 'KIT_DAMAGED', version: '2.2.3' }, '2.2.4'), 'update');
  assert.equal(kitAction({ state: 'KIT_OK', version: '2.2.4' }, '2.2.4'), 'none');
  // A newer Kit is never replaced by the older bundle.
  assert.equal(kitAction({ state: 'KIT_OK', version: '2.2.5' }, '2.2.4'), 'none');
  assert.equal(kitAction({ state: 'GIT_NO_KIT', version: null }, '2.2.4'), 'none');
});

test('the section reads inspect, the route updates in the background and approves the Codex hook', async () => {
  const router = createRouter();
  const state = createStateRegistry();
  let installed = false;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const installs: Array<{ root: string; update?: boolean }> = [];
  const kit = {
    inspect: async (root: string) => (installed ? inspected('KIT_OK', '2.2.4') : inspected('KIT_OUTDATED', '2.2.3')),
    install: async (root: string, options: { update?: boolean } = {}): Promise<KitOutcome<KitInstall>> => {
      installs.push({ root, ...options });
      await gate;
      installed = true;
      return { ok: true, command: 'install', result: { version: '2.2.4', previousState: 'KIT_OUTDATED', written: [], commit: { sha: 'c0ffee', role: 'kit-update' }, migrationRequired: false } };
    },
  };
  const codex = fakeProvider({ reads: [hookState(KIT_COMMAND, 'h1')] });
  const claude = { id: 'claude', title: 'Claude Code', trust: async () => ({ trusted: true }) } as unknown as Provider;
  const lines: string[] = [];
  const updated: string[] = [];
  const kitUpdate = registerKitUpdateRoutes({
    router,
    state,
    projects: { get: async (id) => [project, archived].find((p) => p.id === id), list: async () => [project, archived] },
    kit,
    providers: { list: () => [claude, codex.provider] },
    bundled: '2.2.4',
    intervalMs: 0,
    hooks: noSleep,
    now: () => new Date('2026-11-12T12:00:00.000Z'),
    log: (line) => lines.push(line),
    onUpdated: (id) => updated.push(id),
  });
  await kitUpdate.refresh();
  const before = kitUpdate.section().projects;
  assert.deepEqual(Object.keys(before), ['p1'], 'an archived project has no entry');
  assert.deepEqual(before['p1'], { installed: '2.2.3', bundled: '2.2.4', state: 'KIT_OUTDATED', action: 'update', running: false, checkedAt: '2026-11-12T12:00:00.000Z' });
  assert.deepEqual((await state.collect())['kitUpdate'], { projects: before });

  const route = router.match('POST', '/api/projects/p1/kit/update');
  assert.equal(route.kind, 'found');
  const call = (params: Record<string, string>) => (route as { handler: (ctx: unknown) => Promise<unknown> }).handler({ params, body: {} });
  assert.deepEqual(await call({ id: 'p1' }), { kind: 'json', status: 202, body: { started: true, project: 'p1', from: '2.2.3', to: '2.2.4' } });
  assert.equal(kitUpdate.section().projects['p1']!.running, true);
  await assert.rejects(call({ id: 'p1' }), (error: unknown) => error instanceof HttpError && error.status === 409 && error.code === 'busy');
  await assert.rejects(call({ id: 'nope' }), (error: unknown) => error instanceof HttpError && error.status === 404);

  release();
  await kitUpdate.settled('p1');
  assert.deepEqual(installs, [{ root: '/work/demo', update: true }]);
  assert.deepEqual(codex.approved, [{ command: KIT_COMMAND, hash: 'h1' }], 'only the Kit hook, with the hash Codex reported');
  const after = kitUpdate.section().projects['p1']!;
  assert.equal(after.running, false);
  assert.equal(after.installed, '2.2.4');
  assert.equal(after.action, 'none');
  assert.equal(after.error, undefined);
  assert.deepEqual(after.last, { from: '2.2.3', to: '2.2.4', commit: 'c0ffee', hooks: ['ChatGPT: хуки Kit одобрены'], at: '2026-11-12T12:00:00.000Z' });
  assert.deepEqual(lines, ['kit: updated Demo 2.2.3 → 2.2.4']);
  assert.deepEqual(updated, ['p1']);
  kitUpdate.stop();
});

test('a Kit failure is kept with its next step and no hook is approved', async () => {
  const router = createRouter();
  const codex = fakeProvider({ reads: [hookState(KIT_COMMAND, 'h1')] });
  const kitUpdate = registerKitUpdateRoutes({
    router,
    state: createStateRegistry(),
    projects: { get: async () => project, list: async () => [project] },
    kit: {
      inspect: async () => inspected('KIT_OUTDATED', '2.2.3'),
      install: async () => ({ ok: false, code: 'TRANSACTION_PENDING', message: 'A Kit commit transaction is unfinished.', nextAction: 'Run `scripts/workflow repair`.', details: {} }),
    },
    providers: { list: () => [codex.provider] },
    bundled: '2.2.4',
    intervalMs: 0,
    now: () => new Date('2026-11-12T12:00:00.000Z'),
  });
  const route = router.match('POST', '/api/projects/p1/kit/update') as { handler: (ctx: unknown) => Promise<unknown> };
  await route.handler({ params: { id: 'p1' }, body: {} });
  await kitUpdate.settled('p1');
  const entry = kitUpdate.section().projects['p1']!;
  assert.deepEqual(entry.error, { code: 'TRANSACTION_PENDING', message: 'A Kit commit transaction is unfinished.', nextAction: 'Run `scripts/workflow repair`.', at: '2026-11-12T12:00:00.000Z' });
  assert.equal(entry.last, undefined);
  assert.equal(entry.running, false);
  assert.equal(entry.action, 'update');
  assert.deepEqual(codex.approved, []);
});

test('an inspect failure leaves the state unknown with a note', async () => {
  const kitUpdate = registerKitUpdateRoutes({
    router: createRouter(),
    state: createStateRegistry(),
    projects: { get: async () => project, list: async () => [project] },
    kit: { inspect: async () => ({ ok: false, code: 'KIT_TIMEOUT', message: 'Kit не ответил за 60 с (inspect).', nextAction: null, details: {} }), install: async () => assert.fail('no install') },
    providers: { list: () => [] },
    bundled: '2.2.4',
    intervalMs: 0,
  });
  await kitUpdate.refresh('p1');
  const entry = kitUpdate.section().projects['p1']!;
  assert.equal(entry.state, null);
  assert.equal(entry.action, 'none');
  assert.equal(entry.note, 'Kit: Kit не ответил за 60 с (inspect).');
});

test('hook approval: untrusted folder, providers without a record-only approval, a late list', async () => {
  const untrusted = fakeProvider({ trusted: false, reads: [hookState(KIT_COMMAND, 'h1')] });
  assert.equal(await approveKitHooks(untrusted.provider, project, noSleep), 'ChatGPT: папка не доверена — хуки Kit не одобрялись');
  assert.deepEqual(untrusted.approved, []);

  // Claude: no approval at all; Kimi: its approval writes a file shown in the wizard.
  const claude = fakeProvider({ approve: false, reads: [hookState(KIT_COMMAND, 'h1')] });
  assert.equal(await approveKitHooks(claude.provider, project, noSleep), null);
  const kimi = fakeProvider({ reads: [{ ...hookState(KIT_COMMAND, 'h1'), writes: [] }] });
  assert.equal(await approveKitHooks(kimi.provider, project, noSleep), null);
  assert.deepEqual(kimi.approved, []);

  // The first read comes before Codex listed the new hooks: no hash yet.
  const late = fakeProvider({ reads: [hookState(KIT_COMMAND, ''), hookState(KIT_COMMAND, 'h2')] });
  assert.equal(await approveKitHooks(late.provider, project, noSleep), 'ChatGPT: хуки Kit одобрены');
  assert.deepEqual(late.approved, [{ command: KIT_COMMAND, hash: 'h2' }]);

  // A stale list: Codex refuses the old hash, the next read has the new one.
  const stale = Object.assign(new Error('Хеш хука Kit не совпадает с показанным'), { code: 'hash-changed' });
  const changed = fakeProvider({ reads: [hookState(KIT_COMMAND, 'old', 'approved'), hookState(KIT_COMMAND, 'new')], failures: [stale] });
  assert.equal(await approveKitHooks(changed.provider, project, noSleep), 'ChatGPT: хуки Kit одобрены');
  assert.deepEqual(changed.approved.map((e) => e.hash), ['old', 'new']);

  const never = fakeProvider({ reads: [hookState(KIT_COMMAND, '')] });
  assert.equal(await approveKitHooks(never.provider, project, noSleep), 'ChatGPT: хуки Kit не одобрены — ChatGPT не показал их хеш; одобрите в «Настройках»');
  assert.equal(never.reads(), 3);

  const refused = Object.assign(new Error('codex не найден'), { code: 'not-installed' });
  const broken = fakeProvider({ reads: [hookState(KIT_COMMAND, 'h1')], failures: [refused] });
  assert.equal(await approveKitHooks(broken.provider, project, noSleep), 'ChatGPT: хуки Kit не одобрены — codex не найден');
});

test('on Windows the hook is approved with the commandWindows Codex reports', async () => {
  const host = defaultHookHost({ LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' }, 'C:\\Users\\u', 'win32', 'C:\\Program Files\\nodejs\\node.exe');
  const windows = String(kitHookEntry('codex', 'SessionStart', host)['commandWindows']);
  assert.match(windows, /powershell|wfk/i);
  assert.notEqual(windows, KIT_COMMAND);
  const codex = fakeProvider({ reads: [hookState(windows, 'w1')] });
  assert.equal(await approveKitHooks(codex.provider, project, noSleep), 'ChatGPT: хуки Kit одобрены');
  assert.deepEqual(codex.approved, [{ command: windows, hash: 'w1' }]);
});
