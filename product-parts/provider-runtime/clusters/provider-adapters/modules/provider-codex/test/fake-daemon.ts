// A fake Codex daemon for tests: a WebSocket JSON-RPC server on a unix socket (server frames are
// unmasked, client frames must be masked). It records every request, answers the methods the
// provider uses and keeps the list of loaded threads like the real daemon: thread/start loads a
// thread, thread/unsubscribe of its last subscriber unloads it, thread/loaded/list lists them.
import { createHash } from 'node:crypto';
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
  /** thread/delete of this thread id answers with a JSON-RPC error (another writer holds it). */
  deleteRefuse?: string;
  /** thread/delete of this thread id answers «no rollout found» (the thread is gone already). */
  deleteGone?: string;
  /** thread/read answers with a JSON-RPC error with this message. */
  readError?: string;
  /** On this method the request is recorded and the connection dropped without an answer (M32 T003). */
  dropOn?: string;
  /** thread/items/list answers with a JSON-RPC error with this message (M32). */
  itemsError?: string;
  /** An answer of a client does not close the request (no serverRequest/resolved, spec M33). */
  silentResolve?: boolean;
  /** Confirm interrupt by a matching completion, state only, or an empty RPC without proof. */
  interruptMode?: 'event' | 'state' | 'empty';
}

/**
 * What thread/read returns for a thread (M18): its status type and turns; historyMode (M32,
 * default paginated) decides how thread/turns/list and thread/items/list answer.
 */
export interface FakeThread {
  status: string;
  turns: unknown[];
  historyMode?: string;
  /** activeFlags of the status (spec M33: waitingOnUserInput, waitingOnApproval). */
  activeFlags?: string[];
}

/** A request the fake sent to the subscribers of a thread (spec M33, T002). */
export interface FakeServerRequest {
  id: number;
  threadId: string;
  method: string;
  params: unknown;
}

type FakeItem = Record<string, unknown> & { id?: string; type?: string };
type FakeTurn = { id: string; status: string; items?: FakeItem[]; [key: string]: unknown };

/** The view of a turn like codex 0.169.0 (M32 T001): notLoaded, summary or full items. */
function turnView(turn: FakeTurn, view: string, legacy: boolean): Record<string, unknown> {
  const items = turn.items ?? [];
  const visible = items.filter((item) => item.type === 'userMessage' || item.type === 'agentMessage');
  const picked = view === 'notLoaded' ? [] : view === 'full' ? (legacy ? visible : items)
    : [visible.find((item) => item.type === 'userMessage'), visible.filter((item) => item.type === 'agentMessage').at(-1)].filter((item): item is FakeItem => item !== undefined);
  return { ...turn, items: picked, itemsView: view };
}

/** thread/turns/list and thread/items/list of the fake (M32): opaque cursors, exclusive item anchors. */
function listAnswer(method: string, params: Record<string, unknown>, thread: FakeThread | undefined): { result?: unknown; error?: { code: number; message: string } } {
  const legacy = (thread?.historyMode ?? 'paginated') === 'legacy';
  const turns = (thread?.turns ?? []) as FakeTurn[];
  const limit = typeof params['limit'] === 'number' ? params['limit'] : 25;
  const page = <T>(all: T[], start: number, tag: string) => {
    const data = all.slice(start, start + limit);
    return { data, next: start + limit < all.length ? `${tag}:${start + limit}` : null };
  };
  const at = (cursor: unknown, tag: string): number | null => {
    if (cursor === null || cursor === undefined) return 0;
    const match = typeof cursor === 'string' ? new RegExp(`^${tag}:(\\d+)$`).exec(cursor) : null;
    return match ? Number(match[1]) : null;
  };
  if (method === 'thread/turns/list') {
    if (turns.length === 0 && !legacy) return { error: { code: -32601, message: 'list_turns is not supported yet' } };
    const ordered = params['sortDirection'] === 'asc' ? turns : [...turns].reverse();
    const start = at(params['cursor'], 't');
    if (start === null) return { error: { code: -32602, message: 'invalid cursor' } };
    const { data, next } = page(ordered, start, 't');
    const view = typeof params['itemsView'] === 'string' ? params['itemsView'] : 'summary';
    return { result: { data: data.map((turn) => turnView(turn, view, legacy)), nextCursor: next, backwardsCursor: null } };
  }
  if (legacy) return { error: { code: -32601, message: 'thread/items/list is not supported yet' } };
  const turn = turns.find((candidate) => candidate.id === params['turnId']);
  if (!turn) return { error: { code: -32602, message: 'turn not found' } };
  const done = (turn.items ?? []).filter((item) => item['pending'] !== true);
  const ordered = params['sortDirection'] === 'desc' ? [...done].reverse() : done;
  const cursor = params['cursor'];
  let start: number | null;
  if (cursor !== null && typeof cursor === 'object') {
    const index = ordered.findIndex((item) => item.id === (cursor as { itemId?: unknown }).itemId);
    start = index < 0 ? null : index + 1;
  } else start = at(cursor, 'i');
  if (start === null) return { error: { code: -32602, message: 'invalid cursor' } };
  const { data, next } = page(ordered, start, 'i');
  return { result: { data: data.map((item) => ({ item, turnId: turn.id, startedAtMs: item['startedAtMs'] ?? null, completedAtMs: null })), nextCursor: next, backwardsCursor: null } };
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
  /**
   * Threads thread/read knows; a thread missing here reads as "idle" when loaded, else
   * "notLoaded", without turns. thread/read never loads a thread (like the real daemon).
   */
  threads: Map<string, FakeThread>;
  /** Payload bytes of every answer sent (M32 budgets). */
  sentBytes: number;
  /** Answers of clients to requests of the server, in order (spec M33). */
  responses: Array<{ id: unknown; result?: unknown; error?: unknown }>;
  /**
   * Sends a request of the server to the subscribers of a thread and keeps it until the first
   * answer (or resolve); a new subscriber gets it again (like the real daemon, T002 Q3).
   */
  ask(threadId: string, method: string, params: unknown): number;
  /** The request was answered elsewhere (in ChatGPT): serverRequest/resolved to the subscribers. */
  resolve(id: number): void;
  /** A notification to the subscribers of a thread. */
  emit(threadId: string, method: string, params: unknown): void;
  /** Requests still waiting for an answer. */
  pendingRequests: Map<number, FakeServerRequest>;
  /** Drops every connection (the server keeps listening). */
  drop(): void;
  close(): Promise<void>;
}

function sendJson(socket: Socket, message: unknown, tricky: boolean, daemon?: FakeDaemon): void {
  const payload = Buffer.from(JSON.stringify(message));
  if (daemon) daemon.sentBytes += payload.length;
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

/**
 * Where the fake daemon listens: the Unix socket path on macOS and Linux; on Windows a named pipe
 * derived from it (Windows refuses a Unix socket in the temporary folder, listen EACCES).
 */
export function listenPath(socketPath: string, platform: NodeJS.Platform = process.platform): string {
  if (platform !== 'win32') return socketPath;
  return `\\\\.\\pipe\\wfk-fake-${createHash('sha256').update(socketPath).digest('hex').slice(0, 16)}`;
}

/** Starts the fake daemon on socketPath (a named pipe on Windows, see listenPath). */
export async function startFakeDaemon(requested: string, options: FakeDaemonOptions = {}): Promise<FakeDaemon> {
  const socketPath = listenPath(requested);
  const calls: DaemonCall[] = [];
  const sockets = new Set<Socket>();
  const loaded = new Set<string>();
  const subscribers = new Map<string, Set<Socket>>();
  /** Idle threads without subscribers: loaded/list calls left before they unload. */
  const idle = new Map<string, number>();
  const archived = new Set<string>();
  const threads = new Map<string, FakeThread>();
  const pendingRequests = new Map<number, FakeServerRequest>();
  let nextRequestId = 100;
  const broadcast = (threadId: string, message: unknown): void => {
    for (const socket of subscribers.get(threadId) ?? []) if (!socket.destroyed) sendJson(socket, message, false);
  };
  const resolveRequest = (id: number): void => {
    const request = pendingRequests.get(id);
    if (!request) return;
    pendingRequests.delete(id);
    broadcast(request.threadId, { method: 'serverRequest/resolved', params: { threadId: request.threadId, requestId: id } });
  };
  const daemon: FakeDaemon = {
    socketPath, calls, pongs: 0, loaded, archived, threads, sentBytes: 0, responses: [], pendingRequests,
    ask(threadId, method, params) {
      const id = nextRequestId++;
      pendingRequests.set(id, { id, threadId, method, params });
      broadcast(threadId, { jsonrpc: '2.0', id, method, params });
      return id;
    },
    resolve: resolveRequest,
    emit: (threadId, method, params) => broadcast(threadId, { method, params }),
    drop: () => { for (const socket of sockets) socket.destroy(); },
    close: async () => undefined,
  };
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
      sendJson(socket, { jsonrpc: '2.0', id, result }, tricky, daemon);
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
        const message = JSON.parse(frame.payload.toString()) as { id?: unknown; method: string; params?: unknown; result?: unknown; error?: unknown };
        if (message.method === undefined) {
          // An answer of the client to a request of the server: the first one closes it for all.
          daemon.responses.push({ id: message.id, ...('result' in message ? { result: message.result } : {}), ...('error' in message ? { error: message.error } : {}) });
          if (typeof message.id === 'number' && !options.silentResolve) resolveRequest(message.id);
          continue;
        }
        calls.push({ method: message.method, params: message.params });
        if (message.method === options.dropOn) {
          socket.destroy();
          return;
        }
        if (message.id === undefined) continue;
        const threadId = options.threadId ?? '019a0000-0000-7000-8000-000000000001';
        if (message.method === 'initialize') {
          answer(message.id, { userAgent: 'fake-daemon/9.9.9', codexHome: '/fake', platformOs: 'macos' });
          if (!options.silentStatus) sendJson(socket, { method: 'remoteControl/status/changed', params: { status: options.remoteControl ?? 'connected', serverName: 'fake-mac' } }, tricky);
        } else if (message.method === 'thread/start') {
          loaded.add(threadId);
          subscribers.set(threadId, new Set([...(subscribers.get(threadId) ?? []), socket]));
          answer(message.id, { thread: { id: threadId }, model: 'gpt-fake' });
        } else if (message.method === 'thread/resume') {
          // Loads a thread again (an idle chat woken in the shared daemon mode, M12).
          const id = String((message.params as { threadId?: unknown } | undefined)?.threadId ?? '');
          loaded.add(id);
          subscribers.set(id, new Set([...(subscribers.get(id) ?? []), socket]));
          answer(message.id, { thread: { id } });
          for (const request of pendingRequests.values()) {
            if (request.threadId === id) sendJson(socket, { jsonrpc: '2.0', id: request.id, method: request.method, params: request.params }, tricky);
          }
        } else if (message.method === 'thread/name/set' && options.nameError) {
          sendJson(socket, { jsonrpc: '2.0', id: message.id, error: { code: -32000, message: options.nameError } }, tricky);
        } else if (message.method === 'thread/name/set') {
          answer(message.id, {});
        } else if (message.method === 'turn/interrupt' && options.interruptMode) {
          const params = message.params as { threadId: string; turnId: string };
          const known = threads.get(params.threadId);
          const turn = known?.turns.find((value) => value && typeof value === 'object' && (value as { id?: string }).id === params.turnId) as { id: string; status: string; items?: unknown[] } | undefined;
          if (!turn || turn.status !== 'inProgress') {
            sendJson(socket, { id: message.id, error: { code: -32000, message: 'expected turn is not active' } }, tricky);
          } else {
            if (options.interruptMode !== 'empty') { turn.status = 'interrupted'; known!.status = 'idle'; }
            answer(message.id, {});
            if (options.interruptMode === 'event') sendJson(socket, { method: 'turn/completed', params: { threadId: params.threadId, turn } }, tricky);
          }
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
          if (id === options.deleteRefuse) sendJson(socket, { jsonrpc: '2.0', id: message.id, error: { code: -32000, message: `thread ${id} already has an active writer` } }, tricky);
          else if (id === options.deleteGone) sendJson(socket, { jsonrpc: '2.0', id: message.id, error: { code: -32600, message: `no rollout found for thread id ${id}` } }, tricky);
          else {
            loaded.delete(id);
            answer(message.id, {});
          }
        } else if (message.method === 'thread/read' && options.readError) {
          sendJson(socket, { jsonrpc: '2.0', id: message.id, error: { code: -32000, message: options.readError } }, tricky);
        } else if (message.method === 'thread/read') {
          const params = (message.params ?? {}) as { threadId?: unknown; includeTurns?: unknown };
          const id = String(params.threadId ?? '');
          const known = threads.get(id);
          const status = known?.status ?? (loaded.has(id) ? 'idle' : 'notLoaded');
          answer(message.id, { thread: { id, status: { type: status, ...(known?.activeFlags ? { activeFlags: known.activeFlags } : {}) }, historyMode: known?.historyMode ?? 'paginated', turns: params.includeTurns === true ? (known?.turns ?? []) : [] } });
        } else if (message.method === 'thread/items/list' && options.itemsError) {
          sendJson(socket, { jsonrpc: '2.0', id: message.id, error: { code: -32000, message: options.itemsError } }, tricky);
        } else if (message.method === 'thread/turns/list' || message.method === 'thread/items/list') {
          const params = (message.params ?? {}) as Record<string, unknown>;
          const listed = listAnswer(message.method, params, threads.get(String(params['threadId'] ?? '')));
          if (listed.error) sendJson(socket, { jsonrpc: '2.0', id: message.id, error: listed.error }, tricky);
          else answer(message.id, listed.result);
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
