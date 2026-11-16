// The Kit structure on the Kit card and in «Обновить Kit» (spec M38 section 2.2), with a stand-in
// kit-structure and Kit; the files live in a temporary folder so that the rollback is real.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createRouter, createStateRegistry } from '#http-server';
import type { FragmentId, InstallResult, StructureReport, StructureStatus } from '#kit-structure';
import type { KitInspect, KitInstall, KitOutcome } from '#kit-runner';
import type { KitStatus } from '#plan-view';
import type { Project } from '#provider-registry';
import { registerKitUpdateRoutes } from '../src/index.ts';
import type { KitUpdateOptions } from '../src/index.ts';
import { STRUCTURE_NO_CHANGES, dirtyNote } from '../src/structure.ts';

const SETTINGS = '.claude/settings.json';
const MANIFEST = '.workflow-kit/manifest.json';
const TEMPLATE = '.workflow-kit/templates/module.md';
const AT = '2026-11-16T12:00:00.000Z';
let tmp = '';

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-kit-structure-'));
});
after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

const file = (root: string, relative: string): string => path.join(root, ...relative.split('/'));
async function put(root: string, relative: string, text: string): Promise<void> {
  await mkdir(path.dirname(file(root, relative)), { recursive: true });
  await writeFile(file(root, relative), text);
}
const read = (root: string, relative: string): Promise<string> => readFile(file(root, relative), 'utf8');

async function folder(name: string): Promise<Project> {
  const root = path.join(tmp, name);
  await put(root, 'AGENTS.md', 'agents\n');
  await put(root, SETTINGS, 'settings 3\n');
  await put(root, MANIFEST, 'manifest 3\n');
  return { id: 'p1', name: 'Demo', path: root, source: 'opened', createdAt: AT };
}

/** A kit-structure report: three fragments with the given statuses. */
function report(statuses: Partial<Record<'agents' | 'hook' | 'template', StructureStatus>>, installedVersion: number | null = 3): StructureReport {
  const fragments = [
    { id: 'agents-section' as FragmentId, path: 'AGENTS.md', kind: 'section' as const, status: statuses.agents ?? 'ok' },
    { id: 'claude-hook' as FragmentId, path: SETTINGS, kind: 'hook' as const, status: statuses.hook ?? 'ok' },
    { id: 'template-module' as FragmentId, path: TEMPLATE, kind: 'file' as const, status: statuses.template ?? 'ok' },
  ];
  const order: StructureStatus[] = ['modified', 'newer', 'outdated', 'missing'];
  const status = order.find((s) => fragments.some((f) => f.status === s)) ?? 'ok';
  const installable = fragments.some((f) => f.status === 'missing' || f.status === 'outdated');
  return { status, version: 4, installedVersion, fragments, warnings: [], notes: [], installable } as StructureReport;
}

function inspected(state: string, version: string | null): KitOutcome<KitInspect> {
  return { ok: true, command: 'inspect', result: { action: 'open', state, version, path: '/p', git: { repository: true, head: 'abc', identity: null }, transactionPending: false, damaged: [] } };
}
const changes = (paths: string[] | undefined): KitOutcome<KitStatus> => ({ ok: true, command: 'status', result: { changes: paths } as unknown as KitStatus });
const installed = (paths: string[]): KitOutcome<KitInstall> => ({ ok: true, command: 'install', result: { version: '2.2.7', previousState: 'KIT_OK', written: [], with: paths, commit: { sha: 'f00d', role: 'kit-update' }, migrationRequired: false } });

interface Setup {
  project: Project;
  kit: KitUpdateOptions['kit'];
  structure?: KitUpdateOptions['structure'];
}

function register(setup: Setup) {
  const router = createRouter();
  const lines: string[] = [];
  const kitUpdate = registerKitUpdateRoutes({
    router,
    state: createStateRegistry(),
    projects: { get: async () => setup.project, list: async () => [setup.project] },
    kit: setup.kit,
    providers: { list: () => [] },
    ...(setup.structure ? { structure: setup.structure } : {}),
    bundled: '2.2.7',
    intervalMs: 0,
    now: () => new Date(AT),
    log: (line) => lines.push(line),
  });
  const route = router.match('POST', '/api/projects/p1/kit/update') as { handler: (ctx: unknown) => Promise<unknown> };
  const press = async () => {
    await route.handler({ params: { id: 'p1' }, body: {} });
    await kitUpdate.settled('p1');
    return kitUpdate.section().projects['p1']!;
  };
  return { kitUpdate, lines, press };
}

test('the card: a fresh Kit with an outdated structure is offered the update; kept files; a failed check', async () => {
  const project = await folder('card');
  const noInstall = async (): Promise<KitOutcome<KitInstall>> => assert.fail('no install');
  let check: () => Promise<StructureReport> = async () => report({ hook: 'outdated', template: 'modified' });
  const structure = { check: () => check(), install: async (): Promise<InstallResult> => assert.fail('no install') };
  let state = 'KIT_OK';
  const { kitUpdate } = register({ project, kit: { inspect: async () => inspected(state, state === 'KIT_OK' ? '2.2.7' : null), install: noInstall }, structure });
  await kitUpdate.refresh('p1');
  const entry = kitUpdate.section().projects['p1']!;
  assert.deepEqual(entry.structure, { status: 'modified', installed: 3, version: 4, installable: true, kept: [TEMPLATE] });
  assert.equal(entry.action, 'update', 'the structure alone offers the update');

  check = async () => report({});
  await kitUpdate.refresh('p1');
  assert.equal(kitUpdate.section().projects['p1']!.action, 'none');
  assert.equal(kitUpdate.section().projects['p1']!.structure?.status, 'ok');

  check = async () => {
    throw new Error('Файл не является корректным JSON');
  };
  await kitUpdate.refresh('p1');
  const failed = kitUpdate.section().projects['p1']!;
  assert.equal(failed.structure, null);
  assert.equal(failed.structureNote, 'Структура Kit: Файл не является корректным JSON');
  assert.equal(failed.action, 'none');

  // Without the Kit the structure is the wizard's business: not checked at all.
  state = 'GIT_NO_KIT';
  check = async () => assert.fail('no check without the Kit');
  await kitUpdate.refresh('p1');
  assert.equal(kitUpdate.section().projects['p1']!.structure, null);
  assert.equal(kitUpdate.section().projects['p1']!.structureNote, undefined);

  // A service without kit-structure keeps the Kit card as before.
  const plain = register({ project, kit: { inspect: async () => inspected('KIT_OK', '2.2.7'), install: noInstall } });
  await plain.kitUpdate.refresh('p1');
  assert.deepEqual([plain.kitUpdate.section().projects['p1']!.structure, plain.kitUpdate.section().projects['p1']!.action], [null, 'none']);
});

test('the update writes the outdated structure and Kit commits it with --with', async () => {
  const project = await folder('update');
  let current = report({ hook: 'outdated', template: 'missing' });
  const structure = {
    check: async () => current,
    install: async (root: string): Promise<InstallResult> => {
      await put(root, SETTINGS, 'settings 4\n');
      await put(root, TEMPLATE, '# module\n');
      await put(root, MANIFEST, 'manifest 4\n');
      current = report({}, 4);
      return { written: ['claude-hook', 'template-module', 'manifest'], skipped: [], report: current };
    },
  };
  const installs: unknown[] = [];
  const { kitUpdate, lines, press } = register({
    project,
    kit: {
      inspect: async () => inspected('KIT_OK', '2.2.7'),
      status: async () => changes(['notes.txt']),
      install: async (_root, options) => {
        installs.push(options);
        return installed([SETTINGS, MANIFEST, TEMPLATE].sort());
      },
    },
    structure,
  });
  await kitUpdate.refresh('p1');
  assert.equal(kitUpdate.section().projects['p1']!.action, 'update');
  const entry = await press();
  assert.deepEqual(installs, [{ update: true, with: [SETTINGS, TEMPLATE, MANIFEST] }]);
  assert.deepEqual(entry.last, { from: '2.2.7', to: '2.2.7', commit: 'f00d', hooks: [], structure: { from: 3, to: 4, files: [SETTINGS, TEMPLATE, MANIFEST] }, structureNote: null, at: AT });
  assert.deepEqual(lines, ['kit: updated Demo 2.2.7 → 2.2.7', 'kit: structure Demo 3 → 4']);
  assert.equal(entry.action, 'none');
  assert.equal(entry.structure?.status, 'ok');
  assert.equal(await read(project.path, SETTINGS), 'settings 4\n');
});

test('files with uncommitted changes, or no list of them, keep the structure as it is', async () => {
  assert.equal(dirtyNote(['a', 'b']), 'файлы изменены и не закоммичены: a, b');
  assert.equal(dirtyNote(['a', 'b', 'c', 'd', 'e', 'f', 'g']), 'файлы изменены и не закоммичены: a, b, c, d, e и ещё 2');
  const project = await folder('dirty');
  const structure = { check: async () => report({ hook: 'outdated' }), install: async (): Promise<InstallResult> => assert.fail('the structure is not written') };
  const cases: Array<[KitUpdateOptions['kit']['status'], string]> = [
    [async () => changes([SETTINGS, 'notes.txt']), `файлы изменены и не закоммичены: ${SETTINGS}`],
    [async () => changes(undefined), STRUCTURE_NO_CHANGES],
    [async () => ({ ok: false, code: 'KIT_TIMEOUT', message: 'Kit не ответил', nextAction: null, details: {} }), STRUCTURE_NO_CHANGES],
    [undefined, STRUCTURE_NO_CHANGES],
  ];
  for (const [status, note] of cases) {
    const installs: unknown[] = [];
    const kit: KitUpdateOptions['kit'] = {
      inspect: async () => inspected('KIT_OUTDATED', '2.2.6'),
      install: async (_root, options) => {
        installs.push(options);
        return installed([]);
      },
      ...(status ? { status } : {}),
    };
    const { lines, press } = register({ project, kit, structure });
    const entry = await press();
    assert.deepEqual(installs, [{ update: true }], 'the Kit is still updated, without --with');
    assert.equal(entry.last?.structureNote, `Структура Kit не обновлена: ${note}`);
    assert.equal(entry.last?.structure, null);
    assert.equal(lines.at(-1), `kit: structure skipped Demo: ${note}`);
    assert.equal(await read(project.path, SETTINGS), 'settings 3\n');
  }
});

test('a Kit failure puts the structure files back and removes the created ones', async () => {
  const project = await folder('rollback');
  const structure = {
    check: async () => report({ hook: 'outdated', template: 'missing' }),
    install: async (root: string): Promise<InstallResult> => {
      await put(root, SETTINGS, 'settings 4\n');
      await put(root, TEMPLATE, '# module\n');
      await put(root, MANIFEST, 'manifest 4\n');
      return { written: ['claude-hook', 'template-module', 'manifest'], skipped: [], report: report({}, 4) };
    },
  };
  const failures: Array<() => Promise<KitOutcome<KitInstall>>> = [
    async () => ({ ok: false, code: 'TRANSACTION_PENDING', message: 'A Kit commit transaction is unfinished.', nextAction: 'Run `scripts/workflow repair`.', details: {} }),
    async () => {
      throw new Error('spawn node ENOENT');
    },
  ];
  const codes: string[] = [];
  for (const install of failures) {
    const { press } = register({ project, kit: { inspect: async () => inspected('KIT_OK', '2.2.7'), status: async () => changes([]), install }, structure });
    const entry = await press();
    codes.push(entry.error?.code ?? '');
    assert.equal(entry.last, undefined);
    assert.equal(await read(project.path, SETTINGS), 'settings 3\n');
    assert.equal(await read(project.path, MANIFEST), 'manifest 3\n');
    assert.equal(existsSync(file(project.path, TEMPLATE)), false);
  }
  assert.deepEqual(codes, ['TRANSACTION_PENDING', 'KIT_UPDATE_FAILED']);
});
