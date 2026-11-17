import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import WebSocket from 'ws';
import { createHttpServer, createRouter } from '#http-server';
import { createSpeechService, registerSpeechRoutes, speechUpgradeAllowed } from '../src/index.ts';
import type { HelperClient, HelperMessage, SpeechModel } from '../src/index.ts';
const bytes = Buffer.alloc(4), hash = createHash('sha256').update(bytes).digest('hex');
const model: SpeechModel = { id: 'test', name: 'Test', quantization: 'Q8', repository: 'x/y', revision: 'a'.repeat(40), filename: 'm.gguf', sizeBytes: 4, sha256: hash, languages: ['ru'], streaming: true, license: 'MIT', licenseUrl: '', source: '' };
async function fixture(platform: NodeJS.Platform = 'darwin', waitFeed?: () => Promise<void>, failFirst = false) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wfk-speech-service-'));
  await writeFile(path.join(root, 'test.gguf'), bytes);
  const calls: string[] = [];
  let killed = 0, seq = 0;
  const fake = (): HelperClient => ({ closed: Promise.resolve(), close: () => { killed++; }, async request(message) {
    calls.push(message.type);
    if (failFirst) { failFirst = false; throw new Error('worker pipe closed'); }
    if (message.type === 'hello') return { type: 'hello', protocolVersion: 1, sampleRate: 16000 };
    if (message.type === 'load') return { type: 'loaded', backend: 'test' };
    if (message.type === 'begin') return { type: 'ready' };
    if (message.type === 'feed') await waitFeed?.();
    return { type: message.type === 'finish' ? 'final' : 'transcript', eventSeq: ++seq, committed: 'Привет ', tentative: 'мир', truncated: false };
  } });
  const speech = await createSpeechService({ root, settingsFile: path.join(root, 'settings.json'), appDir: root, platform, arch: 'arm64', helperPath: process.execPath, catalog: [model], helperFactory: fake });
  return { root, speech, calls, killed: () => killed, async close() { await speech.close(); await rm(root, { recursive: true, force: true, maxRetries: 5 }); } };
}
test('one owner; feed/finalize order, double finish, model deletion and cancel during preparation', async () => {
  const f = await fixture();
  try {
    const seen: HelperMessage[] = [], lease = f.speech.begin('dictation-one', m => seen.push(m));
    assert.throws(() => f.speech.begin('dictation-two', () => {}), { code: 'speech-busy' });
    await assert.rejects(f.speech.remove('test'), { code: 'speech-busy' });
    assert.throws(() => lease.feed(bytes, 0), { code: 'invalid-audio' });
    await lease.ready;
    const feed = lease.feed(bytes, 0), final = lease.finish();
    assert.equal(lease.finish(), final); await feed; await final;
    assert.deepEqual(f.calls, ['hello', 'load', 'begin', 'feed', 'finish']);
    assert.deepEqual(seen.map(m => m.type), ['ready', 'transcript', 'final']);
    const late = f.speech.begin('dictation-new', () => {}); late.cancel(); late.cancel();
    await assert.rejects(late.ready, { code: 'speech-cancelled' });
    assert.equal((await f.speech.status()).phase, 'idle');
  } finally { await f.close(); }
});
test('bounded audio queue and nonfinite samples are rejected before inference', async () => {
  let release!: () => void; const blocked = new Promise<void>(resolve => release = resolve);
  const f = await fixture('darwin', () => blocked);
  try {
    const lease = f.speech.begin('dictation-audio', () => {}); await lease.ready;
    const nan = Buffer.alloc(4); nan.writeFloatLE(NaN);
    assert.throws(() => lease.feed(nan, 0), { code: 'invalid-audio' });
    const one = lease.feed(Buffer.alloc(64000), 0), two = lease.feed(Buffer.alloc(64000), 1);
    assert.throws(() => lease.feed(bytes, 2), { code: 'speech-overload' });
    release(); await one; await two; lease.cancel(); assert.equal(f.killed(), 1);
  } finally { release(); await f.close(); }
});
for (const platform of ['linux', 'win32'] as const) test(`${platform}: unavailable without starting native code`, async () => {
  const f = await fixture(platform);
  try { assert.equal((await f.speech.status()).available, false); assert.throws(() => f.speech.begin('dictation-os', () => {}), { code: 'speech-unavailable' }); assert.deepEqual(f.calls, []); }
  finally { await f.close(); }
});
test('upgrade requires exact same origin, loopback endpoints and path', () => {
  const req = { url: '/api/speech/stream', method: 'GET', headers: { host: 'localhost:4747', origin: 'http://localhost:4747' }, socket: { localAddress: '127.0.0.1', remoteAddress: '::ffff:127.0.0.1' } };
  const allowed = (r: unknown) => speechUpgradeAllowed(r as Parameters<typeof speechUpgradeAllowed>[0], 4747);
  assert.equal(allowed(req), true);
  for (const origin of [undefined, 'null', 'https://foreign.example', 'http://localhost:1']) assert.equal(allowed({ ...req, headers: { ...req.headers, origin } }), false);
  assert.equal(allowed({ ...req, socket: { ...req.socket, remoteAddress: '100.64.0.1' } }), false);
  assert.equal(allowed({ ...req, headers: { ...req.headers, host: 'foreign.example:4747' } }), false);
  assert.equal(allowed({ ...req, url: '/api/speech/stream?other=1' }), false);
});
test('real HTTP upgrade streams only to the owner; missing origin is refused and shutdown closes connections', async () => {
  const f = await fixture(), router = createRouter(), server = createHttpServer({ router, getInterfaces: () => ({}) });
  const stop = registerSpeechRoutes({ router, server, speech: f.speech });
  const bound = await server.listen(0), base = `127.0.0.1:${bound.port}`;
  const ws = new WebSocket(`ws://${base}/api/speech/stream`, { origin: `http://${base}` });
  try {
    await once(ws, 'open');
    let next = once(ws, 'message'); ws.send(JSON.stringify({ type: 'begin', protocolVersion: 1, dictationId: 'dictation-real' }));
    assert.equal(JSON.parse(String((await next)[0])).type, 'ready');
    next = once(ws, 'message'); ws.send(Buffer.concat([Buffer.alloc(4), bytes]));
    const text = JSON.parse(String((await next)[0])); assert.equal(text.committed, 'Привет '); assert.equal(text.audioSeq, 0);
    next = once(ws, 'message'); ws.send(JSON.stringify({ type: 'finish', dictationId: 'dictation-real' }));
    assert.equal(JSON.parse(String((await next)[0])).type, 'final');
    const denied = new WebSocket(`ws://${base}/api/speech/stream`);
    denied.on('error', () => {}); assert.match(String((await once(denied, 'error'))[0]), /403/);
    const idle = new WebSocket(`ws://${base}/api/speech/stream`, { origin: `http://${base}` });
    await once(idle, 'open'); const closed = once(idle, 'close'); await stop(); await closed;
  } finally { ws.terminate(); await stop(); await server.close(); await f.close(); }
});
test('failed worker is discarded; the next explicit begin creates a healthy runtime', async () => {
  const f = await fixture('darwin', undefined, true);
  try {
    const failed = f.speech.begin('dictation-failed', () => {});
    await assert.rejects(failed.ready, /worker pipe closed/);
    assert.equal((await f.speech.status()).phase, 'idle'); assert.equal(f.killed(), 1);
    const seen: HelperMessage[] = [], retry = f.speech.begin('dictation-retry', message => seen.push(message));
    await retry.ready; await retry.feed(bytes, 0); await retry.finish();
    assert.deepEqual(f.calls, ['hello', 'hello', 'load', 'begin', 'feed', 'finish']);
    assert.equal(seen.at(-1)?.type, 'final');
  } finally { await f.close(); }
});
