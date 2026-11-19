// M45 T001: the parameter host gives the terminal back. A Remote Control message (the Ingress line
// of Claude's debug file) cancels its transaction, an idle menu of the host closes after 10 s, a
// user's text waits while the terminal is not clean, a discovery that failed by itself is not
// repeated by a restarted host, and a wanted value Claude already has is settled at once.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { TerminalScreen } from '#pty-host';
import { DISCOVERY_RETRY_MS, DISCOVERY_TRIES, INPUT_QUIET_MS, MENU_IDLE_MS, ParameterEngine } from '../src/pty/parameter-engine.ts';
import { ParameterHost } from '../src/pty/parameter-files.ts';
import { PARAMETER_NATIVE, validCatalog } from '../src/pty/parameter-protocol.ts';
import type { NativeMetadata } from '../src/pty/parameter-protocol.ts';
import { INGRESS_MAX_READ, IngressWatch } from '../src/pty/remote-ingress.ts';
import type { IngressFiles } from '../src/pty/remote-ingress.ts';

const hostId = randomUUID(); const sessionId = randomUUID();
const idle = (input = '', mode = 'auto') => `────────────────────────\r\n❯ ${input}\r\n────────────────────────\r\n  ⏵⏵ ${mode} mode on (shift+tab to cycle)`;
const MENU = 'Select model\r\n❯ 1. Default\r\n  2. Sonnet 5.5  Everyday\r\nEnter to set as default · Esc to cancel';
const INGRESS = '2026-11-19T09:05:41.482Z [DEBUG] [bridge:repl] Ingress message type=user uuid=90e59071\n';

function world(version = '2.1.328') {
  let now = 1000;
  const screen = new TerminalScreen();
  const engine = new ParameterEngine(hostId, '/project', screen, () => now);
  const meta: NativeMetadata = { version: 1, hostId, sessionId, cwd: '/project', cliVersion: version,
    model: { id: 'claude-opus-5-5', label: 'Opus 5.5' }, effort: 'high', fast: false, at: now };
  const feed = (text: string) => { screen.feed(`\x1b[2J\x1b[H${'\r\n'.repeat(Math.max(0, 40 - text.split('\r\n').length))}${text}`); engine.observe(meta); };
  feed(idle());
  const tick = () => { now += 250; engine.observe(meta); return engine.propose(); };
  return { engine, feed, tick, advance: (n: number) => { now += n; } };
}

/** Starts a discovery: /model is typed and Enter pressed; the screen shows `after`. */
function opened(w: ReturnType<typeof world>, after: string): void {
  w.engine.discover(); const typed = w.tick()!; assert.equal(typed.value, '/model'); w.engine.sent(typed);
  w.feed(idle('/model')); const enter = w.tick()!; assert.equal(enter.value, 'enter'); w.engine.sent(enter);
  w.feed(after);
}

/** A growing debug file in memory. */
function debugFile(): IngressFiles & { append(text: string): void; reset(text: string): void } {
  let content = Buffer.alloc(0);
  return {
    append: (text) => { content = Buffer.concat([content, Buffer.from(text)]); },
    reset: (text) => { content = Buffer.from(text); },
    size: async () => content.length,
    slice: async (_file, start, end) => content.subarray(start, end).toString('utf8'),
  };
}

test('the Ingress line is found once per message, also split across two reads; old lines and a truncated file are not', async () => {
  const file = debugFile(); file.append(INGRESS);
  const watch = new IngressWatch('/d.log', file);
  assert.equal(await watch.poll(), false, 'the first poll only marks the end');
  file.append('2026-11-19T09:05:42.000Z [DEBUG] CCRClient: Heartbeat sent\n'); assert.equal(await watch.poll(), false);
  file.append(INGRESS.slice(0, 40)); assert.equal(await watch.poll(), false);
  file.append(INGRESS.slice(40)); assert.equal(await watch.poll(), true);
  assert.equal(await watch.poll(), false, 'the same line is not reported again');
  file.reset('x\n'); assert.equal(await watch.poll(), false, 'a shorter file starts over at its end');
  file.append('y'.repeat(INGRESS_MAX_READ) + '\n' + INGRESS); assert.equal(await watch.poll(), true, 'a long burst is read from its end');
  assert.equal(await new IngressWatch('/missing', { size: async () => null, slice: async () => '' }).poll(), false);
});

test('a Remote Control message in the debug file cancels the host menu at once and keeps discovery away for a moment', async () => {
  let now = 1000;
  const screen = new TerminalScreen();
  const file = debugFile();
  const meta: NativeMetadata = { version: 1, hostId, sessionId, cwd: '/project', cliVersion: '2.1.328', model: { id: 'claude-opus-5-5', label: 'Opus 5.5' }, effort: 'high', fast: false, at: now };
  const host = new ParameterHost('/d.log', hostId, '/project', screen, {
    read: async (f) => (f === '/d.log' + PARAMETER_NATIVE ? JSON.stringify(meta) : null), take: async () => null, put: async () => undefined,
    size: file.size, slice: file.slice,
  }, () => now);
  const feed = (text: string) => { screen.feed(`\x1b[2J\x1b[H${'\r\n'.repeat(Math.max(0, 40 - text.split('\r\n').length))}${text}`); host.observe(); };
  feed(idle());
  const poll = async () => { now += 250; return host.poll(); };
  const typed = (await poll())!; assert.equal(typed.value, '/model'); host.engine.sent(typed);
  feed(idle('/model')); const enter = (await poll())!; assert.equal(enter.value, 'enter'); host.engine.sent(enter);
  feed(MENU);
  file.append(INGRESS);
  const escape = await poll();
  assert.equal(escape?.value, 'escape', 'the menu of the host closes for the message');
  host.engine.sent(escape!); feed(idle()); now += 1000; await poll();
  assert.equal(host.engine.transacting, false);
  assert.equal(await poll(), null, 'no new discovery right after the message');
  now += INPUT_QUIET_MS + DISCOVERY_RETRY_MS; assert.equal((await poll())?.value, '/model', 'discovery comes back later');
});

test('a menu of the host that waits without a key closes after 10 s', () => {
  const w = world(); opened(w, MENU);
  w.advance(MENU_IDLE_MS - 1000); assert.notEqual(w.tick()?.value, 'escape');
  w.advance(1000); assert.equal(w.tick()?.value, 'escape');
});

test('a user text waits while the cleanup left the input dirty, and goes once it is clean or after 10 s', () => {
  for (const clean of [true, false]) {
    const w = world(); w.engine.discover(); w.engine.sent(w.tick()!);
    w.feed(idle('/model foreign draft')); w.tick(); w.tick();
    assert.equal(w.engine.transacting, false, 'the cancelled transaction ended without clearing the foreign draft');
    assert.equal(w.engine.yieldToUser(), true, 'the text waits while the input is not clean');
    if (clean) { w.feed(idle()); w.tick(); } else { w.advance(10_000); w.tick(); }
    assert.equal(w.engine.yieldToUser(), false);
  }
});

test('a discovery that failed by itself on every try is kept for this CLI version; a restarted host does not open /model', () => {
  const w = world();
  for (let i = 0; i < DISCOVERY_TRIES; i++) {
    opened(w, 'unrecognized');
    w.tick(); w.tick();
    w.feed(idle()); w.tick(); w.tick();
    assert.equal(w.engine.transacting, false, `try ${i + 1} ended`);
    w.advance(DISCOVERY_RETRY_MS);
  }
  const catalog = w.engine.exportCatalog();
  assert.ok(catalog && validCatalog(catalog));
  assert.deepEqual([catalog.models, catalog.failed], [[], ['catalog:Opus 5.5']]);
  const restarted = world(); restarted.engine.loadCatalog(catalog); restarted.engine.discover();
  assert.equal(restarted.tick(), null, 'no /model on the same CLI version');
  const updated = world('2.1.329'); assert.equal(updated.engine.loadCatalog(catalog), false); updated.engine.discover();
  assert.equal(updated.tick()?.value, '/model', 'a new CLI version is read again');
});

test('a discovery cancelled by the user on its last try is not kept as failed', () => {
  const w = world();
  for (let i = 0; i < DISCOVERY_TRIES; i++) {
    opened(w, MENU);
    w.engine.userInput(); w.tick(); w.engine.sent({ kind: 'key', value: 'escape', revision: -1 });
    w.feed(idle()); w.advance(1000); w.tick(); w.tick();
    w.advance(DISCOVERY_RETRY_MS);
  }
  assert.equal(w.engine.exportCatalog(), null);
});

test('a wanted mode Claude already has is settled at once, even while Claude answers', () => {
  const w = world();
  w.feed('✻ Thinking… (esc to interrupt)');
  w.engine.want({ version: 1, hostId, sessionId, changes: { mode: 'auto' }, ids: { mode: randomUUID() } });
  w.engine.pursue();
  assert.equal(w.engine.snapshot().wanted?.mode?.status, 'applied');
});

test('the service keeps the models of a catalog when a host of the same CLI only failed, and adds the failed keys up', async () => {
  const { mkdtemp, rm, writeFile, readFile } = await import('node:fs/promises');
  const os = await import('node:os'); const path = await import('node:path');
  const { CATALOG_CACHE, saveCatalog } = await import('../src/native-wanted.ts');
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wfk-m45-catalog-'));
  try {
    const rt = { context: { dirs: { stateDir: dir } } } as unknown as Parameters<typeof saveCatalog>[0];
    const debug = path.join(dir, 'session.debug.log');
    const models = [{ key: 'native:Opus%205.5', label: 'Opus 5.5', group: 'primary', index: 2 }];
    await writeFile(path.join(dir, CATALOG_CACHE), JSON.stringify({ version: 1, cliVersion: '2.1.328', primaryLast: 5, models, efforts: {}, failed: ['efforts:Haiku 4.5'] }));
    await writeFile(debug + '.parameters-catalog', JSON.stringify({ version: 1, cliVersion: '2.1.328', primaryLast: 5, models: [], efforts: {}, failed: ['catalog:Opus 5.5'] }));
    await saveCatalog(rt, debug);
    const saved = JSON.parse(await readFile(path.join(dir, CATALOG_CACHE), 'utf8'));
    assert.deepEqual([saved.models, saved.failed], [models, ['efforts:Haiku 4.5', 'catalog:Opus 5.5']]);
    // Another CLI version replaces the cache, failed keys of the old version are dropped.
    await writeFile(debug + '.parameters-catalog', JSON.stringify({ version: 1, cliVersion: '2.1.329', primaryLast: 5, models: [], efforts: {}, failed: ['catalog:Opus 5.5'] }));
    await saveCatalog(rt, debug);
    const other = JSON.parse(await readFile(path.join(dir, CATALOG_CACHE), 'utf8'));
    assert.deepEqual([other.cliVersion, other.models, other.failed], ['2.1.329', [], ['catalog:Opus 5.5']]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('the ConPTY host (Windows) gives the parameter host the debug file of Claude for Remote Control messages', async () => {
  const { runHost } = await import('../src/pty/host.ts');
  const debug = 'C:\\fixture\\session.debug.log';
  const sized: string[] = [];
  let emit!: (text: string) => void;
  let exit!: (code: number) => void;
  const done = runHost({ kind: 'session', claude: 'C:\\claude.exe', title: 'Test', debug, resume: null, first: null, native: { hostId, cwd: 'C:\\project' } }, {
    start: () => ({ pid: 1, onData: (fn) => { emit = fn; }, onExit: (fn) => { exit = fn; }, kill: () => undefined, write: () => true }),
    print: () => undefined, takeFile: async () => null, readFile: async () => null, putFile: async () => undefined,
    fileSize: async (file) => { sized.push(file); return 0; }, fileSlice: async () => '',
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now: () => Date.now(), exit: () => undefined,
  }, { sessionMs: 1000, environmentMs: 1000, pollMs: 2 });
  emit('https://claude.ai/code/session_FIXTURE\r\n');
  for (let i = 0; i < 200 && sized.length === 0; i++) await new Promise((resolve) => setTimeout(resolve, 2));
  assert.equal(sized[0], debug);
  exit(0); await done;
});
