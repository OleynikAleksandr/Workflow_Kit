# M28: стенды T007

Дата 14.11.2026, macOS. Сохранённые исходники собственных стендов, не production API.
Живой стенд создаёт изолированный Kit (свой `WFK_DATA_DIR`, порт, только Claude),
временный проект `~/WorkflowKitProjects/M28_t007_*`, подключает неизменённый
`session.exp` и пишет последний кадр `TerminalScreen`. Все действия идут через
настоящие маршруты панели (`message`, `interrupt`, `/api/state`) с заголовком
`Origin`. В конце — архив, остановка и удаление сессии, снятие доверия, удаление
временной папки и записи `~/.claude/projects`, сверка хэша `~/.claude/settings.json`.
Повторный запуск — только в пределах бюджета ходов.

Запуск: `node --experimental-strip-types m28-live.mjs <repo> <result.json>`,
`M28_CHROMIUM=<chrome-headless-shell> node m28-browser.mjs <repo>`.

## Живой стенд (`m28-live.mjs`, прогон 3)

```javascript
// M28 T007 disposable live harness: isolated Kit, temp project, unchanged session.exp observed via
// TerminalScreen frames. Three short Haiku turns; every action goes through the real panel routes.
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
const REPO = process.argv[2]; const OUT = process.argv[3];
const { createApp } = await import(`${REPO}/product-parts/backend-core/clusters/runtime/modules/cli/src/index.ts`);
const { createClaudeProvider, PTY_SCRIPTS } = await import(`${REPO}/product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/index.ts`);
const { installStructure } = await import(`${REPO}/product-parts/backend-core/clusters/projects/modules/kit-structure/src/index.ts`);
await mkdir(path.join(os.homedir(), 'WorkflowKitProjects'), { recursive: true });
const base = await mkdtemp(path.join(os.homedir(), 'WorkflowKitProjects', 'M28_t007_'));
const projectPath = path.join(base, 'project'); const scratch = path.join(base, 'observer');
await mkdir(projectPath, { recursive: true }); await mkdir(scratch, { recursive: true });
const frameFile = path.join(scratch, 'frame.json');
const observer = path.join(scratch, 'screen.mjs');
await writeFile(observer, `import {createInterface} from 'node:readline';
import {writeFileSync} from 'node:fs';
import {TerminalScreen} from '${REPO}/product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/src/index.ts';
const screen = new TerminalScreen();
for await (const line of createInterface({ input: process.stdin })) {
  if (!line.startsWith('DATA ')) continue;
  screen.feed(Buffer.from(line.slice(5), 'hex').toString('utf8'));
  writeFileSync(${JSON.stringify(frameFile)}, JSON.stringify({ at: new Date().toISOString(), text: screen.text() }));
}
`);
const wrapper = path.join(scratch, 'session.exp');
await writeFile(wrapper, `# M28 T007 disposable observation harness. Sources the unchanged production host.
set m28_pipe [open [list | ${process.execPath} ${observer}] w]
fconfigure $m28_pipe -encoding utf-8 -buffering line
rename source m28_source
proc source {args} {
  set result [uplevel 1 [list m28_source {*}$args]]
  if {[file tail [lindex $args end]] eq "interrupt.tcl"} {
    rename interrupt_data m28_interrupt_data
    proc interrupt_data {data} {
      global m28_pipe
      m28_interrupt_data $data
      binary scan [encoding convertto utf-8 $data] H* encoded
      catch {puts $m28_pipe "DATA $encoded"; flush $m28_pipe}
    }
  }
  return $result
}
source ${PTY_SCRIPTS.session}
`);
let provider;
const env = { ...process.env, WFK_DATA_DIR: path.join(base, 'service'), WFK_PORT: '0' };
const app = await createApp({ env, providers: [ctx => (provider = createClaudeProvider(ctx, { scripts: { ...PTY_SCRIPTS, session: wrapper } }))], log: () => {} });
const hooks = []; const match = app.router.match.bind(app.router);
app.router.match = (method, url) => {
  const found = match(method, url);
  if (found.kind !== 'found' || !url.startsWith('/api/hooks/')) return found;
  return { ...found, handler: async ctx => { const input = ctx.body?.input;
    const o = { at: new Date().toISOString(), event: url, hookEvent: input?.hook_event_name ?? null, prompt: typeof input?.prompt === 'string' ? input.prompt.slice(0, 80) : null };
    hooks.push(o); const end = ctx.res.end;
    ctx.res.end = function (chunk, ...args) { o.reply = typeof chunk === 'string' ? chunk.slice(0, 200) : null; return end.call(this, chunk, ...args); };
    return await found.handler(ctx); } };
};
const opened = await app.projects.open(projectPath); const project = opened.project;
const kit = await app.kit.install(projectPath, { name: 'M28 T007 probe' }); if (!kit.ok) throw new Error(JSON.stringify(kit));
await installStructure(projectPath);
await writeFile(path.join(projectPath, '.claude', 'settings.local.json'), JSON.stringify({ model: 'haiku', effortLevel: 'low', fastMode: false, autoCompactWindow: 150000, permissions: { defaultMode: 'default' } }));
await provider.refresh();
const preview = await provider.previewTrust(project);
const trust = await provider.grantTrust(project, preview.token, {});
const defaultsFile = path.join(os.homedir(), '.claude', 'settings.json');
const hash = async () => { try { return createHash('sha256').update(await readFile(defaultsFile)).digest('hex'); } catch { return null; } };
const baselineHash = await hash();
const started = await app.start(); env.WFK_PORT = String(started.port);
const origin = `http://127.0.0.1:${started.port}`;
const log = []; const t0 = Date.now();
const note = (step, data) => { const row = { t: +((Date.now() - t0) / 1000).toFixed(1), step, ...data }; log.push(row); console.log(JSON.stringify(row)); };
const call = async (method, url, body) => { const r = await fetch(origin + url, { method, headers: { 'content-type': 'application/json', origin }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json; try { json = JSON.parse(text); } catch { json = text; } return { status: r.status, body: json }; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const frame = async () => { try { return JSON.parse(await readFile(frameFile, 'utf8')).text; } catch { return ''; } };
const until = async (what, fn, ms) => { const end = Date.now() + ms; while (Date.now() < end) { const v = await fn(); if (v) return v; await sleep(250); } note('timeout', { what }); return null; };
let session = null; let key = null; let turns = 0;
const state = async () => (await call('GET', '/api/state')).body;
const activity = async () => (await state())?.channel?.sessions?.find(s => s.key === key) ?? null;
const interruption = async () => (await state())?.channel?.interruptions?.[project.id]?.[key] ?? null;
const msgUrl = () => `/api/projects/${encodeURIComponent(project.id)}/sessions/${encodeURIComponent(key)}/message`;
const stopUrl = () => `/api/projects/${encodeURIComponent(project.id)}/sessions/${encodeURIComponent(key)}/interrupt`;
const promptCount = () => hooks.filter(h => h.hookEvent === 'UserPromptSubmit').length;
let result = 'ok';
try {
  const T1 = 'Выполни в Bash ровно одну команду: touch m28-probe.txt. Больше ничего не делай.';
  session = await provider.createSession(project, { title: 'M28 T007 probe', firstMessage: T1 });
  note('launched with the first message', { localId: session.localId });
  // Turn 1: permission dialog; a parameter change is refused, a message is queued, Stop is one Esc.
  const first = await until('turn 1 prompt hook', async () => promptCount() > 0, 60000); if (first) turns++;
  const found = await until('channel slot', async () => app.channel.list().find(a => a.projectId === project.id) ?? null, 10000);
  key = found?.key ?? `claude:${session.localId}`;
  note('turn 1 started', { key, localKey: `claude:${session.localId}`, activity: (await activity())?.state });
  const dialog = await until('permission dialog', async () => /Do you want to proceed/.test(await frame()), 60000);
  note('dialog', { seen: Boolean(dialog), interruption: await interruption() });
  const param = await provider.updateParameters(project, session.localId, { effort: 'medium' }).then(r => ({ ok: true, items: (r.items ?? []).map(i => `${i.id}=${i.value}`) }), e => ({ ok: false, code: e?.code ?? null, error: String(e?.message ?? e) }));
  note('parameter change during the turn', param);
  const queued = await call('POST', msgUrl(), { text: 'Перечисли числа от 1 до 400 через запятую, без инструментов.' });
  const act = await activity();
  note('message during the turn', { status: queued.status, body: queued.body, pending: act?.pending, queued: act?.queued });
  const i1 = await interruption();
  const p2 = promptCount();
  const stop1 = await call('POST', stopUrl(), { turnRef: i1?.turnRef });
  note('Stop in the dialog', { before: i1, status: stop1.status, body: stop1.body });
  const created = await access(path.join(projectPath, 'm28-probe.txt')).then(() => true, () => false);
  note('file after Esc', { created, screen: (await frame()).split('\n').filter(l => /Interrupted|What should Claude/.test(l)) });
  // Turn 2: the queue goes right after the interruption; Stop while Claude generates.
  const turn2 = await until('turn 2 from the queue', async () => promptCount() > p2, 20000); if (turn2) turns++;
  note('queue after interruption', { prompts: promptCount(), prompt: hooks.filter(h => h.hookEvent === 'UserPromptSubmit').at(-1)?.prompt, activity: await activity().then(a => a && { state: a.state, pending: a.pending, queued: a.queued }) });
  await until('generation on screen', async () => /\d+, \d+, \d+/.test(await frame()), 30000);
  const i2 = await until('turn 2 interruption ref', async () => { const i = await interruption(); return i?.state === 'working' && i.turnRef && i.turnRef !== i1?.turnRef ? i : null; }, 10000);
  const stop2 = await call('POST', stopUrl(), { turnRef: i2?.turnRef });
  note('Stop while generating', { before: i2, status: stop2.status, body: stop2.body, numbers: ((await frame()).match(/\d+(?=,)/g) ?? []).length });
  const free = await until('channel leaves working', async () => (await activity())?.state === 'waiting', 15000);
  note('after Stop', { waiting: Boolean(free), activity: await activity().then(a => a && { state: a.state, pending: a.pending }), stopHooks: hooks.filter(h => h.hookEvent === 'Stop').length });
  await sleep(3000);
  // Turn 3: a panel message to the free agent goes at once.
  const p3 = promptCount();
  const direct = await call('POST', msgUrl(), { text: 'Ответь одним словом: готово.' });
  note('message to the free agent', { status: direct.status, body: direct.body });
  const woke = await until('turn 3 prompt hook', async () => promptCount() > p3, 15000); if (woke) turns++;
  note('turn 3', { started: Boolean(woke), prompt: hooks.filter(h => h.hookEvent === 'UserPromptSubmit').at(-1)?.prompt });
  const done = await until('turn 3 Stop hook', async () => (await activity())?.state === 'waiting', 60000);
  note('turn 3 end', { waiting: Boolean(done), last: (await activity())?.lastAssistantMessage?.slice(0, 120) ?? null, queued: (await activity())?.queued });
  const parameters = await provider.readParameters(project, session.localId).catch(e => String(e));
  note('context window', { context: parameters?.context ?? parameters });
} catch (error) { result = 'error'; note('error', { error: String(error?.stack ?? error).slice(0, 800) }); }
// Cleanup.
try {
  app.channel.forget(key);
  await provider.archiveSessions(project, null).catch(e => String(e));
  await provider.stopSession(project, session?.localId).catch(e => String(e));
  const deleted = await provider.deleteSessions(project).catch(e => String(e));
  const trustAfter = await provider.trust(project).catch(e => String(e));
  const processes = (await app.supervisor.list()).length;
  await app.stop();
  const claudeDir = path.join(os.homedir(), '.claude', 'projects', projectPath.replace(/[^A-Za-z0-9]/g, '-'));
  await rm(claudeDir, { recursive: true, force: true }); await rm(base, { recursive: true, force: true });
  note('cleanup', { deleted: Array.isArray(deleted) ? deleted.length : deleted, trusted: trustAfter?.trusted ?? trustAfter, processes, defaultsUnchanged: (await hash()) === baselineHash, baseRemoved: !(await access(base).then(() => true, () => false)), claudeDirRemoved: !(await access(claudeDir).then(() => true, () => false)) });
} catch (error) { note('cleanup error', { error: String(error) }); }
await writeFile(OUT, JSON.stringify({ result, turns, log, hooks: hooks.map(({ at, hookEvent, prompt, reply }) => ({ at, hookEvent, prompt, reply })) }, null, 1));
process.exit(0);
```

## Браузерный стенд (`m28-browser.mjs`)

```javascript
// Owned source server :48762 and the M28 browser scenario runner (T007 evidence).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const REPO = process.argv[2];
const require = createRequire(path.join(process.env.HOME, '.npm/_npx/9833c18b2d85bc59/node_modules/'));
const { chromium } = require('playwright');
const WEB = path.join(REPO, 'product-parts/control-panel/clusters/web-panel/modules');
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.html': 'text/html' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = url.startsWith('/session-chat/') ? path.join(WEB, 'session-chat/src', url.slice(14)) : path.join(WEB, 'panel-shell/src', url);
  if (!file.startsWith(WEB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(48762, '127.0.0.1', r));
const scenario = eval(fs.readFileSync(path.join(WEB, 'session-chat/test/m28-composer.browser.js'), 'utf8'));
const browser = await chromium.launch({ executablePath: process.env.M28_CHROMIUM });
const page = await browser.newPage();
const out = [];
try {
  for (const theme of ['light', 'dark']) for (const [width, height] of [[375, 667], [768, 1024], [1280, 800]]) {
    out.push(await scenario(page, { provider: 'claude', theme, width, height, shot: path.join(REPO, `docs/evidence/M28/composer-claude-${theme}-${width}.png`) }));
  }
  for (const provider of ['codex', 'kimi']) for (const theme of ['light', 'dark']) out.push(await scenario(page, { provider, theme, width: 1280, height: 800 }));
  console.log(JSON.stringify({ ok: true, runs: out.length, checks: out.reduce((n, r) => n + r.checks.length, 0), out }, null, 1));
} catch (error) { console.log(JSON.stringify({ ok: false, error: String(error?.stack ?? error).slice(0, 1500), done: out.length })); process.exitCode = 1; }
finally { await browser.close(); server.close(); }
```
