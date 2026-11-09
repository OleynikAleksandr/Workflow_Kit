import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { InvalidJsonFileError, readJsonFile, renameRetrying, writeFileAtomic, writeJsonAtomic } from '../src/index.ts';

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

test('renameRetrying retries a busy rename on Windows only and gives up after the attempts', async () => {
  const busy = (code: string) => Object.assign(new Error(code), { code });
  let calls = 0;
  const pauses: number[] = [];
  const flaky = async () => {
    calls += 1;
    if (calls < 3) throw busy(calls === 1 ? 'EPERM' : 'EBUSY');
  };
  await renameRetrying('a', 'b', 'win32', { rename: flaky, sleep: async (ms) => void pauses.push(ms) });
  assert.equal(calls, 3);
  assert.deepEqual(pauses, [15, 30]);
  calls = 0;
  await assert.rejects(renameRetrying('a', 'b', 'darwin', { rename: flaky, sleep: async () => {} }), { code: 'EPERM' });
  assert.equal(calls, 1);
  calls = 0;
  const missing = async () => {
    calls += 1;
    throw busy('ENOENT');
  };
  await assert.rejects(renameRetrying('a', 'b', 'win32', { rename: missing, sleep: async () => {} }), { code: 'ENOENT' });
  assert.equal(calls, 1);
  calls = 0;
  const always = async () => {
    calls += 1;
    throw busy('EACCES');
  };
  await assert.rejects(renameRetrying('a', 'b', 'win32', { rename: always, sleep: async () => {}, attempts: 4 }), { code: 'EACCES' });
  assert.equal(calls, 4);
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

test('writeFileAtomic writes text with the given file and directory modes', async () => {
  const file = path.join(tmp, 'text', 'deep', 'notes.md');
  await writeFileAtomic(file, '# Notes\n', { mode: 0o644, dirMode: 0o755 });
  assert.equal(await readFile(file, 'utf8'), '# Notes\n');
  if (process.platform !== 'win32') {
    assert.equal((await stat(file)).mode & 0o777, 0o644);
    assert.equal((await stat(path.dirname(file))).mode & 0o777, 0o755);
  }
  await writeFileAtomic(file, '# Changed\n', { mode: 0o644 });
  assert.equal(await readFile(file, 'utf8'), '# Changed\n');
  assert.deepEqual(await readdir(path.dirname(file)), ['notes.md']);
});
