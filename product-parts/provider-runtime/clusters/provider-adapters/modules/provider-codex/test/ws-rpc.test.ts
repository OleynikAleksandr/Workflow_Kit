import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createRpcSession, initializeSession } from '../src/rpc.ts';
import type { RpcTransport } from '../src/rpc.ts';
import { OPCODE, acceptKey, connectUnixWebSocket, createFrameDecoder, encodeFrame } from '../src/ws.ts';
import { startFakeDaemon } from './fake-daemon.ts';

let tmp = '';

before(async () => {
  // Unix socket names are limited to 104 bytes on macOS: keep the directory short.
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfkw-'));
});

after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

test('frames round-trip with masks and all three length encodings, split at any byte', () => {
  for (const size of [0, 5, 125, 126, 65535, 65536, 70000]) {
    const payload = Buffer.alloc(size, 'x');
    const masked = encodeFrame(OPCODE.text, payload, Buffer.from([1, 2, 3, 4]));
    const decode = createFrameDecoder();
    const frames = [...decode(masked.subarray(0, 3)), ...decode(masked.subarray(3))];
    assert.equal(frames.length, 1, `size ${size}`);
    assert.equal(frames[0]!.fin, true);
    assert.equal(frames[0]!.payload.equals(payload), true);
  }
  const unmasked = encodeFrame(OPCODE.ping, Buffer.from('hi'), null);
  assert.deepEqual([...unmasked], [0x89, 2, 0x68, 0x69]);
  assert.equal(acceptKey('dGhlIHNhbXBsZSBub25jZQ=='), 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
  assert.throws(() => createFrameDecoder(10)(encodeFrame(OPCODE.text, Buffer.alloc(11), null)), /too large/);
});

test('JSON-RPC over the unix WebSocket: handshake, ping, fragmented answers, notifications', async () => {
  const daemon = await startFakeDaemon(path.join(tmp, 'a.sock'), { tricky: true });
  try {
    const session = createRpcSession(await connectUnixWebSocket(daemon.socketPath, { timeoutMs: 2000 }), { timeoutMs: 2000 });
    const init = await initializeSession(session);
    assert.equal(init.userAgent, 'fake-daemon/9.9.9');
    const rc = (await session.waitForNotification('remoteControl/status/changed', 1000)) as { status: string };
    assert.equal(rc.status, 'connected');
    const started = await session.request<{ thread: { id: string } }>('thread/start', { cwd: '/p' });
    assert.match(started.thread.id, /^019a/);
    await assert.rejects(session.request('nope/method'), (error: Error & { code?: unknown }) => error.code === -32601);
    for (let i = 0; i < 50 && daemon.pongs === 0; i += 1) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(daemon.pongs, 1);
    session.close();
    assert.deepEqual(daemon.calls.map((c) => c.method), ['initialize', 'initialized', 'thread/start', 'nope/method']);
  } finally {
    await daemon.close();
  }
});

test('a refused handshake or a missing socket rejects with a readable error', async () => {
  const daemon = await startFakeDaemon(path.join(tmp, 'b.sock'), { refuse: 'HTTP/1.1 403 Forbidden' });
  try {
    await assert.rejects(connectUnixWebSocket(daemon.socketPath, { timeoutMs: 1000 }), /refused the WebSocket connection \(HTTP\/1.1 403/);
  } finally {
    await daemon.close();
  }
  await assert.rejects(connectUnixWebSocket(path.join(tmp, 'missing.sock'), { timeoutMs: 1000 }), /ENOENT|closed/);
});

test('server requests are refused, requests time out, a closed transport fails pending calls', async () => {
  const sent: unknown[] = [];
  let deliver: (message: unknown) => void = () => undefined;
  let closeIt: (error?: Error) => void = () => undefined;
  const transport: RpcTransport = {
    send: (message) => sent.push(message),
    onMessage: (handler) => (deliver = handler),
    onClose: (handler) => (closeIt = handler),
    close: () => undefined,
  };
  const session = createRpcSession(transport, { timeoutMs: 50 });
  deliver({ jsonrpc: '2.0', id: 'srv-1', method: 'item/commandExecution/requestApproval', params: {} });
  assert.deepEqual(sent[0], { jsonrpc: '2.0', id: 'srv-1', error: { code: -32601, message: 'Workflow Kit does not handle server requests' } });
  await assert.rejects(session.request('slow'), /no answer in time/);
  const pending = session.request('x', undefined, 5000);
  closeIt(new Error('gone'));
  await assert.rejects(pending, /gone/);
  await assert.rejects(session.request('after'), /gone/);
  assert.equal(await session.waitForNotification('never', 20), undefined);
});
