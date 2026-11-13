import assert from 'node:assert/strict';
import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createAgentChannel, parseHookInput } from '#agent-channel';
import { createKimiInterrupt } from '../src/interrupt.ts';
import { createTurnGate } from '../src/turn-gate.ts';
import { withSessions } from './fake-sessions.ts';
import type { SessionSetup } from './fake-sessions.ts';

const deps = { interruptWaitMs: 1500, interruptPollMs: 5, liveness: { pidAlive: () => true, bootTime: () => 0, hostname: () => 'fixture-host' } };
const target = { turnRef: 'kit-1', nativeTurnId: null };
const ok = (data: unknown) => ({ body: JSON.stringify({ code: 0, msg: 'ok', data }) });
async function active(w: SessionSetup) {
  await w.provider.createSession(w.project, { title: 'Test' });
  const session = w.api.sessions.get('session_1')!;
  session.status = 'running';
  w.api.message(session, 'user', 'first', 'user');
  const server = (await w.machine.supervisor.list())[0]!;
  const holder = { version: 1, token: 'token-1', pid: server.pid, hostname: 'fixture-host', startedAt: Date.now() };
  await w.api.lock(session.id, holder);
  await w.provider.listSessions(w.project);
  return { session, holder, file: path.join(w.machine.paths.locks, `${session.id}.lock`) };
}

for (const platform of ['darwin', 'linux', 'win32'] as const) test(`Kimi ${platform}: aborted:true and idle confirm Stop without hook; explicit next message works`, async () => {
  await withSessions(async (w) => {
    const { session } = await active(w);
    const controls = createKimiInterrupt({ ...w.runtime, context: { ...w.runtime.context, platform } }, deps.liveness, createTurnGate(), deps);
    await controls.refresh(w.project, await w.provider.listSessions(w.project));
    w.provider.interruptAvailability = controls.interruptAvailability;
    w.provider.interruptTurn = controls.interruptTurn;
    assert.equal((await w.provider.capabilities()).interruptTurn?.available, true);
    const reads = w.machine.api.requests.length;
    assert.equal(w.provider.interruptAvailability!(w.project, session.id).available, true);
    assert.equal(w.machine.api.requests.length, reads, 'availability is cached');
    const ch = createAgentChannel({ resolveProject: async () => ({ id: w.project.id }) });
    try {
      await ch.prompt(parseHookInput('kimi', { session_id: session.id, cwd: w.project.path, prompt: [{ type: 'text', text: 'first' }] }, undefined, () => 'kimi')!);
      const key = `kimi:${session.id}`;
      const ref = ch.interruption(key)!.turnRef!;
      ch.suspend(key);
      const result = await w.provider.interruptTurn!(w.project, session.id, { ...target, turnRef: ref });
      assert.deepEqual(result, { status: 'interrupted', stopped: true, proof: 'provider-state', nativeTurnId: null });
      assert.equal(ch.confirmInterrupted(key, ref, null), true);
      assert.equal(ch.get(key)!.state, 'waiting');
      ch.enqueue(key, 'keep queued');
      ch.wake(key); await ch.maintain();
      assert.equal(ch.queued(key).length, 1);
      assert.equal(w.seen(/POST .*:abort$/).length, 1);
      assert.equal(w.seen(/takeover|shutdown|:reload/).length, 0);
      assert.equal(await w.provider.sendMessage!(w.project, session.id, 'next', { id: 'after-stop' }), true);
    } finally { ch.close(); }
  }, deps);
});

test('foreign/unknown locks, archived sessions, pending questions and absent Kit server refuse before abort', async () => {
  await withSessions(async (w) => {
    const { session, holder, file } = await active(w);
    for (const lock of [{ ...holder, pid: 999 }, { ...holder, hostname: 'other-host' }, { pid: holder.pid }, null]) {
      await writeFile(file, JSON.stringify(lock));
      await w.provider.listSessions(w.project);
      assert.equal(w.provider.interruptAvailability!(w.project, session.id).available, false);
      assert.equal((await w.provider.interruptTurn!(w.project, session.id, target)).status, 'unavailable');
    }
    await writeFile(file, JSON.stringify(holder));
    await w.provider.listSessions(w.project);
    session.archived = true;
    assert.equal((await w.provider.interruptTurn!(w.project, session.id, target)).status, 'unavailable');
    session.archived = false; session.pending = 'approval';
    assert.equal((await w.provider.interruptTurn!(w.project, session.id, target)).status, 'unavailable');
    session.pending = 'none';
    await w.machine.crash();
    assert.equal((await w.provider.interruptTurn!(w.project, session.id, target)).status, 'unavailable');
    assert.equal(w.seen(/POST .*:abort$/).length, 0);
  }, deps);
});

test('a changed prompt before abort is stale; a new prompt during confirmation is not reported stopped', async () => {
  for (const changeAt of ['before', 'after'] as const) await withSessions(async (w) => {
    const { session } = await active(w);
    const base = w.machine.api.override!;
    let pages = 0;
    w.machine.api.override = (request) => {
      if (request.method === 'GET' && request.url.includes('/messages?') && ++pages === 2 && changeAt === 'before') w.api.message(session, 'user', 'successor', 'user');
      const response = base(request);
      if (request.url.endsWith(':abort') && changeAt === 'after') { w.api.message(session, 'user', 'successor', 'user'); session.status = 'running'; }
      return response;
    };
    assert.deepEqual(await w.provider.interruptTurn!(w.project, session.id, target), { status: 'stale', stopped: false });
    assert.equal(session.status, 'running');
    assert.equal(w.seen(/POST .*:abort$/).length, changeAt === 'before' ? 0 : 1);
  }, deps);
});

test('missing proof, API failure and foreign ownership rejection never report a successful stop', async () => {
  for (const mode of ['shape', 'busy', 'foreign', 'error'] as const) await withSessions(async (w) => {
    const { session } = await active(w);
    const base = w.machine.api.override!;
    w.machine.api.override = (request) => {
      if (request.url.endsWith(':abort')) return mode === 'shape' ? ok({}) : mode === 'busy' ? ok({ aborted: true }) : { status: 409, body: JSON.stringify({ code: mode === 'foreign' ? 40931 : 50001, msg: 'refused' }) };
      return base(request);
    };
    if (mode === 'foreign') assert.equal((await w.provider.interruptTurn!(w.project, session.id, target)).status, 'unavailable');
    else await assert.rejects(w.provider.interruptTurn!(w.project, session.id, target), { code: mode === 'busy' ? 'interrupt-timeout' : 'interrupt-failed' });
    assert.equal(session.status, 'running');
    assert.equal(w.seen(/POST .*:abort$/).length, 1);
  }, { ...deps, interruptWaitMs: 600 });
});

test('a new lock epoch and a foreign owner arriving after availability do not receive abort', async () => {
  await withSessions(async (w) => {
    const { session, holder, file } = await active(w);
    await writeFile(file, JSON.stringify({ ...holder, token: 'next-turn' }));
    assert.equal((await w.provider.interruptTurn!(w.project, session.id, target)).status, 'stale');
    await writeFile(file, JSON.stringify({ ...holder, pid: 999 }));
    assert.equal((await w.provider.interruptTurn!(w.project, session.id, target)).status, 'unavailable');
    assert.equal(w.seen(/POST .*:abort$/).length, 0);
  }, deps);
});

test('Stop cancels provider retry backoff; no queued background prompt is sent afterwards', async () => {
  await withSessions(async (w) => {
    const { session } = await active(w);
    w.api.fail(/POST .*\/prompts$/, 40931);
    const sending = w.provider.sendMessage!(w.project, session.id, 'queued background', { id: 'retrying' });
    for (let i = 0; i < 200 && w.seen(/POST .*\/prompts$/).length === 0; i++) await new Promise((r) => setTimeout(r, 2));
    assert.equal(w.seen(/POST .*\/prompts$/).length, 1);
    assert.equal((await w.provider.interruptTurn!(w.project, session.id, target)).status, 'interrupted');
    assert.equal(await sending, false);
    assert.equal(w.seen(/POST .*\/prompts$/).length, 1);
  }, { ...deps, retryDelaysMs: [60_000] });
});

test('only a previously bound prompt may be confirmed idle after timeout; unknown idle is refused', async () => {
  for (const reason of ['completed', 'interrupted']) await withSessions(async (w) => {
    const { session, file } = await active(w);
    const base = w.machine.api.override!;
    w.machine.api.override = (request) => request.url.endsWith(':abort') ? ok({ aborted: true }) : base(request);
    await assert.rejects(w.provider.interruptTurn!(w.project, session.id, target), { code: 'interrupt-timeout' });
    session.status = 'idle'; session.lastReason = reason;
    await rm(file);
    assert.equal((await w.provider.interruptTurn!(w.project, session.id, target)).status, reason === 'completed' ? 'already-idle' : 'interrupted');
    assert.equal((await w.provider.interruptTurn!(w.project, session.id, { ...target, turnRef: 'unknown' })).status, 'unavailable');
    assert.equal(w.seen(/POST .*:abort$/).length, 1);
  }, { ...deps, interruptWaitMs: 300 });
});

test('a server belonging to the app is never used or replaced for Stop', async () => {
  await withSessions(async (w) => {
    const { session } = await active(w);
    await w.machine.crash();
    const stopApp = await w.machine.startApp();
    try {
      await w.provider.listSessions(w.project);
      assert.equal(w.provider.interruptAvailability!(w.project, session.id).available, false);
      assert.equal((await w.provider.interruptTurn!(w.project, session.id, target)).status, 'unavailable');
      assert.equal(w.machine.spawned.length, 1);
      assert.equal(w.seen(/POST .*:abort$|takeover|shutdown/).length, 0);
    } finally { await stopApp(); }
  }, deps);
});

test('expired preflight cannot send a late abort even if a transport ignores cancellation', async () => {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  let delaying = false;
  let finished = false;
  await withSessions(async (w) => {
    const { session } = await active(w);
    delaying = true;
    await assert.rejects(w.provider.interruptTurn!(w.project, session.id, target), { code: 'interrupt-timeout' });
    release();
    for (let i = 0; i < 200 && !finished; i++) await new Promise((r) => setTimeout(r, 2));
    await new Promise((r) => setImmediate(r));
    assert.equal(finished, true);
    assert.equal(w.seen(/POST .*:abort$/).length, 0);
  }, { ...deps, interruptWaitMs: 120, fetch: async (url, init) => {
    if (delaying && String(url).endsWith('/api/v1/sessions/session_1')) {
      await wait;
      const response = await fetch(url, { ...init, signal: undefined });
      finished = true;
      return response;
    }
    return fetch(url, init);
  } });
});

test('transport timeouts before the operation deadline are 504; ordinary failures and timeout-looking text stay 502', async () => {
  const failures = [
    { error: new DOMException('unrelated text', 'TimeoutError'), code: 'interrupt-timeout', status: 504 },
    { error: new DOMException('cancelled request', 'AbortError'), code: 'interrupt-timeout', status: 504 },
    { error: new TypeError('wrapped fetch failure', { cause: new DOMException('request expired', 'TimeoutError') }), code: 'interrupt-timeout', status: 504 },
    { error: new TypeError('ECONNRESET'), code: 'interrupt-failed', status: 502 },
    { error: new Error('сервер Kimi не ответил вовремя'), code: 'interrupt-failed', status: 502 },
  ];
  for (const entry of failures) {
    let fault: Error | null = null;
    await withSessions(async (w) => {
      const { session } = await active(w);
      fault = entry.error;
      const channel = createAgentChannel({ resolveProject: async () => ({ id: w.project.id }) });
      const key = `kimi:${session.id}`;
      try {
        channel.enqueue(key, 'preserve', 'panel', w.project.id);
        channel.suspend(key);
        await assert.rejects(w.provider.interruptTurn!(w.project, session.id, target), { code: entry.code, status: entry.status });
        assert.equal(channel.interruption(key)!.barrier, true);
        assert.equal(channel.queued(key)[0]!.text, 'preserve');
        assert.equal(session.status, 'running');
        assert.equal(w.seen(/POST .*:abort$/).length, 0, 'a rejected fetch is not replayed');
      } finally { channel.close(); }
    }, { ...deps, interruptWaitMs: 60_000, fetch: async (url, init) => {
      if (fault && init?.method === 'POST' && String(url).endsWith(':abort')) throw fault;
      return fetch(url, init);
    } });
  }
});
