import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { SharedAccess } from '#provider-registry';
import { createParameterParts } from '../src/parameters.ts';
import { permissionId } from '../src/parameter-values.ts';
import type { CodexRuntime } from '../src/runtime.ts';
import { RpcError } from '../src/rpc.ts';
import type { RpcSession } from '../src/rpc.ts';

const model = { model: 'gpt-6.1-sol', displayName: 'GPT-6.1-Sol', defaultReasoningEffort: 'medium', supportedReasoningEfforts: [{ reasoningEffort: 'high' }, { reasoningEffort: 'medium' }], serviceTiers: [{ id: 'priority' }], hidden: false };
const rootEntry = { path: { type: 'special', value: { kind: 'root' } }, access: 'read' };
function profile(platform: NodeJS.Platform) {
  const folder = platform === 'win32' ? 'C:\\Work' : '/work';
  return { runtime_workspace_roots: [folder], permission_profile: { type: 'managed', network: 'restricted', file_system: { type: 'restricted', entries: [rootEntry,
    { path: { type: 'path', path: folder }, access: 'write' },
    { path: { type: 'special', value: { kind: 'slash_tmp' } }, access: 'write' },
    { path: { type: 'special', value: { kind: 'tmpdir' } }, access: 'write' },
    { path: { type: 'path', path: folder + (platform === 'win32' ? '\\.git' : '/.git') }, access: 'read', missing_path_behavior: 'skip' },
  ] } } };
}
async function fixture(platform: NodeJS.Platform) {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-param-'));
  const file = path.join(tmp, 'session.jsonl'); let now = Date.parse('2026-11-13T10:00:00Z');
  const settings = { ...profile(platform), model: 'ignored-file-model', reasoning_effort: 'low', service_tier: 'priority', collaboration_mode: { mode: 'plan' }, approval_policy: 'never' };
  await writeFile(file, JSON.stringify({ type: 'event_msg', payload: { type: 'thread_settings_applied', thread_settings: settings } }) + '\n'
    + JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { model_context_window: 475000, last_token_usage: { total_tokens: 31024 } } } }) + '\n');
  const calls: string[] = []; const flags: boolean[] = []; const fails = new Set<string>();
  const thread: Record<string, unknown> = { id: 's1', model: 'gpt-6.1-sol', reasoningEffort: 'high', path: file, status: { type: 'notLoaded' } };
  let sharedState = 'active'; let rejectExperimental = false;
  const session = { async request(method: string) {
    calls.push(method); if (fails.has(method)) throw new Error('catalog unavailable');
    if (method === 'thread/read') return { thread };
    if (method === 'model/list') return { data: [model] };
    if (method === 'collaborationMode/list') return { data: [{ mode: 'default' }, { mode: 'plan' }] };
    if (method === 'permissionProfile/list') return { data: [':workspace', ':read-only', ':danger-full-access'].map(id => ({ id, allowed: true })) };
    if (method === 'account/rateLimits/read') return { rateLimits: { primary: { usedPercent: 42, windowDurationMins: 300, resetsAt: 1794567600 }, secondary: { usedPercent: 29, windowDurationMins: 10080, resetsAt: null } } };
    throw new Error('Unexpected method: ' + method);
  } } as unknown as RpcSession;
  const rt = { context: { platform, now: () => new Date(now), runCommand: () => { throw new Error('read launched a program'); } },
    async withDaemon<T>(fn: (s: RpcSession) => Promise<T>, _timeout?: number, experimental?: boolean): Promise<T> {
      flags.push(experimental ?? false);
      if (experimental && rejectExperimental) throw new RpcError('initialize', -32600, 'experimental capability unavailable');
      return fn(session);
    },
  } as unknown as CodexRuntime;
  const shared = { cached: () => sharedState === 'missing' ? null : ({ state: sharedState, checkedAt: '2000-01-01T00:00:00Z' }), state: () => { throw new Error('read refreshed shared state'); } } as unknown as SharedAccess;
  return { tmp, file, calls, flags, fails, thread, settings, parts: createParameterParts(rt, shared),
    advance(ms: number) { now += ms; }, state(s: string) { sharedState = s; }, rejectExperimental() { rejectExperimental = true; }, close: () => rm(tmp, { recursive: true, force: true }) };
}
for (const platform of ['darwin', 'linux', 'win32'] as const) test(`${platform}: effective values, labels, context, limits, catalogs cached without loads or programs`, async () => {
  const f = await fixture(platform);
  try {
    const result = await f.parts.readParameters('s1');
    assert.deepEqual(result.items.map(i => [i.id, i.label, i.inRow]), [ ['speed', 'Быстрая', true], ['model', 'GPT-6.1 Sol', true], ['effort', 'Высокое', true], ['permissions', 'Рабочая папка', true], ['mode', 'План', true] ]);
    assert.equal(result.items[0]?.icon, 'zap'); assert.equal(result.items.find(i => i.id === 'permissions')?.value, ':workspace');
    assert.equal(result.items.find(i => i.id === 'permissions')?.options?.find(o => o.value === ':danger-full-access')?.confirm?.includes('полный доступ'), true);
    assert.equal(result.editable, true); assert.equal(result.context?.usedTokens, 31024); assert.equal(result.context.windowTokens, 475000);
    assert.equal(result.context.usedPercent, 100 * 31024 / 475000); assert.deepEqual(result.limits.map(l => l.label), ['5 ч', '7 д']);
    assert.deepEqual(result.notes, ['Одобрения: never']);
    await f.parts.readParameters('s1');
    assert.equal(f.calls.filter(m => m === 'model/list').length, 1);
    f.advance(61000); await f.parts.readParameters('s1');
    assert.equal(f.calls.filter(m => m === 'account/rateLimits/read').length, 2);
    assert.equal(f.calls.filter(m => m === 'model/list').length, 1);
    f.advance(600000); await f.parts.readParameters('s1');
    assert.equal(f.calls.filter(m => m === 'model/list').length, 2);
    assert.ok(f.calls.every(m => ['thread/read', 'model/list', 'account/rateLimits/read', 'collaborationMode/list', 'permissionProfile/list'].includes(m)));
    assert.ok(f.flags.every(Boolean));
  } finally { await f.close(); }
});
test('catalog failures keep values, per-item reason, only usable options make editable', async () => {
  const f = await fixture('darwin');
  try {
    f.fails.add('collaborationMode/list');
    let result = await f.parts.readParameters('s1');
    assert.equal(result.editable, true); assert.equal(result.items.find(i => i.id === 'mode')?.options, undefined);
    assert.ok(result.items.find(i => i.id === 'mode')?.reason);
    for (const m of ['model/list', 'permissionProfile/list']) f.fails.add(m);
    f.parts.clearCache(); result = await f.parts.readParameters('s1');
    assert.equal(result.editable, false); assert.equal(result.items.find(i => i.id === 'model')?.label, 'gpt-6.1-sol');
  } finally { await f.close(); }
});
test('experimental rejection retries without capability and disables edits, values still readable', async () => {
  const f = await fixture('darwin');
  try { f.rejectExperimental(); const result = await f.parts.readParameters('s1'); assert.equal(result.editable, false); assert.deepEqual(f.flags, [true, false]); assert.ok(result.reason?.includes('не поддерживает')); }
  finally { await f.close(); }
});
test('missing, stale and disabled shared states never cause refresh; missing rollout omits unavailable fields', async () => {
  const f = await fixture('darwin');
  try {
    f.state('missing'); assert.equal((await f.parts.readParameters('s1')).editable, false);
    f.state('needs-connection'); assert.equal((await f.parts.readParameters('s1')).editable, false);
    f.state('active'); assert.equal((await f.parts.readParameters('s1')).editable, true);
    delete f.thread.path; const result = await f.parts.readParameters('s1');
    assert.equal(result.editable, false); assert.deepEqual(result.items.map(i => i.id), ['model', 'effort']);
    assert.equal(result.context, null); assert.ok(result.reason?.includes('первого сообщения'));
  } finally { await f.close(); }
});
test('unknown records are harmless, unfamiliar values show ids, refresh clears refusal', async () => {
  const f = await fixture('linux');
  try {
    await writeFile(f.file, '{"type":"unknown"}\n'); f.thread.model = 'custom-model'; f.thread.reasoningEffort = 'extreme';
    const result = await f.parts.readParameters('s1'); assert.equal(result.items[1]?.label, 'extreme');
    f.parts.markUnsupported(); assert.equal((await f.parts.readParameters('s1')).editable, false);
    await writeFile(f.file, JSON.stringify({ type: 'event_msg', payload: { type: 'thread_settings_applied', thread_settings: f.settings } }) + '\n');
    f.parts.clearCache(); f.thread.model = 'gpt-6.1-sol'; f.thread.reasoningEffort = 'high';
    assert.equal((await f.parts.readParameters('s1')).editable, true);
    f.fails.add('thread/read'); await assert.rejects(f.parts.readParameters('s1'), { code: 'parameters-unavailable' });
  } finally { await f.close(); }
});
for (const platform of ['darwin', 'linux', 'win32'] as const) test(`${platform}: conservative recognition of standard and custom permission structures`, () => {
  assert.equal(permissionId(profile(platform), false, platform), ':workspace');
  assert.equal(permissionId({ permission_profile: { type: 'disabled' } }, false, platform), ':danger-full-access');
  assert.equal(permissionId({ permission_profile: { type: 'managed', network: 'restricted', file_system: { type: 'restricted', entries: [rootEntry] } } }, false, platform), ':read-only');
  const modified = profile(platform); modified.permission_profile.file_system.entries.push({ path: { type: 'path', path: platform === 'win32' ? 'C:\\other' : '/other' }, access: 'write' });
  assert.equal(permissionId(modified, false, platform), null);
  assert.equal(permissionId({ ...profile(platform), permission_profile: { type: 'managed', network: 'enabled' } }, false, platform), null);
  assert.equal(permissionId({ sandbox_policy: { type: 'workspace-write' } }, true, platform), null);
  assert.equal(permissionId({ sandbox_policy: { type: 'read-only' } }, true, platform), ':read-only');
});
