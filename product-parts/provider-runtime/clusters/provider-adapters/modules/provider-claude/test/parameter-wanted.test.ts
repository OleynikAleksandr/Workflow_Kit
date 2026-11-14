// M29 3.2: wanted choices applied in the background, the catalog file and the short model path.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { TerminalScreen } from '#pty-host';
import { ParameterEngine } from '../src/pty/parameter-engine.ts';
import { ParameterHost, replaceFile } from '../src/pty/parameter-files.ts';
import { PARAMETER_CATALOG, PARAMETER_NATIVE, PARAMETER_STATE, PARAMETER_WANTED, validCatalog, validWanted } from '../src/pty/parameter-protocol.ts';
import type { NativeAction, NativeCatalog, NativeMetadata, NativeWanted, WantedField } from '../src/pty/parameter-protocol.ts';

const hostId = randomUUID(); const sessionId = randomUUID();
const LABELS = ['', 'Default', 'Opus 5.5', 'Sonnet 5.5', 'Haiku 5.5', 'Fable 5.2', 'Sonnet 5'];
const MODES = ['auto', 'manual', 'accept edits', 'plan'];
const idle = (input: string, mode: string) => `────────────────────────\r\n❯ ${input}\r\n────────────────────────\r\n  ⏵⏵ ${mode} mode on (shift+tab to cycle)`;

/** A Claude terminal: native menus, Shift+Tab, session-only acknowledgements and the statusline. */
function claude(options: { model?: number; version?: string; switchDialog?: 'same' | string; planModel?: string } = {}) {
  let now = 1000;
  const screen = new TerminalScreen();
  const engine = new ParameterEngine(hostId, '/project', screen, () => now);
  const sim = { selection: options.model ?? 3 as number | 'more', expanded: false, menu: '', draft: '', effort: 'high', mode: 0, acks: '', switching: '', shown: '' };
  const meta: NativeMetadata = { version: 1, hostId, sessionId, cwd: '/project', cliVersion: options.version ?? '2.1.325',
    model: { id: 'm', label: LABELS[options.model ?? 3]! }, effort: 'high', fast: false, at: now };
  const written: NativeAction[] = [];
  const modelMenu = () => 'Select model\r\n' + [1, 2, 3, 4, 5].map(i => `${sim.selection === i ? '❯' : ' '} ${i}. ${LABELS[i]}  Description`).join('\r\n')
    + `\r\n${sim.selection === 'more' ? '❯' : ' '} ${sim.expanded ? '▾' : '▸'} More models\r\n`
    + (sim.expanded ? `${sim.selection === 6 ? '❯' : ' '} 6. Sonnet 5  Older model\r\n` : '')
    + (sim.selection === 'more' ? `Enter to ${sim.expanded ? 'collapse' : 'expand'} · Esc to cancel` : 'Enter to set as default · s for this session only · Esc to cancel');
  const effortMenu = () => 'Effort\r\n' + ' '.repeat({ low: 0, medium: 7, high: 15, xhigh: 22, max: 28 }[sim.effort]!) + '▲\r\nlow   medium  high   xhigh  max\r\nUltracode off · Tab to toggle\r\n←/→ to adjust · Enter to confirm · s for this session only · Esc to cancel';
  // Claude 2.1.325 asks before re-reading a cached conversation with another model.
  const switchDialog = () => `Switch model?\r\nYour next response will be slower and use more tokens\r\nThis conversation is cached for the current model. Switching to ${sim.shown} means the full history gets re-read.\r\n❯ 1. Yes, switch to ${sim.shown}\r\n  2. No, go back`;
  const render = () => {
    const text = sim.menu === 'model' ? modelMenu() : sim.menu === 'effort' ? effortMenu() : sim.menu === 'switch' ? switchDialog() : sim.acks + '\r\n' + idle(sim.draft, MODES[sim.mode]!);
    screen.feed(`\x1b[2J\x1b[H${'\r\n'.repeat(Math.max(0, 40 - text.split('\r\n').length))}${text}`); engine.observe(meta);
  };
  render();
  const step = () => {
    now += 250; engine.observe(meta);
    const a = engine.propose(); if (!a) return;
    assert.equal(engine.sent(a), true); written.push(a);
    if (a.kind === 'text') sim.draft = a.value;
    else if (a.value === 'enter') {
      if (sim.menu === 'switch') { meta.model = { id: 'm', label: sim.switching }; sim.acks += `\r\n⎿ Set model to ${sim.switching} for this session only`; meta.at = now; sim.menu = ''; }
      else if (sim.menu === 'model') { assert.equal(sim.selection, 'more', 'Enter never saves a model default'); sim.expanded = true; }
      else { sim.menu = sim.draft.slice(1); sim.draft = ''; if (sim.menu === 'model') sim.selection = LABELS.indexOf(meta.model.label); }
    } else if (a.value === 'escape') sim.menu = '';
    else if (a.value === 'up') sim.selection = sim.selection === 'more' ? 5 : sim.selection === 6 ? 'more' : Math.max(1, (sim.selection as number) - 1);
    else if (a.value === 'down') sim.selection = sim.selection === 5 ? 'more' : sim.selection === 'more' ? (sim.expanded ? 6 : 'more') : Math.min(6, (sim.selection as number) + 1);
    else if (a.value === 'left' || a.value === 'right') { const l = ['low', 'medium', 'high', 'xhigh', 'max']; sim.effort = l[l.indexOf(sim.effort) + (a.value === 'right' ? 1 : -1)]!; }
    else if (a.value === 'mode') sim.mode = (sim.mode + 1) % 4;
    else if (a.value === 'session') {
      if (sim.menu === 'model' && options.switchDialog) { sim.switching = LABELS[sim.selection as number]!; sim.shown = options.switchDialog === 'same' ? sim.switching : options.switchDialog; sim.menu = 'switch'; render(); return; }
      if (sim.menu === 'model') { const label = LABELS[sim.selection as number]!; meta.model = { id: 'm', label: options.planModel ?? label }; sim.acks += `\r\n⎿ Set model to ${label} for this session only`; }
      else { meta.effort = sim.effort; sim.acks += `\r\n⎿ Set effort level to ${sim.effort} (this session only)`; }
      meta.at = now; sim.menu = '';
    } else assert.fail(`unexpected key ${a.value}`);
    render();
  };
  const run = (n = 400) => { for (let i = 0; i < n; i++) { engine.pursue(); engine.discover(); step(); if (!engine.busy && !engine.current().input && !(engine.snapshot().wanted && Object.values(engine.snapshot().wanted!).some(w => w.status === 'pending' || w.status === 'applying'))) { if (engine.snapshot().models.length) break; } } };
  const want = (changes: Partial<Record<WantedField, string>>, ids: Partial<Record<WantedField, string>> = {}) => {
    const w: NativeWanted = { version: 1, hostId, sessionId, changes, ids: Object.fromEntries(Object.keys(changes).map(k => [k, ids[k as WantedField] ?? randomUUID()])) };
    engine.want(w); return w;
  };
  return { engine, sim, meta, written, step, run, want, render, advance: (ms: number) => { now += ms; } };
}
const keys = (written: NativeAction[]) => written.map(a => a.value);

test('wanted file and catalog shapes are validated', () => {
  assert.equal(validWanted({ version: 1, hostId, sessionId, changes: { mode: 'plan' }, ids: { mode: randomUUID() } }), true);
  assert.equal(validWanted({ version: 1, hostId, sessionId, changes: { mode: 'plan' }, ids: {} }), false, 'every field has an id');
  assert.equal(validWanted({ version: 1, hostId, sessionId, changes: { speed: 'fast' }, ids: { speed: randomUUID() } }), false);
  assert.equal(validCatalog({ version: 1, cliVersion: '2.1.325', primaryLast: 5, models: [{ key: 'k', label: 'Opus 5.5', group: 'primary', index: 2 }], efforts: { 'Opus 5.5': { values: ['low', 'high'], recommended: 'high', ultracode: true } } }), true);
  assert.equal(validCatalog({ version: 1, cliVersion: '2.1.300', primaryLast: 5, models: [], efforts: {} }), false, 'below the native floor');
});

test('discovery reads models and efforts once and never opens /fast', () => {
  const w = claude(); w.run();
  assert.equal(w.engine.snapshot().models.length, 5);
  assert.deepEqual(w.engine.snapshot().efforts, ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.ok(!w.written.some(a => a.value === '/fast'));
  const catalog = w.engine.exportCatalog()!;
  assert.equal(catalog.cliVersion, '2.1.325');
  assert.deepEqual(catalog.efforts['Sonnet 5.5']?.values, ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.equal(catalog.models.find(m => m.label === 'Sonnet 5')?.group, 'more');
});

test('a catalog file of the same CLI version replaces discovery; another version does not', () => {
  const first = claude(); first.run(); const catalog = first.engine.exportCatalog()!;
  const w = claude(); assert.equal(w.engine.loadCatalog(catalog), true);
  w.run(20);
  assert.deepEqual(w.written, [], 'no menu is opened');
  assert.equal(w.engine.snapshot().models.length, 5);
  const other = claude({ version: '2.1.326' }); assert.equal(other.engine.loadCatalog(catalog), false);
});

test('wanted fields go in order model, effort, mode; an effective value needs no keys', () => {
  const first = claude(); first.run(); const catalog = first.engine.exportCatalog()!;
  const w = claude(); w.engine.loadCatalog(catalog);
  const key = (label: string) => catalog.models.find(m => m.label === label)!.key;
  w.want({ mode: 'plan', effort: 'medium', model: key('Haiku 5.5') });
  w.run();
  const wanted = w.engine.snapshot().wanted!;
  assert.deepEqual(Object.fromEntries(Object.entries(wanted).map(([k, v]) => [k, v.status])), { model: 'applied', effort: 'applied', mode: 'applied' });
  assert.equal(w.meta.model.label, 'Haiku 5.5'); assert.equal(w.meta.effort, 'medium'); assert.equal(w.engine.snapshot().mode, 'plan');
  const order = w.written.filter(a => a.kind === 'text' || a.value === 'mode').map(a => a.value);
  assert.deepEqual(order.slice(0, 2), ['/model', '/effort'], 'the model first, then its efforts');
  assert.equal(order.at(-1), 'mode');
  const again = claude(); again.engine.loadCatalog(catalog); again.want({ mode: 'auto' }); again.run(10);
  assert.equal(again.engine.snapshot().wanted!.mode!.status, 'applied'); assert.deepEqual(again.written, []);
});

test('the short path starts at the current row: no walk to the top; More models expands only for its rows', () => {
  const first = claude(); first.run(); const catalog = first.engine.exportCatalog()!;
  const known = { values: ['low', 'medium', 'high', 'xhigh', 'max'], recommended: 'high', ultracode: true };
  // Efforts of the other models are known except Sonnet 5: they are read once after the switch.
  for (const label of ['Opus 5.5', 'Haiku 5.5', 'Fable 5.2']) catalog.efforts[label] = known;
  const key = (label: string) => catalog.models.find(m => m.label === label)!.key;
  const w = claude({ model: 3 }); w.engine.loadCatalog(catalog); w.want({ model: key('Fable 5.2') }); w.run();
  assert.deepEqual(keys(w.written), ['/model', 'enter', 'down', 'down', 'session']);
  const back = claude({ model: 5 }); back.engine.loadCatalog(catalog); back.want({ model: key('Opus 5.5') }); back.run();
  assert.deepEqual(keys(back.written), ['/model', 'enter', 'up', 'up', 'up', 'session']);
  const more = claude({ model: 4 }); more.engine.loadCatalog(catalog); more.want({ model: key('Sonnet 5') }); more.run();
  assert.deepEqual(keys(more.written).slice(0, 5), ['/model', 'enter', 'down', 'down', 'enter']);
  assert.ok(!more.written.some(a => a.value === '/effort'), 'the model transaction ends with its acknowledgement');
  more.run();
  assert.equal(more.meta.model.label, 'Sonnet 5');
  assert.equal(more.written.filter(a => a.value === 'session').length, 1, 'the efforts of the new model are only previewed');
  assert.ok(more.written.some(a => a.value === '/effort'), 'Sonnet 5 had no cached efforts');
  assert.deepEqual(more.engine.exportCatalog()!.efforts['Sonnet 5']?.values, known.values);
});

test('M29 T005: the "Switch model?" dialog of a cached conversation is confirmed for the own target only', () => {
  const first = claude(); first.run(); const catalog = first.engine.exportCatalog()!;
  for (const label of ['Opus 5.5', 'Haiku 5.5', 'Fable 5.2']) catalog.efforts[label] = catalog.efforts['Sonnet 5.5']!;
  const key = (label: string) => catalog.models.find(m => m.label === label)!.key;
  const w = claude({ switchDialog: 'same' }); w.engine.loadCatalog(catalog); w.want({ model: key('Haiku 5.5') }); w.run();
  assert.deepEqual(keys(w.written), ['/model', 'enter', 'down', 'session', 'enter']);
  assert.equal(w.meta.model.label, 'Haiku 5.5'); assert.equal(w.engine.snapshot().wanted!.model!.status, 'applied');
  // A dialog naming another model is closed with Esc and counts as a failure; nothing is switched.
  const x = claude({ switchDialog: 'Opus 5.5' }); x.engine.loadCatalog(catalog); x.want({ model: key('Haiku 5.5') }); x.run(60);
  assert.equal(x.meta.model.label, 'Sonnet 5.5'); assert.equal(x.sim.menu, '', 'the dialog is not left open');
  assert.deepEqual(keys(x.written).slice(0, 5), ['/model', 'enter', 'down', 'session', 'escape']);
  assert.ok(x.engine.snapshot().wanted!.model!.attempts >= 1);
});

test('M29 T005: in plan mode the statusline keeps the plan model; Claude\'s line naming the target confirms it', () => {
  const first = claude(); first.run(); const catalog = first.engine.exportCatalog()!;
  for (const label of ['Opus 5.5', 'Haiku 5.5', 'Fable 5.2']) catalog.efforts[label] = catalog.efforts['Sonnet 5.5']!;
  const key = (label: string) => catalog.models.find(m => m.label === label)!.key;
  const w = claude({ planModel: 'Sonnet 5.5' }); w.engine.loadCatalog(catalog); w.want({ model: key('Haiku 5.5') }); w.run(40);
  assert.equal(w.engine.snapshot().wanted!.model!.status, 'applied');
  assert.deepEqual(keys(w.written), ['/model', 'enter', 'down', 'session'], 'no retry and no effort reading');
  assert.equal(w.engine.snapshot().model?.label, 'Sonnet 5.5', 'the panel shows what Claude reports');
});

test('a newer choice replaces the older one; an applied id is never applied again', () => {
  const w = claude(); w.run();
  const id = randomUUID();
  w.want({ mode: 'plan' }, { mode: id }); w.run();
  assert.equal(w.engine.snapshot().mode, 'plan');
  w.want({ mode: 'plan' }, { mode: id }); const before = w.written.length; w.sim.mode = 0; w.render(); w.run(20);
  assert.equal(w.written.length, before, 'the same id stays applied');
  w.want({ mode: 'acceptEdits' }); w.run();
  assert.equal(w.engine.snapshot().mode, 'acceptEdits');
});

test('cancellation by the user is retried without counting; other failures fail the field after three tries', () => {
  const w = claude(); w.run();
  w.want({ mode: 'plan' });
  w.engine.pursue(); assert.equal(w.engine.snapshot().wanted!.mode!.status, 'applying');
  w.engine.userInput(); w.step(); w.step();
  assert.equal(w.engine.snapshot().wanted!.mode!.status, 'pending');
  assert.equal(w.engine.snapshot().wanted!.mode!.attempts, 0);
  const x = claude(); x.run(); x.want({ effort: 'medium' });
  for (let attempt = 1; attempt <= 3; attempt++) {
    x.engine.pursue(); x.engine.cancel(); x.step(); x.step(); x.advance(1000);
  }
  const status = x.engine.snapshot().wanted!.effort!;
  assert.equal(status.status, 'failed'); assert.equal(status.attempts, 3); assert.ok(status.reason);
  const y = claude(); y.run(); y.want({ effort: 'ultra-high' }); y.run(5);
  assert.equal(y.engine.snapshot().wanted!.effort!.status, 'failed', 'a value outside the catalog fails at once');
});

test('the host reads the wanted and catalog files and writes the catalog once', async () => {
  const files = new Map<string, string>(); const debug = '/logs/session.debug.log';
  const screen = new TerminalScreen(); let now = 1000;
  const host = new ParameterHost(debug, hostId, '/project', screen, {
    read: async (file) => files.get(file) ?? null,
    take: async (file) => { const v = files.get(file) ?? null; files.delete(file); return v; },
    put: async (file, value) => void files.set(file, JSON.stringify(value)),
  }, () => now);
  const meta: NativeMetadata = { version: 1, hostId, sessionId, cwd: '/project', cliVersion: '2.1.325', model: { id: 'm', label: 'Sonnet 5.5' }, effort: 'high', fast: false, at: now };
  files.set(debug + PARAMETER_NATIVE, JSON.stringify(meta));
  const catalog: NativeCatalog = { version: 1, cliVersion: '2.1.325', primaryLast: 5,
    models: [{ key: 'native:Sonnet%205.5', label: 'Sonnet 5.5', group: 'primary', index: 3 }],
    efforts: { 'Sonnet 5.5': { values: ['low', 'high'], recommended: 'high', ultracode: false } } };
  files.set(debug + PARAMETER_CATALOG, JSON.stringify(catalog));
  files.set(debug + PARAMETER_WANTED, JSON.stringify({ version: 1, hostId, sessionId, changes: { mode: 'plan' }, ids: { mode: randomUUID() } }));
  screen.feed(`\x1b[2J\x1b[H${'\r\n'.repeat(36)}${idle('', 'auto')}`);
  now += 500; assert.equal(await host.poll(), null, 'no key while the frame is fresh');
  now += 300; const action = await host.poll();
  assert.equal(action?.value, 'mode', 'the wanted mode goes first, no discovery');
  const state = JSON.parse(files.get(debug + PARAMETER_STATE)!);
  assert.deepEqual(state.efforts, ['low', 'high']);
  assert.equal(state.wanted.mode.status, 'applying');
  assert.equal(files.get(debug + PARAMETER_CATALOG), JSON.stringify(catalog), 'an unchanged catalog is not rewritten');
});

test('replaceFile retries a busy rename on Windows and gives up on other errors', async () => {
  const calls: string[] = []; let failures = 2;
  const ops = (code: string) => ({
    write: async (path: string) => void calls.push(`write ${path}`),
    rename: async () => { calls.push('rename'); if (failures-- > 0) throw Object.assign(new Error(code), { code }); },
    sleep: async () => void calls.push('sleep'),
  });
  await replaceFile('C:\\logs\\s.parameters-wanted', '{}', ops('EPERM'));
  assert.deepEqual(calls, ['write C:\\logs\\s.parameters-wanted.partial', 'rename', 'sleep', 'rename', 'sleep', 'rename']);
  failures = 1; await assert.rejects(replaceFile('/tmp/x', '{}', ops('ENOENT')), /ENOENT/);
  failures = 10; await assert.rejects(replaceFile('/tmp/x', '{}', ops('EBUSY'), 3), /EBUSY/);
});
