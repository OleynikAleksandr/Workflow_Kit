# M33/T001: проба вопросов Claude

15.11.2026, macOS, Claude Code 2.1.325, служба Kit из исходников (HEAD `087c69f`). Факты и
выбор варианта — [факты Claude](../design/M33-claude-question-facts.md), разделы 4 и 5.

## Стенд

Одноразовый стенд по образцу [M28](M28/probe-harness.md): изолированный Kit через
`createApp` и `createClaudeProvider`, неизменённый `session.exp` под обёрткой, которая пишет
кадры `TerminalScreen` и нажимает ограниченный набор клавиш. Проект —
`~/WorkflowKitProjects/M33_probe_<случайное>`, модель Haiku 5.5, усилие low. Пробные хуки —
только в `.claude/settings.local.json` пробного проекта:

- `PreToolUse` с `matcher: "AskUserQuestion"` — пишет вход и выходит без вывода;
- `PermissionRequest` с `matcher: "AskUserQuestion"`, `timeout` 43 200 — пишет вход и ждёт
  файл решения `decision-<pid>.json` (печатает его) или `release-<pid>` (выход без вывода).

Стенд читает из транскрипта только строки `AskUserQuestion` и их результаты; переписку
пользователя не читает.

## Ход пробы

Согласие пользователя на бюджет — 15.11.2026, «Да, я согласен.». Ходов — 6 из 12, серия K
не запускалась.

| Ход | Что сделано | Что проверено |
| --- | --- | --- |
| 1 | один вопрос; хук держал его 7 мин, пользователь смотрел карточку в Desktop; ответ хуком «Blue» | D1, P1, P2, P3 (Desktop: скриншоты пользователя до и после) |
| 2 | два вопроса (несколько вариантов и один); ответ пользователя в Desktop при ждущем хуке; через 9 мин — поздний ответ старого хука | P4, D2 (массив из Desktop) |
| 3 | те же два вопроса; ответ хуком: `["Apple","Plum"]` и свой текст `medium` | P3 (несколько вариантов, свой текст, два вопроса), D2 |
| 4 | один вопрос; при открытом диалоге `sendDirect("probe pasted text")` | P6: текст стал ответом |
| 5 | один вопрос; Esc в терминале | D2 (отмена), SIGTERM хука |
| 6 | два одинаковых вопроса подряд; первый хук держал 674 с, затем «Yes», второй — «No» | P5, P7 |

Хэш `~/.claude/settings.json` до и после пробы совпал. Очистка: сессия архивирована и
остановлена, `deleteSessions` удалил локальные данные, запись доверия пробной папки в
`~/.claude.json` снята, процессов стенда и супервизора не осталось, папка пробы и её
временный каталог удалены.

## Запуск

Повтор — только с согласованным бюджетом ходов. Извлечь блоки ниже во временный каталог
`<dir>` (`m33-claude-probe.mjs`, `m33.sh`, `waitq.sh`), затем:

```sh
cd <dir> && M33_REPO=<repo> node --experimental-strip-types m33-claude-probe.mjs &
# в m33.sh подставить порт из строки {"ready":true,"port":…}
./m33.sh post launch
./m33.sh post send '{"text":"Probe turn. Call the AskUserQuestion tool exactly once …"}'
P=$(./waitq.sh)            # pid ждущего хука
./m33.sh post decide "{\"pid\":$P,\"output\":{\"hookSpecificOutput\":{\"hookEventName\":\"PermissionRequest\",\"decision\":{\"behavior\":\"allow\",\"updatedInput\":{\"questions\":[…],\"answers\":{\"<вопрос>\":\"<подпись>\"}}}}}}"
./m33.sh get probe         # хуки, ожидания, строки вопросов транскрипта
./m33.sh post cleanup      # затем остановить стенд и удалить папку пробы
```

## Стенд `m33-claude-probe.mjs`

```javascript
// M33 disposable probe harness (T001). Sources the unchanged production session.exp, records terminal
// frames, Kit hook traffic, probe hooks (PermissionRequest/PreToolUse on AskUserQuestion) and the
// AskUserQuestion lines of the probe transcript. Never touches working projects or user defaults.
import { mkdtemp, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
const REPO = process.env.M33_REPO;
const { createApp } = await import(`${REPO}/product-parts/backend-core/clusters/runtime/modules/cli/src/index.ts`);
const { createClaudeProvider, PTY_SCRIPTS } = await import(`${REPO}/product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/index.ts`);
const { installStructure } = await import(`${REPO}/product-parts/backend-core/clusters/projects/modules/kit-structure/src/index.ts`);
await mkdir(path.join(os.homedir(), 'WorkflowKitProjects'), { recursive: true });
const base = await mkdtemp(path.join(os.homedir(), 'WorkflowKitProjects', 'M33_probe_'));
const projectPath = path.join(base, 'project');
const scratch = path.join(base, 'observer');
const qdir = path.join(base, 'qhook');
for (const d of [projectPath, scratch, qdir]) await mkdir(d, { recursive: true });
const framesFile = path.join(scratch, 'frames.jsonl');
const observer = path.join(scratch, 'screen.mjs');
await writeFile(observer, `import {createInterface} from 'node:readline';
import {appendFileSync} from 'node:fs';
import {TerminalScreen} from '${REPO}/product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/src/index.ts';
const screen = new TerminalScreen(); let last = ''; let count = 0; let lastAt = 0; let pending = null;
const flush = () => { pending = null; const text = screen.text(); if (text === last || count >= 6000) return; last = text; count++; lastAt = Date.now();
  appendFileSync(${JSON.stringify(framesFile)}, JSON.stringify({ at: new Date().toISOString(), valid: screen.valid, text }) + '\\n'); };
for await (const line of createInterface({ input: process.stdin })) {
  if (!line.startsWith('DATA ')) continue;
  screen.feed(Buffer.from(line.slice(5), 'hex').toString('utf8'));
  if (Date.now() - lastAt >= 150) flush(); else if (!pending) pending = setTimeout(flush, 160);
}
`);
// Probe hook: logs its input; in "permission" mode waits for decision-<pid>.json or release-<pid>.
const qhook = path.join(qdir, 'qhook.mjs');
await writeFile(qhook, `import {appendFileSync, existsSync, readFileSync, unlinkSync, writeFileSync} from 'node:fs';
import path from 'node:path';
const dir = ${JSON.stringify(qdir)}; const mode = process.argv[2]; const pid = process.pid;
const log = (o) => appendFileSync(path.join(dir, 'hooks.jsonl'), JSON.stringify({ at: new Date().toISOString(), pid, mode, ...o }) + '\\n');
let raw = ''; process.stdin.setEncoding('utf8'); for await (const c of process.stdin) raw += c;
let input = null; try { input = JSON.parse(raw); } catch {}
log({ event: 'start', input });
for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => { log({ event: 'signal', signal: s }); process.exit(0); });
if (mode !== 'permission') { log({ event: 'exit-silent' }); process.exit(0); }
writeFileSync(path.join(dir, 'waiting-' + pid + '.json'), JSON.stringify({ pid, at: Date.now(), input }));
const started = Date.now();
for (;;) {
  const dec = path.join(dir, 'decision-' + pid + '.json'); const rel = path.join(dir, 'release-' + pid);
  if (existsSync(dec)) { const text = readFileSync(dec, 'utf8'); unlinkSync(dec); try { unlinkSync(path.join(dir, 'waiting-' + pid + '.json')); } catch {}
    log({ event: 'decision', waitedMs: Date.now() - started, output: JSON.parse(text) }); process.stdout.write(text); process.exit(0); }
  if (existsSync(rel)) { unlinkSync(rel); try { unlinkSync(path.join(dir, 'waiting-' + pid + '.json')); } catch {}
    log({ event: 'release', waitedMs: Date.now() - started }); process.exit(0); }
  if ((Date.now() - started) % 60000 < 500) log({ event: 'alive', waitedMs: Date.now() - started });
  await new Promise(r => setTimeout(r, 500));
}
`);
const wrapper = path.join(scratch, 'session.exp');
await writeFile(wrapper, `# M33 disposable probe harness. Sources the unchanged production host.
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
        set f [open $m33_keys r]; fconfigure $f -encoding utf-8; set k [read $f]; close $f; file delete $m33_keys
        switch -glob -- $k {
          esc {send -- "\\033"}
          enter {send -- "\\r"}
          down {send -- "\\033\\[B"}
          up {send -- "\\033\\[A"}
          left {send -- "\\033\\[D"}
          right {send -- "\\033\\[C"}
          tab {send -- "\\t"}
          space {send -- " "}
          text:* {send -- [string range $k 5 end]}
          {[1-9]} {send -- $k}
        }
      }
    }
  }
  return $result
}
source ${PTY_SCRIPTS.session}
`);
let provider;
const env = { ...process.env, WFK_DATA_DIR: path.join(base, 'service'), WFK_PORT: '0' };
const app = await createApp({ env, providers: [ctx => (provider = createClaudeProvider(ctx, { scripts: { ...PTY_SCRIPTS, session: wrapper } }))], log: () => {} });
const kitHooks = []; const match = app.router.match.bind(app.router);
app.router.match = (method, url) => {
  const found = match(method, url);
  if (found.kind !== 'found' || !url.startsWith('/api/hooks/')) return found;
  return { ...found, handler: async ctx => {
    const input = ctx.body?.input;
    const o = { at: new Date().toISOString(), event: url, hookEvent: input?.hook_event_name ?? null };
    kitHooks.push(o);
    const end = ctx.res.end;
    ctx.res.end = function (chunk, ...args) { o.reply = typeof chunk === 'string' ? chunk.slice(0, 200) : null; return end.call(this, chunk, ...args); };
    return await found.handler(ctx);
  } };
};
const opened = await app.projects.open(projectPath); const project = opened.project;
const kit = await app.kit.install(projectPath, { name: 'M33 probe' }); if (!kit.ok) throw new Error(JSON.stringify(kit));
await installStructure(projectPath);
const hookCmd = (mode) => `${process.execPath} ${qhook} ${mode}`;
await writeFile(path.join(projectPath, '.claude', 'settings.local.json'), JSON.stringify({
  model: 'haiku', effortLevel: 'low', fastMode: false, permissions: { defaultMode: 'default' },
  hooks: {
    PreToolUse: [{ matcher: 'AskUserQuestion', hooks: [{ type: 'command', command: hookCmd('pretool'), timeout: 10 }] }],
    PermissionRequest: [{ matcher: 'AskUserQuestion', hooks: [{ type: 'command', command: hookCmd('permission'), timeout: 43200 }] }],
  },
}, null, 2));
await provider.refresh();
const preview = await provider.previewTrust(project);
const trust = await provider.grantTrust(project, preview.token, {});
const defaultsFile = path.join(os.homedir(), '.claude', 'settings.json');
const hash = async () => { try { return createHash('sha256').update(await readFile(defaultsFile)).digest('hex'); } catch { return null; } };
const baselineHash = await hash();
let session = null; const actions = []; let turns = 0;
const json = value => ({ kind: 'json', status: 200, body: value });
const readJsonl = async (file) => (await readFile(file, 'utf8').catch(() => '')).split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return { bad: l.length }; } });
const probeHooks = () => readJsonl(path.join(qdir, 'hooks.jsonl'));
const transcriptPath = async () => (await probeHooks()).map(h => h.input?.transcript_path).find(Boolean) ?? null;
// AskUserQuestion lines of the probe transcript only (the questions are the probe's own text).
const questionLines = async () => {
  const file = await transcriptPath(); if (!file) return null;
  const out = []; const ids = new Set();
  for (const r of await readJsonl(file)) {
    const parts = Array.isArray(r.message?.content) ? r.message.content : [];
    for (const p of parts) {
      if (p.type === 'tool_use' && p.name === 'AskUserQuestion') { ids.add(p.id); out.push({ kind: 'tool_use', uuid: r.uuid, ts: r.timestamp, sidechain: r.isSidechain ?? false, id: p.id, input: p.input }); }
      if (p.type === 'tool_result' && ids.has(p.tool_use_id)) out.push({ kind: 'tool_result', uuid: r.uuid, ts: r.timestamp, id: p.tool_use_id, isError: p.is_error ?? false, content: p.content, toolUseResult: r.toolUseResult ?? null });
    }
  }
  return out;
};
app.router.get('/api/m33/probe', async () => json({ base, session, turns, actions, kitHooks, probeHooks: await probeHooks(),
  waiting: (await readdir(qdir)).filter(n => n.startsWith('waiting-')), questions: await questionLines(),
  defaultsUnchanged: (await hash()) === baselineHash }));
app.router.get('/api/m33/frames', async ctx => { const all = await readJsonl(framesFile); const n = Number(ctx.query?.n ?? 3); return json(all.slice(-n)); });
app.router.post('/api/m33/launch', async () => { if (session) throw new Error('Already launched'); session = await provider.createSession(project, { title: 'M33 probe' }); return json({ session }); });
app.router.post('/api/m33/refresh', async () => { const list = await provider.listSessions(project); session = list.find(s => s.localId === session?.localId || s.state === 'running') ?? session; return json({ session, list }); });
app.router.post('/api/m33/send', async ctx => { const text = String(ctx.body?.text ?? ''); turns++; actions.push({ at: new Date().toISOString(), send: text, turn: turns }); return json({ taken: await provider.sendDirect(project, session.localId, text), turns }); });
app.router.post('/api/m33/paste', async ctx => { const text = String(ctx.body?.text ?? ''); actions.push({ at: new Date().toISOString(), pasteNoTurn: text }); return json({ taken: await provider.sendDirect(project, session.localId, text) }); });
const KEYS = /^(esc|enter|down|up|left|right|tab|space|[1-9]|text:.{1,200})$/s;
app.router.post('/api/m33/key', async ctx => { const k = String(ctx.body?.key ?? ''); if (!KEYS.test(k)) throw new Error('bad key'); actions.push({ at: new Date().toISOString(), key: k }); await writeFile(path.join(scratch, 'key'), k, { flag: 'wx' }); return json({ queued: true }); });
app.router.post('/api/m33/decide', async ctx => { const pid = Number(ctx.body?.pid); actions.push({ at: new Date().toISOString(), decide: pid, output: ctx.body?.output }); await writeFile(path.join(qdir, `decision-${pid}.json`), JSON.stringify(ctx.body?.output)); return json({ written: true }); });
app.router.post('/api/m33/release', async ctx => { const pid = Number(ctx.body?.pid); actions.push({ at: new Date().toISOString(), release: pid }); await writeFile(path.join(qdir, `release-${pid}`), ''); return json({ written: true }); });
app.router.post('/api/m33/cleanup', async () => {
  for (const n of (await readdir(qdir)).filter(n => n.startsWith('waiting-'))) await writeFile(path.join(qdir, `release-${n.slice(8, -5)}`), '');
  if (session) { app.channel.forget(`claude:${session.localId}`); await provider.archiveSessions(project, null).catch(e => String(e)); await provider.stopSession(project, session.localId).catch(e => String(e)); }
  const deleted = await provider.deleteSessions(project).catch(e => String(e));
  return json({ deleted, trust: await provider.trust(project), processes: await app.supervisor.list(), defaultsUnchanged: (await hash()) === baselineHash });
});
const started = await app.start(); env.WFK_PORT = String(started.port);
await writeFile(path.join(scratch, 'address.json'), JSON.stringify({ base, port: started.port, projectId: project.id }));
console.log(JSON.stringify({ ready: true, port: started.port, base, kit: kit.ok, trust: trust.trusted, defaultsHash: baselineHash }));
process.on('SIGTERM', async () => { await app.stop(); process.exit(0); });
```

## `m33.sh`

```sh
#!/bin/bash
# Usage: m33.sh get <route> | m33.sh post <route> [json]
P=<port>
if [ "$1" = get ]; then curl -s "http://127.0.0.1:$P/api/m33/$2"; else
BODY="$3"; [ -z "$BODY" ] && BODY='{}'
curl -s -X POST -H 'Content-Type: application/json' -H "Origin: http://127.0.0.1:$P" "http://127.0.0.1:$P/api/m33/$2" -d "$BODY"; fi
```

## `waitq.sh`

```sh
#!/bin/bash
# Waits until a permission hook is waiting; prints its pid.
D=$(dirname "$0")
for i in $(seq 1 60); do p=$("$D/m33.sh" get probe | python3 -c 'import json,sys;w=json.load(sys.stdin)["waiting"];print(w[0][8:-5] if w else "")'); [ -n "$p" ] && { echo "$p"; exit 0; }; sleep 2; done; echo none
```

## Поведение на ОС

| macOS | Linux | Windows x64/ARM64 |
| --- | --- | --- |
| живая проба (expect, Claude Desktop) | не проверялось вживую; тот же код хука и транскрипта, CI с подставным `claude` | не проверялось вживую; хук в exec-форме и ConPTY — тесты с подставной платформой, живая проверка — проверяющий на Windows |
