# M32 T001: протокол истории Codex (доказательства)

Выводы и выбор вариантов — «Результаты T001» в [протокольном плане](../planning/M32-codex-protocol-plan.md).
15.11.2026: macOS 27.2 arm64, codex-cli 0.169.0 (сервер 0.169.0), Node v24.21.0, Kit HEAD 8e6d0e1b.
Уровни: **schema** — JSON Schema; **live** — демон пользователя, существующие треды, только чтение;
**live-temp** — настоящий `codex app-server` во временном CODEX_HOME без входа, заглушка модели
на 127.0.0.1, треды синтетические; **pending** — не наблюдалось; fake не применялся.
Выводились только id, типы, статусы, счётчики и байты; auth.json и файлы историй не читались,
пользовательские треды не возобновлялись и не прерывались, ходов в них нет.

## Воспроизведение

```sh
D=$(mktemp -d) && awk '/^```js$/{f=1;next} /^```$/{f=0} f' docs/evidence/M32-codex-protocol.md > "$D/p.mjs"
shasum -a 256 "$D/p.mjs"   # eff99b48ad836ccf7d04394dbade8d009e390367a90d68670572a7afdbc7e2b1
node "$D/p.mjs" discover   # поля ok/failed — выбор фикстур
TH=01a1d50b-6999-7022-81c9-9f604ceea169
node "$D/p.mjs" probe $TH 01a1d58d-8745-7a03-99a4-473e493f847a exec-8d730741-0e53-4463-afe9-7eaae03dace0
node "$D/p.mjs" probe $TH 01a1d512-9c80-7003-a725-c8104d35c7e9 exec-b25dceaf-8017-4acc-a5fa-7d9fd5730919
T=$(mktemp -d) && node "$D/p.mjs" temp "$T"   # ~40 с, 7 прогонов
codex app-server generate-json-schema [--experimental] --out "$D/s"
```

SHA-256 v2 (16 знаков): ThreadTurnsListParams 2a8b93d7d4437cc2, ThreadItemsListParams 44c3c947e226be40
(`--experimental` 4a65ec8077ac41db), ThreadResumeParams cb2daef3e452f9dc.

## Результаты

| № | Факт и счётчики | Уровень |
| --- | --- | --- |
| 1 | Поля — в плане; якорь элемента — только с turnId; `deferOutput.commandExecution`, thread/items/read, thread/start.historyMode — только `--experimental` | schema |
| 2 | 26 тредов (13 и 13 архивных), все paginated, CLI 0.164.0-alpha.11.1…0.169.0; 24 notLoaded; legacy нет; loaded/list 2 → 2 | live |
| 3 | `01a1d50b…`: 17 ходов, 2 993 элемента, 20 408 181 байт страниц items/list; элемент до 591 095 (userMessage: 1,3 КБ текста, 3 изображения); страница 50 до 2 686 893; вывод команды до 65 536 | live |
| 4 | turns: asc = обратный desc, limit=1 совпадает, notLoaded без items; backwardsCursor [14,13] → asc [14,15,16] | live |
| 5 | Ход 10, 380 эл.: limit=1 asc/desc полные и обратные; якоря k=1, 102, 104, 378 исключающие в обе стороны; после якоря 378 — 1 эл., 1 163 байт; backwardsCursor [379,378] → [379] | live |
| 6 | Лимит клиента 62 062 (прочие ≤ 55 520, цель 68 605): asc 103 эл. и отказ по заголовку кадра 68 605, desc 276 и отказ; gap [103,103] = цель; реплики до и после прочитаны | live |
| 7 | summary: в 17 ходах первая userMessage и одна agentMessage (0/N−1 из N, раз 0/15 из 18), 34 текста как в полных; нет 198 реплик и commandExecution; 10 ходов — 653 731 | live |
| 8 | deferOutput с experimentalApi — успешный aggregatedOutput null, упавший не отложен; без — -32600; без turnId принят | live |
| 8а | Упавший вывод (exit 1, 13 393 байт; ход 6, 723 эл.): limit=1 полные, якоря 35/37 верны; изолировать лимитом нельзя — в ходе страница 66 652 | live |
| 9 | До/после: notLoaded, loaded=false, loadedCount 2; pid 1050, startSeconds 1794729059, цель `cfe9e3b793f3…`, userAgent неизменны; initialize: userAgent, codexHome, platformFamily, platformOs | live |
| 10 | Вывод 300 000 байт сохранён как 65 536: exit 0 completed и exit 3 failed | live-temp |
| 11 | Лимит 33 663–33 665 (прочие ≤ 717): успешный и упавший вывод — gap ровно элемент, обе реплики; два вывода — gap [2,4], реплики до и после; якоря верны | live-temp |
| 12 | legacy: items/list -32601 «thread/items/list is not supported yet»; turns/list и курсоры как у paginated; full — только userMessage/agentMessage, страница ≤ 1 099; summary тот же | live-temp |
| 13 | Активный ход: items/list — только завершённые элементы; turns/list отстаёт от thread/read: новейший — прежний ход, новый — interrupted без items при живом active/inProgress (7 из 7 прогонов), inProgress при живом completed. Новый paginated до первого хода: -32601 «list_turns is not supported yet», и у includeTurns | live-temp |
| 14 | Новый процесс сервера: треды notLoaded до и после чтений; resume excludeTurns=true — 0 ходов (оба режима), без флага — 3 | live-temp |
| 15 | legacy старых CLI; изменение существующего item; backwardsCursor при обновлении якоря; элемент > 16 МиБ (fake T002a/T005); Windows, Linux | pending |

## Поведение на ОС

macOS — выполнено; Linux (тот же код) и Windows (сокет только через proxy Kit) не запускались.
Проверки ОС — [M32-codex-validation.md](../planning/M32-codex-validation.md).

## Скрипт

```js
// M32 T001: Codex history paging over public JSON-RPC; prints ids, types, statuses, counts, bytes, never text.
// discover | probe <thread> <turn> <item> (running daemon, read-only) | temp <empty dir> (temp CODEX_HOME, mock model)
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { connect } from 'node:net';
import { homedir } from 'node:os';
import path from 'node:path';

const MiB = 2 ** 20, HOME = process.env.CODEX_HOME || path.join(homedir(), '.codex');
const out = (k, v) => console.log(k, JSON.stringify(v));
const size = (v) => Buffer.byteLength(typeof v === 'string' ? v : JSON.stringify(v ?? null));
const text = (i) => (i.type === 'agentMessage' ? i.text ?? '' : (i.content ?? []).map((p) => p.text ?? '').join('\n'));
const visible = (i) => (i.type === 'userMessage' || i.type === 'agentMessage') && text(i).trim() !== '';
const brief = (i) => (i.type === 'commandExecution' ? ['cmd', i.exitCode, i.status, i.aggregatedOutput == null ? null : size(i.aggregatedOutput)] : i.type.slice(0, 5));
const tally = (l) => l.reduce((m, k) => ((m[k] = (m[k] ?? 0) + 1), m), {});
const settle = (p) => p.then((r) => r, (error) => ({ error })), ids = (l) => l.map((e) => (e.item ?? e).id).join();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** JSON-RPC over a message transport; this client refuses a response above c.limit bytes. */
function rpc(write, close) {
  const pending = new Map(), c = { limit: Infinity, maxNote: 0, close, release: close };
  let next = 1, dead = null;
  c.fail = (e) => { dead ??= e; for (const p of pending.values()) p.reject(dead); pending.clear(); };
  c.receive = (msg, bytes) => {
    const p = pending.get(msg.id);
    if (p && ('result' in msg || 'error' in msg)) {
      pending.delete(msg.id);
      if (bytes > c.limit) p.reject({ code: 'message-too-large', declared: bytes, limit: c.limit });
      else if (msg.error) p.reject({ rpc: msg.error.code, message: String(msg.error.message).slice(0, 120) });
      else p.resolve({ result: msg.result, bytes });
    } else if (msg.method && msg.id != null) write({ id: msg.id, error: { code: -32601, message: 'read-only probe' } });
    else c.maxNote = Math.max(c.maxNote, bytes);
  };
  c.call = (method, params) => new Promise((resolve, reject) => { if (dead) return reject(dead); const id = next++; pending.set(id, { resolve, reject }); write({ id, method, params }); });
  c.request = async (m, p) => (await c.call(m, p)).result;
  c.init = async (experimental) => {
    const r = await c.call('initialize', { clientInfo: { name: 'wfk-m32-probe', title: 'M32 probe', version: '0' }, ...(experimental ? { capabilities: { experimentalApi: true } } : {}) });
    write({ method: 'initialized' });
    [c.info, c.maxNote] = [r.result, Math.max(c.maxNote, r.bytes)];
    return c;
  };
  return c;
}

/** WebSocket over the daemon control socket; the size is checked on the real frame header. */
async function socketConn({ limit = Infinity, experimental = false } = {}) {
  const target = await realpath(path.join(HOME, 'app-server-control', 'app-server-control.sock'));
  const sock = connect({ path: target }), key = randomBytes(16).toString('base64');
  const frame = (op, body) => {
    const n = body.length, m = randomBytes(4), head = n < 126 ? Buffer.from([0x80 | op, 0x80 | n]) : Buffer.from([0x80 | op, 0xfe, n >> 8, n & 255]); // requests < 64 KiB
    if (!sock.destroyed) sock.write(Buffer.concat([head, m, Buffer.from(body.map((b, i) => b ^ m[i % 4]))]));
  };
  const c = Object.assign(rpc((msg) => frame(1, Buffer.from(JSON.stringify(msg))), () => sock.destroy()), { limit, target });
  let chunks = [], have = 0, hs = Buffer.alloc(0), open = false, parts = [], frag = 0;
  const kill = (e) => { c.fail(e); sock.destroy(); };
  const take = (n) => { if (chunks[0].length < n) chunks = [Buffer.concat(chunks)]; const b = chunks[0].subarray(0, n); chunks[0] = chunks[0].subarray(n); if (!chunks[0].length) chunks.shift(); have -= n; return b; };
  const parse = () => {
    while (have >= 2) {
      if (chunks[0].length < Math.min(have, 14)) chunks = [Buffer.concat(chunks)];
      const h = chunks[0], op = h[0] & 15;
      let len = h[1] & 127, off = 2;
      if (len === 126) { if (have < 4) return; [len, off] = [h.readUInt16BE(2), 4]; } else if (len === 127) { if (have < 10) return; [len, off] = [Number(h.readBigUInt64BE(2)), 10]; }
      if (op <= 1 && frag + len > c.limit) return kill({ code: 'message-too-large', declared: frag + len, limit: c.limit });
      if (have < off + len) return;
      take(off);
      const body = Buffer.from(take(len));
      if (op === 9) frame(10, body);
      else if (op === 8) return kill({ code: 'server-closed' });
      else if (op <= 1) { parts.push(body); frag += len; if (h[0] & 0x80) { const all = Buffer.concat(parts), n = frag; [parts, frag] = [[], 0]; c.receive(JSON.parse(all), n); } }
    }
  };
  await new Promise((resolve, reject) => {
    sock.on('connect', () => sock.write(`GET / HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`));
    sock.on('data', (d) => {
      if (open) { chunks.push(d); have += d.length; return parse(); }
      const end = (hs = Buffer.concat([hs, d])).indexOf('\r\n\r\n');
      if (end < 0) return;
      if (!hs.subarray(0, end).toString('latin1').includes(createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64'))) return reject(new Error('handshake refused'));
      open = true;
      if (hs.length > end + 4) { chunks.push(hs.subarray(end + 4)); have += hs.length - end - 4; }
      resolve();
      parse();
    });
    sock.on('error', (e) => (open ? kill({ code: 'transport', errno: e.code }) : reject(e)));
    sock.on('close', () => kill({ code: 'transport-closed' }));
  });
  return c.init(experimental);
}

function stdioConn(home) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CODEX_|OPENAI_)/.test(k)).concat([['CODEX_HOME', home]]));
  const child = spawn('codex', ['app-server'], { env, stdio: ['pipe', 'pipe', 'ignore'] });
  const c = rpc((msg) => child.stdin.write(JSON.stringify(msg) + '\n'), () => child.kill());
  c.release = () => (c.limit = Infinity);
  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d;
    for (let i; (i = buf.indexOf('\n')) >= 0; buf = buf.slice(i + 1)) c.receive(JSON.parse(buf.slice(0, i)), Buffer.byteLength(buf.slice(0, i)));
  });
  return c;
}

async function pages(c, method, params) {
  const data = [], sizes = [], seen = new Set();
  for (let cursor = null; ; seen.add(cursor)) {
    const { result, bytes } = await c.call(method, { ...params, cursor });
    data.push(...result.data);
    sizes.push(bytes);
    if (!(cursor = result.nextCursor)) return { data, sizes };
    if (seen.has(cursor)) throw { code: 'cursor-loop', method };
  }
}
const turnsOf = (c, threadId, dir, limit, itemsView = 'notLoaded') => pages(c, 'thread/turns/list', { threadId, sortDirection: dir, limit, itemsView });
const itemsOf = (c, threadId, turnId, dir, limit) => pages(c, 'thread/items/list', { threadId, turnId, sortDirection: dir, limit });
async function state(c, threadId) {
  const loaded = (await c.request('thread/loaded/list', {})).data, t = (await c.request('thread/read', { threadId })).thread;
  return { loaded: loaded.includes(threadId), loadedCount: loaded.length, status: t.status?.type, historyMode: t.historyMode, turnsField: t.turns?.length ?? null };
}

/** Turns both ways, limit=1, backwardsCursor; each turn in full (items/list, else full view); summary. */
async function turnChecks(c, threadId) {
  const a = (await turnsOf(c, threadId, 'asc', 50)).data, d = (await turnsOf(c, threadId, 'desc', 50)).data;
  const a1 = (await turnsOf(c, threadId, 'asc', 1)).data, d1 = (await turnsOf(c, threadId, 'desc', 1)).data;
  const pos = (id) => a.findIndex((t) => t.id === id), page = { threadId, limit: 2, sortDirection: 'desc', itemsView: 'notLoaded' };
  const p1 = await c.request('thread/turns/list', page), p2 = await c.request('thread/turns/list', { ...page, cursor: p1.nextCursor }), p = p2.data.length ? p2 : p1;
  const back = await c.request('thread/turns/list', { ...page, limit: 5, sortDirection: 'asc', cursor: p.backwardsCursor });
  out('turns', { count: a.length, ascRev: ids(a) === ids([...d].reverse()), limit1: ids(a1) === ids(a) && ids(d1) === ids(d), noItems: d.every((t) => t.itemsView === 'notLoaded' && !t.items.length), status: tally(a.map((t) => t.status)), backwards: [p.data.map((t) => pos(t.id)), back.data.map((t) => pos(t.id))] });
  const full = new Map(), first = await settle(itemsOf(c, threadId, a[0]?.id, 'asc', 50));
  let via = 'items/list', maxPage = 0;
  if (first.error?.rpc === -32601) {
    via = `full view; items/list: ${first.error.message}`;
    const f = await turnsOf(c, threadId, 'asc', 1, 'full');
    f.data.forEach((t) => full.set(t.id, t.items));
    maxPage = Math.max(...f.sizes);
  } else for (const t of a) { const r = await itemsOf(c, threadId, t.id, 'asc', 50); full.set(t.id, r.data.map((e) => e.item)); maxPage = Math.max(maxPage, ...r.sizes); }
  // Visible messages the summary keeps: indexes in the full turn ('cmd': a command, -1: text differs).
  const sum = await turnsOf(c, threadId, 'desc', 10, 'summary');
  const pick = sum.data.map((t) => { const v = (full.get(t.id) ?? []).filter(visible); return t.items.map((i) => (i.type === 'commandExecution' ? 'cmd' : v.findIndex((w) => w.id === i.id && text(w) === text(i)))).join('/') + ` of ${v.length}`; });
  out('views', { fullVia: via, fullMax: maxPage, sumMaxPage: Math.max(...sum.sizes), sumPick: tally(pick) });
  return { full, pos };
}

async function itemChecks(c, threadId, turnId, ref, big) {
  const req = (p) => c.call('thread/items/list', { threadId, turnId, limit: 1, ...p }), anchor = (k) => ({ type: 'item', itemId: ref[k].id });
  const anchors = [], at = (e) => ref.findIndex((i) => i.id === e.item.id);
  for (const k of [...new Set([1, big - 1, big + 1, ref.length - 2])].filter((k) => k > 0 && k < ref.length - 1))
    anchors.push([k, (await req({ sortDirection: 'asc', cursor: anchor(k) })).result.data[0]?.item.id === ref[k + 1].id, (await req({ sortDirection: 'desc', cursor: anchor(k) })).result.data[0]?.item.id === ref[k - 1].id]);
  const tail = await req({ limit: 50, sortDirection: 'asc', cursor: anchor(ref.length - 2) }), b = (await req({ limit: 2, sortDirection: 'desc' })).result;
  const back = (await req({ limit: 5, sortDirection: 'asc', cursor: b.backwardsCursor })).result;
  out('items', { asc1: ids((await itemsOf(c, threadId, turnId, 'asc', 1)).data) === ids(ref), desc1: ids((await itemsOf(c, threadId, turnId, 'desc', 1)).data) === ids([...ref].reverse()), anchors, tail: [tail.result.data.length, tail.bytes], backwards: [b.data.map(at), back.data.map(at)] });
}

/** Two-sided read: a client limit above every other page and service message, below the target pages. */
async function sides(conn, threadId, turnId, ref, set) {
  const walk = async (limit, dir) => {
    const c = await conn(limit), read = [];
    let cursor = null, error = null;
    try { do { const r = await c.call('thread/items/list', { threadId, turnId, limit: 1, sortDirection: dir, cursor }); read.push({ ...r.result.data[0], bytes: r.bytes }); cursor = r.result.nextCursor; } while (cursor); } catch (e) { error = e; }
    c.release();
    return { read, error, service: c.maxNote };
  };
  const all = await walk(Infinity, 'asc'), sizes = all.read.map((e) => e.bytes), page = Math.min(...set.map((k) => sizes[k]));
  const other = Math.max(all.service, ...sizes.filter((_, k) => !set.includes(k)));
  if (other >= page) return { otherMax: other, page, limit: null };
  const limit = other < MiB && page > MiB ? MiB : Math.floor((other + page) / 2);
  const f = await walk(limit, 'asc'), b = await walk(limit, 'desc'), from = f.read.length, to = ref.length - b.read.length - 1;
  return { limit, otherMax: other, page, fwd: [from, f.error?.code, f.error?.declared], bwd: [b.read.length, b.error?.code, b.error?.declared], gap: [from, to], gapOk: from === Math.min(...set) && to === Math.max(...set), before: f.read.some((e) => visible(e.item)), after: b.read.some((e) => visible(e.item)) };
}

async function deferred(c, threadId, turnId, ref, big) {
  const r = await settle(c.request('thread/items/list', { threadId, turnId, limit: 1, sortDirection: 'asc', cursor: turnId ? { type: 'item', itemId: ref[big - 1].id } : null, deferOutput: { commandExecution: true } }));
  return r.error ?? brief(r.data[0].item);
}

// Commands with a visible message on both sides in the turn; margin: bytes over the next largest item.
function candidates(l) {
  return l.flatMap((i, k) => (i.type !== 'commandExecution' || !l.slice(0, k).some(visible) || !l.slice(k + 1).some(visible) ? [] : [{ item: i.id, k, of: l.length, exitCode: i.exitCode, outBytes: size(i.aggregatedOutput ?? ''), margin: size(i) - Math.max(0, ...l.filter((_, j) => j !== k).map(size)) }]));
}

async function identity(c) {
  const pid = JSON.parse(await readFile(path.join(HOME, 'app-server-daemon', 'daemon.pid'), 'utf8').catch(() => 'null'));
  return { userAgent: c.info.userAgent, init: Object.keys(c.info), pid: pid?.pid, startSeconds: pid?.processIdentity?.startSeconds, socket: path.basename(c.target).slice(0, 12) };
}

async function discover() {
  const c = await socketConn(), kinds = 'cli vscode exec appServer subAgent subAgentReview subAgentCompact subAgentThreadSpawn subAgentOther unknown'.split(' ');
  out('identity', await identity(c));
  const loaded = (await c.request('thread/loaded/list', {})).data, list = [];
  for (const archived of [false, true]) list.push(...(await pages(c, 'thread/list', { limit: 50, useStateDbOnly: true, sourceKinds: kinds, archived })).data.map((t) => ({ ...t, archived })));
  for (const t of list) {
    const row = { id: t.id, mode: t.historyMode, status: t.status?.type, cli: t.cliVersion, archived: t.archived, turns: 0, items: 0, bytes: 0, maxItem: [0, null], maxPage: 0 }, found = [];
    try { // a legacy thread answers items/list with -32601
      for (const turn of (await turnsOf(c, t.id, 'desc', 50)).data) {
        const r = await itemsOf(c, t.id, turn.id, 'asc', 50), l = r.data.map((e) => e.item);
        Object.assign(row, { turns: row.turns + 1, items: row.items + l.length, bytes: row.bytes + r.sizes.reduce((x, y) => x + y, 0), maxPage: Math.max(row.maxPage, ...r.sizes) });
        for (const i of l) if (size(i) > row.maxItem[0]) row.maxItem = [size(i), i.type];
        found.push(...candidates(l).map((x) => ({ turn: turn.id, ...x })));
      }
    } catch (e) { row.error = e; }
    // ok: the largest margin among outputs of at least 32 KiB; failed: the largest output.
    row.ok = found.filter((x) => x.exitCode === 0 && x.outBytes >= 32768).sort((x, y) => y.margin - x.margin)[0];
    row.failed = found.filter((x) => x.exitCode !== 0).sort((x, y) => y.outBytes - x.outBytes)[0];
    out('thread', row);
  }
  const after = (await c.request('thread/loaded/list', {})).data;
  out('loaded', { before: loaded.length, after: after.length, same: same(loaded, after) });
  c.close();
}

async function probe(threadId, turnId, itemId) {
  const c = await socketConn(), before = await state(c, threadId);
  out('identity', await identity(c)), out('before', before);
  const { full, pos } = await turnChecks(c, threadId), ref = full.get(turnId), big = ref.findIndex((i) => i.id === itemId);
  out('target', { turn: pos(turnId), items: ref.length, big, item: brief(ref[big]) });
  await itemChecks(c, threadId, turnId, ref, big);
  out('sides', await sides((limit) => socketConn({ limit }), threadId, turnId, ref, [big]));
  const x = await socketConn({ experimental: true });
  out('deferOutput', { experimental: await deferred(x, threadId, turnId, ref, big), stable: await deferred(c, threadId, turnId, ref, big), withoutTurn: await deferred(x, threadId, null, ref, big) });
  x.close();
  const after = await state(c, threadId);
  out('after', { ...after, unchanged: same(after, before), identity: await identity(c) });
  c.close();
}

/** Mock Responses model: a short note and a call per planned command, then a short answer. */
function mockModel(plan) {
  return createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      if (!req.url.endsWith('/responses')) return res.writeHead(404).end();
      const json = JSON.parse(body), input = json.input ?? [], tools = (json.tools ?? []).map((t) => t.name);
      const step = input.slice(input.findLastIndex((i) => i.role === 'user') + 1).filter((i) => /_call_output$/.test(i.type)).length;
      const id = `r${Date.now()}`, cmd = plan.now[step], msg = (t) => ({ type: 'message', role: 'assistant', id: `m${id}`, content: [{ type: 'output_text', text: t }] });
      const call = tools.includes('exec_command') ? ['exec_command', { cmd }] : tools.includes('shell_command') ? ['shell_command', { command: cmd }] : ['shell', { command: ['bash', '-lc', cmd] }];
      const items = cmd ? [msg(`short note ${step}`), { type: 'function_call', id: `f${id}`, call_id: `c${id}`, name: call[0], arguments: JSON.stringify(call[1]) }] : [msg('short answer')];
      const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      ev('response.created', { response: { id } });
      items.forEach((item, i) => ev('response.output_item.done', { output_index: i, item }));
      ev('response.completed', { response: { id, usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } });
      res.end();
    });
  });
}

async function temp(dir) {
  const home = path.join(dir, 'home'), work = path.join(dir, 'work'), plan = { now: [] }, model = mockModel(plan), threads = {};
  const OK = "sleep 3; head -c 300000 /dev/zero | tr '\\0' x", FAIL = "head -c 300000 /dev/zero | tr '\\0' y; exit 3";
  await new Promise((r) => model.listen(0, '127.0.0.1', r));
  for (const d of [home, work]) await mkdir(d, { recursive: true });
  await writeFile(path.join(home, 'config.toml'), `model = "mock"\nmodel_provider = "mock"\napproval_policy = "never"\nsandbox_mode = "danger-full-access"\n[model_providers.mock]\nname = "mock"\nbase_url = "http://127.0.0.1:${model.address().port}/v1"\nwire_api = "responses"\n`);
  let c = await stdioConn(home).init(true); // experimental: thread/start.historyMode
  const done = new Set(), receive = c.receive;
  c.receive = (msg, bytes) => (msg.method === 'turn/completed' && done.add(msg.params.turn.id), receive(msg, bytes));
  for (const mode of ['paginated', 'legacy']) {
    const threadId = (await c.request('thread/start', { cwd: work, historyMode: mode })).thread.id, turns = {};
    for (const [label, cmds] of Object.entries({ ok: [OK], failed: [FAIL], both: [OK, FAIL] })) {
      plan.now = cmds;
      const turnId = (await c.request('turn/start', { threadId, input: [{ type: 'text', text: `short question ${label}` }] })).turn.id, seen = [];
      // Live state (thread/read with turns) next to stored history (turns/list, items/list), read at once.
      for (let n = 0, last = ''; n < 80; n += 1, await new Promise((r) => setTimeout(r, n < 20 ? 10 : 300))) {
        const [r, t, tail] = await Promise.all([settle(c.request('thread/read', { threadId, includeTurns: true })), settle(c.request('thread/turns/list', { threadId, limit: 1, sortDirection: 'desc', itemsView: 'notLoaded' })), settle(c.request('thread/items/list', { threadId, turnId, limit: 10 }))]);
        const live = r.thread?.turns.at(-1), top = t.data?.[0], row = JSON.stringify([r.error?.message ?? r.thread.status?.type, live?.id === turnId ? live.status : 'older', t.error?.message ?? (top?.id === turnId ? top.status : 'older'), tail.error?.message ?? tail.data.map((e) => brief(e.item))]);
        if (row !== last) seen.push(JSON.parse((last = row)));
        if (done.has(turnId) && top?.id === turnId && top.status !== 'inProgress') break;
      }
      out(`${mode}.${label}.active`, seen);
      turns[label] = turnId;
    }
    threads[mode] = { threadId, turns };
  }
  c.close();
  c = await stdioConn(home).init(false); // a fresh server: the threads are on disk only now
  for (const [mode, { threadId, turns }] of Object.entries(threads)) {
    console.log(`--- ${mode}`);
    const before = await state(c, threadId), { full } = await turnChecks(c, threadId);
    out('before', before);
    if (mode === 'paginated') for (const [label, turnId] of Object.entries(turns)) {
      const ref = full.get(turnId), set = ref.flatMap((i, k) => (i.type === 'commandExecution' ? [k] : []));
      if (label === 'failed') await itemChecks(c, threadId, turnId, ref, set[0]);
      out(`sides.${label}`, await sides(async (limit) => ((c.limit = limit), c), threadId, turnId, ref, set));
    }
    const after = await state(c, threadId), resume = async (p) => (await c.request('thread/resume', { threadId, ...p })).thread.turns?.length ?? null;
    out('after', { ...after, unchanged: same(after, before), resumeExclude: await resume({ excludeTurns: true }), resumeDefault: await resume({}) });
  }
  c.close();
  model.close();
}

const [mode, ...args] = process.argv.slice(2);
const run = { discover, probe: () => probe(...args), temp: () => temp(path.resolve(args[0])) }[mode];
if (!run || (mode !== 'discover' && !args[0])) { console.error('see the header'); process.exit(2); }
run().then(() => process.exit(0), (e) => { console.error('failed', JSON.stringify(e?.message ? { message: e.message } : e)); process.exit(1); });
```
