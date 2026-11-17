// End to end through an INSTALLED instance (spec speech-integration 2.3): the page is the real
// panel of the instance (/), a composer card is added to it; only the WAV is routed by Playwright.
// dom.js, composer, the speech-input modules, the AudioWorklet, /api/speech and the WebSocket
// come from the running installed service, which runs its own helper (no WFK_SPEECH_HELPER).
// A routed document would count as a public page for Chromium's local network access checks. Audio is a synthetic MediaStream of
// a Russian WAV, not a hardware microphone. Nothing is sent to an agent.
// node installed-browser.smoke.mjs <playwright entry> <instance url> <float32 wav> <out dir>
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [runtime, base, audioFile, output] = process.argv.slice(2);
const loaded = await import(pathToFileURL(runtime).href), { chromium } = loaded.default ?? loaded;
await mkdir(output, { recursive: true });
const state = await (await fetch(`${base}/api/speech`)).json();
assert.equal(state.available, true, `dictation unavailable: ${state.reason ?? JSON.stringify(state)}`);
const audio = await readFile(audioFile);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 760 } }), errors = [], served = new Set();
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', r => { if (r.url().startsWith(base)) served.add(new URL(r.url()).pathname); });
  await page.route(`${base}/installed-fixture/audio.wav`, route => route.fulfill({ status: 200, contentType: 'audio/wav', body: audio }));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });
    window.audioFixture = { contexts: [], tracks: [], ended: false };
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext(), source = context.createBufferSource(), destination = context.createMediaStreamDestination();
      source.buffer = await context.decodeAudioData(await (await fetch('/installed-fixture/audio.wav')).arrayBuffer());
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
  await page.goto(`${base}/`); await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    const { h } = await import('/dom.js'), { createComposer } = await import('/session-chat/composer.js');
    const { composerData } = await import('/session-chat/composer-model.js');
    window.sent = [];
    const shell = { dom: { h }, api: async (method, _url, body) => { if (method === 'GET') return { supported: false }; window.sent.push(body); return { sent: true }; } };
    const composer = createComposer({ shell, projectId: 'installed', key: 'claude:installed', provider: 'claude', onSent() {} });
    const card = h('section', { class: 'panel sc-card' }, [h('h2', {}, ['Установленный экземпляр: поток в черновик']), composer.node]);
    Object.assign(card.style, { position: 'fixed', inset: '32px', zIndex: '1000', height: '480px', maxWidth: '860px', margin: '0 auto' });
    document.head.append(h('link', { rel: 'stylesheet', href: '/session-chat/session-chat.css' })); document.body.append(card);
    composer.update(composerData({}, 'installed', 'claude:installed', 'claude'), () => {}); composer.setVisible(true);
  });
  const mic = page.getByRole('button', { name: 'Начать диктовку', exact: true });
  const listening = page.getByRole('button', { name: 'Слушаю — нажмите, чтобы остановить', exact: true });
  const input = page.getByRole('textbox', { name: 'Сообщение агенту' });
  await mic.waitFor();
  await input.fill('Заметка: '); await input.evaluate(n => n.setSelectionRange(n.value.length, n.value.length));
  await mic.click();
  try { await listening.waitFor({ timeout: 60000 }); } catch (error) {
    await writeFile(path.join(output, 'installed-browser-failure.txt'), `${await page.locator('body').ariaSnapshot()}\n\n${errors.join('\n')}`);
    throw new Error(`${error.message}\nbrowser errors: ${errors.join(' | ') || 'none'}`);
  }
  await page.evaluate(() => window.audioFixture.play());
  await page.waitForFunction(() => document.querySelector('.sc-input').value.length > 'Заметка: '.length + 5, null, { timeout: 20000 });
  const firstTextMs = await page.evaluate(() => performance.now() - window.audioFixture.startedAt);
  await page.waitForFunction(() => window.audioFixture.ended, null, { timeout: 60000 });
  const stopAt = performance.now(); await listening.click(); await mic.waitFor({ timeout: 20000 });
  const stopMs = performance.now() - stopAt;
  const text = await input.inputValue();
  assert.match(text, /^Заметка: /u); assert.match(text, /модуль/iu); assert.match(text, /распознавания/iu);
  assert.equal(await page.evaluate(() => window.sent.length), 0, 'nothing is sent');
  assert.equal(await page.evaluate(() => window.audioFixture.tracks.every(t => t.readyState === 'ended')), true);
  assert.equal(await page.evaluate(() => window.audioFixture.contexts.every(c => c.state === 'closed')), true);
  assert.deepEqual(errors, []);
  for (const asset of ['/dom.js', '/session-chat/composer.js']) assert.ok(served.has(asset), `${asset} from the instance`);
  assert.ok([...served].some(p => p.startsWith('/speech-input/')), 'speech-input assets from the instance');
  await page.screenshot({ path: path.join(output, 'installed-browser-final.png') });
  const after = await (await fetch(`${base}/api/speech`)).json();
  const result = { ok: true, base, browser: browser.version(), source: 'Russian WAV → synthetic MediaStream', speech: { backend: after.backend, selected: after.selected ?? null }, served: [...served].filter(p => /^\/(speech-input\/|session-chat\/composer|dom\.js|api\/speech)/u.test(p)).sort(), firstTextMs, stopMs, text, sent: 0, microphonePermission: 'not tested', errors };
  await writeFile(path.join(output, 'installed-browser.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
