# M33: живая проверка вопросов агента до исправлений (T008)

Первая живая проверка M33 на macOS. Она нашла расхождения с фактами T001 и T002, поэтому
полная проверка с ответами из родных приложений идёт после исправлений отдельной задачей плана
(итог — `docs/evidence/M33-acceptance.md`). Поправки фактов —
[Claude, раздел 7](../design/M33-claude-question-facts.md) и
[Codex, раздел 7](../design/M33-codex-question-facts.md).

## Стенд

macOS, 15.11.2026. Служба из исходников (`createApp`) с провайдерами Claude и Codex в
одноразовом проекте `~/WorkflowKitProjects/M33_live_*`. Все хуки проекта (`.claude/settings.json`,
`.codex/hooks.json`) вызывают `bin/wfk.mjs` репозитория через шим, который направляет их в службу
стенда. Демон Codex — уже работающий; стенд его не запускает и не обслуживает (без
`autostart` и `maintain`). Claude Code 2.1.325, Haiku 5.5 с низким усилием, режим `auto`;
Codex 0.169.0, GPT-5.6 Luna с низким усилием, режим плана, «только чтение». Ответ из панели —
щелчком в настоящей панели стенда (headless Chromium): выбор варианта и «Отправить».

## Найдено

### Н1. Claude: без хука `PreToolUse` ожидающий вопрос не попадает в транскрипт

- Ход 1 (структура Kit как в T005: хук `PermissionRequest`, без `PreToolUse`): хук вопроса
  пришёл в службу и ждал, диалог нарисован в терминале, но строки `assistant` с `tool_use`
  `AskUserQuestion` в транскрипте нет, пока вопрос ждёт. Карточки в панели нет.
- После ответа в терминале (Enter, «Blue») строка вызова и результат записаны вместе; лента
  показала закрытый вопрос с ответом «Blue» и id вызова.
- Процесс `wfk hook question` после ответа в терминале не завершился: ожидание не было
  привязано к вопросу и не закрылось по результату в транскрипте (дефект, второй).
- Причина: в T001 в пробном проекте был хук `PreToolUse` на `AskUserQuestion`; Claude записывает
  строку вызова в транскрипт перед хуками `PreToolUse` (T001: за 70–100 мс до него). Факт D1
  T001 верен только при наличии такого хука.
- Ход 2 (новая сессия, в `settings.local.json` пробный хук `PreToolUse` с matcher
  `AskUserQuestion`, команда `cat >/dev/null; exit 0`): вопрос в ленте через ~0,1 с,
  `pending`, `answerable: true`; панель: строка «Агент ждёт вашего ответа», карточка «Color»;
  выбор «Blue» и «Отправить» — `{ answered: true, outcome: "accepted" }`; терминал: «User
  answered Claude's questions: · Which color do you prefer? → Blue», «Allowed by
  PermissionRequest hook»; агент ответил «Вы выбрали синий цвет.»; процесс хука завершился.

### Н2. Codex: в треде, созданном Kit, нет инструмента `request_user_input`

- Ходы 1 и 2 (тред создан `createSession` Kit: служебный первый ход в обычном режиме, затем
  режим плана параметром Kit; ход 2 — `turn/start` с `collaborationMode: plan` напрямую): модель
  ответила «Не могу вызвать `request_user_input`: этот инструмент недоступен». По журналу треда
  режим плана применён в обоих ходах, но набор инструментов хода плана — только `exec` и
  `functions`.
- В треде T002 первый ход был в режиме плана, и `request_user_input` был в наборе инструментов
  каждого хода.
- В обычном режиме у модели есть `request_user_input_async`: «returns immediately without ending
  the turn …; any reply arrives asynchronously as a new user message». По схеме протокола такой
  вопрос — поле `questions: [{ title, options }]` элемента истории `agentMessage`, а не запрос
  сервера; M33 его не обрабатывает.

Снимки настоящей панели стенда (ход 2, тёмная тема, 1280 px): ожидающий вопрос —
[T008-claude-pending.png](M33/T008-claude-pending.png), после ответа —
[T008-claude-answered.png](M33/T008-claude-answered.png).

## Решение пользователя

На вопрос о вопросах обычного режима Codex пользователь выбрал «Добавить в M33 (Рекомендую)»:
карточка показывает и асинхронный вопрос Codex, а «Отправить» отдаёт выбранный ответ агенту
обычным сообщением через прежнюю доставку. На дополнительный бюджет живых проверок (до 2
коротких ходов Haiku и до 4 коротких ходов Codex) пользователь ответил «Да, согласен».

## Расход ходов

Бюджет T008 — до 3 ходов Haiku и 2 ходов Codex; израсходовано: Claude — 2, Codex — 2.

## Не проверено в T008

Ответы из Claude Desktop и ChatGPT, `question-stale`, вопрос без канала ответа, вопросы Codex
из панели. Эти проверки перенесены в полную живую проверку после исправлений.

## Очистка

Сессии стенда остановлены и удалены (треды Codex удалены `deleteSessions`), процессы стенда
остановлены, записи доверия одноразовых проектов убраны из `~/.codex/config.toml` (файл совпал с
копией до стенда), папки проектов удалены; `~/.claude/settings.json` и `~/.local/bin/wfk` не
менялись (sha256 до и после).

## Скрипты стенда

Запуск: `M33_PRETOOL=1 M33_REPO=<репозиторий> node bench.mjs` (`M33_PRETOOL=1` — пробный хук
`PreToolUse` в `settings.local.json`, ход 2). Сессии — `POST /api/m33/launch`, параметры —
`/params`, реплика — `/send`, лента — `GET /api/m33/state`, очистка — `/cleanup`. Ход Codex
в режиме плана — `codex-turn.mjs`, ответ из панели — `panel.mjs`.

### bench.mjs

```js
// M33 T008 disposable live bench: the service from sources (createApp) with the real Claude and Codex
// providers in a disposable Kit project. Every hook of the project (Claude and Codex) calls the
// repository wfk.mjs through a shim that points it at this service. The Codex daemon is the one
// already running; the bench never starts it, never runs the upkeep (hand-over) and never touches
// working projects. The service log goes to a file so the absence of question text can be checked.
import { mkdtemp, mkdir, writeFile, readFile, appendFile, chmod } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
const REPO = process.env.M33_REPO;
const mod = (p) => import(`${REPO}/product-parts/${p}/src/index.ts`);
const { createApp } = await mod('backend-core/clusters/runtime/modules/cli');
const { createClaudeProvider, PTY_SCRIPTS } = await mod('provider-runtime/clusters/provider-adapters/modules/provider-claude');
const { createCodexProvider } = await mod('provider-runtime/clusters/provider-adapters/modules/provider-codex');
const { installStructure } = await mod('backend-core/clusters/projects/modules/kit-structure');
await mkdir(path.join(os.homedir(), 'WorkflowKitProjects'), { recursive: true });
const base = await mkdtemp(path.join(os.homedir(), 'WorkflowKitProjects', 'M33_live_'));
const projectPath = path.join(base, 'project');
const scratch = path.join(base, 'bench');
for (const d of [projectPath, scratch]) await mkdir(d, { recursive: true });
const serviceLog = path.join(scratch, 'service.log');
// Terminal frames of the Claude host and a key file (Esc etc.), as in the T001 probe.
const framesFile = path.join(scratch, 'frames.jsonl');
const observer = path.join(scratch, 'screen.mjs');
await writeFile(observer, `import {createInterface} from 'node:readline';
import {appendFileSync} from 'node:fs';
import {TerminalScreen} from '${REPO}/product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/src/index.ts';
const screen = new TerminalScreen(); let last = ''; let lastAt = 0; let pending = null;
const flush = () => { pending = null; const text = screen.text(); if (text === last) return; last = text; lastAt = Date.now();
  appendFileSync(${JSON.stringify(framesFile)}, JSON.stringify({ at: new Date().toISOString(), text }) + '\\n'); };
for await (const line of createInterface({ input: process.stdin })) {
  if (!line.startsWith('DATA ')) continue;
  screen.feed(Buffer.from(line.slice(5), 'hex').toString('utf8'));
  if (Date.now() - lastAt >= 300) flush(); else if (!pending) pending = setTimeout(flush, 320);
}
`);
const wrapper = path.join(scratch, 'session.exp');
await writeFile(wrapper, `# M33 T008 bench. Sources the unchanged production host.
set m33_pipe [open [list | ${process.execPath} ${observer}] w]
fconfigure $m33_pipe -encoding utf-8 -buffering line
set m33_keys ${path.join(scratch, 'key')}
rename source m33_source
proc source {args} {
  set result [uplevel 1 [list m33_source {*}$args]]
  if {[file tail [lindex $args end]] eq "interrupt.tcl"} {
    rename interrupt_data m33_interrupt_data
    proc interrupt_data {data} {
      global m33_pipe
      m33_interrupt_data $data
      binary scan [encoding convertto utf-8 $data] H* encoded
      catch {puts $m33_pipe "DATA $encoded"; flush $m33_pipe}
    }
    rename interrupt_tick m33_interrupt_tick
    proc interrupt_tick {} {
      global m33_keys spawn_id
      m33_interrupt_tick
      if {[file exists $m33_keys]} {
        set f [open $m33_keys r]; set k [read $f]; close $f; file delete $m33_keys
        switch -- $k { esc {send -- "\\033"} enter {send -- "\\r"} }
      }
    }
  }
  return $result
}
source ${PTY_SCRIPTS.session}
`);
// Shim: every hook of the disposable project runs the repository launcher against this service.
const benchEnv = path.join(scratch, 'bench.env');
const shim = path.join(scratch, 'wfk');
await writeFile(shim, `#!/bin/sh\n. "${benchEnv}"\nexec "${process.execPath}" "${REPO}/bin/wfk.mjs" "$@"\n`);
await chmod(shim, 0o755);
let claude, codex;
const env = { ...process.env, WFK_DATA_DIR: path.join(base, 'service'), WFK_PORT: '0' };
const log = (line) => void appendFile(serviceLog, `${new Date().toISOString()} ${line}\n`);
const app = await createApp({ env, log, providers: [
  ctx => (claude = createClaudeProvider(ctx, { scripts: { ...PTY_SCRIPTS, session: wrapper } })),
  ctx => { codex = createCodexProvider(ctx); return { ...codex, autostart: undefined, maintain: undefined }; },
] });
const hookLog = []; const match = app.router.match.bind(app.router);
app.router.match = (method, url) => {
  const found = match(method, url);
  if (found.kind !== 'found' || !url.startsWith('/api/hooks/')) return found;
  return { ...found, handler: async ctx => {
    const o = { at: new Date().toISOString(), url, event: ctx.body?.input?.hook_event_name ?? null, waiter: ctx.body?.waiterId ? 'yes' : undefined };
    hookLog.push(o);
    const end = ctx.res.end;
    ctx.res.end = function (chunk, ...args) { o.status = ctx.res.statusCode; o.reply = typeof chunk === 'string' ? chunk.slice(0, 160) : null; o.doneAt = new Date().toISOString(); return end.call(this, chunk, ...args); };
    return await found.handler(ctx);
  } };
};
const opened = await app.projects.open(projectPath); const project = opened.project;
const kit = await app.kit.install(projectPath, { name: 'M33 live' }); if (!kit.ok) throw new Error(JSON.stringify(kit));
await installStructure(projectPath);
const KIT_WFK = '$HOME/.local/bin/wfk';
for (const file of [path.join(projectPath, '.claude', 'settings.json'), path.join(projectPath, '.codex', 'hooks.json')]) {
  const text = await readFile(file, 'utf8');
  if (!text.includes(KIT_WFK)) throw new Error(`no Kit hook command in ${file}`);
  await writeFile(file, text.split(KIT_WFK).join(shim));
}
// Probe of the flush hypothesis: a no-op PreToolUse hook on AskUserQuestion (M33_PRETOOL=1).
const local = { model: 'haiku', effortLevel: 'low', fastMode: false };
if (process.env.M33_PRETOOL === '1') local.hooks = { PreToolUse: [{ matcher: 'AskUserQuestion', hooks: [{ type: 'command', command: 'cat >/dev/null; exit 0', timeout: 10 }] }] };
await writeFile(path.join(projectPath, '.claude', 'settings.local.json'), JSON.stringify(local, null, 2));
const hash = async (f) => { try { return createHash('sha256').update(await readFile(f)).digest('hex'); } catch { return null; } };
const claudeDefaults = path.join(os.homedir(), '.claude', 'settings.json');
const baseline = await hash(claudeDefaults);
await claude.refresh(); await codex.refresh?.();
const trust = {};
for (const [name, p] of [['claude', claude], ['codex', codex]]) {
  const preview = await p.previewTrust(project);
  trust[name] = (await p.grantTrust(project, preview.token, {})).trusted ?? null;
}
const json = value => ({ kind: 'json', status: 200, body: value });
const sessions = {};
const pick = (name) => (name.startsWith('codex') ? codex : claude);
const brief = (page) => ({ messages: (page.messages ?? []).map(m => ({ id: m.id, role: m.role, text: String(m.text ?? '').slice(0, 120) })).slice(-6),
  questions: page.questions ?? null, truncated: page.truncated });
app.router.get('/api/m33/state', async () => {
  const out = { base, projectId: project.id, sessions, hooks: hookLog.slice(-30), claudeDefaultsUnchanged: (await hash(claudeDefaults)) === baseline };
  for (const name of Object.keys(sessions)) out[name] = brief(await pick(name).readMessages(project, sessions[name].localId, { limit: 20 }).catch(e => ({ error: String(e.message ?? e) })));
  return json(out);
});
app.router.post('/api/m33/launch', async ctx => {
  const name = String(ctx.body?.provider); if (sessions[name]) throw new Error('Already launched');
  sessions[name] = await pick(name).createSession(project, { title: String(ctx.body?.title ?? name) });
  return json({ session: sessions[name] });
});
app.router.post('/api/m33/params', async ctx => {
  const name = String(ctx.body?.provider);
  const p = pick(name); return json({ after: await p.updateParameters(project, sessions[name].localId, ctx.body.change) });
});
app.router.post('/api/m33/send', async ctx => {
  const name = String(ctx.body?.provider);
  return json({ taken: await pick(name).sendDirect(project, sessions[name].localId, String(ctx.body?.text ?? '')) });
});
app.router.post('/api/m33/key', async ctx => { const k = String(ctx.body?.key); if (!['esc', 'enter'].includes(k)) throw new Error('bad key'); await writeFile(path.join(scratch, 'key'), k, { flag: 'wx' }); return json({ queued: k }); });
app.router.get('/api/m33/frame', async () => { const lines = (await readFile(framesFile, 'utf8').catch(() => '')).trim().split('\n'); return json(lines.length ? JSON.parse(lines.at(-1) || '{}') : null); });
app.router.post('/api/m33/cleanup', async () => {
  const out = {};
  for (const name of Object.keys(sessions)) {
    const p = pick(name); const s = sessions[name];
    app.channel.forget(`${p === codex ? 'codex' : 'claude'}:${s.localId}`);
    out[name] = { stopped: await p.stopSession?.(project, s.localId).then(() => true).catch(e => String(e)) };
  }
  out.deleted = { claude: await claude.deleteSessions(project).catch(e => String(e)), codex: await codex.deleteSessions(project).catch(e => String(e)) };
  out.processes = await app.supervisor.list(); out.claudeDefaultsUnchanged = (await hash(claudeDefaults)) === baseline;
  return json(out);
});
const started = await app.start();
await writeFile(benchEnv, `WFK_PORT=${started.port}; export WFK_PORT\nWFK_DATA_DIR="${env.WFK_DATA_DIR}"; export WFK_DATA_DIR\n`);
env.WFK_PORT = String(started.port);
await writeFile(path.join(os.tmpdir(), 'm33-live-address.json'), JSON.stringify({ base, port: started.port, projectId: project.id }));
console.log(JSON.stringify({ ready: true, port: started.port, base, projectId: project.id, kit: kit.ok, trust, claudeDefaultsHash: baseline }));
process.on('SIGTERM', async () => { await app.stop(); process.exit(0); });
```

### codex-turn.mjs

```js
// M33 T008: starts one turn of a bench thread in plan mode over the public JSON-RPC of the Codex
// daemon (as the ChatGPT app does), then unsubscribes and closes. Never answers server requests
// (spec M33 2.4: silence keeps the question for the other clients). Does not import Kit.
// Usage: node codex-turn.mjs <threadId> <text>
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { realpath } from 'node:fs/promises';
const SOCKET = path.join(os.homedir(), '.codex', 'app-server-control', 'app-server-control.sock');
/** Minimal WebSocket client over a Unix socket: text frames, masking, fragmentation, ping. */
function openWs(socketPath) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(socketPath);
    const key = randomBytes(16).toString('base64');
    let buf = Buffer.alloc(0); let open = false; let frag = [];
    const handlers = { message: () => {}, close: () => {} };
    const send = (text) => {
      const data = Buffer.from(text, 'utf8'); const mask = randomBytes(4); const n = data.length;
      const head = n < 126 ? Buffer.from([0x81, 0x80 | n]) : n < 65536 ? Buffer.from([0x81, 0xfe, n >> 8, n & 255]) : Buffer.concat([Buffer.from([0x81, 0xff]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n)); return b; })()]);
      const body = Buffer.alloc(n); for (let i = 0; i < n; i++) body[i] = data[i] ^ mask[i & 3];
      sock.write(Buffer.concat([head, mask, body]));
    };
    const control = (op, payload) => { const mask = randomBytes(4); const body = Buffer.from(payload.map((b, i) => b ^ mask[i & 3])); sock.write(Buffer.concat([Buffer.from([0x80 | op, 0x80 | payload.length]), mask, body])); };
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!open) {
        const end = buf.indexOf('\r\n\r\n'); if (end < 0) return;
        const head = buf.subarray(0, end).toString('latin1'); buf = buf.subarray(end + 4);
        if (!/^HTTP\/1\.1 101/.test(head)) { reject(new Error('handshake: ' + head.split('\r\n')[0])); sock.destroy(); return; }
        open = true; resolve({ send, on: (ev, fn) => { handlers[ev] = fn; }, close: () => { try { control(8, [3, 232]); } catch {} sock.end(); } });
      }
      for (;;) {
        if (buf.length < 2) return;
        const fin = buf[0] & 0x80; const op = buf[0] & 15; let len = buf[1] & 127; let off = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (buf.length < off + len) return;
        const payload = buf.subarray(off, off + len); buf = buf.subarray(off + len);
        if (op === 9) { control(10, [...payload]); continue; }
        if (op === 8) { sock.end(); continue; }
        if (op === 1 || op === 0) { frag.push(payload); if (fin) { const text = Buffer.concat(frag).toString('utf8'); frag = []; handlers.message(text, text.length); } }
      }
    });
    sock.on('error', (e) => { if (!open) reject(e); else handlers.close(e); });
    sock.on('close', () => handlers.close(null));
    sock.write(`GET / HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
  });
}


const [threadId, text] = process.argv.slice(2);
const ws = await openWs(await realpath(SOCKET));
let next = 1; const pending = new Map();
ws.on('message', (t) => { let m; try { m = JSON.parse(t); } catch { return; }
  if (m.method) return; // notifications and server requests: ignored, never answered
  const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } });
const request = (method, params) => new Promise((resolve, reject) => { const id = next++; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params })); setTimeout(() => pending.delete(id) && reject(new Error('timeout ' + method)), 30000); });
await request('initialize', { clientInfo: { name: 'm33-bench', version: '0.0.1' }, capabilities: { experimentalApi: true } });
ws.send(JSON.stringify({ jsonrpc: '2.0', method: 'initialized' }));
await request('thread/resume', { threadId, excludeTurns: true });
const model = 'gpt-5.6-luna';
const r = await request('turn/start', { threadId, input: [{ type: 'text', text }], model, effort: 'low', collaborationMode: { mode: 'plan', settings: { model, reasoning_effort: 'low', developer_instructions: null } } });
await request('thread/unsubscribe', { threadId });
console.log(JSON.stringify({ turn: r?.turn?.id ?? null, at: new Date().toISOString() }));
ws.close(); setTimeout(() => process.exit(0), 300);
```

### panel.mjs

```js
// Opens the bench panel on a session, screenshots the pending card, optionally picks options and
// presses «Отправить», then screenshots the result. Usage: node panel.mjs <port> <projectId> <key> <out prefix> [labels,comma] [theme]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
const require = createRequire(path.join(execSync('npm root -g').toString().trim(), 'x.js'));
const { chromium } = require('playwright');
const [port, projectId, key, out, labels, theme] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, colorScheme: theme === 'light' ? 'light' : 'dark' });
const errors = []; page.on('pageerror', e => errors.push(e.message));
const posts = []; const result0 = { errors: null, posts: null }; page.on('response', async r => { if (r.url().endsWith('/answer')) posts.push({ status: r.status(), body: (await r.text().catch(() => '')).slice(0, 300) }); });
await page.goto(`http://127.0.0.1:${port}/#/p/${encodeURIComponent(projectId)}`);
await page.getByText(key, { exact: true }).first().click();
await page.waitForTimeout(1500);
result0.hash = await page.evaluate(() => location.hash);
const card = page.locator('.sc-question:not(.sc-question-closed)');
const result = Object.assign(result0, { errors, posts });
try {
  await card.first().waitFor({ timeout: 30000 });
  result.status = await page.locator('.sc-state').first().textContent().catch(() => null);
  await page.screenshot({ path: `${out}-pending.png` });
  if (labels) {
    for (const label of labels.split(',')) await card.locator('.sc-q-option', { hasText: label }).first().click();
    await card.getByRole('button', { name: 'Отправить' }).click();
    await page.locator('.sc-question-closed').last().waitFor({ timeout: 30000 });
    await page.waitForTimeout(1500);
    result.closed = await page.locator('.sc-question-closed').last().innerText();
    await page.screenshot({ path: `${out}-answered.png` });
  } else result.card = await card.first().innerText();
} catch (e) { result.error = String(e.message ?? e).slice(0, 400); await page.screenshot({ path: `${out}-error.png` }); }
console.log(JSON.stringify(result));
await browser.close();
```
