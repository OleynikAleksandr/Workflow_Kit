// A fake Codex daemon for tests: a WebSocket JSON-RPC server on a unix socket (server frames are
// unmasked, client frames must be masked). It records every request and answers the methods the
// provider uses.
import { createServer } from 'node:net';
import type { Server, Socket } from 'node:net';
import { OPCODE, acceptKey, createFrameDecoder, encodeFrame } from '../src/ws.ts';

/** A request the fake daemon received. */
export interface DaemonCall {
  method: string;
  params: unknown;
}

/** Options of the fake daemon. */
export interface FakeDaemonOptions {
  /** remoteControl/status/changed sent after initialize (default "connected"). */
  remoteControl?: string;
  threadId?: string;
  /** Sends a ping before the first answer and splits answers into fragments (protocol coverage). */
  tricky?: boolean;
  /** Answers the handshake with this status line instead of 101. */
  refuse?: string;
}

/** A running fake daemon. */
export interface FakeDaemon {
  socketPath: string;
  calls: DaemonCall[];
  pongs: number;
  close(): Promise<void>;
}

function sendJson(socket: Socket, message: unknown, tricky: boolean): void {
  const payload = Buffer.from(JSON.stringify(message));
  if (!tricky || payload.length < 4) {
    socket.write(encodeFrame(OPCODE.text, payload, null));
    return;
  }
  const half = Math.floor(payload.length / 2);
  const first = encodeFrame(OPCODE.text, payload.subarray(0, half), null);
  first[0] = OPCODE.text; // FIN cleared: a fragment.
  socket.write(first);
  socket.write(encodeFrame(OPCODE.continuation, payload.subarray(half), null));
}

/** Starts the fake daemon on socketPath. */
export async function startFakeDaemon(socketPath: string, options: FakeDaemonOptions = {}): Promise<FakeDaemon> {
  const calls: DaemonCall[] = [];
  const sockets = new Set<Socket>();
  const daemon: FakeDaemon = { socketPath, calls, pongs: 0, close: async () => undefined };
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => undefined);
    let head = Buffer.alloc(0);
    let open = false;
    let pinged = false;
    const decode = createFrameDecoder();
    const tricky = options.tricky === true;
    const answer = (id: unknown, result: unknown): void => {
      if (tricky && !pinged) {
        pinged = true;
        socket.write(encodeFrame(OPCODE.ping, Buffer.from('hi'), null));
      }
      sendJson(socket, { jsonrpc: '2.0', id, result }, tricky);
    };
    socket.on('data', (chunk: Buffer) => {
      if (!open) {
        head = Buffer.concat([head, chunk]);
        const end = head.indexOf('\r\n\r\n');
        if (end < 0) return;
        if (options.refuse) {
          socket.end(`${options.refuse}\r\n\r\n`);
          return;
        }
        const key = /^sec-websocket-key:\s*(\S+)/im.exec(head.subarray(0, end).toString())?.[1] ?? '';
        socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`);
        open = true;
        chunk = head.subarray(end + 4);
        if (chunk.length === 0) return;
      }
      for (const frame of decode(chunk)) {
        if (frame.opcode === OPCODE.pong) daemon.pongs += 1;
        if (frame.opcode === OPCODE.close) socket.end();
        if (frame.opcode !== OPCODE.text) continue;
        const message = JSON.parse(frame.payload.toString()) as { id?: unknown; method: string; params?: unknown };
        calls.push({ method: message.method, params: message.params });
        if (message.id === undefined) continue;
        const threadId = options.threadId ?? '019a0000-0000-7000-8000-000000000001';
        if (message.method === 'initialize') {
          answer(message.id, { userAgent: 'fake-daemon/9.9.9', codexHome: '/fake', platformOs: 'macos' });
          sendJson(socket, { method: 'remoteControl/status/changed', params: { status: options.remoteControl ?? 'connected', serverName: 'fake-mac' } }, tricky);
        } else if (message.method === 'thread/start') {
          answer(message.id, { thread: { id: threadId }, model: 'gpt-fake' });
        } else if (message.method === 'thread/name/set') {
          answer(message.id, {});
        } else if (message.method === 'turn/start') {
          answer(message.id, { turn: { id: 'turn-1' } });
          sendJson(socket, { method: 'turn/completed', params: { threadId } }, tricky);
        } else {
          sendJson(socket, { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'unknown' } }, tricky);
        }
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(socketPath, resolve));
  daemon.close = () =>
    new Promise((resolve) => {
      for (const socket of sockets) socket.destroy();
      server.close(() => resolve());
    });
  return daemon;
}
