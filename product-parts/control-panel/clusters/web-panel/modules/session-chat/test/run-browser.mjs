// Owned source server :48762 (panel-shell at /, session-chat at /session-chat/) and Playwright runs
// of the session-chat browser scenarios (M32 T004). Needs a global `playwright` with Chromium.
// Usage: node run-browser.mjs <repo> <out dir> '<scenario file>::<JSON array of configs>' ...
// Writes <out dir>/browser.json; exits 1 when a run fails.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
const [repo, out, ...scenarios] = process.argv.slice(2);
const require = createRequire(path.join(execSync('npm root -g').toString().trim(), 'x.js'));
const { chromium } = require('playwright');
const web = path.join(repo, 'product-parts/control-panel/clusters/web-panel/modules');
const types = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.html': 'text/html' };
const speech = path.join(repo, 'product-parts/speech-input/clusters/browser-input/modules/speech-input/src');
const server = createServer(async (req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (url === '/api/speech') { res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ available: false, supported: false, reason: 'Speech disabled in legacy fixture', models: [] })); return; }
  const file = url.startsWith('/speech-input/') ? path.join(speech, url.slice(14)) : url.startsWith('/session-chat/') ? path.join(web, 'session-chat/src', url.slice(14)) : path.join(web, 'panel-shell/src', url.slice(1));
  try { res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' }).end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const page = await browser.newPage();
const results = [];
let failed = 0;
for (const spec of scenarios) {
  const [file, configJson] = spec.split('::');
  const fn = (0, eval)((await readFile(file, 'utf8')).replaceAll('http://127.0.0.1:48762', baseUrl));
  for (const config of JSON.parse(configJson ?? '[{}]')) {
    try { results.push({ file: path.basename(file), ok: true, ...(await fn(page, config)) }); }
    catch (error) { failed += 1; results.push({ file: path.basename(file), ok: false, config, error: String(error.message ?? error).slice(0, 500) }); }
  }
}
await browser.close();
server.close();
await writeFile(path.join(out, 'browser.json'), JSON.stringify(results, null, 1));
console.log(JSON.stringify(results.map((r) => ({ file: r.file, ok: r.ok, theme: r.theme, width: r.width, provider: r.provider, checks: r.checks?.length, error: r.error }))));
process.exit(failed ? 1 : 0);
