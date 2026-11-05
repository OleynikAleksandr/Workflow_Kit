import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { backupDirFor, backupFile, createOperations, toOperationError } from '../src/index.ts';

let tmp = '';

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-ops-'));
});

after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

test('an operation runs in the background and reports its result', async () => {
  const ops = createOperations();
  const gate = deferred();
  const started = ops.start({
    key: 'k1',
    kind: 'provider.trust',
    title: 'Доверие',
    scope: { provider: 'claude', project: 'p1' },
    run: async (handle) => {
      handle.progress('ожидание');
      await gate.promise;
      return { trusted: true };
    },
  });
  assert.equal(started.existing, false);
  assert.equal(started.operation.status, 'running');
  assert.equal(ops.active('k1')?.id, started.operation.id);
  assert.equal(ops.section().operations[0]?.progress, 'ожидание');
  gate.resolve();
  const finished = await ops.wait(started.operation.id);
  assert.equal(finished.status, 'succeeded');
  assert.deepEqual(finished.result, { trusted: true });
  assert.equal(finished.progress, null);
  assert.ok(finished.finishedAt);
  assert.equal(ops.active('k1'), undefined);
});

test('starting the same key while it runs returns the running operation and does not run twice', async () => {
  const ops = createOperations();
  const gate = deferred();
  let runs = 0;
  const spec = {
    key: 'session.create:claude:p1',
    kind: 'provider.session.create',
    title: 'Создать сессию',
    run: async () => {
      runs += 1;
      await gate.promise;
      return runs;
    },
  };
  const first = ops.start(spec);
  const second = ops.start(spec);
  assert.equal(second.existing, true);
  assert.equal(second.operation.id, first.operation.id);
  gate.resolve();
  await ops.wait(first.operation.id);
  assert.equal(runs, 1);
  const third = ops.start(spec);
  assert.equal(third.existing, false);
  await ops.wait(third.operation.id);
  assert.equal(runs, 2);
});

test('a failure keeps code, message, hint and details; onFinish sees the outcome', async () => {
  const ops = createOperations();
  const seen: string[] = [];
  const error = Object.assign(new Error('нет доступа'), { code: 'denied', hint: 'войдите', details: { files: ['a'] } });
  const started = ops.start({
    key: 'k',
    kind: 'x',
    title: 'x',
    run: () => {
      throw error;
    },
    onFinish: (op) => {
      seen.push(op.status);
      throw new Error('ignored');
    },
  });
  const finished = await ops.wait(started.operation.id);
  assert.equal(finished.status, 'failed');
  assert.deepEqual(finished.error, { files: ['a'], code: 'denied', message: 'нет доступа', hint: 'войдите' });
  assert.deepEqual(seen, ['failed']);
  assert.deepEqual(toOperationError('boom'), { code: 'internal', message: 'boom' });
});

test('finished operations are pruned by count and age, running ones first in the list', async () => {
  let clock = Date.parse('2026-01-01T00:00:00.000Z');
  const ops = createOperations({ now: () => new Date(clock), keepFinished: 2, keepMs: 1000 });
  for (const key of ['a', 'b', 'c']) {
    clock += 10;
    await ops.wait(ops.start({ key, kind: 'k', title: key, run: () => key }).operation.id);
  }
  assert.deepEqual(ops.list().map((op) => op.key), ['c', 'b']);
  const gate = deferred();
  ops.start({ key: 'live', kind: 'k', title: 'live', run: () => gate.promise });
  assert.equal(ops.list()[0]?.key, 'live');
  clock += 5000;
  assert.deepEqual(ops.list().map((op) => op.key), ['live']);
  gate.resolve();
  await assert.rejects(ops.wait('nope'));
});

test('backupFile copies a file with mode 0600 and keeps the newest copies', async () => {
  const source = path.join(tmp, 'claude.json');
  const backups = path.join(tmp, 'backups');
  assert.equal(await backupFile(path.join(tmp, 'absent.json'), { backupsDir: backups }), null);
  let clock = Date.parse('2026-01-01T00:00:00.000Z');
  const copies: string[] = [];
  for (let i = 0; i < 4; i += 1) {
    await writeFile(source, `{"n":${i}}`);
    clock += 1000;
    const copy = await backupFile(source, { backupsDir: backups, keep: 3, now: () => new Date(clock) });
    assert.ok(copy);
    copies.push(copy);
  }
  const dir = backupDirFor(backups, source);
  assert.equal(path.dirname(copies[0]!), dir);
  assert.match(path.basename(dir), /^claude\.json-[0-9a-f]{10}$/);
  const left = (await readdir(dir)).sort();
  assert.equal(left.length, 3);
  assert.equal(await readFile(path.join(dir, left[2]!), 'utf8'), '{"n":3}');
  if (process.platform !== 'win32') assert.equal((await stat(copies[3]!)).mode & 0o777, 0o600);
});
