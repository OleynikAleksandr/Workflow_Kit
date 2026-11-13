// HTTP client of a local Kimi Code server (docs/planning/M8-kimi-protocol.md, section 10): only
// 127.0.0.1, no redirects, the token read from its file for every request and sent only in the
// Authorization header.
import { readFile } from 'node:fs/promises';

/** Codes of the Kimi answer envelope used by Kit. */
export const KIMI_CODES = {
  badRequest: 40001,
  unauthorized: 40101,
  noProvider: 40110,
  /** No such session (GET, :delete, messages). */
  noSession: 40401,
  promptUsed: 40927,
  remoteControlRuns: 40928,
  foreignSession: 40931,
  reloadNeeded: 40932,
} as const;

/** api: the server answered with code ≠ 0; auth: the token was refused twice; transport: no answer; shape: an answer Kit does not know. */
export type KimiErrorKind = 'api' | 'auth' | 'transport' | 'shape';

/** An error of the Kimi API; only code and msg of the answer are kept (no stack, no data). */
export class KimiError extends Error {
  readonly code: number;
  readonly msg: string;
  readonly kind: KimiErrorKind;
  /** Transport timeout/cancellation provenance; never inferred from an API message. */
  readonly timedOut: boolean;

  constructor(code: number, msg: string, kind: KimiErrorKind = 'api', options: { timedOut?: boolean } = {}) {
    super(msg);
    this.name = 'KimiError';
    this.code = code;
    this.msg = msg;
    this.kind = kind;
    this.timedOut = kind === 'transport' && options.timedOut === true;
  }
}

/** A shape error: the field the client could not use. */
export function shapeError(what: string): KimiError {
  return new KimiError(-2, what, 'shape');
}

/** Text of a Kimi error for the user; a shape error names the Kimi version. */
export function describeKimiError(error: unknown, version: string | null): string {
  if (error instanceof KimiError && error.kind === 'shape') return `неизвестный ответ Kimi ${version ?? ''}`.trim() + ` (${error.msg})`;
  if (error instanceof KimiError && error.kind === 'api') return `Kimi: ${error.msg} (код ${error.code})`;
  return error instanceof Error ? error.message : String(error);
}

/** Options of one request. */
export interface KimiRequestOptions {
  /** Default 10 s. */
  timeoutMs?: number;
  /** False for /healthz: no token is read or sent. */
  auth?: boolean;
  /** Absolute operation deadline, checked again after token IO and on auth retries. */
  deadline?: number;
  /** False for a destructive command that must never be replayed automatically. */
  retryAuth?: boolean;
}

/** Client of one server; every method resolves to the `data` of the envelope. */
export interface KimiClient {
  readonly port: number;
  get(path: string, options?: KimiRequestOptions): Promise<unknown>;
  post(path: string, body: unknown, options?: KimiRequestOptions): Promise<unknown>;
  delete(path: string, options?: KimiRequestOptions): Promise<unknown>;
}

/** Inputs of createKimiClient; fetch is injectable for tests. */
export interface KimiClientOptions {
  port: number;
  tokenFile: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** Default timeout of a request. */
export const KIMI_TIMEOUT_MS = 10_000;

function transportTimedOut(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  let cause = error;
  for (let depth = 0; depth < 4 && cause instanceof Error; depth++) {
    if (cause.name === 'TimeoutError' || cause.name === 'AbortError') return true;
    cause = cause.cause;
  }
  return false;
}

function transportMessage(error: unknown, timedOut: boolean): string {
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
  if (timedOut) return 'сервер Kimi не ответил вовремя';
  return `сервер Kimi недоступен: ${cause instanceof Error ? cause.message : String(cause)}`;
}

/** Creates a client of the server on 127.0.0.1:<port>. */
export function createKimiClient(options: KimiClientOptions): KimiClient {
  const doFetch = options.fetch ?? fetch;
  const readToken = async (): Promise<string> => {
    const token = (await readFile(options.tokenFile, 'utf8').catch(() => '')).trim();
    if (token === '') throw new KimiError(-1, 'нет токена сервера Kimi (server.token)', 'auth');
    return token;
  };

  const once = async (method: string, route: string, body: unknown, request: KimiRequestOptions): Promise<{ status: number; envelope: unknown }> => {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (request.auth !== false) headers['authorization'] = `Bearer ${await readToken()}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    let response: Response;
    let text: string;
    let signal: AbortSignal | undefined;
    try {
      const remaining = request.deadline === undefined ? Number.POSITIVE_INFINITY : request.deadline - Date.now();
      if (remaining <= 0) throw new DOMException('Deadline expired', 'TimeoutError');
      signal = AbortSignal.timeout(Math.min(remaining, request.timeoutMs ?? options.timeoutMs ?? KIMI_TIMEOUT_MS));
      response = await doFetch(`http://127.0.0.1:${options.port}${route}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'error',
        signal,
      });
      text = await response.text();
    } catch (error) {
      const timedOut = transportTimedOut(error, signal);
      throw new KimiError(-1, transportMessage(error, timedOut), 'transport', { timedOut });
    }
    let envelope: unknown;
    try {
      envelope = JSON.parse(text);
    } catch {
      envelope = undefined;
    }
    return { status: response.status, envelope };
  };

  const refused = (answer: { status: number; envelope: unknown }): boolean =>
    answer.status === 401 || (typeof answer.envelope === 'object' && answer.envelope !== null && (answer.envelope as Record<string, unknown>)['code'] === KIMI_CODES.unauthorized);

  const call = async (method: string, route: string, body: unknown, request: KimiRequestOptions = {}): Promise<unknown> => {
    if (!route.startsWith('/api/')) throw new Error(`not a Kimi API path: ${route}`);
    let answer = await once(method, route, body, request);
    // A refused token: the file is read again and the request repeated once.
    if (refused(answer) && request.auth !== false && request.retryAuth !== false) answer = await once(method, route, body, request);
    if (refused(answer)) throw new KimiError(KIMI_CODES.unauthorized, 'сервер Kimi не принял токен', 'auth');
    const envelope = answer.envelope;
    if (typeof envelope !== 'object' || envelope === null || typeof (envelope as Record<string, unknown>)['code'] !== 'number') throw shapeError(`${method} ${route}: нет конверта`);
    const { code, msg, data } = envelope as { code: number; msg?: unknown; data?: unknown };
    if (code !== 0) throw new KimiError(code, typeof msg === 'string' ? msg.slice(0, 300) : `код ${code}`);
    return data;
  };

  return {
    port: options.port,
    get: (route, request) => call('GET', route, undefined, request),
    post: (route, body, request) => call('POST', route, body, request),
    delete: (route, request) => call('DELETE', route, undefined, request),
  };
}
