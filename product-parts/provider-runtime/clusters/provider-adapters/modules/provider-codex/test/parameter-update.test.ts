import assert from 'node:assert/strict';
import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createParameterParts } from '../src/parameters.ts';
import { createParameterUpdater } from '../src/parameter-update.ts';
import type { CodexRuntime } from '../src/runtime.ts';
import { RpcError } from '../src/rpc.ts';
import type { RpcSession } from '../src/rpc.ts';
import type { SharedAccess } from '#provider-registry';

async function fixture(platform: NodeJS.Platform) {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-update-')); const file = path.join(tmp, 'rollout');
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  const thread = { id: 's', model: 'wide', reasoningEffort: 'ultra', path: file, status: { type: 'active' } };
  const settings: Record<string, unknown> = { service_tier: 'priority', collaboration_mode: { mode: 'default', settings: { developer_instructions: 'Keep me' } }, permission_profile: { type: 'disabled' } };
  const models = [
    { model: 'wide', displayName: 'Wide', hidden: false, defaultReasoningEffort: 'high', supportedReasoningEfforts: ['low', 'high', 'ultra'].map(reasoningEffort => ({ reasoningEffort })), serviceTiers: [{ id: 'priority' }] },
    { model: 'small', displayName: 'Small', hidden: false, defaultReasoningEffort: 'low', supportedReasoningEfforts: [{ reasoningEffort: 'low' }], serviceTiers: [] },
  ];
  let loaded = true; let sharedState = 'active'; let refreshes = 0; let updateError: Error | null = null;
  const persist = async () => appendFile(file, JSON.stringify({ type: 'event_msg', payload: { type: 'thread_settings_applied', thread_settings: settings } }) + '\n');
  await writeFile(file, ''); await persist();
  const session = { async request(method: string, raw: unknown = {}) {
    const params = raw as Record<string, unknown>; calls.push({ method, params });
    if (method === 'thread/read') return { thread };
    if (method === 'model/list') return { data: models };
    if (method === 'collaborationMode/list') return { data: [{ mode: 'default' }, { mode: 'plan' }] };
    if (method === 'permissionProfile/list') return { data: [{ id: ':danger-full-access', allowed: true }, { id: ':read-only', allowed: true }, { id: ':workspace', allowed: false }] };
    if (method === 'account/rateLimits/read') return {};
    if (method === 'thread/loaded/list') return { data: loaded ? ['s'] : [], nextCursor: null };
    if (method === 'thread/resume') { loaded = true; return {}; }
    if (method === 'thread/unsubscribe') { loaded = false; return {}; }
    if (method === 'thread/settings/update') {
      if (updateError) throw updateError;
      if (params.model) thread.model = String(params.model);
      if (params.effort) thread.reasoningEffort = String(params.effort);
      if (Object.hasOwn(params, 'serviceTier')) settings.service_tier = params.serviceTier;
      if (params.collaborationMode) settings.collaboration_mode = params.collaborationMode;
      if (params.permissions) settings.permission_profile = params.permissions === ':danger-full-access' ? { type: 'disabled' } : { type: 'custom' };
      await persist(); return {};
    }
    throw new Error('Unexpected method ' + method);
  } } as unknown as RpcSession;
  const rt = { context: { platform, now: () => new Date('2026-11-13T10:00:00Z'), log: () => {} }, withDaemon: async (fn: (s: RpcSession) => Promise<unknown>) => fn(session) } as unknown as CodexRuntime;
  const parts = createParameterParts(rt, { cached: () => ({ state: sharedState }) } as unknown as SharedAccess);
  const update = createParameterUpdater(rt, parts, { active: () => sharedState === 'active', refresh: async () => { refreshes++; return sharedState === 'active'; } });
  return { parts, update, thread, settings, models, calls, updates: () => calls.filter(c => c.method === 'thread/settings/update').map(c => c.params),
    loaded(v: boolean) { loaded = v; }, state(v: string) { sharedState = v; }, error(e: Error | null) { updateError = e; }, refreshes: () => refreshes, close: () => rm(tmp, { recursive: true, force: true }) };
}
for (const platform of ['darwin', 'linux', 'win32'] as const) test(`${platform}: effort-only, compatible model, speed and mode keep other settings intact`, async () => {
  const f = await fixture(platform);
  try {
    let result = await f.update('s', { effort: 'high' });
    assert.deepEqual(f.updates()[0], { threadId: 's', effort: 'high' });
    assert.equal(result.items.find(i => i.id === 'effort')?.value, 'high'); assert.ok(result.notes?.includes('Применится со следующего хода'));
    await f.update('s', { model: 'wide' }); assert.deepEqual(f.updates()[1], { threadId: 's', model: 'wide' });
    assert.deepEqual(f.settings.collaboration_mode, { mode: 'default', settings: { developer_instructions: 'Keep me' } });
    await f.update('s', { speed: 'standard' }); assert.deepEqual(f.updates()[2], { threadId: 's', serviceTier: null });
    await f.update('s', { mode: 'plan' }); assert.deepEqual(f.updates()[3], { threadId: 's', collaborationMode: { mode: 'plan', settings: { model: 'wide', reasoning_effort: 'high', developer_instructions: null } } });
    assert.equal(f.refreshes(), 4);
    assert.ok(!f.calls.some(c => c.method === 'turn/settings/update' || c.method === 'turn/start'));
  } finally { await f.close(); }
});
for (const platform of ['darwin', 'linux', 'win32'] as const) test(`${platform}: inherited incompatibilities repaired together, explicit invalid choices refused`, async () => {
  const f = await fixture(platform);
  try {
    await assert.rejects(f.update('s', { model: 'small', effort: 'ultra' }), { code: 'parameter-invalid' });
    await assert.rejects(f.update('s', { model: 'small', speed: 'priority' }), { code: 'parameter-invalid' });
    assert.equal(f.updates().length, 0);
    const result = await f.update('s', { model: 'small' });
    assert.deepEqual(f.updates(), [{ threadId: 's', model: 'small', effort: 'low', serviceTier: null }]);
    assert.equal(result.notes?.filter(n => /новая модель/.test(n)).length, 2);
  } finally { await f.close(); }
});
test('full access needs confirmation; prohibited/unknown profiles and unknown models/modes fail without updates', async () => {
  const f = await fixture('darwin');
  try {
    await assert.rejects(f.update('s', { permissions: ':danger-full-access' }), (e: unknown) => { assert.equal((e as { code: string }).code, 'confirmation-required'); return true; });
    for (const change of [{ permissions: ':workspace' }, { permissions: 'bogus' }, { model: 'bogus' }, { mode: 'bogus' }, { effort: 'bogus' }, { speed: 'bogus' }]) await assert.rejects(f.update('s', change), { code: 'parameter-invalid' });
    assert.equal(f.updates().length, 0);
    await f.update('s', { permissions: ':danger-full-access', confirmed: true });
    assert.deepEqual(f.updates(), [{ threadId: 's', permissions: ':danger-full-access' }]);
  } finally { await f.close(); }
});
test('a not loaded thread is resumed and unsubscribed; refusal cached until refresh', async () => {
  const f = await fixture('linux');
  try {
    f.loaded(false); f.thread.status.type = 'notLoaded';
    await f.update('s', { effort: 'high' });
    assert.deepEqual(f.calls.filter(c => ['thread/resume', 'thread/settings/update', 'thread/unsubscribe'].includes(c.method)).map(c => c.method), ['thread/resume', 'thread/settings/update', 'thread/unsubscribe']);
    f.error(new RpcError('thread/settings/update', -32601, 'unknown method'));
    await assert.rejects(f.update('s', { effort: 'low' }), { code: 'parameters-unavailable' });
    assert.equal((await f.parts.readParameters('s')).editable, false);
    const count = f.updates().length; await assert.rejects(f.update('s', { effort: 'low' }), { code: 'parameters-unavailable' }); assert.equal(f.updates().length, count);
    f.parts.clearCache(); f.error(null); await f.update('s', { effort: 'low' });
  } finally { await f.close(); }
});
test('concurrent edits re-read effective values and preserve both; refresh can revoke shared access', async () => {
  const f = await fixture('win32');
  try {
    await Promise.all([f.update('s', { effort: 'high' }), f.update('s', { mode: 'plan' })]);
    assert.equal(f.thread.reasoningEffort, 'high');
    assert.deepEqual(f.updates()[1], { threadId: 's', collaborationMode: { mode: 'plan', settings: { model: 'wide', reasoning_effort: 'high', developer_instructions: null } } });
    f.state('needs-connection'); await assert.rejects(f.update('s', { effort: 'low' }), { code: 'parameters-unavailable' });
    assert.equal(f.updates().length, 2);
  } finally { await f.close(); }
});
for (const fix of ['effort', 'speed'] as const) test(`model changes repair only incompatible inherited ${fix}`, async () => {
  const f = await fixture('darwin');
  try {
    if (fix === 'effort') f.models[1]!.serviceTiers = [{ id: 'priority' }];
    else f.models[1]!.supportedReasoningEfforts.push({ reasoningEffort: 'ultra' });
    const result = await f.update('s', { model: 'small' });
    assert.deepEqual(f.updates()[0], fix === 'effort'
      ? { threadId: 's', model: 'small', effort: 'low' }
      : { threadId: 's', model: 'small', serviceTier: null });
    assert.equal(result.notes?.filter(n => /новая модель/.test(n)).length, 1);
  } finally { await f.close(); }
});
