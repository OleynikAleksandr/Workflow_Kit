// M44 T004, browser check of the run card (needs a global `playwright` with Chromium):
//   node product-parts/control-panel/clusters/web-panel/modules/session-view/test/m44-run-card.browser.mjs [out dir]
// The real run-model.js and run-card.js with the panel stylesheets in Chromium: a working run
// without the Kit grant shows «Автопилот не получил разрешения Kit», the reason and «Повторить»;
// «Повторить» posts /autopiloting/retry with the run and revision; a granted run shows «Выполняет
// задачи» without it. Dark and light theme, desktop and phone width; no page errors. Exits 1 on
// a failed check and writes <out dir>/m44-run-card.json and screenshots when a dir is given.
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
const REASON = 'AUTOPILOT_MANUAL_REQUIRED: Acceptance criteria 5 need the user\'s manual check.';
for (const theme of ['dark', 'light']) {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 700 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const checks = [];
    try {
      await page.goto(base);
      const seen = await page.evaluate(async ({ theme, reason }) => {
        document.documentElement.dataset.theme = theme;
        const { h } = await import('/dom.js');
        const { runView } = await import('/session-view/run-model.js');
        const { runCard } = await import('/session-view/run-card.js');
        const posts = [];
        const shell = { dom: { h }, api: async (method, url, body) => (posts.push({ method, url, body }), {}) };
        const ctx = { say: () => undefined, requestRefresh: () => undefined };
        const state = (run) => ({ autopiloting: { projects: { p: { runId: 'run-m44', revision: 9, owner: 'claude:s-1', mode: 'full', phase: 'executing', pausedFrom: null, reason: null, nextAction: null, scopeId: 'auto', wait: null, publication: null, ...run } } }, workflow: { projects: { p: {} } } });
        const fixture = document.getElementById('fixture');
        const missing = runCard(shell, runView(state({ authorized: false, reason }), 'p', 'claude:s-1'), 'p', ctx);
        const granted = runCard(shell, runView(state({ authorized: true }), 'p', 'claude:s-1'), 'p', ctx);
        fixture.append(missing, granted);
        const buttons = [...missing.querySelectorAll('button')].map((b) => ({ text: b.textContent, primary: b.classList.contains('primary'), height: b.getBoundingClientRect().height }));
        const retry = [...missing.querySelectorAll('button')].find((b) => b.textContent === 'Повторить');
        retry?.click();
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          stage: missing.querySelector('.sv-run-stage b')?.textContent,
          detail: missing.querySelector('.sv-warn')?.textContent,
          warnTone: missing.classList.contains('sv-run-warn'),
          buttons,
          grantedStage: granted.querySelector('.sv-run-stage b')?.textContent,
          grantedButtons: [...granted.querySelectorAll('button')].map((b) => b.textContent),
          posts,
          overflow: document.documentElement.scrollWidth > window.innerWidth,
        };
      }, { theme, reason: REASON });
      const check = (ok, name) => {
        if (!ok) throw new Error(`${name}: ${JSON.stringify(seen)}`);
        checks.push(name);
      };
      check(seen.stage === 'Автопилот не получил разрешения Kit', 'no-grant label');
      check(seen.detail === REASON, 'the Kit reason');
      check(seen.warnTone, 'warning tone');
      check(seen.buttons[0]?.text === 'Повторить' && seen.buttons[0]?.primary, '«Повторить» first and primary');
      check(seen.buttons.every((b) => b.height >= 32), 'touch targets');
      check(seen.posts.length === 1 && seen.posts[0].method === 'POST' && seen.posts[0].url === '/api/projects/p/autopiloting/retry' && seen.posts[0].body.runId === 'run-m44' && seen.posts[0].body.expectedRevision === 9, 'retry posts the run and revision');
      check(seen.grantedStage === 'Выполняет задачи' && !seen.grantedButtons.includes('Повторить'), 'a granted run works without «Повторить»');
      check(!seen.overflow, 'no horizontal scroll');
      check(errors.length === 0, `no page errors ${errors.join('; ')}`);
      if (out) {
        await mkdir(out, { recursive: true });
        await page.screenshot({ path: path.join(out, `m44-run-card-${theme}-${width}.png`) });
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
if (out) await writeFile(path.join(out, 'm44-run-card.json'), JSON.stringify(results, null, 1));
console.log(JSON.stringify(results));
process.exit(failed ? 1 : 0);
