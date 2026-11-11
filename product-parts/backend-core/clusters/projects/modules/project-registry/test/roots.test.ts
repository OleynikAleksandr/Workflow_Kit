import assert from 'node:assert/strict';
import type { Dirent, Stats } from 'node:fs';
import { test } from 'node:test';
import { ProjectError, allowedRoots, listFolders, resolveInsideRoots } from '../src/index.ts';
import type { HomeScope, RegistryFs } from '../src/index.ts';

/** A fake file system: folders, links (path -> target) and folders that never answer. */
function fakeFs(folders: string[], links: Record<string, string> = {}, hanging: string[] = []): RegistryFs {
  const known = new Set<string>();
  for (const folder of folders) {
    const s = folder.includes('\\') ? '\\' : '/';
    const parts = folder.split(s);
    for (let i = 1; i <= parts.length; i += 1) {
      const head = parts.slice(0, i).join(s);
      known.add(head === '' ? '/' : /^[A-Z]:$/i.test(head) ? head + s : head);
    }
  }
  const fold = (value: string) => (value.includes('\\') ? value.toLowerCase() : value);
  const has = (value: string) => [...known].some((f) => fold(f) === fold(value));
  const dir = { isDirectory: () => true } as Stats;
  const missing = () => Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  const sep = (value: string) => (value.includes('\\') ? '\\' : '/');
  const children = (parent: string) => {
    const s = sep(parent);
    const prefix = parent.endsWith(s) ? parent : parent + s;
    const names = new Set<string>();
    for (const item of [...known, ...Object.keys(links)]) {
      if (fold(item).startsWith(fold(prefix)) && item.length > prefix.length) names.add(item.slice(prefix.length).split(s)[0]!);
    }
    return [...names].map((name) => {
      const full = prefix + name;
      const link = full in links;
      return { name, isDirectory: () => !link && has(full), isSymbolicLink: () => link } as Dirent;
    });
  };
  return {
    realpath: async (target) => {
      if (hanging.includes(target)) return new Promise(() => {});
      if (target in links) return links[target]!;
      if (has(target)) return target;
      throw missing();
    },
    stat: async (target) => {
      if (hanging.includes(target)) return new Promise(() => {});
      if (has(target) || target in links) return dir;
      throw missing();
    },
    readdir: async (target) => {
      if (!has(target)) throw missing();
      return children(target);
    },
    mkdir: async () => undefined,
    rm: async () => undefined,
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

test('win32: other drives answering stat are roots, the system drive gives only home', async () => {
  const scope: HomeScope = {
    homedir: 'C:\\Users\\alex',
    platform: 'win32',
    env: { SystemDrive: 'C:' },
    fs: fakeFs(['C:\\', 'C:\\Users\\alex', 'C:\\Users\\alex\\code', 'C:\\Temp', 'D:\\', 'D:\\Work', 'E:\\'], {}, ['A:\\']),
  };
  const roots = await allowedRoots(scope);
  assert.deepEqual(roots, [
    { name: 'Домой', path: 'C:\\Users\\alex', kind: 'home' },
    { name: 'D:\\', path: 'D:\\', kind: 'drive' },
    { name: 'E:\\', path: 'E:\\', kind: 'drive' },
  ]);
  assert.equal(await code(resolveInsideRoots('D:\\Work', scope)), 'ok');
  assert.equal(await code(resolveInsideRoots('d:\\work', scope)), 'ok');
  assert.equal(await code(resolveInsideRoots('C:\\Temp', scope)), 'outside-roots');
  assert.equal(await code(resolveInsideRoots('C:\\', scope, { allowDrive: true })), 'outside-roots');
  assert.equal(await code(resolveInsideRoots('D:\\', scope)), 'invalid-path');
  assert.equal(await code(resolveInsideRoots('D:\\', scope, { allowDrive: true })), 'ok');
  const listing = await listFolders('D:\\', scope);
  assert.equal(listing.parent, null);
  assert.deepEqual(listing.entries.map((e) => e.path), ['D:\\Work']);
  assert.equal(listing.roots.length, 3);
  assert.equal((await listFolders('D:\\Work', scope)).parent, 'D:\\');
});

test('win32: another system drive letter is taken from SystemDrive', async () => {
  const scope: HomeScope = { homedir: 'D:\\Users\\alex', platform: 'win32', env: { SystemDrive: 'D:' }, fs: fakeFs(['C:\\', 'D:\\', 'D:\\Users\\alex']) };
  assert.deepEqual((await allowedRoots(scope)).map((r) => r.path), ['D:\\Users\\alex', 'C:\\']);
});

test('darwin: volumes under /Volumes are roots, the boot volume link is not', async () => {
  const scope: HomeScope = {
    homedir: '/Users/alex',
    platform: 'darwin',
    fs: fakeFs(['/', '/Users/alex', '/Volumes', '/Volumes/Backup', '/Volumes/Backup/Projects', '/private/tmp'], { '/Volumes/Macintosh HD': '/' }),
  };
  assert.deepEqual(await allowedRoots(scope), [
    { name: 'Домой', path: '/Users/alex', kind: 'home' },
    { name: 'Backup', path: '/Volumes/Backup', kind: 'drive' },
  ]);
  assert.equal(await code(resolveInsideRoots('/Volumes/Backup/Projects', scope)), 'ok');
  assert.equal(await code(resolveInsideRoots('/private/tmp', scope)), 'outside-roots');
  assert.equal(await code(resolveInsideRoots('/Volumes/Macintosh HD', scope, { allowDrive: true })), 'outside-roots');
  assert.equal(await code(resolveInsideRoots('/Users/alex', scope)), 'invalid-path');
});

test('linux: /media/<user>, /run/media/<user> and /mnt mounts are roots', async () => {
  const scope: HomeScope = {
    homedir: '/home/alex',
    platform: 'linux',
    env: { USER: 'alex' },
    fs: fakeFs(['/home/alex', '/media/alex', '/media/alex/USB', '/run/media/alex/Disk', '/mnt', '/mnt/data', '/media/bob/Other', '/srv']),
  };
  assert.deepEqual((await allowedRoots(scope)).map((r) => r.path), ['/home/alex', '/media/alex/USB', '/run/media/alex/Disk', '/mnt/data']);
  assert.equal(await code(resolveInsideRoots('/media/bob/Other', scope)), 'outside-roots');
  assert.equal(await code(resolveInsideRoots('/srv', scope)), 'outside-roots');
  assert.equal(await code(resolveInsideRoots('/mnt/data', scope, { allowDrive: true })), 'ok');
});

test('linux: the user name falls back to the home folder name', async () => {
  const scope: HomeScope = { homedir: '/home/kim', platform: 'linux', env: {}, fs: fakeFs(['/home/kim', '/media/kim/Stick']) };
  assert.deepEqual((await allowedRoots(scope)).map((r) => r.path), ['/home/kim', '/media/kim/Stick']);
});
