// M45 T003, browser check (needs a global `playwright` with Chromium):
//   node product-parts/control-panel/clusters/web-panel/modules/session-view/test/m45-cards.browser.mjs [out dir]
// The real session-chat composer and the real session-view sidebar slot with the panel stylesheets:
// an answer `undelivered` keeps the text in the input, shows «Сообщение не дошло до Claude: <reason>»
// and «Повторить», which posts the same text again; a `host` project whose next task is a delivery
// in TODO shows «Подтвердить выпуск» with the autopilot of the session off. Dark and light theme,
// desktop and phone width; no page errors. Exits 1 on a failed check; writes <out dir>/m45-cards.json
// and screenshots when a dir is given.
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const out = process.argv[2] ?? null;
const require = createRequire(path.join(execSync('npm root -g').toString().trim(), 'x.js'));
const { chromium } = require('playwright');
const modules = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const speech = path.resolve(modules, '../../../../speech-input/clusters/browser-input/modules/speech-input/src');
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' };
const CSS = ['/styles.css', '/buttons.css', '/controls.css', '/session-chat/session-chat.css', '/session-chat/parameters.css', '/session-chat/claude-controls.css', '/session-view/session-view.css', '/session-view/run-card.css', '/session-view/decision-card.css'];
const PAGE = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">${CSS.map((c) => `<link rel="stylesheet" href="${c}">`).join('')}</head><body style="margin:0"><main id="chat" style="display:flex;flex-direction:column;height:60dvh;padding:16px;box-sizing:border-box"></main><aside id="side" style="max-width:360px;margin:16px"></aside></body></html>`;
const server = createServer(async (req, res) => {
  const url = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  if (url === '/') return void res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE);
  if (url === '/api/speech') return void res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ available: false, supported: false, reason: 'off', models: [] }));
  const file = url.startsWith('/speech-input/') ? path.join(speech, url.slice(14))
    : url.startsWith('/session-chat/') ? path.join(modules, 'session-chat/src', url.slice(14))
    : url.startsWith('/session-view/') ? path.join(modules, 'session-view/src', url.slice(14)) : path.join(modules, 'panel-shell/src', url.slice(1));
  try { res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' }).end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
const address = server.address();
const base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/`;
const browser = await chromium.launch();
const results = [];
let failed = 0;
const REASON = 'Claude не начал ход с этим сообщением: терминал занят или в нём открыт диалог';
for (const theme of ['dark', 'light']) {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const checks = [];
    const check = (value, name) => { if (!value) throw new Error(`${theme}/${width}: ${name}`); checks.push(name); };
    try {
      await page.goto(base);
      await page.evaluate(async ({ theme, reason }) => {
        document.documentElement.dataset.theme = theme;
        const { h } = await import('/dom.js');
        const chat = await import('/session-chat/session-chat.js');
        const view = await import('/session-view/session-view.js');
        const key = 'claude:fixture', projectId = 'p';
        const f = window.fixture = { posts: [], answer: { sent: false, undelivered: { reason } } };
        const slots = {};
        const state = () => ({
          channel: { sessions: [{ projectId, key, state: 'waiting', pending: 0, queued: [] }], interruptions: { [projectId]: { [key]: { available: true, reason: '', turnRef: null, state: 'waiting', pending: false } } } },
          providers: { projects: { [projectId]: { claude: { sessions: [{ localId: 'fixture', model: 'Opus 5.5' }] } } } },
          workflow: { projects: { [projectId]: { decisionsMode: 'host', decisions: [], plan: { scopeId: 'S1', ownerSession: 'fixture', phase: 'running', phaseLabel: 'Выполняется', progress: { done: 4, total: 6 }, progressLabel: 'в main 4 из 6', actions: ['pause'],
            tasks: [{ id: 'T004', title: 'Сценарии', kind: 'work', status: 'DONE', state: 'done', stateLabel: 'готово' }, { id: 'T005', title: 'Поставка 0.20.1', kind: 'delivery', status: 'TODO', state: 'run', stateLabel: 'сейчас', current: true }] } } } },
          autopilot: { sessions: [{ key, enabled: false, last: null }] }, autopiloting: { settings: { mode: 'off' }, projects: {} }, reviews: { projects: { [projectId]: [] } }, review: { projects: {} }, titles: { projects: {} },
        });
        const shell = { registerSlot: (name, definition) => { slots[name] = definition; }, dom: { h }, say: () => undefined, api: async (method, url, body) => {
          if (method === 'GET' && url.endsWith('/messages')) return { supported: true, messages: [] };
          if (method === 'GET' && url === '/api/state') return state();
          if (method === 'GET') return { supported: false };
          f.posts.push({ url, body }); return structuredClone(f.answer);
        } };
        chat.install(shell); view.install(shell);
        const session = { project: { id: projectId }, session: { key, provider: 'claude', providerLabel: 'Claude', name: 'Сессия' } };
        const ctx = { requestRefresh: () => undefined, say: () => undefined };
        const s = state();
        document.getElementById('chat').append(slots.sessionChat.render(slots.sessionChat.select(s, session), s, session, ctx));
        document.getElementById('side').append(slots.sessionSidebar.render(slots.sessionSidebar.select(s, session), s, session, ctx));
      }, { theme, reason: REASON });
      const input = page.locator('.sc-compose textarea');
      await input.fill('Составь спецификацию и план');
      await input.press('Enter');
      await page.waitForSelector('.sc-compose .sc-retry:not([hidden])');
      const status = (await page.locator('.sc-compose .sc-status').innerText()).trim();
      check(status === `Сообщение не дошло до Claude: ${REASON}`, 'the note names the reason');
      check(await input.inputValue() === 'Составь спецификацию и план', 'the text stays in the input');
      const retry = page.locator('.sc-compose .sc-retry');
      check((await retry.innerText()).trim() === 'Повторить', 'the retry button');
      const box = await retry.boundingBox(); check(box && box.height >= 28 && box.x >= 0 && box.x + box.width <= width, 'the retry fits the width');
      if (out) { await mkdir(out, { recursive: true }); await page.locator('#chat').screenshot({ path: path.join(out, `m45-undelivered-${theme}-${width}.png`) }); }
      await page.evaluate(() => { window.fixture.answer = { sent: true }; });
      await retry.click();
      await page.waitForFunction(() => window.fixture.posts.length === 2);
      const posts = await page.evaluate(() => window.fixture.posts.map((p) => p.body.text));
      check(posts[1] === 'Составь спецификацию и план', 'the retry posts the same text');
      await page.waitForFunction(() => document.querySelector('.sc-compose textarea').value === '');
      check(await retry.isHidden(), 'the retry hides after a delivered send');
      const card = page.locator('#side h2', { hasText: 'Подтвердить выпуск' });
      check(await card.count() === 1, 'the delivery card shows with the autopilot of the session off');
      check(await page.locator('#side button', { hasText: 'Подтвердить выпуск' }).count() === 1, 'the delivery button');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      check(!overflow, 'no horizontal scroll');
      check(errors.length === 0, `no page errors (${errors.join('; ')})`);
      if (out) { await mkdir(out, { recursive: true }); await page.screenshot({ path: path.join(out, `m45-${theme}-${width}.png`), fullPage: true }); }
      results.push({ theme, width, ok: true, checks });
    } catch (error) {
      failed += 1;
      results.push({ theme, width, ok: false, error: String(error instanceof Error ? error.message : error).slice(0, 400), checks });
    } finally { await page.close(); }
  }
}
await browser.close();
server.close();
if (out) { await mkdir(out, { recursive: true }); await writeFile(path.join(out, "m45-cards.json"), JSON.stringify(results, null, 1)); }
console.log(JSON.stringify(results.map((r) => ({ theme: r.theme, width: r.width, ok: r.ok, checks: r.checks.length, error: r.error }))));
process.exit(failed ? 1 : 0);
