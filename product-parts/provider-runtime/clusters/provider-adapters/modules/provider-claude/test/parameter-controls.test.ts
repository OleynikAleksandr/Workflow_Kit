import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { Project, SessionParameters } from '#provider-registry';
import type { ClaudeRuntime } from '../src/runtime.ts';
import { CATALOG_PENDING, EFFORTS_PENDING, HOST_REQUIRED, createClaudeControls, nativeClaudeParameters, pendingNote } from '../src/parameter-controls.ts';
import { CATALOG_CACHE } from '../src/native-wanted.ts';
import { FAST_REASON, PARAMETER_CATALOG, PARAMETER_STATE, PARAMETER_WANTED } from '../src/pty/parameter-protocol.ts';
import type { NativeCatalog, NativeParameterState } from '../src/pty/parameter-protocol.ts';
import { readNativeJson, writeNativeJson } from '../src/native-parameters.ts';
const base: SessionParameters = { items: [], context: { usedTokens: 5000, windowTokens: 200000, usedPercent: 2.5 }, limits: [{ id: 'five_hour', label: '5 ч', usedPercent: 20, resetsAt: null }], editable: false, style: { font: 'system-ui', ring: 'last' }, at: 'old' };
const native = (): NativeParameterState => ({ version: 1, hostId: randomUUID(), sessionId: randomUUID(), epoch: '', at: Date.now(), cliVersion: '2.1.325', status: 'idle', inputEmpty: true, reason: null,
  model: { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5' }, effort: 'high', mode: 'auto', fast: false, ultracode: false, ultracodeAvailable: true, effortRecommended: 'medium',
  models: [{ key: 'native:Sonnet%205.5', label: 'Sonnet 5.5', group: 'primary' }, { key: 'native:Sonnet%205', label: 'Sonnet 5', group: 'more' }], efforts: ['low', 'medium', 'high', 'xhigh', 'max'], fastReason: FAST_REASON, pending: null, wantedFile: true });

test('presentation: native hierarchy, separate Ultracode, speed read-only; a turn does not lock the menus (M29)', () => {
  const n = native(); const p = nativeClaudeParameters(base, n);
  assert.equal(p.presentation?.layout, 'claude-controls'); assert.equal(p.editable, true); assert.equal(p.items.find(i => i.id === 'model')?.value, 'claude-sonnet-5-5');
  assert.equal(p.items[0]?.options?.[0]?.selected, true); assert.equal(p.items[0]?.options?.[1]?.group, 'more');
  assert.equal(p.items.find(i => i.id === 'effort')?.options?.find(o => o.value === 'medium')?.recommended, true);
  assert.equal(p.items.find(i => i.id === 'speed')?.options?.[1]?.reason, FAST_REASON); assert.equal(p.items.find(i => i.id === 'mode')?.options?.some(o => /bypass/i.test(o.value)), false);
  for (const status of ['busy', 'dialog', 'unknown', 'control'] as const) {
    const q = nativeClaudeParameters(base, { ...n, status });
    assert.equal(q.editable, true, status); assert.equal(q.reason, undefined, status);
    for (const item of q.items.filter(i => i.id !== 'speed' && i.id !== 'ultracode')) assert.equal(item.options?.every(o => !o.disabled), true, `${status} ${item.id}`);
  }
  const legacy = nativeClaudeParameters({ ...base, items: [{ id: 'effort', value: 'ultra', label: 'Ultracode', title: 'effort', tone: 'muted', inRow: true }] }, null);
  assert.equal(legacy.editable, false); assert.equal(legacy.items[0]?.value, 'ultra'); assert.match(legacy.notes?.[0] ?? '', /базовый effort неизвестен/); assert.equal(legacy.at, 'old');
  const old = nativeClaudeParameters(base, { ...n, wantedFile: undefined });
  assert.equal(old.editable, false); assert.equal(old.reason, HOST_REQUIRED, 'a 0.13.2 host does not read the wanted file');
});

test('pending notes say what a choice waits for', () => {
  const n = native();
  assert.equal(pendingNote(n), 'применяется');
  assert.equal(pendingNote({ ...n, status: 'control' }), 'применяется');
  assert.equal(pendingNote({ ...n, status: 'busy' }), 'применится, когда Claude закончит ответ');
  assert.equal(pendingNote({ ...n, inputEmpty: false }), 'применится, когда поле ввода Claude опустеет');
  assert.equal(pendingNote({ ...n, status: 'dialog' }), 'применится, когда Claude освободится');
});

test('M28 T014 kept: one reason per menu, never under the options', () => {
  const n = { ...native(), efforts: [] as string[] };
  const p = nativeClaudeParameters(base, n);
  assert.equal(p.reason, EFFORTS_PENDING);
  assert.equal(p.items.find(i => i.id === 'model')!.options?.every(o => !o.disabled && !o.reason), true);
  assert.equal(p.items.find(i => i.id === 'effort')!.options?.length, 0);
  assert.equal(nativeClaudeParameters(base, { ...n, models: [] }).reason, CATALOG_PENDING);
});

async function world(platform: NodeJS.Platform) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wfk-ccontrol-')); const debug = path.join(root, 'native'); const project = { id: 'p', path: root } as Project;
  const stateDir = path.join(root, 'state'); await mkdir(stateDir);
  const n = native(); n.epoch = n.hostId + ':1';
  const record = { localId: n.sessionId, remoteId: 'session_native', projectPath: root, projectId: 'p', debugFile: debug, controlHostId: n.hostId, processId: 'proc' };
  let now = Date.now();
  const rt = { context: { platform, dirs: { stateDir }, now: () => new Date(now), runCommand() { throw new Error('GET executed program'); } }, store: { read: async () => ({ sessions: [record] }) }, isAlive: async () => true } as unknown as ClaudeRuntime;
  const controls = createClaudeControls(rt, { clear() {}, read: async () => structuredClone(base) });
  await writeNativeJson(debug + PARAMETER_STATE, n);
  return { root, debug, project, stateDir, n, controls, rt, put: (s: NativeParameterState) => writeNativeJson(debug + PARAMETER_STATE, { ...s, at: Date.now() }), advance: (ms: number) => { now += ms; } };
}

for (const platform of ['darwin', 'linux', 'win32'] as const) test(`${platform}: a choice is answered at once as pending; the host's status settles it`, async () => {
  const w = await world(platform);
  try {
    const started = Date.now();
    const answer = await w.controls.update(w.project, w.n.sessionId, { effort: 'medium' });
    assert.ok(Date.now() - started < 1000, 'nothing waits for the terminal');
    const effort = answer.items.find(i => i.id === 'effort')!;
    assert.equal(effort.value, 'high', 'the row keeps the confirmed value');
    assert.deepEqual(effort.pending, { value: 'medium', label: 'Medium', note: 'применяется' });
    const wanted = await readNativeJson(w.debug + PARAMETER_WANTED);
    assert.deepEqual(wanted.changes, { effort: 'medium' }); assert.equal(wanted.hostId, w.n.hostId);
    // A newer choice of the same field replaces the older one with a new id.
    await w.put({ ...w.n, status: 'busy' });
    const later = await w.controls.update(w.project, w.n.sessionId, { effort: 'low' });
    assert.equal(later.items.find(i => i.id === 'effort')!.pending?.note, 'применится, когда Claude закончит ответ');
    const replaced = await readNativeJson(w.debug + PARAMETER_WANTED);
    assert.equal(replaced.changes.effort, 'low'); assert.notEqual(replaced.ids.effort, wanted.ids.effort);
    // The confirmed value again cancels the waiting choice.
    await w.controls.update(w.project, w.n.sessionId, { effort: 'high' });
    assert.equal(await readNativeJson(w.debug + PARAMETER_WANTED), null);
    // Applied: the host reports the id; the read prunes it and shows the new value.
    await w.controls.update(w.project, w.n.sessionId, { mode: 'plan' });
    const id = (await readNativeJson(w.debug + PARAMETER_WANTED)).ids.mode;
    await w.put({ ...w.n, mode: 'plan', wanted: { mode: { id, value: 'plan', status: 'applied', reason: null, attempts: 0 } } });
    const applied = await w.controls.read(w.project, w.n.sessionId);
    assert.equal(applied.items.find(i => i.id === 'mode')!.value, 'plan'); assert.equal(applied.items.find(i => i.id === 'mode')!.pending, undefined);
    assert.equal(await readNativeJson(w.debug + PARAMETER_WANTED), null);
    // Failed: shown in failures for 60 s, the row keeps the confirmed value.
    await w.controls.update(w.project, w.n.sessionId, { model: 'native:Sonnet%205' });
    const mid = (await readNativeJson(w.debug + PARAMETER_WANTED)).ids.model;
    await w.put({ ...w.n, wanted: { model: { id: mid, value: 'native:Sonnet%205', status: 'failed', reason: 'Каталог Claude изменился', attempts: 3 } } });
    const failed = await w.controls.read(w.project, w.n.sessionId);
    assert.equal(failed.items[0]!.value, 'claude-sonnet-5-5'); assert.equal(failed.items[0]!.pending, undefined);
    assert.equal(failed.failures?.[0]?.field, 'model'); assert.equal(failed.failures?.[0]?.reason, 'Каталог Claude изменился');
    w.advance(61_000); assert.equal((await w.controls.read(w.project, w.n.sessionId)).failures, undefined);
    for (const change of [{ model: 'native:Sonnet%205', effort: 'medium' }, { access: 'full' }, { mode: 'bypassPermissions' }, { ultracode: 'maybe' }, { model: 'invented' }]) await assert.rejects(w.controls.update(w.project, w.n.sessionId, change), { code: 'parameter-invalid' });
    await assert.rejects(w.controls.update(w.project, w.n.sessionId, { speed: 'fast' }), { code: 'parameters-unavailable' });
    await writeNativeJson(w.debug + PARAMETER_STATE, { ...w.n, at: 0 });
    const stale = await w.controls.read(w.project, w.n.sessionId); assert.equal(stale.editable, false); assert.equal(stale.at, 'old');
    await assert.rejects(w.controls.update(w.project, w.n.sessionId, { effort: 'medium' }), { code: 'parameters-unavailable' });
  } finally { await rm(w.root, { recursive: true, force: true }); }
});

test('the host catalog is cached per CLI version; a host without its catalog yet shows the cached menus', async () => {
  const w = await world('darwin');
  try {
    const catalog: NativeCatalog = { version: 1, cliVersion: '2.1.325', primaryLast: 5,
      models: [{ key: 'native:Opus%205.5', label: 'Opus 5.5', group: 'primary', index: 2 }, { key: 'native:Sonnet%205.5', label: 'Sonnet 5.5', group: 'primary', index: 3 }],
      efforts: { 'Sonnet 5.5': { values: ['low', 'high'], recommended: 'high', ultracode: false } } };
    await writeNativeJson(w.debug + PARAMETER_CATALOG, catalog);
    await w.controls.read(w.project, w.n.sessionId);
    assert.deepEqual(await readNativeJson(path.join(w.stateDir, CATALOG_CACHE)), catalog);
    // Another host of the same version adds efforts of another model.
    await writeNativeJson(w.debug + PARAMETER_CATALOG, { ...catalog, efforts: { 'Opus 5.5': { values: ['high', 'max'], recommended: 'high', ultracode: true } } });
    await w.controls.read(w.project, w.n.sessionId);
    assert.deepEqual(Object.keys((await readNativeJson(path.join(w.stateDir, CATALOG_CACHE))).efforts).sort(), ['Opus 5.5', 'Sonnet 5.5']);
    await w.put({ ...w.n, models: [], efforts: [] });
    const p = await w.controls.read(w.project, w.n.sessionId);
    assert.deepEqual(p.items[0]!.options?.map(o => o.label), ['Opus 5.5', 'Sonnet 5.5']);
    assert.deepEqual(p.items.find(i => i.id === 'effort')!.options?.map(o => o.value), ['low', 'high']);
    assert.equal(p.reason, undefined);
    await w.put({ ...w.n, models: [], efforts: [], cliVersion: '2.1.326' });
    assert.equal((await w.controls.read(w.project, w.n.sessionId)).reason, CATALOG_PENDING, 'another CLI version reads its own catalog');
  } finally { await rm(w.root, { recursive: true, force: true }); }
});
