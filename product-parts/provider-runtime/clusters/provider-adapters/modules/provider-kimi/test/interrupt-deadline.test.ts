import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { KimiClient } from '../src/client.ts';
import { createKimiInterrupt } from '../src/interrupt.ts';
import { createTurnGate } from '../src/turn-gate.ts';
import { withSessions } from './fake-sessions.ts';

for (const platform of ['darwin', 'linux', 'win32'] as const) test(`Kimi ${platform}: deadline crossing while preparing a probe observes every started promise`, async (t) => {
  const live = { pidAlive: () => true, bootTime: () => 0, hostname: () => 'fixture-host' };
  await withSessions(async (w) => {
    await w.provider.createSession(w.project, { title: 'Deadline' });
    const session = w.api.sessions.get('session_1')!;
    session.status = 'running';
    w.api.message(session, 'user', 'first', 'user');
    const record = (await w.machine.supervisor.list())[0]!;
    await w.api.lock(session.id, { version: 1, token: 'first', pid: record.pid, hostname: 'fixture-host', startedAt: Date.now() });
    const client = (await w.runtime.server.own())!;
    let clock = Date.now();
    let armed = false;
    const observed: boolean[] = [];
    const wrapped: KimiClient = { ...client, get(route, options) {
      if (!armed) return client.get(route, options);
      const index = observed.push(false) - 1;
      const pending = Promise.resolve({});
      const then = pending.then.bind(pending);
      pending.then = (...args) => { observed[index] = true; return then(...args); };
      // Simulate a scheduler pause after starting request one, before request two.
      if (index === 0) clock += 1001;
      return pending;
    } };
    const rt = { ...w.runtime, context: { ...w.runtime.context, platform }, server: { ...w.runtime.server, own: async () => wrapped } };
    const controls = createKimiInterrupt(rt, live, createTurnGate(), { interruptWaitMs: 1000 });
    await controls.refresh(w.project, await w.provider.listSessions(w.project));
    t.mock.method(Date, 'now', () => clock);
    try {
      armed = true;
      await assert.rejects(controls.interruptTurn(w.project, session.id, { turnRef: 'kit-first', nativeTurnId: null }), { code: 'interrupt-timeout', status: 504 });
      assert.deepEqual(observed, [true, true], 'every started request must be owned by Promise.all');
      assert.equal(w.seen(/POST .*:abort$/).length, 0);
    } finally { t.mock.restoreAll(); }
  }, { liveness: live });
});
