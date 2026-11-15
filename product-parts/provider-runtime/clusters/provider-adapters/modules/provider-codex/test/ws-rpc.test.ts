import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import type { Socket } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { RpcError, TransportError, createRpcSession, initializeSession } from '../src/rpc.ts';
import type { RpcTransport } from '../src/rpc.ts';
import { MAX_FRAME_BYTES, MAX_MESSAGE_BYTES, OPCODE, acceptKey, connectUnixWebSocket, connectWebSocket, createFrameDecoder, encodeFrame } from '../src/ws.ts';
import type { ByteStream, Frame } from '../src/ws.ts';
import { listenPath, startFakeDaemon } from './fake-daemon.ts';

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

test('the fake daemon listens on the Unix socket on macOS and Linux and on a named pipe on Windows', () => {
  assert.equal(listenPath('/tmp/a.sock', 'darwin'), '/tmp/a.sock');
  assert.equal(listenPath('/tmp/a.sock', 'linux'), '/tmp/a.sock');
  assert.match(listenPath('C:\\T\\a.sock', 'win32'), /^\\\\\.\\pipe\\wfk-fake-[0-9a-f]{16}$/);
  assert.notEqual(listenPath('C:\\T\\a.sock', 'win32'), listenPath('C:\\T\\b.sock', 'win32'));
});

/** A server frame with FIN cleared (a fragment that more frames continue). */
function fragment(opcode: number, payload: Buffer): Buffer {
  const frame = encodeFrame(opcode, payload, null);
  frame[0] = opcode;
  return frame;
}

/** An in-memory peer: answers the handshake, then pushes exactly the chunks a test gives it. */
function memoryPeer(): { stream: ByteStream; push(chunk: Buffer): void; hangUp(): void; ended(): boolean } {
  let data: (chunk: Buffer) => void = () => undefined;
  let closed: () => void = () => undefined;
  let ended = false;
  const stream: ByteStream & { destroyed: boolean } = {
    destroyed: false,
    write: (chunk) => {
      const key = /Sec-WebSocket-Key: (\S+)/.exec(chunk.toString('latin1'))?.[1];
      if (key) setImmediate(() => data(Buffer.from(`HTTP/1.1 101 Switching Protocols\r\nSec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`, 'latin1')));
    },
    end: () => void (ended = true),
    destroy: () => {
      if (stream.destroyed) return;
      stream.destroyed = true;
      setImmediate(closed);
    },
    onReady: (listener) => void setImmediate(listener),
    onData: (listener) => void (data = listener),
    onError: () => undefined,
    onClose: (listener) => void (closed = listener),
  };
  return {
    stream,
    push: (chunk) => data(chunk),
    hangUp: () => {
      stream.destroyed = true;
      closed();
    },
    ended: () => ended,
  };
}

/** Opens a transport over a memory peer and records its messages and its close reason. */
async function openMemory(options: { maxMessageBytes?: number; maxFrameBytes?: number } = {}) {
  const peer = memoryPeer();
  const transport = await connectWebSocket(peer.stream, { timeoutMs: 1000, ...options });
  const messages: unknown[] = [];
  transport.onMessage((message) => messages.push(message));
  const closed = new Promise<Error | undefined>((resolve) => transport.onClose(resolve));
  return { peer, transport, messages, closed };
}

const isTransport = (code: string, size?: number, limit?: number) => (error: unknown): boolean =>
  error instanceof TransportError && error.code === code && (size === undefined || error.size === size) && (limit === undefined || error.limit === limit);

test('frame limit: exactly the limit passes; one byte more is refused by the header alone', () => {
  const ok = createFrameDecoder(100)(encodeFrame(OPCODE.text, Buffer.alloc(100), null));
  assert.equal(ok[0]!.payload.length, 100);
  const header16 = encodeFrame(OPCODE.text, Buffer.alloc(101), null).subarray(0, 4);
  assert.throws(() => createFrameDecoder(100)(header16), isTransport('frame-too-large', 101, 100));
  // A 64-bit length of 16 MiB + 1 is refused before any payload byte arrives.
  const header64 = Buffer.from([0x81, 127, 0, 0, 0, 0, 0x01, 0, 0, 0x01]);
  assert.throws(() => createFrameDecoder()(header64), isTransport('frame-too-large', MAX_FRAME_BYTES + 1, MAX_FRAME_BYTES));
  assert.throws(() => createFrameDecoder()(Buffer.from([0x81, 127, 0xff, 0, 0, 0, 0, 0, 0, 0])), isTransport('frame-too-large'));
});

test('a 16 MiB frame arriving in 4 KiB chunks is assembled with linear copying', () => {
  const payload = Buffer.alloc(MAX_FRAME_BYTES, 0x61);
  payload[payload.length - 1] = 0x62;
  const frame = encodeFrame(OPCODE.text, payload, null);
  const decode = createFrameDecoder();
  const started = performance.now();
  const frames: Frame[] = [];
  for (let i = 0; i < frame.length; i += 4096) frames.push(...decode(frame.subarray(i, i + 4096)));
  const elapsed = performance.now() - started;
  assert.equal(frames.length, 1);
  assert.equal(frames[0]!.payload.equals(payload), true);
  // Copying the whole buffer on every chunk (the old decoder) would move about 34 GB here.
  assert.ok(elapsed < 5000, `decoding took ${Math.round(elapsed)} ms`);
});

test('UTF-8 split across TCP chunks and across fragments arrives intact', async () => {
  const { peer, messages, transport } = await openMemory();
  const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', method: 'note', params: { text: 'привет, мир' } }));
  for (const byte of encodeFrame(OPCODE.text, body, null)) peer.push(Buffer.from([byte]));
  const cut = body.indexOf(Buffer.from('и')) + 1; // inside the two bytes of a Cyrillic letter
  peer.push(Buffer.concat([fragment(OPCODE.text, body.subarray(0, cut)), encodeFrame(OPCODE.continuation, body.subarray(cut), null)]));
  assert.deepEqual(messages, [JSON.parse(body.toString()), JSON.parse(body.toString())]);
  transport.close();
});

test('fragments: exactly the message limit passes, more is refused on the header of the next fragment', async () => {
  const fits = await openMemory({ maxMessageBytes: 50 });
  const json = Buffer.from(JSON.stringify({ method: 'x', params: 'a'.repeat(50 - 26) }));
  assert.equal(json.length, 50);
  fits.peer.push(Buffer.concat([fragment(OPCODE.text, json.subarray(0, 25)), encodeFrame(OPCODE.continuation, json.subarray(25), null)]));
  assert.equal(fits.messages.length, 1);
  fits.transport.close();

  const over = await openMemory({ maxMessageBytes: 50 });
  over.peer.push(fragment(OPCODE.text, Buffer.alloc(30, 0x20)));
  // Only the header of the second fragment: the limit is checked before its payload is buffered.
  over.peer.push(encodeFrame(OPCODE.continuation, Buffer.alloc(30, 0x20), null).subarray(0, 2));
  assert.equal(over.peer.stream.destroyed, true);
  assert.ok(isTransport('message-too-large', 60, 50)(await over.closed));
  assert.deepEqual(over.messages, []);
});

test('malformed JSON, invalid UTF-8 and protocol errors close the transport with a typed error', async () => {
  const notJson = await openMemory();
  notJson.peer.push(encodeFrame(OPCODE.text, Buffer.from('not json'), null));
  assert.ok(isTransport('malformed-json', 8)(await notJson.closed));

  const badUtf8 = await openMemory();
  badUtf8.peer.push(encodeFrame(OPCODE.text, Buffer.from([0x22, 0xff, 0x22]), null));
  assert.ok(isTransport('malformed-json', 3)(await badUtf8.closed));

  const orphan = await openMemory();
  orphan.peer.push(encodeFrame(OPCODE.continuation, Buffer.from('{}'), null));
  assert.ok(isTransport('protocol-error')(await orphan.closed));

  const reserved = await openMemory();
  reserved.peer.push(encodeFrame(3, Buffer.from('{}'), null));
  assert.ok(isTransport('protocol-error')(await reserved.closed));

  const nested = await openMemory();
  nested.peer.push(Buffer.concat([fragment(OPCODE.text, Buffer.from('{')), encodeFrame(OPCODE.text, Buffer.from('{}'), null)]));
  assert.ok(isTransport('protocol-error')(await nested.closed));
});

test('a cut body is a lost connection; a client close or a server close frame is a normal close', async () => {
  const cut = await openMemory();
  cut.peer.push(encodeFrame(OPCODE.text, Buffer.from('{"id":1,"result":{}}'), null).subarray(0, 8));
  cut.peer.hangUp();
  assert.ok(isTransport('connection-lost')(await cut.closed));

  const client = await openMemory();
  client.transport.close();
  assert.equal(client.peer.ended(), true);
  client.peer.hangUp();
  assert.equal(await client.closed, undefined);

  const server = await openMemory();
  server.peer.push(encodeFrame(OPCODE.close, Buffer.alloc(0), null));
  server.peer.hangUp();
  assert.equal(await server.closed, undefined);
});

test('RpcError keeps code, size and limit of the transport failure for pending and later calls', async () => {
  const peer = memoryPeer();
  const session = createRpcSession(await connectWebSocket(peer.stream, { timeoutMs: 1000, maxMessageBytes: 64 }), { timeoutMs: 1000 });
  const pending = session.request('thread/items/list', { threadId: 't' });
  peer.push(encodeFrame(OPCODE.text, Buffer.alloc(65, 0x20), null).subarray(0, 2));
  const check = (method: string) => (error: unknown): boolean =>
    error instanceof RpcError && error.method === method && error.code === 'message-too-large' && error.transport?.code === 'message-too-large' && error.transport.size === 65 && error.transport.limit === 64;
  await assert.rejects(pending, check('connection'));
  await assert.rejects(session.request('thread/read'), check('thread/read'));

  const lost = memoryPeer();
  const second = createRpcSession(await connectWebSocket(lost.stream, { timeoutMs: 1000 }), { timeoutMs: 1000 });
  const waiting = second.request('thread/read');
  lost.hangUp();
  await assert.rejects(waiting, (error: unknown) => error instanceof RpcError && error.code === 'connection-lost' && error.transport?.code === 'connection-lost');

  const normal = memoryPeer();
  const third = createRpcSession(await connectWebSocket(normal.stream, { timeoutMs: 1000 }), { timeoutMs: 1000 });
  third.close();
  await assert.rejects(third.request('thread/read'), (error: unknown) => error instanceof RpcError && error.code === 'closed' && error.transport === null);
});

test('bytes that come with the handshake answer stay ahead of the chunks that follow it', async () => {
  // The start of a frame arrives with the handshake answer and the rest right after it, before the
  // transport is handed out: the frame is decoded in order, with no protocol error.
  const frame = Buffer.concat([fragment(OPCODE.text, Buffer.from('{"id":1,')), encodeFrame(OPCODE.continuation, Buffer.from('"result":"x"}'), null)]);
  for (const cut of [1, 2, 5, 12, frame.length - 1]) {
    let data: (chunk: Buffer) => void = () => undefined;
    let closed: () => void = () => undefined;
    const stream: ByteStream & { destroyed: boolean } = {
      destroyed: false,
      write: (chunk) => {
        const key = /Sec-WebSocket-Key: (\S+)/.exec(chunk.toString('latin1'))?.[1];
        if (!key) return;
        setImmediate(() => {
          data(Buffer.concat([Buffer.from(`HTTP/1.1 101 Switching Protocols\r\nSec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`, 'latin1'), frame.subarray(0, cut)]));
          data(frame.subarray(cut));
        });
      },
      end: () => undefined,
      destroy: () => {
        if (stream.destroyed) return;
        stream.destroyed = true;
        setImmediate(closed);
      },
      onReady: (listener) => void setImmediate(listener),
      onData: (listener) => void (data = listener),
      onError: () => undefined,
      onClose: (listener) => void (closed = listener),
    };
    const session = createRpcSession(await connectWebSocket(stream, { timeoutMs: 1000 }), { timeoutMs: 1000 });
    assert.equal(await session.request('read'), 'x', `cut at ${cut}`);
    session.close();
  }
});

/** A raw WebSocket server on a test socket (a named pipe on Windows) that runs onOpen after the handshake. */
async function rawDaemon(name: string, onOpen: (socket: Socket) => void): Promise<{ socketPath: string; close(): Promise<void> }> {
  const socketPath = listenPath(path.join(tmp, name));
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('error', () => undefined);
    let head = Buffer.alloc(0);
    let open = false;
    socket.on('data', (chunk: Buffer) => {
      if (open) return;
      head = Buffer.concat([head, chunk]);
      const end = head.indexOf('\r\n\r\n');
      if (end < 0) return;
      const key = /^sec-websocket-key:\s*(\S+)/im.exec(head.subarray(0, end).toString())?.[1] ?? '';
      socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`);
      open = true;
      onOpen(socket);
    });
  });
  await new Promise<void>((resolve) => server.listen(socketPath, resolve));
  return {
    socketPath,
    close: () => new Promise<void>((resolve) => {
      for (const socket of sockets) socket.destroy();
      server.close(() => resolve());
    }),
  };
}

test('real WebSocket on a test socket: 16 MiB message in fragments passes, 16 MiB + 1 frame or message is refused', async () => {
  const half = MAX_MESSAGE_BYTES / 2;
  const json = Buffer.alloc(MAX_MESSAGE_BYTES, 0x20);
  json.write('{"id":1,"result":"x"}', 0);
  const fits = await rawDaemon('f.sock', (socket) => socket.write(Buffer.concat([fragment(OPCODE.text, json.subarray(0, half)), encodeFrame(OPCODE.continuation, json.subarray(half), null)])));
  try {
    const session = createRpcSession(await connectUnixWebSocket(fits.socketPath, { timeoutMs: 2000 }), { timeoutMs: 10_000 });
    assert.equal(await session.request('big'), 'x');
    session.close();
  } finally {
    await fits.close();
  }

  const frame = await rawDaemon('g.sock', (socket) => socket.write(Buffer.from([0x81, 127, 0, 0, 0, 0, 0x01, 0, 0, 0x01])));
  try {
    const session = createRpcSession(await connectUnixWebSocket(frame.socketPath, { timeoutMs: 2000 }), { timeoutMs: 5000 });
    await assert.rejects(session.request('big'), (error: unknown) => error instanceof RpcError && error.code === 'frame-too-large' && error.transport?.size === MAX_FRAME_BYTES + 1 && error.transport.limit === MAX_FRAME_BYTES);
  } finally {
    await frame.close();
  }

  const message = await rawDaemon('h.sock', (socket) => socket.write(Buffer.concat([fragment(OPCODE.text, json.subarray(0, half)), encodeFrame(OPCODE.continuation, Buffer.alloc(half + 1, 0x20), null).subarray(0, 10)])));
  try {
    const session = createRpcSession(await connectUnixWebSocket(message.socketPath, { timeoutMs: 2000 }), { timeoutMs: 5000 });
    await assert.rejects(session.request('big'), (error: unknown) => error instanceof RpcError && error.code === 'message-too-large' && error.transport?.size === MAX_MESSAGE_BYTES + 1 && error.transport.limit === MAX_MESSAGE_BYTES);
  } finally {
    await message.close();
  }
});
