import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { InvalidJsonFileError, readJsonFile, writeJsonAtomic } from '../src/index.ts';

let tmp = '';
before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-atomic-'));
});
after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

test('writeJsonAtomic writes pretty JSON and leaves no temporary files', async () => {
  const file = path.join(tmp, 'nested', 'a.json');
  await writeJsonAtomic(file, { b: 1, list: [1, 2] });
  assert.equal(await readFile(file, 'utf8'), '{\n  "b": 1,\n  "list": [\n    1,\n    2\n  ]\n}\n');
  assert.deepEqual(await readdir(path.dirname(file)), ['a.json']);
});

test('writeJsonAtomic replaces the previous content', async () => {
  const file = path.join(tmp, 'replace.json');
  await writeJsonAtomic(file, { version: 1 });
  await writeJsonAtomic(file, { version: 2 });
  assert.deepEqual(await readJsonFile(file), { version: 2 });
  assert.deepEqual(await readdir(tmp).then((names) => names.filter((n) => n.endsWith('.tmp'))), []);
});

test('writeJsonAtomic uses mode 0600 by default', { skip: process.platform === 'win32' }, async () => {
  const file = path.join(tmp, 'mode.json');
  await writeJsonAtomic(file, {});
  assert.equal((await stat(file)).mode & 0o777, 0o600);
});

test('concurrent writes never produce a partial file', async () => {
  const file = path.join(tmp, 'race.json');
  const big = 'x'.repeat(100_000);
  await Promise.all(Array.from({ length: 10 }, (_, i) => writeJsonAtomic(file, { i, big })));
  const value = (await readJsonFile(file)) as { i: number; big: string };
  assert.equal(value.big.length, 100_000);
  assert.ok(value.i >= 0 && value.i < 10);
});

test('a failed rename removes the temporary file', async () => {
  const dir = path.join(tmp, 'target-is-dir');
  await writeJsonAtomic(path.join(dir, 'inner.json'), {});
  await assert.rejects(writeJsonAtomic(dir, { x: 1 }));
  const names = await readdir(tmp);
  assert.deepEqual(names.filter((n) => n.endsWith('.tmp')), []);
});

test('readJsonFile returns undefined for a missing file and rejects bad JSON', async () => {
  assert.equal(await readJsonFile(path.join(tmp, 'missing.json')), undefined);
  const bad = path.join(tmp, 'bad.json');
  await writeFile(bad, '{ not json');
  await assert.rejects(readJsonFile(bad), InvalidJsonFileError);
});
