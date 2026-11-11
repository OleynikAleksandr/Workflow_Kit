// Model of the folder picker roots (spec M14 section 2.7).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rootState } from '../src/folder-roots.js';

const roots = [
  { name: 'Домой', path: 'C:\\Users\\alex', kind: 'home' as const },
  { name: 'D:\\', path: 'D:\\', kind: 'drive' as const },
];

test('home itself cannot be picked, a folder inside can', () => {
  const home = rootState({ path: 'C:\\Users\\alex', parent: null, roots });
  assert.equal(home.root?.kind, 'home');
  assert.equal(home.canPick, false);
  assert.match(home.note, /домашняя папка/);
  const inner = rootState({ path: 'c:\\users\\alex\\code', parent: 'C:\\Users\\alex', roots });
  assert.equal(inner.root?.kind, 'home');
  assert.equal(inner.canPick, true);
});

test('a drive root is picked only where allowed (the projects folder)', () => {
  const drive = rootState({ path: 'D:\\', parent: null, roots });
  assert.equal(drive.root?.path, 'D:\\');
  assert.equal(drive.canPick, false);
  assert.match(drive.note, /корень диска/);
  assert.equal(rootState({ path: 'D:\\', parent: null, roots }, true).canPick, true);
  assert.equal(rootState({ path: 'D:\\Work', parent: 'D:\\', roots }).root?.path, 'D:\\');
});

test('posix volumes and a listing without roots', () => {
  const mac = [
    { name: 'Домой', path: '/Users/alex', kind: 'home' as const },
    { name: 'Backup', path: '/Volumes/Backup', kind: 'drive' as const },
  ];
  assert.equal(rootState({ path: '/Volumes/Backup/Projects', parent: '/Volumes/Backup', roots: mac }).root?.name, 'Backup');
  assert.equal(rootState({ path: '/Volumes/BackupOld', parent: '/Volumes', roots: mac }).root, undefined);
  assert.equal(rootState({ path: '/home/alex', parent: null }).canPick, false);
});
