import type { IncomingMessage, ServerResponse } from 'node:http';

/** Error a route handler throws to answer with a JSON error and a status code. */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

/** A JSON answer with an explicit status; plain return values are sent as 200. */
export interface JsonResult {
  readonly kind: 'json';
  readonly status: number;
  readonly body: unknown;
}

/** Builds a JSON answer with a status other than 200 (for example 201 or 202). */
export function jsonResult(status: number, body: unknown): JsonResult {
  return { kind: 'json', status, body };
}

/** What a route handler receives. */
export interface RouteContext {
  method: string;
  /** Decoded path without the query string. */
  path: string;
  query: URLSearchParams;
  /** Values of :name segments of the route pattern. */
  params: Record<string, string>;
  /** Parsed JSON body of a mutating request (undefined when empty or for GET). */
  body: unknown;
  req: IncomingMessage;
  res: ServerResponse;
}

/**
 * Route handler. A returned JsonResult is sent as is, any other value is sent as JSON
 * with status 200; a handler that already wrote the response returns undefined.
 */
export type RouteHandler = (ctx: RouteContext) => unknown;

interface Route {
  method: string;
  pattern: string;
  segments: string[];
  handler: RouteHandler;
}

/** Result of matching a request against the registry. */
export type RouteMatch =
  | { kind: 'found'; handler: RouteHandler; params: Record<string, string> }
  | { kind: 'method-not-allowed'; allow: string[] }
  | { kind: 'not-found' };

/** Registry of API routes; modules add their routes here at startup. */
export interface Router {
  add(method: string, pattern: string, handler: RouteHandler): void;
  get(pattern: string, handler: RouteHandler): void;
  post(pattern: string, handler: RouteHandler): void;
  delete(pattern: string, handler: RouteHandler): void;
  match(method: string, path: string): RouteMatch;
  /** Registered routes as "METHOD pattern", for diagnostics. */
  list(): string[];
}

function splitPath(path: string): string[] {
  return path.split('/').filter((s) => s !== '');
}

function matchSegments(route: string[], actual: string[]): Record<string, string> | undefined {
  if (route.length !== actual.length) return undefined;
  const params: Record<string, string> = {};
  for (let i = 0; i < route.length; i += 1) {
    const expected = route[i]!;
    const value = actual[i]!;
    if (expected.startsWith(':')) params[expected.slice(1)] = value;
    else if (expected !== value) return undefined;
  }
  return params;
}

/** Creates an empty route registry. Patterns are paths with :name segments, e.g. /api/projects/:id. */
export function createRouter(): Router {
  const routes: Route[] = [];
  const router: Router = {
    add(method, pattern, handler) {
      const upper = method.toUpperCase();
      if (!pattern.startsWith('/')) throw new Error(`Route pattern must start with /: ${pattern}`);
      if (routes.some((r) => r.method === upper && r.pattern === pattern)) {
        throw new Error(`Route already registered: ${upper} ${pattern}`);
      }
      routes.push({ method: upper, pattern, segments: splitPath(pattern), handler });
    },
    get: (pattern, handler) => router.add('GET', pattern, handler),
    post: (pattern, handler) => router.add('POST', pattern, handler),
    delete: (pattern, handler) => router.add('DELETE', pattern, handler),
    match(method, path) {
      const upper = method.toUpperCase();
      const actual = splitPath(path);
      const allow: string[] = [];
      for (const route of routes) {
        const params = matchSegments(route.segments, actual);
        if (!params) continue;
        if (route.method === upper || (upper === 'HEAD' && route.method === 'GET')) {
          return { kind: 'found', handler: route.handler, params };
        }
        allow.push(route.method);
      }
      return allow.length > 0 ? { kind: 'method-not-allowed', allow } : { kind: 'not-found' };
    },
    list: () => routes.map((r) => `${r.method} ${r.pattern}`),
  };
  return router;
}
