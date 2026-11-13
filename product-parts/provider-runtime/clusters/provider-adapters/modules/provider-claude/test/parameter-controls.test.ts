import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { Project, SessionParameters } from '#provider-registry';
import type { ClaudeRuntime } from '../src/runtime.ts';
import { createClaudeControls, nativeClaudeParameters } from '../src/parameter-controls.ts';
import { PARAMETER_REQUEST, PARAMETER_RESULT, PARAMETER_STATE } from '../src/pty/parameter-protocol.ts';
import type { NativeParameterState } from '../src/pty/parameter-protocol.ts';
import { readNativeJson, writeNativeJson } from '../src/native-parameters.ts';
const base: SessionParameters = { items: [], context: { usedTokens: 5000, windowTokens: 200000, usedPercent: 2.5 }, limits: [{ id: 'five_hour', label: '5 ч', usedPercent: 20, resetsAt: null }], editable: false, style: { font: 'system-ui', ring: 'last' }, at: 'old' };
const native = (): NativeParameterState => ({ version: 1, hostId: randomUUID(), sessionId: randomUUID(), epoch: '', at: Date.now(), cliVersion: '2.1.324', status: 'idle', inputEmpty: true, reason: null,
  model: { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5' }, effort: 'high', mode: 'auto', fast: false, ultracode: false, ultracodeAvailable: true, effortRecommended: 'medium',
  models: [{ key: 'native:Sonnet%205.5', label: 'Sonnet 5.5', group: 'primary' }, { key: 'native:Sonnet%205', label: 'Sonnet 5', group: 'more' }], efforts: ['low', 'medium', 'high', 'xhigh', 'max'], fastReason: 'Fast mode requires usage credits', pending: null });
test('presentation keeps effective ids distinct from opaque options, native hierarchy, separate Ultracode and unavailable fast', () => {
  const n = native(); const p = nativeClaudeParameters(base, n);
  assert.equal(p.presentation?.layout, 'claude-controls'); assert.equal(p.editable, true); assert.equal(p.items.find(i => i.id === 'model')?.value, 'claude-sonnet-5-5');
  assert.equal(p.items[0]?.options?.[0]?.selected, true); assert.equal(p.items[0]?.options?.[1]?.group, 'more');
  assert.equal(p.items.find(i => i.id === 'effort')?.options?.find(o => o.value === 'medium')?.recommended, true);
  assert.equal(p.items.find(i => i.id === 'speed')?.options?.[1]?.reason, n.fastReason); assert.equal(p.items.find(i => i.id === 'mode')?.options?.some(o => /bypass/i.test(o.value)), false);
  n.ultracode = true; assert.equal(nativeClaudeParameters(base, n).items.find(i => i.id === 'effort')?.value, 'high');
  const legacy = nativeClaudeParameters({ ...base, items: [{ id: 'effort', value: 'ultra', label: 'Ultracode', title: 'effort', tone: 'muted', inRow: true }] }, null);
  assert.equal(legacy.editable, false); assert.equal(legacy.items[0]?.value, 'ultra'); assert.match(legacy.notes?.[0] ?? '', /базовый effort неизвестен/); assert.equal(legacy.at, 'old');
  for (const status of ['busy', 'dialog', 'unknown', 'control'] as const) assert.equal(nativeClaudeParameters(base, { ...n, status }).editable, false);
});
for (const platform of ['darwin', 'linux', 'win32'] as const) test(`${platform}: read-only GET, one-field mutation, confirmed native result and related-state refresh`, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wfk-ccontrol-')); const debug = path.join(root, 'native'); const project = { id: 'p', path: root } as Project;
  let n = native(); n.epoch = n.hostId + ':1';
  const record = { localId: n.sessionId, remoteId: 'session_native', projectPath: root, projectId: 'p', debugFile: debug, controlHostId: n.hostId, processId: 'proc' };
  const rt = { context: { platform, runCommand() { throw new Error('GET executed program'); } }, store: { read: async () => ({ sessions: [record] }) }, isAlive: async () => true } as unknown as ClaudeRuntime;
  const controls = createClaudeControls(rt, { clear() {}, read: async () => structuredClone(base) });
  try {
    await writeNativeJson(debug + PARAMETER_STATE, n);
    const read = await controls.read(project, n.sessionId); assert.equal(read.editable, true); assert.equal(await readNativeJson(debug + PARAMETER_REQUEST), null);
    for (const change of [{ model: 'native:Sonnet%205', effort: 'medium' }, { access: 'full' }, { mode: 'bypassPermissions' }, { ultracode: 'maybe' }, { model: 'invented' }]) await assert.rejects(controls.update(project, n.sessionId, change), { code: 'parameter-invalid' });
    await assert.rejects(controls.update(project, n.sessionId, { speed: 'fast' }), { code: 'parameters-unavailable' });
    assert.equal(await readNativeJson(debug + PARAMETER_REQUEST), null);
    const update = controls.update(project, n.sessionId, { ultracode: 'on' });
    let request: any;
    for (let i = 0; i < 100 && !request; i++) { request = await readNativeJson(debug + PARAMETER_REQUEST); if (!request) await new Promise(r => setTimeout(r, 2)); }
    assert.equal(request.field, 'ultracode'); assert.equal(request.value, 'on');
    n = { ...n, ultracode: true, epoch: n.hostId + ':2', at: Date.now() };
    await writeNativeJson(debug + PARAMETER_STATE, n); await writeNativeJson(debug + PARAMETER_RESULT, { version: 1, id: request.id, hostId: n.hostId, sessionId: n.sessionId, status: 'applied', state: n });
    const result = await update; assert.equal(result.items.find(i => i.id === 'ultracode')?.value, 'on'); assert.equal(result.items.find(i => i.id === 'effort')?.value, 'high');
    assert.deepEqual(result.context, base.context); assert.deepEqual(result.limits, base.limits); assert.equal(result.items[0]?.value, 'claude-sonnet-5-5');
    await writeNativeJson(debug + PARAMETER_STATE, { ...n, status: 'busy', at: Date.now() }); await assert.rejects(controls.update(project, n.sessionId, { effort: 'medium' }), { code: 'parameters-busy' });
    await writeNativeJson(debug + PARAMETER_STATE, { ...n, at: 0 }); const stale = await controls.read(project, n.sessionId); assert.equal(stale.editable, false); assert.equal(stale.at, 'old');
    await assert.rejects(controls.update(project, n.sessionId, { effort: 'medium' }), { code: 'parameters-unavailable' });
  } finally { await rm(root, { recursive: true, force: true }); }
});
