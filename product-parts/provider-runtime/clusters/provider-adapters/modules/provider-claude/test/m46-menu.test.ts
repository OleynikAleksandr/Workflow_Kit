// M46 T001: the /model menu of Claude 2.1.328. Frames recorded from the live CLI on 19.11.2026
// (`claude` 2.1.328 in a pty, 160×40): the footer «s to use this session only · Enter to save · Esc to
// cancel» and the scroll marker «↓ N more» are recognized; a 2.1.325 menu still is. The host reads
// the catalog and changes the effort on a simulated 2.1.328 terminal and leaves an empty input; the
// ConPTY host (Windows) does the same.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { TerminalScreen } from '#pty-host';
import { ParameterEngine } from '../src/pty/parameter-engine.ts';
import { parameterFrame } from '../src/pty/parameter-screen.ts';
import { NATIVE_KEYS, PARAMETER_CATALOG, PARAMETER_NATIVE } from '../src/pty/parameter-protocol.ts';
import type { NativeAction, NativeCatalog, NativeMetadata } from '../src/pty/parameter-protocol.ts';
import { Claude2128 } from './claude-2-1-328.ts';

const hostId = randomUUID(); const sessionId = randomUUID();
const frame = (lines: string[]) => { const s = new TerminalScreen(); s.feed(`\x1b[2J\x1b[H${'\r\n'.repeat(40 - lines.length)}${lines.join('\r\n')}`); return parameterFrame(s); };
const HEAD = ['  Select model', '  Your pick is the default for new sessions. For other models, use --model.'];
const PRIMARY = ['    1.  Default (recommended)  Opus 5.5 · Best for everyday, complex tasks', '  ❯ 2.  Opus 5.5 ✔             For complex work and everyday tasks',
  '    3.  Fable 5.2              For your toughest challenges', '    4.  Sonnet 5.5             Most efficient for simpler tasks', '    5.  Haiku 5.5              Fastest for quick answers'];
const FOOTER = '  s to use this session only · Enter to save · Esc to cancel';

test('the recorded 2.1.328 menu is the model menu with its rows and the effort level', () => {
  const f = frame([...HEAD, ...PRIMARY, '    ▸   More models', '  ◉ xHigh effort ←/→ to adjust', FOOTER]);
  assert.equal(f.kind, 'model');
  assert.deepEqual(f.rows.map((r) => r.label), ['Opus 5.5', 'Fable 5.2', 'Sonnet 5.5', 'Haiku 5.5']);
  assert.equal(f.selected, 2); assert.equal(f.rows[0]!.checked, true); assert.equal(f.more, 'closed');
  assert.equal(f.effortLevel, 'xhigh'); assert.equal(f.hiddenModels, 0);
});

test('the recorded 2.1.328 frames of More models, its scrolled list and a model without effort', () => {
  const more = frame([...HEAD, ...PRIMARY.map((l) => l.replace('❯', ' ')), '  ❯ ▸   More models', '  Enter to expand · Esc to cancel']);
  assert.equal(more.kind, 'model'); assert.equal(more.selected, 'more'); assert.equal(more.more, 'closed');
  const open = frame([...HEAD, ...PRIMARY.map((l) => l.replace('❯', ' ')), '    ▾   More models', '  ❯ 6.  Fable 5.1              Most capable', '    7.  Haiku 4.5              Fastest',
    '    8.  Sonnet 5               Efficient', '    9.  Opus 5                 Best', '    10. Fable 5                Most capable', '    ↓ 4 more', '  ● High effort (default) ←/→ to adjust', FOOTER]);
  assert.equal(open.kind, 'model'); assert.equal(open.more, 'open'); assert.equal(open.selected, 6);
  assert.equal(open.hiddenModels, 4, '«↓ 4 more»: the catalog is not complete yet');
  assert.equal(open.effortLevel, 'high'); assert.equal(open.effortDefault, true);
  assert.deepEqual(open.rows.map((r) => r.index), [2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const none = frame([...HEAD, '    ▾   More models', '    6.  Fable 5.1              Most capable', '  ❯ 7.  Haiku 4.5              Fastest', '    ↓ 4 more', '  ○ Effort not supported for Haiku 4.5', FOOTER]);
  assert.equal(none.kind, 'model'); assert.equal(none.effortLevel, null);
  const end = frame([...HEAD, '    ↑ 4 more', '    5.  Haiku 5.5              Fastest', '    ▾   More models', '    13. Opus 4.6               Best', '  ❯ 14. Sonnet 4.6             Efficient', '  ● High effort (default) ←/→ to adjust', FOOTER]);
  assert.equal(end.hiddenModels, 0, '«↑ 4 more» is above, nothing below'); assert.equal(end.selected, 14);
});

test('the 2.1.325 menu and a foreign dialog keep their kinds', () => {
  assert.equal(frame(['Select model', '❯ 1. Default', '  2. Opus 5.5', 'Enter to set as default · s for this session only · Esc to cancel']).kind, 'model');
  assert.notEqual(frame(['Do you want to proceed?', '❯ 1. Yes', '  2. No', 'Esc to cancel']).kind, 'model');
  assert.notEqual(frame(['Some other list', '❯ 1. One', 's to use this session only · Enter to save · Esc to cancel']).kind, 'model', 'no Select model, no menu');
});

function world() {
  let now = 1_795_100_000_000;
  const screen = new TerminalScreen();
  const engine = new ParameterEngine(hostId, '/project', screen, () => now);
  const meta: NativeMetadata = { version: 1, hostId, sessionId, cwd: '/project', cliVersion: '2.1.328', model: { id: 'claude-opus-5-5', label: 'Opus 5.5' }, effort: 'xhigh', fast: false, at: now - 10 };
  const claude = new Claude2128(meta, () => now);
  const render = () => { screen.feed(`\x1b[2J\x1b[H${'\r\n'.repeat(4)}${claude.screen()}`); engine.observe(meta); };
  render();
  const written: NativeAction[] = [];
  const step = () => {
    now += 250; engine.observe(meta);
    const a = engine.propose(); if (!a) return;
    assert.equal(engine.sent(a), true); written.push(a);
    claude.input(a.kind === 'text' ? a.value : NATIVE_KEYS[a.value as keyof typeof NATIVE_KEYS]);
    render();
  };
  const run = () => { for (let i = 0; i < 400 && engine.busy; i++) step(); };
  return { engine, meta, claude, written, run, request: (field: string, value: string) => ({ version: 1, hostId, sessionId, id: randomUUID(), epoch: engine.snapshot().epoch, expires: now + 25_000, field, value }) };
}

test('the host reads the whole 2.1.328 catalog and the levels, never saves a default and leaves an empty input', () => {
  const w = world();
  w.engine.discover(); w.run();
  assert.equal(w.engine.takeResult()?.status, 'applied');
  const state = w.engine.snapshot();
  assert.equal(state.models.length, 13, 'all models of «More models» behind «↓ N more»');
  assert.deepEqual(state.efforts, ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.equal(w.claude.enterOnModel, 0, 'Enter (save as default) is never pressed on a model');
  assert.equal(w.claude.menu, false); assert.equal(w.claude.draft, '');
  assert.equal(state.status, 'idle');
});

test('an effort change on 2.1.328 goes through /model and s and ends in an empty input', () => {
  const w = world();
  w.engine.discover(); w.run(); w.engine.takeResult();
  w.meta.at += 1; w.engine.observe(w.meta);
  w.engine.begin(w.request('effort', 'high')); w.run();
  assert.equal(w.engine.takeResult()?.status, 'applied');
  assert.equal(w.meta.effort, 'high'); assert.equal(w.claude.effort, 'high');
  assert.equal(w.claude.menu, false); assert.equal(w.claude.draft, ''); assert.equal(w.engine.snapshot().status, 'idle');
  assert.equal(w.claude.enterOnModel, 0);
});

test('the ConPTY host (Windows) reads the 2.1.328 catalog and leaves the terminal idle', async () => {
  const { runHost } = await import('../src/pty/host.ts');
  const debug = 'C:\\fixture\\session.debug.log';
  let now = 1_795_100_000_000;
  const meta: NativeMetadata = { version: 1, hostId, sessionId, cwd: 'C:\\project', cliVersion: '2.1.328', model: { id: 'claude-opus-5-5', label: 'Opus 5.5' }, effort: 'xhigh', fast: false, at: now - 10 };
  const claude = new Claude2128(meta, () => now);
  let emit!: (text: string) => void; let exit!: (code: number) => void;
  let catalog: NativeCatalog | null = null;
  const draw = () => emit(`\x1b[2J\x1b[H${'\r\n'.repeat(4)}${claude.screen()}`);
  const done = runHost({ kind: 'session', claude: 'C:\\claude.exe', title: 'Test', debug, resume: null, first: null, native: { hostId, cwd: 'C:\\project' } }, {
    start: () => ({ pid: 1, onData: (fn) => { emit = fn; }, onExit: (fn) => { exit = fn; }, kill: () => undefined, write: (text) => { claude.input(text); setTimeout(draw, 1); return true; } }),
    print: () => undefined, takeFile: async () => null,
    readFile: async (file) => (file === debug + PARAMETER_NATIVE ? JSON.stringify(meta) : null),
    putFile: async (file, value) => { if (file === debug + PARAMETER_CATALOG) catalog = value as NativeCatalog; },
    fileSize: async () => 0, fileSlice: async () => '',
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now: () => (now += 50), exit: () => undefined,
  }, { sessionMs: 1000, environmentMs: 1000, pollMs: 2 });
  try {
    emit('https://claude.ai/code/session_FIXTURE\r\n'); draw();
    for (let i = 0; i < 3000 && !(catalog && !claude.menu); i++) await new Promise((resolve) => setTimeout(resolve, 2));
    assert.ok(catalog, `the catalog was written (menu ${claude.menu}, acks ${claude.acks.join(' | ')})`);
    assert.equal((catalog as NativeCatalog).models.length, 13, JSON.stringify(catalog)); assert.equal((catalog as NativeCatalog).cliVersion, '2.1.328');
    assert.equal(claude.menu, false); assert.equal(claude.draft, ''); assert.equal(claude.enterOnModel, 0);
  } finally { exit(0); await done; }
});
