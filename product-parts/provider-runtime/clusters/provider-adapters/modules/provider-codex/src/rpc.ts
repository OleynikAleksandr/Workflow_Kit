// Transport-agnostic JSON-RPC 2.0 session used for both Codex app-server transports: the stdio
// `codex app-server` (one JSON message per line) and the daemon's WebSocket control socket.

/** A bidirectional message channel carrying parsed JSON-RPC messages. */
export interface RpcTransport {
  send(message: unknown): void;
  /** Registers the handler of incoming messages (one handler per transport); bytes — the payload size when known. */
  onMessage(handler: (message: unknown, bytes?: number) => void): void;
  /** Registers the handler called once when the channel closes (with the reason if it failed). */
  onClose(handler: (error?: Error) => void): void;
  close(): void;
}

/** Why a transport closed with a failure (spec M32 section 2.3); sizes are bytes, never content. */
export type TransportErrorCode = 'frame-too-large' | 'message-too-large' | 'malformed-json' | 'protocol-error' | 'connection-lost';

/** Structured details of a transport failure, kept by RpcError for the callers. */
export interface TransportFailure {
  code: TransportErrorCode;
  /** Declared or received size in bytes (size errors, malformed JSON). */
  size?: number;
  /** The limit that size exceeded. */
  limit?: number;
  /** The errno of a socket or pipe error (ENOENT, ECONNREFUSED, ECONNRESET, EPIPE, …). */
  errno?: string;
}

/** A transport failure: a size limit, malformed JSON, a protocol error or a lost connection. */
export class TransportError extends Error {
  readonly code: TransportErrorCode;
  readonly size: number | undefined;
  readonly limit: number | undefined;
  readonly errno: string | undefined;
  constructor(code: TransportErrorCode, message: string, details: Omit<TransportFailure, 'code'> = {}) {
    super(message);
    this.name = 'TransportError';
    this.code = code;
    this.size = details.size;
    this.limit = details.limit;
    this.errno = details.errno;
  }

  /** The details without the message. */
  failure(): TransportFailure {
    return {
      code: this.code,
      ...(this.size !== undefined ? { size: this.size } : {}),
      ...(this.limit !== undefined ? { limit: this.limit } : {}),
      ...(this.errno !== undefined ? { errno: this.errno } : {}),
    };
  }
}

/**
 * Error answer of a JSON-RPC call, or a transport failure while waiting for one. A transport
 * failure has code = the TransportError code (or "closed" for a normal close, "timeout") and
 * keeps its details in transport.
 */
export class RpcError extends Error {
  readonly code: number | string;
  readonly method: string;
  readonly data: unknown;
  readonly transport: TransportFailure | null;
  constructor(method: string, code: number | string, message: string, data?: unknown, transport: TransportFailure | null = null) {
    super(`${method}: ${message}`);
    this.name = 'RpcError';
    this.method = method;
    this.code = code;
    this.data = data;
    this.transport = transport;
  }
}

/** A notification received from the server. */
export interface RpcNotification {
  method: string;
  params: unknown;
}

/** A request of the server (a question, an approval, …): it has an id and waits for an answer. */
export interface RpcServerRequest {
  id: string | number;
  method: string;
  params: unknown;
}

/** Options of a session; the question listener (spec M33) uses the handlers. */
export interface RpcSessionOptions {
  timeoutMs?: number;
  /** Gets every request of the server; nothing answers it unless the caller calls respond. */
  onRequest?: (request: RpcServerRequest) => void;
  /** Gets every notification. */
  onNotification?: (note: RpcNotification) => void;
  /** false: notifications are not kept (a long connection must not pile them up); default true. */
  keepNotifications?: boolean;
  /** Called once after the transport closed and the pending calls failed. */
  onClose?: (error?: Error) => void;
}

/** One JSON-RPC conversation over a transport. */
export interface RpcSession {
  request<T = unknown>(method: string, params?: unknown, timeoutMs?: number): Promise<T>;
  notify(method: string, params?: unknown): void;
  /** Every notification received so far, in order. */
  readonly notifications: readonly RpcNotification[];
  /** Resolves with the params of the first notification of method (already received or upcoming); undefined on timeout. */
  waitForNotification(method: string, timeoutMs: number): Promise<unknown>;
  /** Payload bytes received so far (answers and notifications; 0 when the transport does not tell). */
  readonly receivedBytes: number;
  /**
   * Stops the session once more than maxBytes were received: the transport is closed and every
   * pending and later call fails with RpcError code "budget-exhausted" (spec M32 section 2.2).
   */
  limitReceived(maxBytes: number): void;
  /** Answers a request of the server with a result (only the question listener does, spec M33). */
  respond(id: string | number, result: unknown): void;
  close(): void;
}

/** Client identity sent with initialize. */
export const CLIENT_INFO = { name: 'workflow-kit', title: 'Workflow Kit', version: '0.1.0' } as const;

/** Default timeout of one request. */
export const RPC_TIMEOUT_MS = 30_000;

type Pending = { method: string; resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Creates a session over transport. Requests from the server (approvals, questions and the like)
 * are never answered, neither with a result nor with an error: an error of any subscriber cancels
 * the question or rejects the approval for every client (spec M33, facts T002 Q6), and without an
 * answer the request stays with ChatGPT. Only the question listener answers, through respond.
 */
export function createRpcSession(transport: RpcTransport, options: RpcSessionOptions = {}): RpcSession {
  const pending = new Map<number, Pending>();
  const notifications: RpcNotification[] = [];
  const waiters: { method: string; resolve: (params: unknown) => void }[] = [];
  let nextId = 1;
  let closed: Error | null = null;
  let received = 0;
  let receiveLimit = Infinity;
  let overBudget = false;
  const exhausted = (): void => {
    if (closed || received <= receiveLimit) return;
    overBudget = true;
    closed = new Error(`received ${received} bytes, budget ${receiveLimit}`);
    failAll(new RpcError('connection', 'budget-exhausted', closed.message));
    transport.close();
  };
  /** The error a call gets once the transport closed: a failure keeps its code and details. */
  const closedError = (method: string): RpcError =>
    closed instanceof TransportError
      ? new RpcError(method, closed.code, closed.message, undefined, closed.failure())
      : overBudget
        ? new RpcError(method, 'budget-exhausted', closed?.message ?? 'budget exhausted')
        : new RpcError(method, 'closed', closed?.message ?? 'connection closed');

  const failAll = (error: Error): void => {
    for (const [id, entry] of pending) {
      clearTimeout(entry.timer);
      pending.delete(id);
      entry.reject(error);
    }
  };

  transport.onMessage((message, bytes) => {
    if (closed) return;
    received += bytes ?? 0;
    if (received > receiveLimit) {
      exhausted();
      return;
    }
    if (!isObject(message)) return;
    const id = message['id'];
    const method = message['method'];
    if (typeof method === 'string' && id !== undefined && id !== null) {
      if (typeof id === 'string' || typeof id === 'number') options.onRequest?.({ id, method, params: message['params'] });
      return;
    }
    if (typeof method === 'string') {
      const note = { method, params: message['params'] };
      if (options.keepNotifications !== false) notifications.push(note);
      options.onNotification?.(note);
      for (const waiter of waiters.filter((w) => w.method === method)) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(note.params);
      }
      return;
    }
    if (typeof id !== 'number') return;
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    clearTimeout(entry.timer);
    const error = message['error'];
    if (isObject(error)) {
      const code = typeof error['code'] === 'number' || typeof error['code'] === 'string' ? error['code'] : 'error';
      entry.reject(new RpcError(entry.method, code, typeof error['message'] === 'string' ? error['message'] : 'error', error['data']));
    } else {
      entry.resolve(message['result']);
    }
  });
  transport.onClose((error) => {
    if (!overBudget) closed = error ?? new Error('connection closed');
    failAll(closedError('connection'));
    options.onClose?.(error);
  });

  return {
    notifications,
    get receivedBytes() {
      return received;
    },
    limitReceived(maxBytes) {
      receiveLimit = maxBytes;
      exhausted();
    },
    request<T>(method: string, params?: unknown, timeoutMs?: number): Promise<T> {
      if (closed) return Promise.reject(closedError(method));
      const id = nextId++;
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new RpcError(method, 'timeout', 'no answer in time'));
        }, timeoutMs ?? options.timeoutMs ?? RPC_TIMEOUT_MS);
        pending.set(id, { method, resolve: resolve as (value: unknown) => void, reject, timer });
        transport.send(params === undefined ? { jsonrpc: '2.0', id, method } : { jsonrpc: '2.0', id, method, params });
      });
    },
    notify(method, params) {
      if (!closed) transport.send(params === undefined ? { jsonrpc: '2.0', method } : { jsonrpc: '2.0', method, params });
    },
    respond(id, result) {
      if (!closed) transport.send({ jsonrpc: '2.0', id, result });
    },
    waitForNotification(method, timeoutMs) {
      const seen = notifications.find((n) => n.method === method);
      if (seen) return Promise.resolve(seen.params);
      return new Promise((resolve) => {
        const waiter = { method, resolve: (params: unknown) => (clearTimeout(timer), resolve(params)) };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(undefined);
        }, timeoutMs);
        waiters.push(waiter);
      });
    },
    close() {
      if (!closed) closed = new Error('closed by client');
      failAll(new RpcError('connection', 'closed', 'closed by client'));
      transport.close();
    },
  };
}

/** Result of initialize (fields Codex 0.166 returns; extra fields are kept). */
export interface InitializeResult {
  userAgent?: string;
  codexHome?: string;
  platformOs?: string;
  [key: string]: unknown;
}

/** initialize → initialized: the handshake every Codex app-server connection starts with. */
export async function initializeSession(session: RpcSession, timeoutMs?: number, experimentalApi = false): Promise<InitializeResult> {
  const result = await session.request<InitializeResult>('initialize', { clientInfo: CLIENT_INFO, ...(experimentalApi ? { capabilities: { experimentalApi: true } } : {}) }, timeoutMs);
  session.notify('initialized');
  return isObject(result) ? result : {};
}
