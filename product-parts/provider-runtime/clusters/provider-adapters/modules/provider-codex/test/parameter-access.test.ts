import assert from 'node:assert/strict';
import { appendFile } from 'node:fs/promises';
import { test } from 'node:test';
import { accessHarness } from './access-harness.ts';
import type { SessionParameters } from '#provider-registry';
function access(parameters: SessionParameters) { const p = parameters.presentation; assert.equal(p?.layout, 'effort-card'); return p.access; }
import { accessId } from '../src/parameter-access.ts';
for (const platform of ['darwin', 'linux', 'win32'] as const) test(`${platform}: native access roundtrip preserves independent settings, fresh restrictions, no current turn`, async () => {
  const f = await accessHarness(platform);
  try {
    const before = structuredClone(f.settings.collaboration_mode);
    const read = await f.parts.readParameters('s', f.cwd);
    assert.equal(read.presentation?.layout, 'effort-card'); assert.equal(read.presentation.access.value, 'ask');
    assert.equal(read.presentation.speedHint, 'Скорость 1,5×\nБольше использования');
    const result = await f.update('s', { access: 'auto' }, f.cwd);
    assert.equal(access(result).value, 'auto');
    assert.deepEqual(f.updates()[0]?.params, { threadId: 's', permissions: ':workspace', approvalPolicy: 'on-request', approvalsReviewer: 'auto_review' });
    assert.deepEqual(f.settings.collaboration_mode, before); assert.equal(f.thread.model, 'wide'); assert.equal(f.thread.reasoningEffort, 'high'); assert.equal(f.settings.service_tier, 'priority');
    await assert.rejects(f.update('s', { access: 'full' }, f.cwd), { code: 'confirmation-required' }); assert.equal(f.updates().length, 1);
    assert.equal(access(await f.update('s', { access: 'full', confirmed: true }, f.cwd)).value, 'full');
    const reads = f.calls.filter(c => c.method === 'configRequirements/read').length;
    f.state.requirements = { requirements: { allowedApprovalsReviewers: ['user'] } };
    await assert.rejects(f.update('s', { access: 'auto' }, f.cwd), { code: 'parameter-invalid' });
    assert.ok(f.calls.filter(c => c.method === 'configRequirements/read').length > reads); assert.equal(f.updates().length, 2);
    assert.ok(f.calls.filter(c => c.method === 'permissionProfile/list').every(c => c.params.cwd === f.cwd));
    assert.ok(!f.calls.some(c => /turn\/|config\/.*write/.test(c.method)));
  } finally { await f.close(); }
});
test('conservative current-state recognition, omitted reviewer, explicit changes and stale profile cannot imply full access', async () => {
  const f = await accessHarness('darwin');
  try {
    await f.update('s', { access: 'auto' });
    await appendFile(f.file, JSON.stringify({ type: 'turn_context', payload: { sandbox_policy: { type: 'workspace-write' }, approval_policy: 'on-request' } }) + '\n');
    assert.equal(access(await f.parts.readParameters('s')).value, 'auto');
    await f.update('s', { access: 'full', confirmed: true });
    await appendFile(f.file, JSON.stringify({ type: 'turn_context', payload: { sandbox_policy: { type: 'workspace-write' }, approval_policy: 'never' } }) + '\n');
    assert.equal(access(await f.parts.readParameters('s')).value, null);
    assert.equal(accessId(':read-only', 'on-request', 'user'), null);
    assert.equal(accessId(':workspace', 'on-request', 'guardian_subagent'), 'auto');
    assert.equal(accessId(':workspace', { type: 'granular' }, 'user'), null);
    assert.equal(accessId(':danger-full-access', 'never', undefined), null);
  } finally { await f.close(); }
});
test('feature disable, malformed requirements, disallowed profile, mixed legacy fields and ignored writes refuse safely', async () => {
  const f = await accessHarness('win32');
  try {
    for (const key of ['guardian', 'configFlag'] as const) {
      if (key === 'guardian') f.state.guardian = false; else { f.state.guardian = true; f.state.configFlag = false; }
      await assert.rejects(f.update('s', { access: 'auto' }), { code: 'parameter-invalid' });
    }
    f.state.configFlag = undefined; f.state.requirements = { requirements: 'unexpected' };
    await assert.rejects(f.update('s', { access: 'ask' }), { code: 'parameter-invalid' });
    f.state.requirements = { requirements: null }; f.state.profilesAllowed = false;
    await assert.rejects(f.update('s', { access: 'full', confirmed: true }), { code: 'parameter-invalid' });
    f.state.profilesAllowed = true;
    for (const change of [{ access: 'auto', permissions: ':workspace' }, { access: 'toString' }]) await assert.rejects(f.update('s', change), { code: 'parameter-invalid' });
    assert.equal(f.updates().length, 0); f.state.ignoreUpdate = true;
    await assert.rejects(f.update('s', { access: 'auto' }), { code: 'parameters-unavailable' });
  } finally { await f.close(); }
});
test('access catalog is scoped to cwd and read requests never resume a thread', async () => {
  const f = await accessHarness('linux');
  try {
    await f.parts.readParameters('s', '/one'); await f.parts.readParameters('s', '/two');
    assert.equal(f.calls.filter(c => c.method === 'config/read').length, 2);
    assert.equal(f.calls.filter(c => c.method === 'permissionProfile/list').length, 2);
    assert.ok(!f.calls.some(c => c.method === 'thread/resume'));
  } finally { await f.close(); }
});

test('Codex rejects foreign Ultracode before any RPC, including a mixed otherwise valid model change', async () => {
  const f = await accessHarness('linux');
  try {
    const before = f.calls.length;
    for (const change of [{ ultracode: 'on' }, { model: 'wide', ultracode: 'on' }]) await assert.rejects(f.update('s', change), { code: 'parameter-invalid' });
    assert.equal(f.calls.length, before); assert.equal(f.updates().length, 0);
  } finally { await f.close(); }
});
