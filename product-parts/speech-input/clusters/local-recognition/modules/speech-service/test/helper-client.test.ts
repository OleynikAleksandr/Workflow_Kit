import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { test } from 'node:test';
import { createHelperClient } from '../src/index.ts';
function fixture(timeoutMs = 1000) {
  const child = new EventEmitter(), stdin = new PassThrough(), stdout = new PassThrough();
  let kills = 0;
  Object.assign(child, { stdin, stdout, kill() {
    kills++;
    queueMicrotask(() => { child.emit('exit', null, 'SIGKILL'); child.emit('close', null, 'SIGKILL'); });
    return true;
  } });
  stdin.once('finish', () => { child.emit('exit', 0); child.emit('close', 0); });
  const client = createHelperClient('fixture', { launch: () => child as ChildProcessWithoutNullStreams, timeoutMs });
  return { client, child, stdin, stdout, kills: () => kills };
}
function frame(message: unknown) {
  const json = Buffer.from(JSON.stringify(message)), length = Buffer.alloc(4);
  length.writeUInt32LE(json.length); return Buffer.concat([length, json, Buffer.alloc(4)]);
}
test('helper decoder accepts fragmented frames and repeated requests, rejects concurrency', async () => {
  const f = fixture();
  try {
    const result = f.client.request({ type: 'hello' });
    await assert.rejects(f.client.request({ type: 'hello' }), { code: 'helper-state' });
    const data = frame({ type: 'hello', protocolVersion: 1 });
    for (const b of data) f.stdout.write(Buffer.from([b]));
    assert.equal((await result)['protocolVersion'], 1);
    const next = f.client.request({ type: 'begin' }); f.stdout.write(frame({ type: 'ready' }));
    assert.equal((await next).type, 'ready');
  } finally { f.client.close(); await f.client.closed; }
});
for (const stream of ['stdin', 'stdout'] as const) test(`${stream} error rejects once, reaps worker and absorbs later EPIPE`, async () => {
  const f = fixture(); const pending = f.client.request({ type: 'hello' });
  f[stream].emit('error', Object.assign(new Error('closed pipe'), { code: 'EPIPE' }));
  await assert.rejects(pending, { code: 'helper-io' }); await f.client.closed;
  f.stdin.emit('error', new Error('late EPIPE')); f.stdout.emit('error', new Error('late read'));
  await assert.rejects(f.client.request({ type: 'hello' }), { code: 'helper-state' });
  f.client.close(); assert.equal(f.kills(), 1);
});
test('stdout EOF rejects a partial response and kills a worker that did not exit', async () => {
  const f = fixture(); const pending = f.client.request({ type: 'hello' });
  f.stdout.write(Buffer.from([10, 0])); f.stdout.end();
  await assert.rejects(pending, { code: 'helper-exited' }); await f.client.closed;
  assert.equal(f.kills(), 1);
});
test('malformed response kills worker; its following valid data cannot settle the request', async () => {
  const f = fixture(); const pending = f.client.request({ type: 'hello' });
  f.stdout.write(Buffer.from([255, 255, 255, 255]));
  f.stdout.write(frame({ type: 'hello' }));
  await assert.rejects(pending, /Invalid helper JSON length/); await f.client.closed;
  assert.equal(f.kills(), 1);
});
test('worker exit and spawn errors reject pending request; timeout reaps hung worker', async () => {
  for (const event of ['exit', 'error'] as const) {
    const f = fixture(); const pending = f.client.request({ type: 'hello' });
    f.child.emit(event, new Error('spawn failed'));
    await assert.rejects(pending); f.child.emit('close'); await f.client.closed;
  }
  const f = fixture(10);
  await assert.rejects(f.client.request({ type: 'hello' }), { code: 'helper-timeout' });
  await f.client.closed; assert.equal(f.kills(), 1);
});
