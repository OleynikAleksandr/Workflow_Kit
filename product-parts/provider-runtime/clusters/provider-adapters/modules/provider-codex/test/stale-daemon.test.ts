// M17 2.3: a daemon that Kit did not start with the current PATH is shown and restarted on request.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test as plainTest } from 'node:test';
import { DAEMON_RECORD_FILE, STALE_ENV_CONFIRM, STALE_ENV_REASON, pathOf, staleDaemonEnv } from '../src/daemon-record.ts';
import { createCodexProvider } from '../src/index.ts';
import { fakeMachine, machineTest as test } from './helpers.ts';

plainTest('the record decides: another pid or another PATH is stale, no record is not; Windows spells Path', () => {
  assert.equal(staleDaemonEnv(null, 10, '/usr/bin'), false);
  assert.equal(staleDaemonEnv({ pid: 10, path: '/usr/bin' }, 10, '/usr/bin'), false);
  assert.equal(staleDaemonEnv({ pid: 10, path: '/usr/bin' }, 11, '/usr/bin'), true);
  assert.equal(staleDaemonEnv({ pid: 10, path: '/usr/bin' }, 10, '/usr/bin:/home/me/.local/bin'), true);
  assert.equal(staleDaemonEnv({ pid: 10, path: '/usr/bin' }, null, '/usr/bin'), false);
  assert.equal(pathOf({ Path: 'C:\\Windows;C:\\Users\\me\\AppData\\Local\\Workflow Kit' }), 'C:\\Windows;C:\\Users\\me\\AppData\\Local\\Workflow Kit');
  assert.equal(pathOf({}), '');
});

test('a stale daemon gets the note and «Перезапустить демон»; the restart writes a fresh record', async () => {
  const machine = await fakeMachine();
  try {
    const daemon = await machine.daemon();
    const record = path.join(machine.dirs.stateDir, DAEMON_RECORD_FILE);
    await mkdir(machine.dirs.stateDir, { recursive: true });
    const context = machine.context();
    const provider = createCodexProvider(context);

    // No record: Kit does not know this daemon and leaves it alone.
    let status = await provider.refresh!();
    assert.equal(status.label, 'демон подключён');
    assert.notEqual(status.note, STALE_ENV_REASON);
    let [action] = await provider.actions(null);
    assert.equal(action?.enabled, false);

    // Kit started another daemon earlier: this one is not it.
    await writeFile(record, JSON.stringify({ pid: process.pid + 1, path: pathOf(context.env) }));
    status = await provider.refresh!();
    assert.deepEqual([status.state, status.note], ['ready', STALE_ENV_REASON]);
    [action] = await provider.actions(null);
    assert.deepEqual([action?.title, action?.enabled, action?.confirm], ['Перезапустить демон', true, STALE_ENV_CONFIRM]);

    // The same daemon with an older PATH is stale too.
    await writeFile(record, JSON.stringify({ pid: process.pid, path: '/usr/bin' }));
    assert.equal((await provider.refresh!()).note, STALE_ENV_REASON);

    await provider.runAction('daemon-start', null);
    const argvs = (await machine.calls()).filter((c) => c.argv).map((c) => c.argv!.join(' '));
    assert.deepEqual(argvs.slice(-2), ['remote-control stop', 'remote-control start --json']);
    const saved = JSON.parse(await readFile(record, 'utf8')) as { pid: number; path: string };
    assert.equal(saved.pid, process.pid);
    assert.match(saved.path, new RegExp(`^${machine.bin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`));
    assert.notEqual((await provider.refresh!()).note, STALE_ENV_REASON);
    await daemon.close();
  } finally {
    await machine.close();
  }
});
