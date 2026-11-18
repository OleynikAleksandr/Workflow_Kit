// Spec M43 on the fake machine: the ChatGPT app holds remote control (409 already online), a
// session is still created through the daemon, and the creation gives remote control back. The
// system steps are fake: the real ChatGPT app of the machine that runs the tests is never touched.
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { after, before } from 'node:test';
import { installStructure } from '#kit-structure';
import type { Project } from '#provider-registry';
import { APP_OWNER_NOTE, APP_OWNER_REASON, RECLAIM_ACTION, createCodexProvider } from '../src/index.ts';
import type { ReclaimSystem } from '../src/index.ts';
import { POSIX_MACHINE_SKIP, fakeMachine, machineTest as test } from './helpers.ts';
import type { FakeMachine } from './helpers.ts';

let machine: FakeMachine;
let project: Project;

before(async () => {
  if (POSIX_MACHINE_SKIP) return;
  machine = await fakeMachine();
  await machine.daemon();
  project = await machine.project('Held');
  await installStructure(project.path);
  const provider = createCodexProvider(machine.context());
  await provider.refresh!();
  await provider.grantTrust(project, (await provider.previewTrust(project)).token);
});

after(async () => {
  await machine?.close();
});

test('remote control held by the ChatGPT app (409 already online) is a working state; a new session gives it back to the daemon (M43)', async () => {
  const held = await machine.daemon({ remoteControl: 'errored' });
  const logs = path.join(machine.codexHome, 'logs_2.sqlite');
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(logs);
  db.exec('CREATE TABLE logs (id INTEGER PRIMARY KEY, ts INTEGER NOT NULL, ts_nanos INTEGER NOT NULL, level TEXT NOT NULL, target TEXT NOT NULL, feedback_log_body TEXT, process_uuid TEXT)');
  const insert = db.prepare('INSERT INTO logs (ts, ts_nanos, level, target, feedback_log_body, process_uuid) VALUES (?, 0, ?, ?, ?, ?)');
  const target = 'codex_app_server_transport::transport::remote_control::websocket';
  insert.run(1, 'WARN', target, 'failed to connect: HTTP error: 401 Unauthorized', `pid:${process.pid}:old`);
  insert.run(2, 'WARN', target, 'failed to connect: HTTP error: 409 Conflict, body: {"detail":"Remote app server already online"}', `pid:${process.pid}:now`);
  insert.run(3, 'WARN', target, 'failed to connect: 500', 'pid:1:other-process');
  db.close();
  // A fake system: the real ChatGPT app of the machine that runs the tests is never touched.
  const steps: string[] = [];
  let opened: () => void = () => undefined;
  const reopened = new Promise<void>((resolve) => { opened = resolve; });
  let servers = [4242];
  const system: ReclaimSystem = {
    processes: async () => ({ servers, apps: [4241] }),
    quitApp: async () => { steps.push('quit'); servers = []; return null; },
    nudgeDaemon: async () => { steps.push('nudge'); return null; },
    openApp: async () => { steps.push('open'); opened(); return null; },
  };
  try {
    const local = createCodexProvider(machine.context(), { reclaim: { system, sleep: async () => undefined, quitWaitMs: 0, waitMs: 0 } });
    await local.refresh!();
    const status = await local.status();
    assert.deepEqual([status.state, status.label, status.note], ['ready', 'через приложение ChatGPT', APP_OWNER_NOTE]);
    assert.equal((await local.capabilities())['createSession']?.available, true);
    const [action, reclaimAction] = await local.actions(null);
    assert.deepEqual([action?.enabled, action?.reason], [false, APP_OWNER_REASON]);
    assert.deepEqual([reclaimAction?.id, reclaimAction?.enabled, reclaimAction?.title], [RECLAIM_ACTION, true, 'Вернуть управление Kit']);
    assert.match(reclaimAction?.confirm ?? '', /Закрыть ChatGPT и открыть снова/);
    const calls = (await machine.calls()).length;
    assert.equal(await local.autostart!(), null, 'nothing to start while the app holds the link');
    const session = await local.createSession(project, { title: 'Held by the app' });
    assert.ok(session.localId, 'a session is created through the daemon while the app holds the link');
    await reopened;
    assert.deepEqual(steps, ['quit', 'nudge', 'open'], 'the creation gave remote control back without waiting for it');
    assert.equal((await machine.calls()).filter((c) => c.argv?.[0] === 'remote-control').length, (await machine.calls()).slice(0, calls).filter((c) => c.argv?.[0] === 'remote-control').length);
  } finally {
    await held.close();
    await rm(logs, { force: true });
  }
});

