// Transport-agnostic JSON-RPC 2.0 session used for both Codex app-server transports: the stdio
// `codex app-server` (one JSON message per line) and the daemon's WebSocket control socket.

/** A bidirectional message channel carrying parsed JSON-RPC messages. */
export interface RpcTransport {
  send(message: unknown): void;
  /** Registers the handler of incoming messages (one handler per transport). */
  onMessage(handler: (message: unknown) => void): void;
  /** Registers the handler called once when the channel closes (with the reason if it failed). */
  onClose(handler: (error?: Error) => void): void;
  close(): void;
}

/** Error answer of a JSON-RPC call, or a transport failure while waiting for one. */
export class RpcError extends Error {
  readonly code: number | string;
  readonly method: string;
  readonly data: unknown;
  constructor(method: string, code: number | string, message: string, data?: unknown) {
    super(`${method}: ${message}`);
    this.name = 'RpcError';
    this.method = method;
    this.code = code;
    this.data = data;
  }
}

/** A notification received from the server. */
export interface RpcNotification {
  method: string;
  params: unknown;
}

/** One JSON-RPC conversation over a transport. */
export interface RpcSession {
  request<T = unknown>(method: string, params?: unknown, timeoutMs?: number): Promise<T>;
  notify(method: string, params?: unknown): void;
  /** Every notification received so far, in order. */
  readonly notifications: readonly RpcNotification[];
  /** Resolves with the params of the first notification of method (already received or upcoming); undefined on timeout. */
  waitForNotification(method: string, timeoutMs: number): Promise<unknown>;
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
 * Creates a session over transport. Requests from the server (approvals and the like) are
 * answered with "method not found": Workflow Kit never approves anything on the user's behalf.
 */
export function createRpcSession(transport: RpcTransport, options: { timeoutMs?: number } = {}): RpcSession {
  const pending = new Map<number, Pending>();
  const notifications: RpcNotification[] = [];
  const waiters: { method: string; resolve: (params: unknown) => void }[] = [];
  let nextId = 1;
  let closed: Error | null = null;

  const failAll = (error: Error): void => {
    for (const [id, entry] of pending) {
      clearTimeout(entry.timer);
      pending.delete(id);
      entry.reject(error);
    }
  };

  transport.onMessage((message) => {
    if (!isObject(message)) return;
    const id = message['id'];
    const method = message['method'];
    if (typeof method === 'string' && id !== undefined && id !== null) {
      transport.send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Workflow Kit does not handle server requests' } });
      return;
    }
    if (typeof method === 'string') {
      const note = { method, params: message['params'] };
      notifications.push(note);
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
    closed = error ?? new Error('connection closed');
    failAll(new RpcError('connection', 'closed', closed.message));
  });

  return {
    notifications,
    request<T>(method: string, params?: unknown, timeoutMs?: number): Promise<T> {
      if (closed) return Promise.reject(new RpcError(method, 'closed', closed.message));
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
