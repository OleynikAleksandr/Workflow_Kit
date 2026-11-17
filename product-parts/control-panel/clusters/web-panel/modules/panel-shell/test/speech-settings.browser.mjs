// Real model store/API and production settings DOM, tiny pinned test weights.
// node speech-settings.browser.mjs <playwright entry> <artifact directory>
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { createRouter, createHttpServer } from '#http-server';
import { panelShellMount } from '#panel-shell';
import { createSpeechService, registerSpeechRoutes } from '#speech-service';
const [runtime, output] = process.argv.slice(2);
const module = await import(pathToFileURL(runtime).href), { chromium } = module.default ?? module;
await mkdir(output, { recursive: true });
const bytes = new Uint8Array([1, 2, 3, 4]), hash = createHash('sha256').update(bytes).digest('hex');
const results = [];
for (const theme of ['dark', 'light']) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wfk-speech-settings-'));
  const catalog = ['one', 'two'].map(id => ({ id, name: 'Voxtral Test', quantization: id === 'one' ? 'Q8_0' : 'Q4_K_M', repository: 'test/model', revision: 'b'.repeat(40), filename: `${id}.gguf`, sizeBytes: 4, sha256: hash, languages: ['ru'], streaming: true, license: 'Apache-2.0', licenseUrl: 'https://www.apache.org/licenses/LICENSE-2.0', source: 'https://huggingface.co' }));
  await writeFile(path.join(root, 'one.gguf'), bytes);
  await writeFile(path.join(root, 'index.html'), '<!doctype html><html><head><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/layout.css"><link rel="stylesheet" href="/controls.css"><link rel="stylesheet" href="/buttons.css"></head><body><main id="fixture"></main></body></html>');
  let controller;
  const speech = await createSpeechService({ root, settingsFile: path.join(root, 'speech.json'), appDir: root, helperPath: process.execPath, platform: 'darwin', arch: 'arm64', catalog,
    fetch: async (_url, init) => new Response(new ReadableStream({ start(c) { controller = c; init.signal.addEventListener('abort', () => { try { c.error(new Error('Cancelled')); } catch {} }); } })),
    helperFactory: () => ({ closed: Promise.resolve(), close() {}, async request(m) { if (m.type === 'hello') return { type: 'hello', protocolVersion: 1, sampleRate: 16000 }; if (m.type === 'load') return { type: 'loaded', backend: 'fixture' }; return { type: 'ready' }; } }),
  });
  const router = createRouter(), server = createHttpServer({ router, staticMounts: [panelShellMount(), { prefix: '/fixture/', dir: root }], getInterfaces: () => ({}) });
  const stop = registerSpeechRoutes({ router, server, speech });
  const { port } = await server.listen(0), base = `http://127.0.0.1:${port}`;
  let browser;
  try {
    browser = await chromium.launch(); const page = await browser.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base + '/fixture/');
    await page.evaluate(async theme => {
      document.documentElement.dataset.theme = theme;
      const { createSpeechSettings } = await import('/speech-settings.js');
      const widget = createSpeechSettings(); document.getElementById('fixture').append(widget.element);
      widget.element.style.maxWidth = '760px'; widget.element.style.margin = '24px auto';
      window.speechWidget = widget; await widget.refresh();
    }, theme);
    await page.getByRole('heading', { name: 'Распознавание речи' }).waitFor();
    await writeFile(path.join(output, `${theme}-settings-initial.txt`), await page.locator('body').ariaSnapshot());
    const one = page.locator('[data-model=one]'), two = page.locator('[data-model=two]');
    await two.getByRole('button', { name: 'Скачать', exact: true }).click();
    await two.getByRole('button', { name: 'Отменить загрузку', exact: true }).waitFor();
    await two.getByRole('button', { name: 'Отменить загрузку', exact: true }).focus();
    controller.enqueue(bytes.subarray(0, 2));
    await page.waitForFunction(() => document.querySelector('[data-model=two] progress').value === 2);
    assert.equal(await two.getByRole('button', { name: 'Отменить загрузку', exact: true }).evaluate(n => n === document.activeElement), true);
    await two.getByRole('button', { name: 'Отменить загрузку', exact: true }).click();
    await two.getByRole('button', { name: 'Скачать', exact: true }).waitFor();
    await two.getByRole('button', { name: 'Скачать', exact: true }).click();
    await two.getByRole('button', { name: 'Отменить загрузку', exact: true }).waitFor();
    controller.enqueue(bytes); controller.close();
    await two.getByRole('button', { name: 'Выбрать', exact: true }).waitFor();
    await two.getByRole('button', { name: 'Выбрать', exact: true }).click();
    await two.getByRole('button', { name: 'Выбрана', exact: true }).waitFor();
    assert.equal(JSON.parse(await readFile(path.join(root, 'speech.json'), 'utf8')).selected, 'two');
    const lease = speech.begin('settings-active', () => {}); await lease.ready;
    await page.evaluate(() => window.speechWidget.refresh());
    assert.equal(await two.getByRole('button', { name: 'Удалить', exact: true }).isDisabled(), true);
    assert.equal(await one.getByRole('button', { name: 'Выбрать', exact: true }).isDisabled(), true);
    lease.cancel(); await page.evaluate(() => window.speechWidget.refresh());
    await page.screenshot({ path: path.join(output, `${theme}-settings.png`) });
    await two.getByRole('button', { name: 'Удалить', exact: true }).click();
    await two.getByRole('button', { name: 'Скачать', exact: true }).waitFor();
    await assert.rejects(readFile(path.join(root, 'two.gguf')), { code: 'ENOENT' });
    await page.route('**/api/speech', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ available: false, models: [], reason: 'Диктовка доступна только в локальной панели macOS' }) }));
    await page.evaluate(() => window.speechWidget.refresh());
    await page.getByText('Диктовка доступна только в локальной панели macOS', { exact: true }).waitFor();
    assert.equal(await page.locator('.speech-model-list').isHidden(), true);
    assert.deepEqual(errors, []);
    await page.evaluate(() => window.speechWidget.dispose());
    results.push({ theme, ok: true, checks: ['download/progress', 'focus retained', 'cancel', 'verified installation', 'persisted selection', 'in-use barriers', 'managed removal', 'unavailable', 'no console errors'] });
  } finally { await browser?.close(); await stop(); await server.close(); await rm(root, { recursive: true, force: true, maxRetries: 5 }); }
}
await writeFile(path.join(output, 'settings-results.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
