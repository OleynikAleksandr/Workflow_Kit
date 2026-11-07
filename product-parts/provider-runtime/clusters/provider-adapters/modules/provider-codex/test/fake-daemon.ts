// A fake Codex daemon for tests: a WebSocket JSON-RPC server on a unix socket (server frames are
// unmasked, client frames must be masked). It records every request, answers the methods the
// provider uses and keeps the list of loaded threads like the real daemon: thread/start loads a
// thread, thread/unsubscribe of its last subscriber unloads it, thread/loaded/list lists them.
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
  /** remoteControl/status/changed sent after initialize (default "connected"); read on every connection. */
  remoteControl?: string;
  /** No remoteControl/status/changed at all (a daemon that says nothing in time). */
  silentStatus?: boolean;
  threadId?: string;
  /** Sends a ping before the first answer and splits answers into fragments (protocol coverage). */
  tricky?: boolean;
  /** Answers the handshake with this status line instead of 101. */
  refuse?: string;
  /** turn/start never sends turn/completed (the provider's wait times out). */
  silentTurn?: boolean;
  /** thread/unsubscribe answers with a JSON-RPC error with this message. */
  unsubscribeError?: string;
  /**
   * Like the real daemon (about 60 s, verified 2026-11-05), a thread without subscribers stays
   * loaded: it is unloaded only after this many thread/loaded/list calls (default 0: at once).
   */
  idleUnloadPolls?: number;
  /** thread/archive answers with a JSON-RPC error with this message (a daemon without it). */
  archiveError?: string;
  /** thread/name/set answers with this error. */
  nameError?: string;
  /** thread/delete of this thread id answers with a JSON-RPC error. */
  deleteRefuse?: string;
}

/** A running fake daemon. */
export interface FakeDaemon {
  socketPath: string;
  calls: DaemonCall[];
  pongs: number;
  /** Thread ids currently loaded (what thread/loaded/list returns). */
  loaded: Set<string>;
  /** Thread ids in the archive (thread/archive adds, thread/unarchive removes). */
  archived: Set<string>;
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
  const loaded = new Set<string>();
  const subscribers = new Map<string, Set<Socket>>();
  /** Idle threads without subscribers: loaded/list calls left before they unload. */
  const idle = new Map<string, number>();
  const archived = new Set<string>();
  const daemon: FakeDaemon = { socketPath, calls, pongs: 0, loaded, archived, close: async () => undefined };
  const release = (threadId: string, socket: Socket): 'unsubscribed' | 'notSubscribed' | 'notLoaded' => {
    if (!loaded.has(threadId)) return 'notLoaded';
    const set = subscribers.get(threadId);
    if (!set?.delete(socket)) return 'notSubscribed';
    if (set.size === 0) {
      subscribers.delete(threadId);
      const polls = options.idleUnloadPolls ?? 0;
      if (polls > 0) idle.set(threadId, polls);
      else loaded.delete(threadId);
    }
    return 'unsubscribed';
  };
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    // A closed connection does not unload its threads: the fake keeps them loaded, which is the
    // defect D1 that thread/unsubscribe fixes.
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
          if (!options.silentStatus) sendJson(socket, { method: 'remoteControl/status/changed', params: { status: options.remoteControl ?? 'connected', serverName: 'fake-mac' } }, tricky);
        } else if (message.method === 'thread/start') {
          loaded.add(threadId);
          subscribers.set(threadId, new Set([...(subscribers.get(threadId) ?? []), socket]));
          answer(message.id, { thread: { id: threadId }, model: 'gpt-fake' });
        } else if (message.method === 'thread/name/set' && options.nameError) {
          sendJson(socket, { jsonrpc: '2.0', id: message.id, error: { code: -32000, message: options.nameError } }, tricky);
        } else if (message.method === 'thread/name/set') {
          answer(message.id, {});
        } else if (message.method === 'turn/start') {
          answer(message.id, { turn: { id: 'turn-1' } });
          if (!options.silentTurn) sendJson(socket, { method: 'turn/completed', params: { threadId } }, tricky);
        } else if (message.method === 'thread/unsubscribe' && options.unsubscribeError) {
          sendJson(socket, { jsonrpc: '2.0', id: message.id, error: { code: -32000, message: options.unsubscribeError } }, tricky);
        } else if (message.method === 'thread/unsubscribe') {
          const id = (message.params as { threadId?: unknown } | undefined)?.threadId;
          const status = typeof id === 'string' ? release(id, socket) : 'notLoaded';
          answer(message.id, { status });
          if (typeof id === 'string' && status === 'unsubscribed' && !loaded.has(id)) sendJson(socket, { method: 'thread/closed', params: { threadId: id } }, tricky);
        } else if (message.method === 'thread/archive' && options.archiveError) {
          sendJson(socket, { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: options.archiveError } }, tricky);
        } else if (message.method === 'thread/archive' || message.method === 'thread/unarchive') {
          // Like the real daemon: archive unloads the thread at once, unarchive does not load it.
          const id = String((message.params as { threadId?: unknown } | undefined)?.threadId ?? '');
          if (message.method === 'thread/archive') {
            archived.add(id);
            loaded.delete(id);
            idle.delete(id);
            subscribers.delete(id);
            answer(message.id, {});
          } else {
            archived.delete(id);
            answer(message.id, { thread: { id } });
          }
        } else if (message.method === 'thread/delete') {
          const id = String((message.params as { threadId?: unknown } | undefined)?.threadId ?? '');
          if (id === options.deleteRefuse) sendJson(socket, { jsonrpc: '2.0', id: message.id, error: { code: -32000, message: 'thread is busy' } }, tricky);
          else {
            loaded.delete(id);
            answer(message.id, {});
          }
        } else if (message.method === 'thread/loaded/list') {
          answer(message.id, { data: [...loaded], nextCursor: null });
          for (const [id, left] of idle) {
            if (left > 1) idle.set(id, left - 1);
            else {
              idle.delete(id);
              loaded.delete(id);
            }
          }
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
