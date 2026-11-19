// M47 T003: the source digest is stable across OSes (LF contents, '/' names, sorted order) and
// changes with any name or content.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { PTY_HOST_SRC, listSources, sourceDigest } from '../src/index.ts';

test('CRLF and LF give one digest; the order of the list does not matter; a name or a byte does', () => {
  const files: Record<string, string> = { a: 'one\ntwo\n', b: 'three\n', crlf: 'one\r\ntwo\r\n' };
  const read = (file: string) => files[file]!;
  const one = sourceDigest([{ name: 'm/a.ts', file: 'a' }, { name: 'm/b.ts', file: 'b' }], read);
  assert.match(one, /^[0-9a-f]{12}$/);
  assert.equal(sourceDigest([{ name: 'm/b.ts', file: 'b' }, { name: 'm/a.ts', file: 'crlf' }], read), one);
  assert.notEqual(sourceDigest([{ name: 'm/c.ts', file: 'a' }, { name: 'm/b.ts', file: 'b' }], read), one);
  files['b'] = 'three!\n';
  assert.notEqual(sourceDigest([{ name: 'm/a.ts', file: 'a' }, { name: 'm/b.ts', file: 'b' }], read), one);
});

test('listSources takes the files of a directory only, named with the prefix and /', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wfk-digest-'));
  try {
    await writeFile(path.join(dir, 'x.ts'), 'x'); await mkdir(path.join(dir, 'sub')); await writeFile(path.join(dir, 'sub', 'y.ts'), 'y');
    assert.deepEqual(listSources(dir, 'p/src').map(s => s.name), ['p/src/x.ts']);
    assert.equal(listSources(dir, 'p/src')[0]!.file, path.join(dir, 'x.ts'));
    assert.ok(listSources(PTY_HOST_SRC, 'pty-host/src').some(s => s.name === 'pty-host/src/screen.ts'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
