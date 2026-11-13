import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { TerminalScreen } from '#pty-host';
import { ParameterEngine } from '../src/pty/parameter-engine.ts';
import { parameterFrame } from '../src/pty/parameter-screen.ts';
import { supportedNativeVersion } from '../src/pty/parameter-protocol.ts';
import type { NativeMetadata, NativeAction } from '../src/pty/parameter-protocol.ts';

const hostId = randomUUID(); const sessionId = randomUUID();
const idle = (input = '', mode = 'auto') => `────────────────────────\r\n❯ ${input}\r\n────────────────────────\r\n  ⏵⏵ ${mode} mode on (shift+tab to cycle)`;
function world(version = '2.1.323') {
  let now = 1000;
  const screen = new TerminalScreen();
  const engine = new ParameterEngine(hostId, '/project', screen, () => now);
  const meta: NativeMetadata = { version: 1, hostId, sessionId, cwd: '/project', cliVersion: version,
    model: { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5' }, effort: 'high', fast: false, at: now };
  const feed = (text: string) => { screen.feed(`\x1b[2J\x1b[H${"\r\n".repeat(Math.max(0, 40 - text.split("\r\n").length))}${text}`); engine.observe(meta); };
  feed(idle());
  const tick = () => { now += 150; engine.observe(meta); return engine.propose(); };
  const request = (field = 'mode', value = 'default') => ({ version: 1, hostId, sessionId, id: randomUUID(), epoch: engine.snapshot().epoch, expires: now + 25_000, field, value });
  return { now: () => now, engine, screen, meta, feed, tick, request, advance: (n: number) => { now += n; } };
}

test('native version floor accepts compatible new patches, not unknown or old versions', () => {
  for (const v of ['2.1.323', '2.1.324', '2.2.0']) assert.equal(supportedNativeVersion(v), true);
  for (const v of ['2.1.322', '1.99.999', '', 'unknown']) assert.equal(supportedNativeVersion(v), false);
});
test('session-local mode reads the actual footer and is never optimistic', () => {
  const w = world('2.1.324'); w.engine.begin(w.request());
  const action = w.tick()!; assert.equal(action.value, 'mode'); assert.equal(w.engine.sent(action), true);
  for (let i = 0; i < 3; i++) { assert.equal(w.tick(), null); assert.equal(w.engine.takeResult(), null); }
  w.feed(idle('', 'manual')); w.tick();
  assert.equal(w.engine.takeResult()?.status, 'applied'); assert.equal(w.engine.snapshot().mode, 'default');
});
test('draft, busy, dialog, unknown control, old version, stale epoch and mismatched identity write nothing', () => {
  for (const text of [idle('user draft'), 'Thinking (esc to interrupt)', 'Allow tool?\r\nEnter to confirm · Esc to cancel', 'unrecognized', '\x1b[1;39r']) {
    const w = world(); w.feed(text); w.engine.begin(w.request()); assert.equal(w.tick(), null); assert.ok(w.engine.takeResult());
  }
  for (const patch of [{ epoch: 'stale' }, { hostId: randomUUID() }, { sessionId: randomUUID() }]) {
    const w = world(); w.engine.begin({ ...w.request(), ...patch }); assert.equal(w.tick(), null); assert.equal(w.engine.takeResult()?.status, 'stale');
  }
  const w = world('2.1.322'); w.engine.begin(w.request()); assert.equal(w.tick(), null); assert.equal(w.engine.takeResult()?.status, 'busy');
});
test('a later screen invalidates a proposed key; duplicate UUID never repeats a transaction', () => {
  const w = world(); const r = w.request(); w.engine.begin(r); const action = w.tick()!;
  w.feed('Do you want to proceed?\r\nEsc to cancel'); assert.equal(w.engine.sent(action), false);
  w.engine.cancel(); w.tick(); assert.equal(w.engine.takeResult()?.status, 'cancelled');
  w.feed(idle()); w.engine.begin({ ...r, epoch: w.engine.snapshot().epoch }); assert.equal(w.engine.takeResult()?.status, 'stale'); assert.equal(w.tick(), null);
});
test('typed control is separate from Enter; foreign input is never submitted or cleared', () => {
  const w = world(); w.engine.discover(); const action = w.tick()!;
  assert.deepEqual({ kind: action.kind, value: action.value }, { kind: 'text', value: '/model' }); w.engine.sent(action);
  w.feed(idle('/model foreign draft')); assert.equal(w.tick(), null); assert.equal(w.tick(), null);
  assert.equal(w.engine.takeResult()?.status, 'cancelled'); assert.equal(w.engine.busy, true);
  w.feed(idle()); w.tick(); assert.equal(w.engine.busy, false);
});
test('timeout closes only our known menu; a foreign permission dialog gets no Escape', () => {
  for (const dialog of [false, true]) {
    const w = world(); w.engine.discover(); w.engine.sent(w.tick()!);
    w.feed(idle('/model')); const enter = w.tick()!; assert.equal(enter.value, 'enter'); w.engine.sent(enter);
    w.feed(dialog ? 'Permission request\r\nEnter to confirm · Esc to cancel' : 'Select model\r\n❯ 1. Default\r\n  2. Sonnet 5.5  Everyday\r\nEnter to set as default · Esc to cancel');
    w.advance(60_000); const next = w.tick();
    assert.equal(next?.value ?? null, dialog ? null : 'escape');
  }
});
test('streamed native control sequences are accepted exactly; unknown forms stay invalid', () => {
  const native = '\x1b(B\x1b[r\x1b[>0q\x1b[?u\x1b[c\x1b[<u';
  for (let split = 0; split <= native.length; split++) { const s = new TerminalScreen(); s.feed(native.slice(0, split)); s.feed(native.slice(split)); assert.equal(s.valid, true, `split ${split}`); }
  for (const control of ['\x1b[1;40r', '\x1b[>1q', '\x1b[>0 q', '\x1b[1u', '\x1b(0']) { const s = new TerminalScreen(); s.feed(control); assert.equal(s.valid, false); }
});
test('T001 actual effort/model frames parse without mistaking selected rows for user input', () => {
  const effort = JSON.parse(readFileSync(new URL('../../../../../../../docs/evidence/M27/normalized-controls-probe.json', import.meta.url), 'utf8'))[0].frame.text as string;
  const model = JSON.parse(readFileSync(new URL('../../../../../../../docs/evidence/M27/more-models-queue-probe.json', import.meta.url), 'utf8'))[0].frame.text as string;
  for (const [text, kind] of [[effort, 'effort'], [model, 'model']]) {
    const screen = new TerminalScreen(); screen.feed(`\x1b[2J\x1b[H${text!.replaceAll('\n', '\r\n')}`);
    const f = parameterFrame(screen); assert.equal(f.kind, kind); assert.equal(f.input, null);
    if (kind === 'effort') { assert.deepEqual(f.efforts, ['low', 'medium', 'high', 'xhigh', 'max']); assert.equal(f.previewEffort, 'medium'); }
    else { assert.equal(f.more, 'open'); assert.ok(f.rows.some(r => r.label === 'Sonnet 5')); }
  }
});

test('catalogue expands and scrolls without saving defaults; setters use s and require fresh independent values plus ACK', () => {
  const w = world(); let selection: number | 'more' = 3; let expanded = false; let menu = ''; let draft = ''; let effort = 'high'; let ultra = false; let acknowledgements = '';
  const written: NativeAction[] = [];
  const modelMenu = () => 'Select model\r\n' + [1, 2, 3, 4, 5].map(i => `${selection === i ? '❯' : ' '} ${i}. ${['', 'Default', 'Opus 5.5', 'Sonnet 5.5', 'Haiku 5.5', 'Fable 5.2'][i]}  Description`).join('\r\n')
    + `\r\n${selection === 'more' ? '❯' : ' '} ${expanded ? '▾' : '▸'} More models\r\n`
    + (expanded ? `${selection === 6 ? '❯' : ' '} 6. Sonnet 5  Older model\r\n` : '')
    + (selection === 'more' ? `Enter to ${expanded ? 'collapse' : 'expand'} · Esc to cancel` : 'Enter to set as default · s for this session only · Esc to cancel');
  const effortMenu = () => 'Effort\r\n' + ' '.repeat({ low: 0, medium: 7, high: 15, xhigh: 22, max: 28 }[effort]!) + '▲\r\nlow   medium  high   xhigh  max\r\nUltracode off · Tab to toggle\r\n←/→ to adjust · Enter to confirm · s for this session only · Esc to cancel';
  const render = () => w.feed(menu === 'model' ? modelMenu() : menu === 'effort' ? effortMenu() : menu === 'fast' ? 'Fast mode requires usage credits\r\nEsc to cancel' : acknowledgements + '\r\n' + idle(draft));
  const action = () => {
    const a = w.tick(); if (!a) return;
    assert.equal(w.engine.sent(a), true); written.push(a);
    if (a.kind === 'text') draft = a.value;
    else if (a.value === 'enter') {
      if (menu === 'model') { assert.equal(selection, 'more', 'Enter must never save a model default'); expanded = true; }
      else { menu = draft.slice(1); draft = ''; }
    } else if (a.value === 'escape') menu = '';
    else if (a.value === 'up') selection = selection === 'more' ? 5 : Math.max(1, (selection as number) - 1);
    else if (a.value === 'down') selection = selection === 5 ? 'more' : selection === 'more' ? 6 : (selection as number) + 1;
    else if (a.value === 'left' || a.value === 'right') {
      const levels = ['low', 'medium', 'high', 'xhigh', 'max']; effort = levels[levels.indexOf(effort) + (a.value === 'right' ? 1 : -1)]!;
    } else if (a.value === 'session') {
      if (menu === 'model') { w.meta.model = { id: 'claude-sonnet-5', label: 'Sonnet 5' }; acknowledgements += '\r\nSet model to Sonnet 5 (this session only)'; }
      else { w.meta.effort = effort; acknowledgements += `\r\nSet effort level to ${effort} (this session only)`; }
      w.meta.at = w.now(); menu = '';
    } else assert.fail(`unexpected key ${a.value}`);
    render();
  };
  w.engine.discover();
  for (let i = 0; i < 300 && w.engine.busy; i++) action();
  assert.equal(w.engine.takeResult()?.status, 'applied');
  assert.equal(w.engine.snapshot().models.length, 5); assert.deepEqual(w.engine.snapshot().efforts, ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.equal(w.engine.snapshot().fastReason, 'Fast mode requires usage credits');
  for (const [field, value] of [['model', 'native:Sonnet%205'], ['effort', 'medium']]) {
    w.meta.at = w.now(); w.engine.observe(w.meta); w.engine.begin(w.request(field, value));
    for (let i = 0; i < 300 && w.engine.busy; i++) action();
    assert.equal(w.engine.takeResult()?.status, 'applied', field);
  }
  assert.equal(w.engine.snapshot().model?.id, 'claude-sonnet-5'); assert.equal(w.engine.snapshot().effort, 'medium');
  assert.equal(written.filter(a => a.value === 'session').length, 2);
  assert.equal(ultra, false);
});

test('native metadata is bound to the same folder; Windows casing and slash forms share identity', () => {
  for (const [cwd, native, accepted] of [['C:/Projects/Alpha', 'c:\\projects\\alpha', true], ['/project', '/other', false], ['/Project', '/project', false]] as const) {
    const screen = new TerminalScreen(); const engine = new ParameterEngine(hostId, cwd, screen, () => 1000);
    screen.feed(`\x1b[H${'\r\n'.repeat(36)}${idle()}`);
    engine.observe({ version: 1, hostId, sessionId, cwd: native, cliVersion: '2.1.324', model: { id: 'm', label: 'M' }, effort: 'high', fast: false, at: 1000 });
    assert.equal(engine.snapshot().status === 'idle', accepted);
  }
});
