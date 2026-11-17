// Full production createApp + browser worklet/WebSocket + real Voxtral. Audio source is
// a synthetic MediaStream of supplied Russian WAV, not hardware microphone permission.
// node real-browser.smoke.mjs <playwright> <helper> <Q8 GGUF> <float32 wav> <out>
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, link, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createApp } from '#cli';
const [runtime, helper, model, audioFile, output] = process.argv.slice(2);
const loaded = await import(pathToFileURL(runtime).href), { chromium } = loaded.default ?? loaded;
const temp = await mkdtemp(path.join(os.tmpdir(), 'wfk-speech-app-'));
const root = path.join(temp, 'Диктовка с пробелами');
await mkdir(path.join(root, 'speech', 'models'), { recursive: true }); await mkdir(output, { recursive: true });
await link(model, path.join(root, 'speech', 'models', 'voxtral-q8.gguf'));
const native = path.join(root, 'Речевой помощник'); await link(helper, native);
await writeFile(path.join(root, 'index.html'), '<!doctype html><html data-theme="dark"><head><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/layout.css"><link rel="stylesheet" href="/controls.css"><link rel="stylesheet" href="/buttons.css"><link rel="stylesheet" href="/session-chat/session-chat.css"><link rel="stylesheet" href="/session-chat/parameters.css"><link rel="stylesheet" href="/session-chat/claude-controls.css"></head><body><main id="fixture"></main></body></html>');
let app, browser;
try {
  app = await createApp({ env: { ...process.env, WFK_DATA_DIR: root, WFK_PORT: '0', WFK_SPEECH_HELPER: native }, homedir: root, providers: [], getInterfaces: () => ({}) });
  app.server.addStatic({ prefix: '/fixture/', dir: root });
  const audio = await readFile(audioFile);
  app.router.get('/api/speech-test/audio', ({ res }) => { res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': audio.length }); res.end(audio); });
  const { port } = await app.start(), base = `http://127.0.0.1:${port}`;
  browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1100, height: 760 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });
    window.audioFixture = { contexts: [], tracks: [], ended: false };
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext(), source = context.createBufferSource(), destination = context.createMediaStreamDestination();
      source.buffer = await context.decodeAudioData(await (await fetch('/api/speech-test/audio')).arrayBuffer());
      source.connect(destination); await context.resume();
      window.audioFixture.contexts.push(context);
      window.audioFixture.play = () => { window.audioFixture.startedAt = performance.now(); source.start(); };
      source.onended = () => { window.audioFixture.ended = true; };
      for (const track of destination.stream.getTracks()) {
        window.audioFixture.tracks.push(track); const stop = track.stop.bind(track); let stopped = false;
        track.stop = () => { if (stopped) return; stopped = true; stop(); try { source.stop(); } catch {} void context.close().catch(() => {}); };
      }
      return destination.stream;
    };
  });
  await page.goto(base + '/fixture/');
  await page.evaluate(async () => {
    const { h } = await import('/dom.js'), { createComposer } = await import('/session-chat/composer.js');
    const { composerData } = await import('/session-chat/composer-model.js');
    window.sent = [];
    const shell = { dom: { h }, api: async (method, _url, body) => { if (method === 'GET') return { supported: false }; window.sent.push(body); return { sent: true }; } };
    const composer = createComposer({ shell, projectId: 'native', key: 'claude:fixture', provider: 'claude', onSent() {} });
    const card = h('section', { class: 'panel sc-card' }, [h('h2', {}, ['Настоящий Voxtral: поток в черновик']), composer.node]);
    card.style.height = '480px'; card.style.maxWidth = '860px'; card.style.margin = '32px auto'; document.getElementById('fixture').append(card);
    composer.update(composerData({}, 'native', 'claude:fixture', 'claude'), () => {}); composer.setVisible(true);
  });
  await page.getByRole('button', { name: 'Начать диктовку', exact: true }).waitFor();
  await writeFile(path.join(output, 'real-browser-initial.txt'), await page.locator('body').ariaSnapshot());
  const input = page.getByRole('textbox', { name: 'Сообщение агенту' });
  await input.fill('Заметка: '); await input.evaluate(n => n.setSelectionRange(n.value.length, n.value.length));
  await page.getByRole('button', { name: 'Начать диктовку', exact: true }).click();
  await page.getByRole('button', { name: 'Слушаю — нажмите, чтобы остановить', exact: true }).waitFor({ timeout: 30000 });
  await page.evaluate(() => window.audioFixture.play());
  await page.waitForFunction(() => document.querySelector('.sc-input').value.length > 'Заметка: '.length + 5, null, { timeout: 15000 });
  const firstTextMs = await page.evaluate(() => performance.now() - window.audioFixture.startedAt);
  const beforeStop = await input.inputValue(); assert.equal(await page.evaluate(() => window.audioFixture.ended), false);
  await page.screenshot({ path: path.join(output, 'real-browser-listening.png') });
  await page.waitForFunction(() => window.audioFixture.ended, null, { timeout: 30000 });
  const startFinalize = performance.now(); await page.getByRole('button', { name: 'Слушаю — нажмите, чтобы остановить', exact: true }).click();
  await page.getByRole('button', { name: 'Начать диктовку', exact: true }).waitFor({ timeout: 15000 });
  const finalizeWithClickMs = performance.now() - startFinalize;
  const text = await input.inputValue();
  assert.match(text, /^Заметка: /); assert.match(text, /модуль/iu); assert.match(text, /распознавания/iu);
  assert.equal(await page.evaluate(() => window.sent.length), 0);
  assert.equal(await page.evaluate(() => window.audioFixture.tracks.every(t => t.readyState === 'ended')), true);
  assert.equal(await page.evaluate(() => window.audioFixture.contexts.every(c => c.state === 'closed')), true);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(output, 'real-browser-final.png') });
  const result = { ok: true, productionApp: true, browser: browser.version(), nativeModel: 'Voxtral Q8_0', source: 'Russian WAV → synthetic MediaStream', firstTextMs, finalizeWithClickMs, beforeStop, text, sent: 0, microphonePermission: 'not tested', backend: (await (await fetch(base + '/api/speech')).json()).backend, errors };
  await writeFile(path.join(output, 'real-browser.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
} finally { await browser?.close(); await app?.stop(); await rm(temp, { recursive: true, force: true, maxRetries: 5 }); }
