import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import { MUTATING_METHODS, checkAccess } from './access.ts';
import { tailscaleAddresses } from './address.ts';
import type { InterfaceMap } from './address.ts';
import { HttpError } from './router.ts';
import type { JsonResult, Router } from './router.ts';
import { findStaticFile, normalizeMount } from './static.ts';
import type { StaticMount } from './static.ts';

/** Options of the HTTP server; interfaces and logging are injected for tests. */
export interface HttpServerOptions {
  router: Router;
  /** Static directories, e.g. the panel at "/". */
  staticMounts?: StaticMount[];
  /** Source of network interfaces (default os.networkInterfaces), read per request. */
  getInterfaces?: () => InterfaceMap;
  /** Log sink for denied requests and handler failures (default: none). */
  log?: (line: string) => void;
  /** Maximum JSON body size in bytes (default 1 MiB). */
  maxBodyBytes?: number;
}

/** A running (or ready to run) backend HTTP server. */
export interface HttpServerHandle {
  readonly server: http.Server;
  addStatic(mount: StaticMount): void;
  /** Listens on all interfaces: "::" dual-stack, falling back to "0.0.0.0" without IPv6. */
  listen(port: number): Promise<{ host: string; port: number }>;
  /** Port actually bound (after listen). */
  port(): number;
  close(): Promise<void>;
}

const BASE_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};

const PANEL_CSP = "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

/** Sends a JSON response with no-store caching. */
export function sendJson(res: http.ServerResponse, status: number, body: unknown, head = false): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    ...BASE_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
  });
  res.end(head ? undefined : text);
}

/** Sends the uniform JSON error shape { error: { code, message, ...details } }. */
export function sendError(
  res: http.ServerResponse,
  status: number,
  code: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): void {
  sendJson(res, status, { error: { ...details, code, message } });
}

async function readJsonBody(req: http.IncomingMessage, limit: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > limit) throw new HttpError(413, 'body-too-large', `Body exceeds ${limit} bytes`);
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (text.trim() === '') return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, 'invalid-json', 'Body is not valid JSON');
  }
}

function isJsonResult(value: unknown): value is JsonResult {
  return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'json';
}

/** Creates the backend HTTP server with the access filter (D8), the route registry and static mounts. */
export function createHttpServer(options: HttpServerOptions): HttpServerHandle {
  const mounts: StaticMount[] = (options.staticMounts ?? []).map(normalizeMount);
  const getInterfaces = options.getInterfaces ?? (() => os.networkInterfaces());
  const log = options.log ?? (() => undefined);
  const maxBody = options.maxBodyBytes ?? 1024 * 1024;
  let boundPort = 0;

  async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const method = (req.method ?? 'GET').toUpperCase();
    const decision = checkAccess(
      {
        method,
        remoteAddress: req.socket.remoteAddress,
        localAddress: req.socket.localAddress,
        host: req.headers.host,
        origin: req.headers.origin,
        contentType: req.headers['content-type'],
      },
      { port: boundPort, tailscaleAddresses: tailscaleAddresses(getInterfaces()) },
    );
    if (!decision.allowed) {
      log(`denied ${method} ${req.url ?? ''} from ${req.socket.remoteAddress ?? '?'}: ${decision.reason}`);
      req.resume();
      sendError(res, 403, 'forbidden', decision.reason);
      return;
    }
    const url = new URL(req.url ?? '/', 'http://localhost');
    let path: string;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      sendError(res, 400, 'bad-path', 'Malformed URL path');
      return;
    }
    if (path === '/api' || path.startsWith('/api/')) {
      await handleApi(req, res, method, path, url.searchParams);
      return;
    }
    req.resume();
    if (method !== 'GET' && method !== 'HEAD') {
      sendError(res, 405, 'method-not-allowed', 'Only GET and HEAD are served here');
      return;
    }
    const found = await findStaticFile(mounts, path);
    if (!found) {
      sendError(res, 404, 'not-found', 'Not found');
      return;
    }
    res.writeHead(200, {
      ...BASE_HEADERS,
      'Content-Type': found.contentType,
      'Content-Length': found.body.length,
      'Cache-Control': 'no-cache',
      'Content-Security-Policy': PANEL_CSP,
    });
    res.end(method === 'HEAD' ? undefined : found.body);
  }

  async function handleApi(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    method: string,
    path: string,
    query: URLSearchParams,
  ): Promise<void> {
    const match = options.router.match(method, path);
    if (match.kind !== 'found') {
      req.resume();
      if (match.kind === 'method-not-allowed') res.setHeader('Allow', match.allow.join(', '));
      const status = match.kind === 'not-found' ? 404 : 405;
      sendError(res, status, match.kind, match.kind === 'not-found' ? 'No such API route' : 'Method not allowed');
      return;
    }
    try {
      const body = MUTATING_METHODS.has(method) ? await readJsonBody(req, maxBody) : (req.resume(), undefined);
      const result = await match.handler({ method, path, query, params: match.params, body, req, res });
      if (res.headersSent) return;
      if (isJsonResult(result)) sendJson(res, result.status, result.body, method === 'HEAD');
      else sendJson(res, 200, result ?? null, method === 'HEAD');
    } catch (error) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      if (error instanceof HttpError) {
        sendError(res, error.status, error.code, error.message, error.details);
        return;
      }
      log(`handler failed for ${method} ${path}: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
      sendError(res, 500, 'internal', 'Internal error');
    }
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      log(`request failed: ${String(error)}`);
      if (!res.headersSent) sendError(res, 500, 'internal', 'Internal error');
      else res.destroy();
    });
  });

  function listenOn(port: number, host: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const onError = (error: Error): void => {
        server.off('listening', onListening);
        reject(error);
      };
      const onListening = (): void => {
        server.off('error', onError);
        resolve();
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen({ port, host, ipv6Only: false });
    });
  }

  return {
    server,
    addStatic(mount) {
      mounts.push(normalizeMount(mount));
    },
    async listen(port) {
      let host = '::';
      try {
        await listenOn(port, host);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'EAFNOSUPPORT' && code !== 'EADDRNOTAVAIL' && code !== 'EINVAL') throw error;
        host = '0.0.0.0';
        await listenOn(port, host);
      }
      boundPort = (server.address() as AddressInfo).port;
      return { host, port: boundPort };
    },
    port: () => boundPort,
    close() {
      return new Promise((resolve, reject) => {
        if (!server.listening) {
          resolve();
          return;
        }
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
    },
  };
}
