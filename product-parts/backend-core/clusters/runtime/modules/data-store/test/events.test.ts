import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createEventLog, createKeyedMutex, eventsFile, resolveDataDirs, rotatedEventsFile } from '../src/index.ts';

let tmp = '';

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-events-'));
});

after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

test('events.jsonl lives in the state directory', () => {
  const dirs = resolveDataDirs({ platform: process.platform === 'win32' ? 'win32' : 'linux', env: { WFK_DATA_DIR: tmp }, homedir: '/home/u' });
  assert.equal(eventsFile(dirs), path.join(tmp, 'events.jsonl'));
  assert.equal(rotatedEventsFile('/x/events.jsonl'), '/x/events.1.jsonl');
  assert.equal(rotatedEventsFile('C:\\x\\events.jsonl'), 'C:\\x\\events.1.jsonl');
});

test('events are appended as JSON lines with time and type, file mode 0600', async () => {
  const file = path.join(tmp, 'a', 'events.jsonl');
  const log = createEventLog({ file, now: () => new Date('2026-01-02T03:04:05.000Z') });
  await Promise.all([log.append('project.created', { id: 'p1' }), log.append('project.removed', { id: 'p1' })]);
  const lines = (await readFile(file, 'utf8')).trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);
  assert.deepEqual(lines, [
    { id: 'p1', time: '2026-01-02T03:04:05.000Z', type: 'project.created' },
    { id: 'p1', time: '2026-01-02T03:04:05.000Z', type: 'project.removed' },
  ]);
  if (process.platform !== 'win32') assert.equal((await stat(file)).mode & 0o777, 0o600);
});

test('the journal rotates before exceeding the limit and keeps one previous file', async () => {
  const file = path.join(tmp, 'b', 'events.jsonl');
  const log = createEventLog({ file, maxBytes: 200 });
  for (let i = 0; i < 12; i += 1) await log.append('tick', { i, pad: 'x'.repeat(40) });
  const current = await readFile(file, 'utf8');
  const previous = await readFile(rotatedEventsFile(file), 'utf8');
  assert.ok(Buffer.byteLength(current) <= 200);
  assert.ok(Buffer.byteLength(previous) <= 200);
  const last = JSON.parse(current.trim().split('\n').at(-1)!) as { i: number };
  assert.equal(last.i, 11);
  if (process.platform !== 'win32') assert.equal((await stat(file)).mode & 0o777, 0o600);
});

test('keyed mutex serializes actions per key and survives failures', async () => {
  const mutex = createKeyedMutex();
  const order: string[] = [];
  const slow = mutex.run('k', async () => {
    await new Promise((r) => setTimeout(r, 20));
    order.push('first');
  });
  const failing = mutex.run('k', () => {
    order.push('second');
    throw new Error('boom');
  });
  const third = mutex.run('k', () => {
    order.push('third');
    return 3;
  });
  const other = mutex.run('other', () => order.push('other'));
  assert.equal(mutex.busy('k'), true);
  await slow;
  await assert.rejects(failing, /boom/);
  assert.equal(await third, 3);
  await other;
  assert.deepEqual(order, ['other', 'first', 'second', 'third']);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(mutex.busy('k'), false);
});
