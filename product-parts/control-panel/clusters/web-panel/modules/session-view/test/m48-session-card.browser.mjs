// M48 T005, browser check of the session autopilot card (needs a global `playwright` with Chromium):
//   node product-parts/control-panel/clusters/web-panel/modules/session-view/test/m48-session-card.browser.mjs [out dir]
// The real session-autopilot-model.js and session-autopilot-card.js with the panel stylesheets in
// Chromium: the three modes with the session's own pressed, the review switch, the last switch, the
// hint about Settings; a press posts the session route with the revision; a refusal shows its line;
// the line that replaces the mode choice and a waiting press. Dark and light theme, desktop and phone
// width; no page errors. Exits 1 on a failed check and writes <out dir>/m48-session-card.json and
// screenshots when a dir is given.
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
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' };
const PAGE = '<!doctype html><html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/buttons.css"><link rel="stylesheet" href="/controls.css"><link rel="stylesheet" href="/session-view/session-view.css"><link rel="stylesheet" href="/session-view/run-card.css"></head><body><main id="fixture" style="max-width:360px;margin:16px"></main></body></html>';
const server = createServer(async (req, res) => {
  const url = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  if (url === '/') return void res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE);
  const file = url.startsWith('/session-view/') ? path.join(modules, 'session-view/src', url.slice(14)) : path.join(modules, 'panel-shell/src', url.slice(1));
  try {
    res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' }).end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
const address = server.address();
const base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/`;
const browser = await chromium.launch();
const results = [];
let failed = 0;
for (const theme of ['dark', 'light']) {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const checks = [];
    try {
      await page.goto(base);
      const seen = await page.evaluate(async ({ theme }) => {
        document.documentElement.dataset.theme = theme;
        const { h } = await import('/dom.js');
        const model = await import('/session-view/session-autopilot-model.js');
        const card = await import('/session-view/session-autopilot-card.js');
        const posts = [];
        let refuse = false;
        const shell = { dom: { h }, api: async (method, url, body) => {
          posts.push({ method, url, body });
          if (refuse) throw Object.assign(new Error('stale'), { code: 'settings-stale' });
          return {};
        } };
        let refreshed = 0;
        const ctx = { say: () => undefined, requestRefresh: () => void (refreshed += 1) };
        const KEY = 'claude:s-1';
        const state = { autopiloting: { sessions: { p: { [KEY]: { revision: 5, mode: 'after-start', review: true, reviewState: 'open', effect: 'Автопилот сессии включён: запуск начнётся после «Начать выполнение плана».' } } }, projects: {} },
          kitWaits: { projects: { p: [{ id: 'w1', action: 'confirm-delivery', state: 'waiting', error: null }] } } };
        const view = model.sessionAutopilotView(state, 'p', KEY);
        const node = card.sessionAutopilotCard(shell, view, 'p', KEY, ctx);
        const fixture = document.getElementById('fixture');
        fixture.append(card.autoChoiceLine(shell, 'Автопилот сам выберет способ выполнения и запустит план.'), card.kitWaitsBlock(shell, model.kitWaitsView(state, 'p')), node);
        const modes = [...node.querySelectorAll('.sv-ap-modes button')].map((b) => ({ text: b.textContent, pressed: b.getAttribute('aria-pressed'), height: b.getBoundingClientRect().height }));
        [...node.querySelectorAll('.sv-ap-modes button')].find((b) => b.textContent === 'Полный')?.click();
        await new Promise((resolve) => setTimeout(resolve, 30));
        refuse = true;
        node.querySelector('.sv-ap-review input')?.click();
        await new Promise((resolve) => setTimeout(resolve, 30));
        return {
          modes,
          review: node.querySelector('.sv-ap-review')?.textContent?.trim(),
          checked: node.querySelector('.sv-ap-review input')?.checked,
          effect: node.querySelector('.sv-ap-effect')?.textContent,
          hint: [...node.querySelectorAll('p.sv-muted')].map((p) => p.textContent).join(' | '),
          posts,
          note: model.cardNotes.get(`p\n${KEY}`),
          refreshed,
          waits: fixture.querySelector('.sv-waits')?.textContent,
          overflow: document.documentElement.scrollWidth > window.innerWidth,
        };
      }, { theme });
      const check = (ok, name) => {
        if (!ok) throw new Error(`${name}: ${JSON.stringify(seen)}`);
        checks.push(name);
      };
      check(seen.modes.map((m) => m.text).join(',') === 'Выкл,После старта,Полный', 'three modes');
      check(seen.modes.find((m) => m.pressed === 'true')?.text === 'После старта', 'the session mode is pressed');
      check(seen.modes.every((m) => m.height >= 32), 'touch targets');
      check(seen.review === 'Ревью спецификации и плана' && seen.checked === false, 'the review switch (the second press unchecked it)');
      check(/запуск начнётся/u.test(seen.effect ?? ''), 'the last switch');
      check(/только для новых сессий/u.test(seen.hint), 'Settings are the defaults of new sessions');
      check(seen.posts[0]?.method === 'POST' && seen.posts[0]?.url === '/api/projects/p/sessions/claude%3As-1/autopiloting' && seen.posts[0]?.body.mode === 'full' && seen.posts[0]?.body.expectedRevision === 5, 'a mode press posts the session route with the revision');
      check(seen.posts[1]?.body.review === false && /другом устройстве/u.test(seen.note ?? '') && seen.refreshed === 2, 'a refusal keeps its line for the next draw');
      check(/«Подтвердить выпуск» ждёт/u.test(seen.waits ?? ''), 'a waiting press');
      check(!seen.overflow, 'no horizontal scroll');
      check(errors.length === 0, `no page errors ${errors.join('; ')}`);
      if (out) {
        await mkdir(out, { recursive: true });
        await page.screenshot({ path: path.join(out, `m48-session-card-${theme}-${width}.png`) });
      }
      results.push({ theme, width, ok: true, checks: checks.length });
    } catch (error) {
      failed += 1;
      results.push({ theme, width, ok: false, error: String(error instanceof Error ? error.message : error).slice(0, 600) });
    }
    await page.close();
  }
}
await browser.close();
server.close();
if (out) await writeFile(path.join(out, 'm48-session-card.json'), JSON.stringify(results, null, 1));
console.log(JSON.stringify(results));
process.exit(failed ? 1 : 0);
