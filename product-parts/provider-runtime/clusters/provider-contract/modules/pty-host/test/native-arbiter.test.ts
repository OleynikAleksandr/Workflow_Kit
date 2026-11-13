import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NativeControlArbiter } from '../src/index.ts';

function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>(ok => { resolve = ok; });
  return { promise, resolve };
}

test('native leases serialize a host, leave other hosts independent, and release after failure', async () => {
  const arbiter = new NativeControlArbiter();
  const held = gate(); const entered = gate(); const order: string[] = [];
  const first = arbiter.run('host-a', async () => { order.push('send'); entered.resolve(); await held.promise; throw new Error('host failed'); });
  const failure = assert.rejects(first, /host failed/);
  await entered.promise;
  const stop = arbiter.run('host-a', async () => { order.push('stop'); return 'confirmed'; });
  await arbiter.run('host-b', async () => { order.push('other'); });
  assert.deepEqual(order, ['send', 'other']);
  held.resolve();
  await failure;
  assert.equal(await stop, 'confirmed');
  assert.deepEqual(order, ['send', 'other', 'stop']);
  assert.equal(await arbiter.run('host-a', async () => 'next'), 'next');
});

test('expired queued admission rejects promptly and never executes after the lease is released', async () => {
  const arbiter = new NativeControlArbiter(); const held = gate(); const entered = gate();
  const active = arbiter.run('host', async () => { entered.resolve(); await held.promise; });
  await entered.promise;
  const controller = new AbortController(); let keys = 0;
  const queued = arbiter.run('host', async () => { keys += 1; }, controller.signal);
  const rejected = assert.rejects(queued, /deadline/);
  controller.abort(new Error('deadline'));
  await rejected;
  held.resolve(); await active;
  await arbiter.run('host', async () => undefined);
  assert.equal(keys, 0);
});

test('aborting an admitted lease cannot release it while native work is still running', async () => {
  const arbiter = new NativeControlArbiter(); const held = gate(); const entered = gate();
  const controller = new AbortController(); let nextRan = false;
  const active = arbiter.run('host', async () => { entered.resolve(); await held.promise; return 'native ACK'; }, controller.signal);
  await entered.promise; controller.abort();
  const next = arbiter.run('host', async () => { nextRan = true; });
  await Promise.resolve(); assert.equal(nextRan, false);
  held.resolve(); assert.equal(await active, 'native ACK'); await next;
  assert.equal(nextRan, true);
});
