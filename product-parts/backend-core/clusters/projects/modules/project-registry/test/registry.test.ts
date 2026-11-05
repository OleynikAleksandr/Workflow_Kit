import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createEventLog } from '#data-store';
import { ProjectError, createProjectRegistry, listFolders, nodeFs, resolveInsideHome } from '../src/index.ts';
import type { ProjectRegistryOptions, RegistryFs } from '../src/index.ts';

let tmp = '';
let home = '';
let outside = '';
let dataDir = '';
let counter = 0;

function options(extra: Partial<ProjectRegistryOptions> = {}): ProjectRegistryOptions {
  return {
    file: path.join(dataDir, 'projects.json'),
    projectsRoot: '~/WorkflowKitProjects',
    homedir: home,
    platform: process.platform,
    newId: () => `id${(counter += 1)}`,
    now: () => new Date('2026-03-04T05:06:07.000Z'),
    ...extra,
  };
}

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof ProjectError, String(error));
    return error.code;
  }
  return 'ok';
}

before(async () => {
  tmp = await realpath(await mkdtemp(path.join(os.tmpdir(), 'wfk-projects-')));
  home = path.join(tmp, 'home');
  outside = path.join(tmp, 'outside');
  dataDir = path.join(tmp, 'data');
  await mkdir(path.join(home, 'code', 'existing'), { recursive: true });
  await mkdir(path.join(home, 'code', '.hidden'), { recursive: true });
  await mkdir(path.join(home, 'Documents'), { recursive: true });
  await writeFile(path.join(home, 'code', 'file.txt'), 'x');
  await mkdir(outside, { recursive: true });
  await symlink(outside, path.join(home, 'escape'));
  await symlink(path.join(home, 'code', 'existing'), path.join(home, 'code', 'link-inside'));
});

after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

test('create makes the folder in the projects root from config and writes projects.json atomically', async () => {
  const events = createEventLog({ file: path.join(dataDir, 'events.jsonl') });
  const registry = createProjectRegistry(options({ events }));
  assert.equal(registry.root, path.join(home, 'WorkflowKitProjects'));
  const project = await registry.create('  Demo ');
  assert.equal(project.name, 'Demo');
  assert.equal(project.path, path.join(home, 'WorkflowKitProjects', 'Demo'));
  assert.equal(project.source, 'created');
  assert.ok((await stat(project.path)).isDirectory());
  const saved = JSON.parse(await readFile(registry.file, 'utf8')) as { version: number; projects: unknown[] };
  assert.equal(saved.version, 1);
  assert.deepEqual(saved.projects, [project]);
  if (process.platform !== 'win32') assert.equal((await stat(registry.file)).mode & 0o777, 0o600);
  assert.equal(await code(registry.create('Demo')), 'exists');
  assert.equal(await code(registry.create('../evil')), 'invalid-name');
  assert.equal(await code(registry.create('CON')), 'invalid-name');
  const lines = (await readFile(events.file, 'utf8')).trim().split('\n');
  assert.equal(lines.length, 1);
  assert.equal((JSON.parse(lines[0]!) as { type: string }).type, 'project.created');
});

test('projects survive a new registry instance (restart of serve)', async () => {
  const registry = createProjectRegistry(options());
  const list = await registry.list();
  assert.deepEqual(list.map((p) => p.name), ['Demo']);
  const section = await registry.section();
  assert.equal(section.projects[0]?.missing, false);
  assert.equal(section.root, path.join(home, 'WorkflowKitProjects'));
});

test('open accepts only folders inside home by realpath', async () => {
  const registry = createProjectRegistry(options());
  const opened = await registry.open(path.join(home, 'code', 'existing'));
  assert.equal(opened.existing, false);
  assert.equal(opened.project.name, 'existing');
  assert.equal(opened.project.source, 'opened');
  const again = await registry.open(path.join(home, 'code', 'link-inside'));
  assert.equal(again.existing, true);
  assert.equal(again.project.id, opened.project.id);
  assert.equal(await code(registry.open(path.join(home, 'escape'))), 'outside-home');
  assert.equal(await code(registry.open(path.join(home, 'code', '..', '..', 'outside'))), 'outside-home');
  assert.equal(await code(registry.open(outside)), 'outside-home');
  assert.equal(await code(registry.open(home)), 'invalid-path');
  assert.equal(await code(registry.open('code/existing')), 'invalid-path');
  assert.equal(await code(registry.open(path.join(home, 'nope'))), 'not-found');
  assert.equal(await code(registry.open(path.join(home, 'code', 'file.txt'))), 'not-directory');
  assert.equal(await code(registry.open(42)), 'invalid-path');
});

test('remove drops the project from the list only and honours guards', async () => {
  const registry = createProjectRegistry(options());
  const [demo] = await registry.list();
  assert.ok(demo);
  registry.addRemoveGuard((p) => (p.id === demo.id ? ['сессия Claude abc'] : []));
  await assert.rejects(registry.remove(demo.id), (error: unknown) => {
    assert.ok(error instanceof ProjectError);
    assert.equal(error.code, 'busy');
    assert.deepEqual(error.details, { blockers: ['сессия Claude abc'] });
    return true;
  });
  const fresh = createProjectRegistry(options());
  const removed = await fresh.remove(demo.id);
  assert.equal(removed.id, demo.id);
  assert.ok((await stat(demo.path)).isDirectory(), 'the folder stays on disk');
  assert.deepEqual((await createProjectRegistry(options()).list()).map((p) => p.name), ['existing']);
  assert.equal(await code(fresh.remove('missing-id')), 'not-found');
});

test('an invalid projects.json is reported and never overwritten', async () => {
  const file = path.join(tmp, 'broken', 'projects.json');
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, '{ not json');
  const registry = createProjectRegistry(options({ file }));
  assert.equal(await code(registry.create('Other')), 'registry-invalid');
  assert.equal(await readFile(file, 'utf8'), '{ not json');
  const section = await registry.section();
  assert.deepEqual(section.projects, []);
  assert.match(section.error ?? '', /не перезаписывается/);
});

test('a projects root outside home is refused', async () => {
  const registry = createProjectRegistry(options({ projectsRoot: path.join(outside, 'projects'), file: path.join(tmp, 'x.json') }));
  assert.equal(await code(registry.create('Thing')), 'outside-home');
  const relative = createProjectRegistry(options({ projectsRoot: 'relative/root', file: path.join(tmp, 'y.json') }));
  assert.equal(await code(relative.create('Thing')), 'invalid-path');
});

test('listFolders lists subfolders inside home and never leaves it', async () => {
  const scope = { homedir: home, platform: process.platform };
  const top = await listFolders(undefined, scope);
  assert.equal(top.path, home);
  assert.equal(top.parent, null);
  assert.deepEqual(top.entries.map((e) => e.name), ['code', 'Documents', 'escape', 'WorkflowKitProjects']);
  const codeDir = await listFolders(path.join(home, 'code'), scope);
  assert.equal(codeDir.parent, home);
  assert.deepEqual(codeDir.entries.map((e) => e.name), ['existing', 'link-inside']);
  const hidden = await listFolders(path.join(home, 'code'), scope, { showHidden: true });
  assert.deepEqual(hidden.entries.map((e) => e.name), ['.hidden', 'existing', 'link-inside']);
  assert.equal((await listFolders(path.join(home, 'code'), scope, { limit: 1 })).truncated, true);
  assert.equal(await code(listFolders(path.join(home, 'escape'), scope)), 'outside-home');
  assert.equal(await code(listFolders(path.join(home, '..'), scope)), 'outside-home');
  assert.equal(await code(resolveInsideHome(path.join(home, 'code', '..', 'code'), scope)), 'ok');
});

test('a permission error (macOS TCC) becomes access-denied with a hint', async () => {
  const denied = path.join(home, 'Documents');
  const fs: RegistryFs = {
    ...nodeFs,
    readdir: async (target) => {
      if (target === denied) throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });
      return nodeFs.readdir(target);
    },
  };
  const scope = { homedir: home, platform: 'darwin' as const, fs };
  await assert.rejects(listFolders(denied, scope), (error: unknown) => {
    assert.ok(error instanceof ProjectError);
    assert.equal(error.code, 'access-denied');
    assert.match(String(error.details?.['hint']), /Конфиденциальность и безопасность/);
    return true;
  });
  const registry = createProjectRegistry(options({ fs, platform: 'darwin', file: path.join(tmp, 'tcc.json') }));
  assert.equal(await code(registry.open(denied)), 'access-denied');
});
