// Synthetic MediaDevices outcomes; real browser contexts, worklet, bounded port,
// WebSocket, field lifecycle. Hardware permissions are a separate live check.
// node capture-negative.browser.mjs <playwright module> <output directory>
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRouter, createHttpServer } from '#http-server';
import { speechInputMount } from '#speech-input';
import { createSpeechService, registerSpeechRoutes } from '#speech-service';
const [runtime, output] = process.argv.slice(2), loaded = await import(pathToFileURL(runtime).href);
const { chromium } = loaded.default ?? loaded;
await mkdir(output, { recursive: true });
const tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-speech-negative-'));
const data = Buffer.alloc(4), model = { id: 'test', name: 'Test', quantization: 'Q8', repository: 'test/model', revision: 'a'.repeat(40), filename: 'test.gguf', sizeBytes: 4, sha256: createHash('sha256').update(data).digest('hex'), languages: ['ru'], streaming: true, license: 'MIT', source: '', licenseUrl: '' };
await writeFile(path.join(tmp, 'test.gguf'), data);
await writeFile(path.join(tmp, 'index.html'), '<!doctype html><html lang="ru"><title>Проверка диктовки</title><body><label>Черновик <textarea id="field"></textarea></label><button id="mic">Микрофон</button><p id="status" role="status"></p></body></html>');
const speech = await createSpeechService({ root: tmp, settingsFile: path.join(tmp, 'speech.json'), appDir: tmp, helperPath: process.execPath, platform: 'darwin', arch: 'arm64', catalog: [model], helperFactory: () => {
  let seq = 0;
  return { closed: Promise.resolve(), close() {}, async request(m) {
    if (m.type === 'hello') return { type: 'hello', protocolVersion: 1, sampleRate: 16000 };
    if (m.type === 'load') return { type: 'loaded', backend: 'fixture' };
    if (m.type === 'begin') { seq = 0; return { type: 'ready' }; }
    return { type: m.type === 'finish' ? 'final' : 'transcript', eventSeq: ++seq, committed: 'Сохранённый текст', tentative: '', truncated: false };
  } };
} });
const router = createRouter(), server = createHttpServer({ router, staticMounts: [speechInputMount(), { prefix: '/fixture/', dir: tmp }], getInterfaces: () => ({}) });
const stop = registerSpeechRoutes({ router, server, speech });
const { port } = await server.listen(0), base = `http://127.0.0.1:${port}`;
let browser;
const errors = [], checks = [];
try {
  browser = await chromium.launch(); const page = await browser.newPage();
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });
    const Audio = window.AudioContext, Worklet = window.AudioWorkletNode;
    const p = window.probe = { contexts: [], tracks: [], closedPorts: 0, mode: 'NotAllowedError' };
    window.AudioContext = class extends Audio { constructor(...args) { super(...args); p.contexts.push(this); } };
    window.AudioWorkletNode = class extends Worklet {
      constructor(...args) { super(...args); const close = this.port.close.bind(this.port); this.port.close = () => { p.closedPorts++; close(); }; }
    };
    navigator.mediaDevices.getUserMedia = async () => {
      if (p.mode !== 'stream') throw new DOMException('Raw browser diagnostic', p.mode);
      const c = new Audio(), source = c.createOscillator(), destination = c.createMediaStreamDestination();
      source.connect(destination); source.start(); await c.resume();
      for (const track of destination.stream.getTracks()) {
        p.tracks.push(track); const stop = track.stop.bind(track); let stopped = false;
        track.stop = () => { if (stopped) return; stopped = true; stop(); source.stop(); void c.close().catch(() => {}); };
      }
      return destination.stream;
    };
  });
  await page.goto(base + '/fixture/');
  await page.evaluate(async () => {
    const { attachDictation } = await import('/speech-input/dictation.js');
    const input = document.getElementById('field'), button = document.getElementById('mic'), status = document.getElementById('status');
    window.dictation = attachDictation({ input, button, onText: text => { input.value = text; }, onError: text => { status.textContent = text; } });
  });
  const mic = page.locator('#mic'), field = page.locator('#field'); await mic.waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.getElementById('mic').disabled);
  for (const [mode, text] of [['NotAllowedError', 'Разрешите доступ'], ['NotFoundError', 'Микрофон не найден'], ['NotReadableError', 'Микрофон недоступен']]) {
    await page.evaluate(mode => { window.probe.mode = mode; document.getElementById('status').textContent = ''; }, mode);
    await mic.click(); await page.waitForFunction(text => document.getElementById('status').textContent.includes(text), text);
    await page.waitForFunction(() => window.probe.contexts.every(c => c.state === 'closed'));
    assert.equal(await page.evaluate(() => window.dictation.blockingSend), false);
    checks.push(mode + ': Russian message, context closed, send unblocked');
  }
  await page.evaluate(() => { window.probe.mode = 'stream'; });
  await mic.click(); await page.waitForFunction(() => window.dictation.state === 'listening');
  await page.waitForFunction(() => document.getElementById('field').value.includes('Сохранённый текст'));
  const before = await field.inputValue();
  await page.evaluate(() => { const until = performance.now() + 3000; while (performance.now() < until) { /* stall main only */ } });
  await page.waitForFunction(() => window.dictation.state === 'error');
  assert.match(await page.locator('#status').innerText(), /не успевает/);
  assert.equal(await field.inputValue(), before);
  await page.waitForFunction(() => window.probe.tracks.every(t => t.readyState === 'ended') && window.probe.contexts.every(c => c.state === 'closed'));
  assert.ok(await page.evaluate(() => window.probe.closedPorts > 0));
  checks.push('real worklet/main-thread stall: overload, saved text, track/context/port closed');
  await mic.click(); await page.waitForFunction(() => window.dictation.state === 'listening');
  await page.evaluate(() => window.probe.tracks.at(-1).dispatchEvent(new Event('ended')));
  await page.waitForFunction(() => window.dictation.state === 'error'); assert.match(await page.locator('#status').innerText(), /Микрофон отключён/);
  await page.waitForFunction(() => window.probe.contexts.every(c => c.state === 'closed'));
  checks.push('device ended: Russian error, cleanup');
  for (const action of ['stop', 'cancel']) {
    await mic.click(); await page.waitForFunction(() => window.dictation.state === 'listening');
    if (action === 'stop') await mic.click(); else await page.evaluate(() => window.dictation.cancel());
    await page.waitForFunction(() => window.dictation.state === 'idle');
    await page.waitForFunction(() => window.probe.tracks.every(t => t.readyState === 'ended') && window.probe.contexts.every(c => c.state === 'closed'));
    checks.push(action + ': tracks/context/port closed');
  }
  await field.fill('Ручная правка'); await page.waitForTimeout(300); assert.equal(await field.inputValue(), 'Ручная правка');
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(output, 'capture-negative.png') });
  const result = { ok: true, browser: browser.version(), checks, errors };
  await writeFile(path.join(output, 'capture-negative.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
} finally { await browser?.close(); await stop(); await server.close(); await rm(tmp, { recursive: true, force: true, maxRetries: 5 }); }
