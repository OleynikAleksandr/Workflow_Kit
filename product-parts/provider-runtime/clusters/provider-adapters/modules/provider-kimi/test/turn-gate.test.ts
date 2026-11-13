import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTurnGate } from '../src/turn-gate.ts';
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }

test('Stop cancels retry delays and queued old sends; a later explicit send waits for Stop', async () => {
  const gate = createTurnGate();
  const entered = deferred<void>();
  const stopping = deferred<void>();
  const order: string[] = [];
  const old = gate.send('s', async (guard) => { entered.resolve(); await guard.wait(60_000); assert.equal(guard.current(), false); return false; });
  const queued = gate.send('s', async () => { assert.fail('old queue must not run'); });
  await entered.promise;
  const stop = gate.interrupt('s', async (changed) => { order.push('stop'); assert.equal(changed(), false); await stopping.promise; });
  const explicit = gate.send('s', async () => { order.push('explicit'); return true; });
  await Promise.all([old, queued]);
  stopping.resolve();
  await stop;
  assert.equal(await explicit, true);
  assert.deepEqual(order, ['stop', 'explicit']);
});

test('an already accepted in-flight send is detected before an old Stop target may act', async () => {
  const gate = createTurnGate();
  const entered = deferred<void>();
  const accepted = deferred<boolean>();
  const send = gate.send('s', async () => { entered.resolve(); return accepted.promise; });
  await entered.promise;
  const stop = gate.interrupt('s', async (changed) => changed());
  accepted.resolve(true);
  assert.equal(await send, true);
  assert.equal(await stop, true);
});
