// Owned ephemeral HTTP server, real browser AudioWorklet/PCM/WebSocket/composer.
// MediaDevices returns a synthetic MediaStream; native recognition/provider I/O are fixtures.
// Real AudioWorklet/resampling/PCM/WebSocket/DOM run; hardware permission is not claimed.
// node speech-question.browser.mjs <absolute playwright entry> <artifact directory>
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
        const { createQuestionCards } = await import('/session-chat/question-card.js');
        const f = window.fixture = { posts: [] };
        f.cards = createQuestionCards({ h, api: async (method, url, body) => {
          if (!url.includes('/questions/') || !url.endsWith('/answer')) throw new Error('A question must use its answer route');
          f.posts.push({ method, url, body }); return { outcome: 'accepted' };
        }, messagesUrl: () => '/api/projects/test/providers/claude/sessions/fixture/messages', link: () => null, changed() {}, repoll() {} });
        f.showQuestion = id => {
          f.question = { id, at: null, afterMessageId: null, state: 'pending', answerable: true,
            parts: [{ id: 'part-one', header: 'Решение', question: 'Что сделать дальше?', options: [{ label: 'Готовый ответ', description: 'Выбрать без диктовки' }], multiSelect: false, allowOther: true }] };
          const node = f.cards.pending(f.question); node.style.maxWidth = '760px'; node.style.margin = '32px auto';
          document.getElementById('fixture').replaceChildren(node); f.cards.keep(new Set([id])); f.cards.setVisible(true);
        };
        f.showQuestion('question-one');
      }, theme);
      let card = page.locator('[data-question="question-one"]');
      await card.locator('.sc-q-other').click();
      await card.getByRole('button', { name: 'Начать диктовку', exact: true }).waitFor();
      await writeFile(path.join(output, `${theme}-question-initial.txt`), await page.locator('body').ariaSnapshot());
      let field = card.getByRole('textbox', { name: 'Свой вариант', exact: true });
      let mic = card.locator('.sc-q-mic');
      await mic.click();
      await page.waitForFunction(() => document.querySelector('.sc-q-other-text').value.includes('Распознанный текст'));
      assert.equal(await card.getByRole('button', { name: 'Отправить', exact: true }).isDisabled(), true);
      await field.press('Control+Enter');
      await card.getByRole('button', { name: 'Отправить', exact: true }).evaluate(n => n.dispatchEvent(new MouseEvent('click', { bubbles: true })));
      assert.equal(await page.evaluate(() => window.fixture.posts.length), 0);
      await page.screenshot({ path: path.join(output, `${theme}-question.png`) });
      await mic.click(); await card.getByRole('button', { name: 'Начать диктовку', exact: true }).waitFor();
      assert.equal(await field.inputValue(), 'Распознанный текст.');
      await card.getByRole('button', { name: 'Отправить', exact: true }).click();
      await page.waitForFunction(() => window.fixture.posts.length === 1);
      const post = await page.evaluate(() => window.fixture.posts[0]);
      assert.ok(post.url.endsWith('/questions/question-one/answer'));
      assert.deepEqual(post.body.answers, { 'part-one': { selected: [], other: 'Распознанный текст.' } });
      await page.evaluate(() => window.fixture.showQuestion('question-two'));
      card = page.locator('[data-question="question-two"]'); await card.locator('.sc-q-other').click();
      field = card.getByRole('textbox', { name: 'Свой вариант', exact: true }); mic = card.locator('.sc-q-mic');
      await card.getByRole('button', { name: 'Начать диктовку', exact: true }).waitFor(); await mic.click();
      await card.getByRole('button', { name: 'Слушаю — нажмите, чтобы остановить', exact: true }).waitFor();
      await field.fill('Ручной ответ сохранён');
      await card.getByRole('button', { name: 'Начать диктовку', exact: true }).waitFor();
      await page.evaluate(() => window.fixture.cards.pending(structuredClone(window.fixture.question)));
      assert.equal(await field.inputValue(), 'Ручной ответ сохранён');
      await mic.click(); await card.getByRole('button', { name: 'Слушаю — нажмите, чтобы остановить', exact: true }).waitFor();
      await card.locator('.sc-q-option').filter({ hasText: 'Готовый ответ' }).click();
      await page.waitForFunction(async () => (await (await fetch('/api/speech')).json()).phase === 'idle');
      assert.equal(await card.locator('.sc-q-dictation').isHidden(), true);
      await card.locator('.sc-q-other').click();
      await mic.click(); await card.getByRole('button', { name: 'Слушаю — нажмите, чтобы остановить', exact: true }).waitFor();
      await page.evaluate(() => window.fixture.cards.setVisible(false));
      await page.waitForFunction(async () => (await (await fetch('/api/speech')).json()).phase === 'idle');
      await page.evaluate(() => window.fixture.cards.setVisible(true));
      await mic.click(); await card.getByRole('button', { name: 'Слушаю — нажмите, чтобы остановить', exact: true }).waitFor();
      await page.evaluate(() => window.fixture.cards.keep(new Set()));
      await page.waitForFunction(async () => (await (await fetch('/api/speech')).json()).phase === 'idle');
      await page.evaluate(() => { const f = window.fixture; document.getElementById('fixture').replaceChildren(f.cards.closed({ ...f.question, state: 'answered', answerable: false, answers: { 'part-one': { selected: [], other: 'Принятый ответ' } } })); });
      await page.getByText('Принятый ответ', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => window.fixture.posts.length), 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      assert.deepEqual(errors, []);
      results.push({ theme, ok: true, checks: ['dictation through writeOther', 'button/keyboard/function send guards', 'answer route only', 'manual edits and poll', 'option change cancels', 'parent hide cancels', 'keep/closed dispose', 'no browser errors'] });
    } catch (error) {
      await page.screenshot({ path: path.join(output, `${theme}-failure.png`) });
      console.error(JSON.stringify({ probe: await page.evaluate(() => ({ events: window.speechProbe.events, contexts: window.speechProbe.contexts.map(c => ({state:c.state,rate:c.sampleRate})) })), errors, feeds, speech: await speech.status(), dom: await page.locator('body').ariaSnapshot() }, null, 2));
      throw error;
    } finally { await context.close(); }
  }
  assert.ok(feeds > 0); console.log(JSON.stringify({ results, feeds }, null, 2));
  await writeFile(path.join(output, 'question-results.json'), JSON.stringify({ results, feeds }, null, 2));
} finally { await browser?.close(); await stop(); await server.close(); await rm(tmp, { recursive: true, force: true, maxRetries: 5 }); }
