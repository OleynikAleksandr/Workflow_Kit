import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { HttpError, createHttpServer, createRouter, createStateRegistry, jsonResult, registerCoreRoutes } from '../src/index.ts';
import type { HttpServerHandle } from '../src/index.ts';

interface Reply {
  status: number;
  headers: http.IncomingHttpHeaders;
  text: string;
}

let tmp = '';
let handle: HttpServerHandle;
let port = 0;
const logs: string[] = [];

function send(method: string, urlPath: string, headers: Record<string, string> = {}, body?: string): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, method, path: urlPath, headers: { Host: `127.0.0.1:${port}`, ...headers }, setHost: false },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

function jsonHeaders(): Record<string, string> {
  return { Origin: `http://127.0.0.1:${port}`, 'Content-Type': 'application/json' };
}

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-http-'));
  await writeFile(path.join(tmp, 'index.html'), '<!doctype html><title>panel</title>');
  await writeFile(path.join(tmp, 'app.js'), 'export {};');
  await writeFile(path.join(tmp, 'index.ts'), 'secret source');
  await writeFile(path.join(tmp, '.hidden.js'), 'hidden');
  const router = createRouter();
  const state = createStateRegistry();
  state.add('system', () => ({ version: '9.9.9' }));
  registerCoreRoutes(router, state, () => ({ version: '9.9.9' }));
  router.post('/api/echo', (ctx) => jsonResult(201, { received: ctx.body }));
  router.get('/api/items/:id', (ctx) => ({ id: ctx.params['id'], q: ctx.query.get('q') }));
  router.get('/api/teapot', () => {
    throw new HttpError(418, 'teapot', 'short and stout');
  });
  router.get('/api/crash', () => {
    throw new Error('unexpected');
  });
  handle = createHttpServer({ router, staticMounts: [{ prefix: '/', dir: tmp }], getInterfaces: () => ({}), log: (l) => logs.push(l) });
  const bound = await handle.listen(0);
  port = bound.port;
  assert.ok(bound.host === '::' || bound.host === '0.0.0.0');
});

after(async () => {
  await handle.close();
  await rm(tmp, { recursive: true, force: true });
});

test('health and state answer with JSON', async () => {
  const health = await send('GET', '/api/health');
  assert.equal(health.status, 200);
  assert.deepEqual(JSON.parse(health.text), { ok: true, version: '9.9.9' });
  assert.equal(health.headers['cache-control'], 'no-store');
  const state = JSON.parse((await send('GET', '/api/state')).text) as Record<string, unknown>;
  assert.deepEqual(state['system'], { version: '9.9.9' });
  assert.equal(typeof state['generatedAt'], 'string');
});

test('route params, query, JSON bodies and errors', async () => {
  assert.deepEqual(JSON.parse((await send('GET', '/api/items/a%20b?q=1')).text), { id: 'a b', q: '1' });
  const echo = await send('POST', '/api/echo', jsonHeaders(), JSON.stringify({ name: 'x' }));
  assert.equal(echo.status, 201);
  assert.deepEqual(JSON.parse(echo.text), { received: { name: 'x' } });
  const bad = await send('POST', '/api/echo', jsonHeaders(), '{oops');
  assert.equal(bad.status, 400);
  const teapot = await send('GET', '/api/teapot');
  assert.equal(teapot.status, 418);
  assert.deepEqual(JSON.parse(teapot.text), { error: { code: 'teapot', message: 'short and stout' } });
  assert.equal((await send('GET', '/api/crash')).status, 500);
  assert.ok(logs.some((l) => l.includes('unexpected')));
  assert.equal((await send('GET', '/api/nothing')).status, 404);
  const notAllowed = await send('POST', '/api/health', jsonHeaders(), '{}');
  assert.equal(notAllowed.status, 405);
  assert.equal(notAllowed.headers['allow'], 'GET');
});

test('the access filter answers 403 with a JSON error', async () => {
  const wrongHost = await send('GET', '/api/health', { Host: `evil.example:${port}` });
  assert.equal(wrongHost.status, 403);
  assert.equal((JSON.parse(wrongHost.text) as { error: { code: string } }).error.code, 'forbidden');
  assert.equal((await send('GET', '/', { Host: 'localhost:1' })).status, 403);
  assert.equal((await send('POST', '/api/echo', { 'Content-Type': 'application/json' }, '{}')).status, 403);
  const foreignOrigin = { Origin: 'http://evil.example', 'Content-Type': 'application/json' };
  assert.equal((await send('POST', '/api/echo', foreignOrigin, '{}')).status, 403);
  const textBody = { Origin: `http://127.0.0.1:${port}`, 'Content-Type': 'text/plain' };
  assert.equal((await send('POST', '/api/echo', textBody, '{}')).status, 403);
  assert.ok(logs.some((l) => l.startsWith('denied')));
});

test('static files: index, allowed types only, no traversal', async () => {
  const index = await send('GET', '/');
  assert.equal(index.status, 200);
  assert.match(index.headers['content-type'] ?? '', /text\/html/);
  assert.match(String(index.headers['content-security-policy']), /default-src 'self'/);
  assert.equal((await send('GET', '/app.js')).status, 200);
  assert.equal((await send('GET', '/index.ts')).status, 404);
  assert.equal((await send('GET', '/.hidden.js')).status, 404);
  assert.equal((await send('GET', '/%2e%2e/etc/passwd.js')).status, 404);
  assert.equal((await send('GET', '/missing.js')).status, 404);
  assert.equal((await send('POST', '/', jsonHeaders(), '{}')).status, 405);
  const head = await send('HEAD', '/');
  assert.equal(head.status, 200);
  assert.equal(head.text, '');
});
