// The HTTP client against a local server: the token only in the header, one retry after a refused
// token, no redirects, only code and msg of an error. Same on every OS.
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { inspect } from 'node:util';
import { KimiError, createKimiClient, describeKimiError } from '../src/client.ts';
import { freeLocalPort } from '../src/server.ts';

interface Seen {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: string;
}

type Handler = (seen: Seen, index: number) => { status?: number; headers?: Record<string, string>; body?: string } | 'hang';

async function withServer(handler: Handler, run: (port: number, seen: Seen[], tokenFile: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wfkk-client-'));
  const tokenFile = path.join(dir, 'server.token');
  await writeFile(tokenFile, 'secret-token\n');
  const seen: Seen[] = [];
  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const item: Seen = { method: request.method ?? '', url: request.url ?? '', headers: request.headers, body: Buffer.concat(chunks).toString('utf8') };
      seen.push(item);
      const answer = handler(item, seen.length - 1);
      if (answer === 'hang') return;
      response.writeHead(answer.status ?? 200, { 'content-type': 'application/json', ...answer.headers });
      response.end(answer.body ?? '');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  try {
    await run((server.address() as AddressInfo).port, seen, tokenFile);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
}

const ok = (data: unknown): { body: string } => ({ body: JSON.stringify({ code: 0, msg: 'success', data }) });
const refused = { status: 401, body: JSON.stringify({ code: 40101, msg: 'Unauthorized', data: null }) };

test('the token goes only in the Authorization header; data of the envelope is returned', async () => {
  await withServer(
    () => ok({ items: [1] }),
    async (port, seen, tokenFile) => {
      const client = createKimiClient({ port, tokenFile });
      assert.deepEqual(await client.get('/api/v1/workspaces'), { items: [1] });
      assert.deepEqual(await client.post('/api/v1/workspaces', { root: '/a' }), { items: [1] });
      assert.equal(seen[0]?.headers.authorization, 'Bearer secret-token');
      assert.equal(seen[0]?.headers.host, `127.0.0.1:${port}`);
      assert.equal(seen[1]?.method, 'POST');
      assert.equal(seen[1]?.body, '{"root":"/a"}');
      for (const item of seen) assert.equal(item.url.includes('secret-token'), false);
    },
  );
});

test('a refused token: the file is read again and the request is repeated once', async () => {
  await withServer(
    (seen) => (seen.headers.authorization === 'Bearer new-token' ? ok('fine') : refused),
    async (port, seen, tokenFile) => {
      // The server was restarted and wrote a new token between the two requests.
      const fetchThenRotate: typeof fetch = async (input, init) => {
        const response = await fetch(input, init);
        await writeFile(tokenFile, 'new-token\n');
        return response;
      };
      assert.equal(await createKimiClient({ port, tokenFile, fetch: fetchThenRotate }).get('/api/v1/meta'), 'fine');
      assert.deepEqual(seen.map((item) => item.headers.authorization), ['Bearer secret-token', 'Bearer new-token']);
    },
  );
  await withServer(
    () => refused,
    async (port, seen, tokenFile) => {
      await assert.rejects(createKimiClient({ port, tokenFile }).get('/api/v1/meta'), (error: unknown) => error instanceof KimiError && error.kind === 'auth' && error.code === 40101);
      assert.equal(seen.length, 2);
      // Without a token file nothing is sent at all.
      await assert.rejects(createKimiClient({ port, tokenFile: path.join(path.dirname(tokenFile), 'missing') }).get('/api/v1/meta'), (error: unknown) => error instanceof KimiError && error.kind === 'auth');
      assert.equal(seen.length, 2);
    },
  );
});

test('a redirect is refused and never followed', async () => {
  await withServer(
    () => ok('other host'),
    async (otherPort, otherSeen) => {
      await withServer(
        () => ({ status: 302, headers: { location: `http://127.0.0.1:${otherPort}/api/v1/meta` } }),
        async (port, seen, tokenFile) => {
          await assert.rejects(createKimiClient({ port, tokenFile }).get('/api/v1/meta'), (error: unknown) => error instanceof KimiError && error.kind === 'transport');
          assert.equal(seen.length, 1);
          assert.equal(otherSeen.length, 0);
        },
      );
    },
  );
});

test('an error keeps only code and msg: stack, data and details are dropped', async () => {
  await withServer(
    () => ({ status: 500, body: JSON.stringify({ code: 40001, msg: 'bad root', data: { secret: 'DATA-SECRET' }, stack: 'STACK-SECRET at server.js:1', details: { more: 'DETAILS-SECRET' } }) }),
    async (port, _seen, tokenFile) => {
      const error = await createKimiClient({ port, tokenFile }).get('/api/v1/workspaces').then(
        () => undefined,
        (reason: unknown) => reason,
      );
      assert.ok(error instanceof KimiError);
      assert.deepEqual([error.code, error.msg, error.kind], [40001, 'bad root', 'api']);
      assert.doesNotMatch(inspect(error, { depth: 5 }) + JSON.stringify(error), /SECRET/);
      assert.equal(describeKimiError(error, '2.5.2'), 'Kimi: bad root (код 40001)');
    },
  );
});

test('an answer that is not an envelope is a shape error naming the Kimi version', async () => {
  await withServer(
    () => ({ body: '<html>hello</html>' }),
    async (port, _seen, tokenFile) => {
      const error = await createKimiClient({ port, tokenFile }).get('/api/v1/meta').then(
        () => undefined,
        (reason: unknown) => reason,
      );
      assert.ok(error instanceof KimiError && error.kind === 'shape');
      assert.match(describeKimiError(error, '2.7.0'), /^неизвестный ответ Kimi 2\.7\.0 /);
    },
  );
});

test('healthz needs no token; only /api/ paths are allowed; a silent server times out', async () => {
  await withServer(
    (seen) => (seen.url === '/api/v1/healthz' ? ok({ ok: true }) : 'hang'),
    async (port, seen, tokenFile) => {
      const client = createKimiClient({ port, tokenFile: path.join(path.dirname(tokenFile), 'missing'), timeoutMs: 150 });
      assert.deepEqual(await client.get('/api/v1/healthz', { auth: false }), { ok: true });
      assert.equal(seen[0]?.headers.authorization, undefined);
      await assert.rejects(client.get('//evil.example/api/'), /not a Kimi API path/);
      await assert.rejects(client.get('@evil.example/api/'), /not a Kimi API path/);
      assert.equal(seen.length, 1);
      const withToken = createKimiClient({ port, tokenFile, timeoutMs: 150 });
      await assert.rejects(withToken.get('/api/v1/meta'), (error: unknown) => error instanceof KimiError && error.kind === 'transport' && /не ответил вовремя/.test(error.msg));
    },
  );
  // Nothing listens: a transport error, not a crash.
  const closed = createKimiClient({ port: await freeLocalPort(), tokenFile: 'unused', timeoutMs: 500 });
  await assert.rejects(closed.get('/api/v1/healthz', { auth: false }), (error: unknown) => error instanceof KimiError && error.kind === 'transport');
});

test('abort can disable auth replay, and an expired absolute deadline sends no request', async () => {
  await withServer(() => ({ status: 401, body: JSON.stringify({ code: 40101, msg: 'Unauthorized' }) }), async (port, seen, tokenFile) => {
    const client = createKimiClient({ port, tokenFile });
    await assert.rejects(client.post('/api/v1/sessions/session_1:abort', {}, { retryAuth: false }), (error: unknown) => error instanceof KimiError && error.kind === 'auth');
    assert.equal(seen.length, 1);
    await assert.rejects(client.post('/api/v1/sessions/session_1:abort', {}, { deadline: Date.now() - 1 }), (error: unknown) => error instanceof KimiError && error.kind === 'transport');
    assert.equal(seen.length, 1);
  });
});

test('transport timeout provenance survives wrapping; ordinary errors and API text do not acquire it', async () => {
  for (const entry of [
    { error: new DOMException('arbitrary text', 'TimeoutError'), timedOut: true },
    { error: new DOMException('arbitrary text', 'AbortError'), timedOut: true },
    { error: new TypeError('wrapped', { cause: new DOMException('expired', 'TimeoutError') }), timedOut: true },
    { error: new TypeError('connection reset'), timedOut: false },
    { error: new Error('сервер Kimi не ответил вовремя'), timedOut: false },
  ]) {
    const client = createKimiClient({ port: 1, tokenFile: 'unused', fetch: async () => { throw entry.error; } });
    await assert.rejects(client.get('/api/v1/meta', { auth: false }), (error: unknown) => {
      assert.ok(error instanceof KimiError);
      assert.equal(error.kind, 'transport');
      assert.equal(error.timedOut, entry.timedOut);
      return true;
    });
  }
  const client = createKimiClient({ port: 1, tokenFile: 'unused', fetch: async () => new Response(JSON.stringify({ code: 50001, msg: 'TimeoutError: сервер Kimi не ответил вовремя' })) });
  await assert.rejects(client.get('/api/v1/meta', { auth: false }), (error: unknown) => {
    assert.ok(error instanceof KimiError);
    assert.equal(error.kind, 'api');
    assert.equal(error.timedOut, false);
    return true;
  });
});

test('an expired request signal remains typed as timeout when fetch throws a generic error', async () => {
  const client = createKimiClient({ port: 1, tokenFile: 'unused', timeoutMs: 1, fetch: async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    throw new TypeError('generic cancellation');
  } });
  await assert.rejects(client.get('/api/v1/meta', { auth: false }), (error: unknown) => error instanceof KimiError && error.kind === 'transport' && error.timedOut);
});
