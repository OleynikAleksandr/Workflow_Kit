// Owned ephemeral HTTP server, real browser AudioWorklet/PCM/WebSocket/composer.
// MediaDevices returns a synthetic MediaStream; native recognition/provider I/O are fixtures.
// Real AudioWorklet/resampling/PCM/WebSocket/DOM run; hardware permission is not claimed.
// node speech-composer.browser.mjs <absolute playwright entry> <artifact directory>
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRouter, createHttpServer } from '#http-server';
import { panelShellMount } from '#panel-shell';
import { sessionChatMount } from '#session-chat';
import { speechInputMount } from '#speech-input';
import { createSpeechService, registerSpeechRoutes } from '#speech-service';
const [runtime, output] = process.argv.slice(2);
if (!runtime || !output) throw new Error('Playwright module and output directory required');
const loadedRuntime = await import(pathToFileURL(runtime).href);
const { chromium } = loadedRuntime.default ?? loadedRuntime;
await mkdir(output, { recursive: true });
const tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-speech-browser-'));
const data = Buffer.alloc(4), model = { id: 'test', name: 'Test', quantization: 'Q8', repository: 'test/model', revision: 'a'.repeat(40), filename: 'test.gguf', sizeBytes: 4, sha256: createHash('sha256').update(data).digest('hex'), languages: ['ru'], streaming: true, license: 'MIT', source: '', licenseUrl: '' };
await writeFile(path.join(tmp, 'test.gguf'), data);
await writeFile(path.join(tmp, 'index.html'), '<!doctype html><html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/session-chat/session-chat.css"><link rel="stylesheet" href="/session-chat/parameters.css"><link rel="stylesheet" href="/session-chat/claude-controls.css"></head><body><main id="fixture"></main></body></html>');
let feeds = 0;
const speech = await createSpeechService({ root: tmp, settingsFile: path.join(tmp, 'speech.json'), appDir: tmp, helperPath: process.execPath, platform: 'darwin', arch: 'arm64', catalog: [model], helperFactory: () => {
  let seq = 0;
  return { closed: Promise.resolve(), close() {}, async request(m, pcm) {
    if (m.type === 'hello') return { type: 'hello', protocolVersion: 1, sampleRate: 16000 };
    if (m.type === 'load') return { type: 'loaded', backend: 'fixture' };
    if (m.type === 'begin') { seq = 0; return { type: 'ready' }; }
    if (m.type === 'feed') { assert.ok(pcm.length > 0 && pcm.length <= 64000); feeds++; }
    return { type: m.type === 'finish' ? 'final' : 'transcript', eventSeq: ++seq, committed: 'Распознанный ', tentative: m.type === 'finish' ? 'текст.' : 'текст', truncated: false };
  } };
} });
const router = createRouter(), server = createHttpServer({ router, staticMounts: [panelShellMount(), sessionChatMount(), speechInputMount(), { prefix: '/fixture/', dir: tmp }], getInterfaces: () => ({}) });
const stop = registerSpeechRoutes({ router, server, speech });
const { port } = await server.listen(0), base = `http://127.0.0.1:${port}`;
let browser;
const results = [];
try {
  browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  for (const theme of ['dark', 'light']) {
    const context = await browser.newContext({ viewport: { width: 1100, height: 760 }, permissions: ['microphone'] });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });
      window.speechProbe = { events: [], contexts: [] };
      const Audio = window.AudioContext;
      window.AudioContext = class extends Audio {
        constructor(...args) { super(...args); window.speechProbe.contexts.push(this); window.speechProbe.events.push('context:' + this.state); }
        resume() { window.speechProbe.events.push('resume:' + this.state); return super.resume().then(() => { window.speechProbe.events.push('resumed:' + this.state); }); }
      };
      navigator.mediaDevices.getUserMedia = async () => {
        const context = new Audio(), oscillator = context.createOscillator(), destination = context.createMediaStreamDestination();
        oscillator.connect(destination); oscillator.start(); await context.resume();
        for (const track of destination.stream.getTracks()) {
          const stop = track.stop.bind(track); let stopped = false;
          track.stop = () => { if (stopped) return; stopped = true; stop(); oscillator.stop(); void context.close().catch(() => {}); };
        }
        return destination.stream;
      };
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    try {
      await page.goto(base + '/fixture/');
      await page.evaluate(async theme => {
        document.documentElement.dataset.theme = theme;
        const { h } = await import('/dom.js');
        const { createComposer } = await import('/session-chat/composer.js');
        const { composerData } = await import('/session-chat/composer-model.js');
        const f = window.fixture = { sent: [], interrupts: [], working: false };
        const shell = { dom: { h }, api: async (method, url, body) => {
          if (method === 'GET') return { supported: false };
          if (url.endsWith('/interrupt')) { f.interrupts.push(body); return { stopped: true, status: 'interrupted' }; }
          f.sent.push(body); return { sent: true };
        } };
        const composer = createComposer({ shell, projectId: 'speech', key: 'claude:fixture', provider: 'claude', onSent() {} });
        const card = h('section', { class: 'panel sc-card' }, [h('h2', {}, ['Диалог']), composer.node]);
        card.style.margin = '40px auto'; card.style.maxWidth = '760px'; card.style.padding = '24px';
        document.getElementById('fixture').append(card); composer.setVisible(true);
        f.update = () => composer.update(composerData({ channel: { sessions: [{ projectId: 'speech', key: 'claude:fixture', state: f.working ? 'working' : 'waiting', pending: 0, queued: [] }], interruptions: { speech: { 'claude:fixture': { state: f.working ? 'working' : 'waiting', available: true, reason: '', turnRef: f.working ? 'turn-one' : null, pending: false } } } } }, 'speech', 'claude:fixture', 'claude'), () => {});
        f.hide = () => { composer.setVisible(false); card.hidden = true; };
        f.show = () => { card.hidden = false; composer.setVisible(true); };
        f.update();
      }, theme);
      await page.getByRole('button', { name: 'Начать диктовку', exact: true }).waitFor();
      // Inspect the actual rendered accessibility tree before selecting controls.
      await writeFile(path.join(output, `${theme}-initial.txt`), await page.locator('body').ariaSnapshot());
      const input = page.getByRole('textbox', { name: 'Сообщение агенту' });
      const mic = page.locator('.sc-compose button').filter({ has: page.locator('.sc-icon-mic') });
      await input.fill('До конец'); await input.evaluate(n => n.setSelectionRange(3, 3));
      await mic.click();
      await page.waitForFunction(() => document.querySelector('.sc-input').value.includes('Распознанный текст') || document.querySelector('.sc-speech-status')?.dataset.tone === 'error');
      assert.match(await input.inputValue(), /Распознанный текст/, await page.locator('.sc-speech-status').innerText());
      assert.equal(await mic.getAttribute('aria-pressed'), 'true');
      assert.equal(await page.getByRole('button', { name: 'Вложения — позже' }).isDisabled(), true);
      await input.press('Enter'); await input.press('Control+Enter');
      assert.equal(await page.evaluate(() => window.fixture.sent.length), 0);
      await page.evaluate(() => { window.fixture.working = true; window.fixture.update(); });
      assert.equal(await page.getByRole('button', { name: 'В очередь', exact: true }).isDisabled(), true);
      await page.getByRole('button', { name: 'В очередь', exact: true }).evaluate(n => n.dispatchEvent(new MouseEvent('click', { bubbles: true })));
      assert.equal(await page.evaluate(() => window.fixture.sent.length), 0, 'send function guard survives a synthetic click');
      await page.getByRole('button', { name: 'Остановить ответ', exact: true }).click();
      await page.waitForFunction(() => window.fixture.interrupts.length === 1);
      assert.equal(await mic.getAttribute('aria-pressed'), 'true', 'agent Stop must not cancel dictation');
      await page.screenshot({ path: path.join(output, `${theme}-listening.png`) });
      await mic.click(); await page.getByRole('button', { name: 'Начать диктовку', exact: true }).waitFor();
      assert.equal(await input.inputValue(), 'До Распознанный текст. конец');
      assert.equal(await page.evaluate(() => window.fixture.sent.length), 0);
      await page.evaluate(() => { window.fixture.working = false; window.fixture.update(); });
      await input.press('Enter');
      await page.waitForFunction(() => window.fixture.sent.length === 1);
      assert.equal(await page.evaluate(() => window.fixture.sent[0].text), 'До Распознанный текст. конец');
      await page.waitForFunction(() => document.querySelector('.sc-input').value === '');
      await mic.click(); await page.getByRole('button', { name: 'Слушаю — нажмите, чтобы остановить', exact: true }).waitFor();
      await input.fill('Ручная правка сохранена');
      await page.getByRole('button', { name: 'Начать диктовку', exact: true }).waitFor();
      assert.equal(await input.inputValue(), 'Ручная правка сохранена');
      // A permission answer arriving after cancel must stop every late track.
      await page.evaluate(() => {
        const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        window.fixture.restoreMic = () => { navigator.mediaDevices.getUserMedia = real; };
        navigator.mediaDevices.getUserMedia = async constraints => { await new Promise(resolve => window.fixture.resolveMic = resolve); const stream = await real(constraints); window.fixture.lateTracks = stream.getTracks(); return stream; };
      });
      await mic.click(); await page.waitForFunction(() => !!window.fixture.resolveMic);
      await page.waitForFunction(async () => (await (await fetch('/api/speech')).json()).phase === 'listening');
      await mic.click(); await page.evaluate(() => window.fixture.resolveMic());
      await page.waitForFunction(() => window.fixture.lateTracks?.every(t => t.readyState === 'ended'));
      await page.evaluate(() => window.fixture.restoreMic());
      assert.equal(await input.inputValue(), 'Ручная правка сохранена');
      await mic.click(); await page.getByRole('button', { name: 'Слушаю — нажмите, чтобы остановить', exact: true }).waitFor();
      await page.evaluate(() => window.fixture.hide());
      await page.waitForFunction(async () => (await (await fetch('/api/speech')).json()).phase === 'idle');
      await page.evaluate(() => window.fixture.show());
      await page.screenshot({ path: path.join(output, `${theme}-draft.png`) });
      assert.deepEqual(errors, []);
      results.push({ theme, ok: true, checks: ['synthetic MediaStream + real worklet/PCM/WebSocket', 'snapshots before Stop', 'separate send', 'Enter/queue guards', 'independent agent Stop', 'manual edits', 'late permission cleanup', 'hide cancellation', 'no browser/CSP errors'] });
    } catch (error) {
      await page.screenshot({ path: path.join(output, `${theme}-failure.png`) });
      console.error(JSON.stringify({ probe: await page.evaluate(() => ({ events: window.speechProbe.events, contexts: window.speechProbe.contexts.map(c => ({state:c.state,rate:c.sampleRate})) })), errors, feeds, speech: await speech.status(), dom: await page.locator('body').ariaSnapshot() }, null, 2));
      throw error;
    } finally { await context.close(); }
  }
  assert.ok(feeds > 0); console.log(JSON.stringify({ results, feeds }, null, 2));
  await writeFile(path.join(output, 'composer-results.json'), JSON.stringify({ results, feeds }, null, 2));
} finally { await browser?.close(); await stop(); await server.close(); await rm(tmp, { recursive: true, force: true, maxRetries: 5 }); }
