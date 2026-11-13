import assert from 'node:assert/strict';
import { appendFile, mkdtemp, readdir, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createJsonlTail, snapshotFile, limitsFile, readSnapshot, writeSnapshot, JSONL_BLOCK_BYTES } from '../src/index.ts';
const record = (type: string, value: unknown) => JSON.stringify({ type, value }) + '\n';
const reader = (options?: { blockBytes?: number; maxBytes?: number }) => createJsonlTail<{ rare: unknown; frequent: unknown }>({
  rare: r => (r as { type: string }).type === 'rare' ? (r as { value: unknown }).value : undefined,
  frequent: r => (r as { type: string }).type === 'frequent' ? (r as { value: unknown }).value : undefined,
}, options);
test('snapshots validate names and use OS paths for all three platforms', async () => {
  for (const platform of ['darwin', 'linux', 'win32'] as const) {
    const stateDir = platform === 'win32' ? 'C:\\state' : '/state';
    const p = platform === 'win32' ? path.win32 : path.posix;
    assert.equal(snapshotFile({ stateDir }, 'claude', 'abc-123', platform), p.join(stateDir, 'session-parameters', 'claude', 'abc-123.json'));
    assert.equal(limitsFile({ stateDir }, 'claude', platform), p.join(stateDir, 'session-parameters', 'claude', 'account.limits.json'));
    for (const id of ['../escape', '', 'x'.repeat(129), 'a/b', 'a\\b', '.', 'a:1']) assert.throws(() => snapshotFile({ stateDir }, 'claude', id, platform));
    assert.throws(() => limitsFile({ stateDir }, '../escape', platform));
  }
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-snapshot-'));
  try {
    const file = snapshotFile({ stateDir: tmp }, 'claude', 's');
    assert.equal(await readSnapshot(file), null);
    await writeSnapshot(file, { model: 'Модель' });
    assert.deepEqual(await readSnapshot(file), { model: 'Модель' });
    await Promise.all(Array.from({ length: 10 }, (_, i) => writeSnapshot(file, { version: i })));
    assert.equal(typeof (await readSnapshot<{ version: number }>(file))?.version, 'number');
    assert.deepEqual(await readdir(path.dirname(file)), ['s.json']);
  } finally { await rm(tmp, { recursive: true, force: true }); }
});
test('cold sparse records beyond a megabyte, oversized UTF8 line and incremental partial lines', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-tail-'));
  const file = path.join(tmp, 'log.jsonl'); const tail = reader();
  try {
    await writeFile(file, record('rare', 'old') + record('noise', 'x'.repeat(JSONL_BLOCK_BYTES + 100)) + record('frequent', 'Русский'.repeat(200000)) + '{bad}\n');
    const initial = await tail.read(file);
    assert.equal(initial.rare, 'old'); assert.equal(initial.frequent, 'Русский'.repeat(200000));
    await appendFile(file, record('frequent', 'next').trimEnd());
    assert.deepEqual(await tail.read(file), initial);
    await appendFile(file, '\n'); assert.deepEqual(await tail.read(file), { rare: 'old', frequent: 'next' });
    await writeFile(file, record('frequent', 'shortened'));
    assert.deepEqual(await tail.read(file), { frequent: 'shortened' });
    const replacement = path.join(tmp, 'replacement'); await writeFile(replacement, record('rare', 'replaced')); await rename(replacement, file);
    assert.deepEqual(await tail.read(file), { rare: 'replaced' });
    tail.clear(file); assert.deepEqual(await tail.read(file), { rare: 'replaced' });
  } finally { await rm(tmp, { recursive: true, force: true }); }
});
test('cold limit does not parse a cut first line; partial final line can cross blocks', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-tail-limit-')); const file = path.join(tmp, 'log');
  try {
    await writeFile(file, record('rare', 'outside') + record('noise', 'x'.repeat(200)) + record('frequent', 'last'));
    const tail = reader({ blockBytes: 32, maxBytes: 128 });
    assert.deepEqual(await tail.read(file), { frequent: 'last' });
    await appendFile(file, record('frequent', 'y'.repeat(50)).trimEnd());
    tail.clear(); assert.deepEqual(await tail.read(file), { frequent: 'last' });
    await appendFile(file, '\n'); assert.deepEqual(await tail.read(file), { frequent: 'y'.repeat(50) });
    await rm(file); assert.deepEqual(await tail.read(file), {});
  } finally { await rm(tmp, { recursive: true, force: true }); }
});
