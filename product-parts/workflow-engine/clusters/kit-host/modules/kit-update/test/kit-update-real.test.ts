// «Обновить Kit» with the real kit-structure and the real Kit bundle on a temporary git repository
// (spec M38 section 4): an outdated structure goes into one kit-update commit and the tree stays
// clean. HOME and the global git config point into the temporary folder.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { createRouter, createStateRegistry } from '#http-server';
import { KIT_VERSION, ensureKitBundle } from '#kit-bundle';
import { createKitRunner } from '#kit-runner';
import { FRAGMENTS, MANIFEST_PATH, STRUCTURE_VERSION, checkStructure, installStructure, sha256 } from '#kit-structure';
import { runCommand } from '#process-supervisor';
import type { Project } from '#provider-registry';
import { registerKitUpdateRoutes } from '../src/index.ts';

let tmp = '';
after(async () => {
  if (tmp) await rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

test('an outdated structure is written and committed by Kit in one commit', async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-kit-update-real-'));
  const home = path.join(tmp, 'home');
  await mkdir(home);
  const gitconfig = path.join(home, '.gitconfig');
  await writeFile(gitconfig, '[user]\n\tname = Kit Tester\n\temail = kit.tester@wfk-tests.org\n[init]\n\tdefaultBranch = main\n');
  const env = { PATH: process.env['PATH'], HOME: home, GIT_CONFIG_GLOBAL: gitconfig, GIT_CONFIG_NOSYSTEM: '1', LANG: 'C.UTF-8' };
  const git = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, env: env as NodeJS.ProcessEnv, encoding: 'utf8' });
  const bundle = await ensureKitBundle({ appDir: path.join(tmp, 'app') });
  const kit = createKitRunner({ runCommand, appBundle: async () => bundle.file, env });

  // The structure first, as the wizard does before Kit manages the repository, then the Kit.
  const root = path.join(tmp, 'project');
  await mkdir(root);
  git(root, 'init', '-q');
  await installStructure(root);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'chore: add Workflow Kit structure');
  const install = await kit.install(root);
  assert.ok(install.ok, install.ok ? '' : `${install.code}: ${install.message}`);
  assert.equal((await checkStructure(root)).status, 'ok');

  // An older app wrote structure 3: the Claude hooks without the question hooks, recorded in an
  // older manifest.
  const settingsFile = path.join(root, '.claude', 'settings.json');
  const settings = JSON.parse(await readFile(settingsFile, 'utf8')) as { hooks: Record<string, unknown> };
  delete settings.hooks['PreToolUse'];
  delete settings.hooks['PermissionRequest'];
  const oldSettings = `${JSON.stringify(settings, null, 2)}\n`;
  await writeFile(settingsFile, oldSettings);
  const hookSpec = FRAGMENTS.find((spec) => spec.id === 'claude-hook')!;
  const manifestFile = path.join(root, ...MANIFEST_PATH.split('/'));
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8')) as { version: number; fragments: Record<string, { sha256: string; version: number }> };
  manifest.version = 3;
  for (const fragment of Object.values(manifest.fragments)) fragment.version = 3;
  manifest.fragments['claude-hook']!.sha256 = sha256(hookSpec.extract(oldSettings)!);
  await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  git(root, 'add', MANIFEST_PATH, '.claude/settings.json');
  git(root, '-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', 'test: structure 3');
  const head = git(root, 'rev-parse', 'HEAD').trim();

  const project: Project = { id: 'p1', name: 'Real', path: root, source: 'opened', createdAt: '2026-11-16T00:00:00.000Z' };
  const router = createRouter();
  const kitUpdate = registerKitUpdateRoutes({
    router,
    state: createStateRegistry(),
    projects: { get: async () => project, list: async () => [project] },
    kit,
    providers: { list: () => [] },
    structure: { check: checkStructure, install: (folder) => installStructure(folder) },
    intervalMs: 0,
  });
  await kitUpdate.refresh('p1');
  const before = kitUpdate.section().projects['p1']!;
  assert.equal(before.installed, KIT_VERSION);
  assert.deepEqual([before.structure?.installed, before.structure?.version, before.structure?.installable, before.action], [3, STRUCTURE_VERSION, true, 'update']);

  const route = router.match('POST', '/api/projects/p1/kit/update') as { handler: (ctx: unknown) => Promise<unknown> };
  await route.handler({ params: { id: 'p1' }, body: {} });
  await kitUpdate.settled('p1');
  const entry = kitUpdate.section().projects['p1']!;
  assert.equal(entry.error, undefined, JSON.stringify(entry.error));
  assert.equal(entry.last?.structureNote, null);
  assert.deepEqual([entry.last?.structure?.from, entry.last?.structure?.to], [3, STRUCTURE_VERSION]);
  assert.deepEqual(entry.last?.structure?.files, ['.claude/settings.json', MANIFEST_PATH]);
  assert.ok(entry.last?.commit);

  // One commit on top of the old head, made by Kit, and a clean tree.
  assert.equal(git(root, 'rev-parse', 'HEAD~1').trim(), head);
  assert.equal(git(root, 'log', '-1', '--format=%s').trim(), 'chore: update the Workflow Kit structure');
  assert.match(git(root, 'log', '-1', '--format=%B'), /Workflow-Role: kit-update/);
  assert.equal(git(root, 'status', '--porcelain').trim(), '');
  assert.deepEqual(git(root, 'show', '--name-only', '--format=', 'HEAD').trim().split('\n').sort(), ['.claude/settings.json', MANIFEST_PATH]);
  const hooks = (JSON.parse(await readFile(settingsFile, 'utf8')) as { hooks: Record<string, unknown> }).hooks;
  assert.ok(hooks['PreToolUse'] && hooks['PermissionRequest'], 'the question hooks are back');
  const after = await checkStructure(root);
  assert.deepEqual([after.status, after.installedVersion], ['ok', STRUCTURE_VERSION]);
  assert.deepEqual([entry.structure?.status, entry.action], ['ok', 'none']);
  kitUpdate.stop();
});
