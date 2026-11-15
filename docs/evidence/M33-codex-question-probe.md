# M33/T002: проба вопросов Codex

15.11.2026, macOS, codex-cli 0.169.0, демон, к которому подключён Kit (общий доступ к чатам
ChatGPT). Факты и выбор варианта — [факты Codex](../design/M33-codex-question-facts.md),
разделы 4 и 5.

## Стенд

Скрипт `m33-codex-probe.mjs` (ниже целиком) не импортирует код Kit: свой минимальный
WebSocket-клиент на Unix-сокете `~/.codex/app-server-control/app-server-control.sock`,
JSON-RPC `initialize` с `experimentalApi: true`, управление по HTTP на 127.0.0.1. В журнал
пишутся методы, id, размеры и параметры `item/tool/requestUserInput` (это вопросы самой
пробы); текст переписки не пишется. Проект —
`~/WorkflowKitProjects/M33_codex_probe_<случайное>/project`, тред «M33 codex probe».
Пользовательские треды не читались и не возобновлялись, файлы авторизации не копировались.

Соединения: B — `thread/start`, `turn/start` и сразу `thread/unsubscribe` (как прямой ход
Kit); A — слушатель (`thread/resume { excludeTurns: true }`); C — поздний подписчик; R —
подписчик, который отвечает на запросы сервера ошибкой `-32601` (как нынешние соединения Kit).

## Ход пробы

Согласие: «Продолжай.» в ответ на сообщение с бюджетом T002. Ходов — 5 из 8, модель
`gpt-5.6-luna`, усилие low.

| Ход | Что сделано | Что проверено |
| --- | --- | --- |
| C1 | режим плана, один вопрос; A подписан до хода, B отписался; C подписался после вопроса; пользователь видел карточку в ChatGPT; ответ A «Blue»; поздний ответ C «Red» | Q1, Q2, Q3, Q4 (ChatGPT: скриншоты до и после), Q5 (поздний ответ), Q7 |
| C2 | R подписан и отвечает `-32601` | Q6: вопрос закрыт для всех, ход без ответа; в ChatGPT «Задано 1 вопрос» |
| C3 | A закрыт при ожидающем вопросе, новый A подписан; ответ пользователя в ChatGPT («Friday») | Q11, Q5 (только `serverRequest/resolved`) |
| C4 | A отписан и снова подписан посреди хода; `turn/interrupt` | Q12, Q10 |
| C5 | режим default, `approvalPolicy: "untrusted"`, `touch probe-approval.txt`; R отвечает `-32601` на `item/commandExecution/requestApproval` | Q6 для одобрения: команда отклонена для всех, файла нет |

Очистка: все соединения отписаны, тред архивирован (`thread/archive`), стенд остановлен,
папка пробы удалена; в `~/.codex/config.toml` записей о папке пробы нет.

## Запуск

Повтор — только с согласованным бюджетом ходов. Извлечь блоки ниже во временный каталог
`<dir>`, затем:

```sh
cd <dir> && node m33-codex-probe.mjs &      # строка {"ready":true,"port":…}
# в cx.sh подставить порт
./cx.sh connect '{"name":"B"}'
./cx.sh thread '{"name":"B"}'
./cx.sh connect '{"name":"A"}'
./cx.sh rpc '{"name":"A","method":"thread/resume","params":{"threadId":"<id>","excludeTurns":true}}'
./cx.sh turn '{"name":"B","text":"Probe turn C1. Use the request_user_input tool …","params":{"model":"<model>","effort":"low","collaborationMode":{"mode":"plan","settings":{"model":"<model>","reasoning_effort":"low","developer_instructions":null}}}}'
./cx.sh rpc '{"name":"B","method":"thread/unsubscribe","params":{"threadId":"<id>"}}'
./cx.sh log                                 # события и удерживаемые запросы
./cx.sh answer '{"name":"A","id":"1","answers":{"color":{"answers":["Blue"]}}}'
./cx.sh connect '{"name":"R","serverRequests":"reject"}'   # подписчик с отказом
```

## Стенд `m33-codex-probe.mjs`

```javascript
// M33 disposable probe (T002): public JSON-RPC of the Codex app-server daemon over its Unix socket
// (WebSocket). Does not import Workflow Kit. Logs methods, ids, sizes and the probe's own questions,
// never the conversation text. Control: HTTP on 127.0.0.1 (see the routes at the end).
import net from 'node:net';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, appendFile, realpath } from 'node:fs/promises';

const SOCKET = path.join(os.homedir(), '.codex', 'app-server-control', 'app-server-control.sock');
await mkdir(path.join(os.homedir(), 'WorkflowKitProjects'), { recursive: true });
const base = await mkdtemp(path.join(os.homedir(), 'WorkflowKitProjects', 'M33_codex_probe_'));
const cwd = path.join(base, 'project'); await mkdir(cwd);
const logFile = path.join(base, 'log.jsonl');
const events = [];
const note = (o) => { const e = { at: new Date().toISOString(), ...o }; events.push(e); return appendFile(logFile, JSON.stringify(e) + '\n'); };

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

/** JSON-RPC connection; server requests are kept until the probe answers (or policy decides). */
const conns = new Map();
async function connect(name, { experimental = true, serverRequests = 'hold' } = {}) {
  const ws = await openWs(await realpath(SOCKET));
  const c = { name, ws, nextId: 1, pending: new Map(), requests: new Map(), policy: serverRequests, bytes: 0, closed: false };
  ws.on('message', (text, n) => {
    c.bytes += n; let m; try { m = JSON.parse(text); } catch { note({ conn: name, bad: n }); return; }
    if (m.method && m.id !== undefined && m.id !== null) {
      const brief = { conn: name, serverRequest: m.method, id: m.id, bytes: n };
      if (m.method === 'item/tool/requestUserInput') brief.params = m.params;
      else brief.params = { threadId: m.params?.threadId, turnId: m.params?.turnId, itemId: m.params?.itemId };
      note(brief);
      if (c.policy === 'reject') { ws.send(JSON.stringify({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'probe rejects server requests' } })); note({ conn: name, rejected: m.id }); }
      else c.requests.set(String(m.id), m);
      return;
    }
    if (m.method) {
      const p = m.params ?? {};
      const brief = { conn: name, notify: m.method, bytes: n, threadId: p.threadId, turnId: p.turnId ?? p.turn?.id, itemId: p.itemId ?? p.item?.id, itemType: p.item?.type, status: p.status ?? p.turn?.status };
      if (m.method === 'serverRequest/resolved') brief.requestId = p.requestId;
      if (m.method === 'thread/status/changed') brief.status = p.status;
      if (!/delta$/i.test(m.method)) note(brief); else c.deltas = (c.deltas ?? 0) + 1;
      return;
    }
    const pend = c.pending.get(m.id); if (!pend) { note({ conn: name, orphanResponse: m.id, error: m.error ?? null }); return; }
    c.pending.delete(m.id); m.error ? pend.reject(Object.assign(new Error(m.error.message), { rpc: m.error })) : pend.resolve(m.result);
  });
  ws.on('close', (e) => { c.closed = true; note({ conn: name, closed: e ? String(e.message) : 'closed' }); for (const p of c.pending.values()) p.reject(new Error('closed')); });
  c.request = (method, params, timeoutMs = 30000) => new Promise((resolve, reject) => {
    const id = c.nextId++; c.pending.set(id, { resolve, reject });
    setTimeout(() => { if (c.pending.delete(id)) reject(new Error('timeout ' + method)); }, timeoutMs);
    ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
  });
  c.respond = (id, body) => { ws.send(JSON.stringify({ jsonrpc: '2.0', id: c.requests.get(String(id))?.id ?? id, ...body })); c.requests.delete(String(id)); };
  const init = await c.request('initialize', { clientInfo: { name: 'm33-probe', version: '0.0.1' }, capabilities: { experimentalApi: experimental } });
  ws.send(JSON.stringify({ jsonrpc: '2.0', method: 'initialized' }));
  conns.get(name)?.ws.close(); conns.set(name, c);
  await note({ conn: name, connected: true, experimental, userAgent: init?.userAgent ?? null });
  return c;
}

let threadId = null;
const conn = (name) => { const c = conns.get(name); if (!c || c.closed) throw new Error('no connection ' + name); return c; };
const routes = {
  'POST /connect': async (b) => { await connect(b.name, b); return { ok: true }; },
  'POST /close': async (b) => { conn(b.name).ws.close(); return { ok: true }; },
  'POST /rpc': async (b) => ({ result: await conn(b.name).request(b.method, b.params ?? {}, b.timeoutMs) }),
  'POST /thread': async (b) => {
    const c = conn(b.name);
    const r = await c.request('thread/start', { cwd, ...(b.params ?? {}) }); threadId = r.thread?.id ?? r.threadId;
    await c.request('thread/name/set', { threadId, name: 'M33 codex probe' });
    return { threadId, cwd };
  },
  'POST /turn': async (b) => ({ result: await conn(b.name).request('turn/start', { threadId, input: [{ type: 'text', text: b.text }], ...(b.params ?? {}) }) }),
  'POST /answer': async (b) => { conn(b.name).respond(b.id, { result: { answers: b.answers } }); await note({ conn: b.name, answered: b.id, answers: b.answers }); return { ok: true }; },
  'POST /reject': async (b) => { conn(b.name).respond(b.id, { error: { code: -32601, message: 'probe' } }); await note({ conn: b.name, rejectedManually: b.id }); return { ok: true }; },
  'POST /status': async (b) => { const r = await conn(b.name).request('thread/read', { threadId }); return { status: r.thread?.status }; },
  'GET /log': async () => ({ threadId, base, events: events.slice(-200), held: Object.fromEntries([...conns].map(([n, c]) => [n, { closed: c.closed, held: [...c.requests.keys()], bytes: c.bytes, deltas: c.deltas ?? 0 }])) }),
};
const server = http.createServer(async (req, res) => {
  let body = ''; for await (const ch of req) body += ch;
  const url = new URL(req.url, 'http://x'); const h = routes[`${req.method} ${url.pathname}`];
  try { if (!h) throw new Error('no route'); const out = await h(body ? JSON.parse(body) : {}); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out)); }
  catch (e) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: String(e.message), rpc: e.rpc ?? null })); }
});
server.listen(0, '127.0.0.1', () => console.log(JSON.stringify({ ready: true, port: server.address().port, base, cwd })));
process.on('SIGTERM', () => { for (const c of conns.values()) c.ws.close(); server.close(); process.exit(0); });
```

## `cx.sh`

```sh
#!/bin/bash
# Usage: cx.sh <route> [json]  (GET for log)
if [ "$1" = log ]; then curl -s "http://127.0.0.1:<port>/log"; else curl -s -X POST "http://127.0.0.1:<port>/$1" -d "${2:-{\}}"; fi
```

## Поведение на ОС

| macOS | Linux | Windows x64/ARM64 |
| --- | --- | --- |
| живая проба на сокете демона | не проверялось вживую: тот же RPC, CI с подставным демоном | не проверялось вживую: транспорт `codex app-server proxy`, тесты с подставной платформой, живая проверка — проверяющий на Windows |
