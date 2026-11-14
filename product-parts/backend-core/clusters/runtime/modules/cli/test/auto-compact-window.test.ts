import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { managedSettingsFile, resolveAutoCompactWindow } from '../src/auto-compact-window.ts';

const OPUS = 'claude-opus-5-5';
function world(platform: NodeJS.Platform, files: Record<string, unknown>, env: NodeJS.ProcessEnv = {}) {
  const p = platform === 'win32' ? path.win32 : path.posix;
  const cwd = platform === 'win32' ? 'C:\\work\\project' : '/work/project';
  const homedir = platform === 'win32' ? 'C:\\Users\\u' : '/home/u';
  const at = { managed: managedSettingsFile(platform)!, local: p.join(cwd, '.claude', 'settings.local.json'), project: p.join(cwd, '.claude', 'settings.json'), user: p.join(homedir, '.claude', 'settings.json') };
  const content = new Map(Object.entries(files).map(([k, v]) => [at[k as keyof typeof at], typeof v === 'string' ? v : JSON.stringify(v)]));
  const reads: string[] = [];
  return { reads, deps: { platform, env, cwd, homedir, read: async (file: string) => { reads.push(file); const v = content.get(file); if (v === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); return v; } } };
}
const per = (window: unknown, model = OPUS) => ({ modelSettings: { [model]: { autoCompactWindow: window } } });

test('layers follow Claude 2.1.325: local, project, user; per-model beats general within a layer', async () => {
  for (const platform of ['darwin', 'linux', 'win32'] as const) {
    assert.deepEqual(await resolveAutoCompactWindow(OPUS, world(platform, { user: per(500000) }).deps), { window: 500000, source: 'user' });
    assert.deepEqual(await resolveAutoCompactWindow(OPUS, world(platform, { user: per(500000), project: per(300000) }).deps), { window: 300000, source: 'project' });
    assert.deepEqual(await resolveAutoCompactWindow(OPUS, world(platform, { user: per(500000), project: per(300000), local: per(250000) }).deps), { window: 250000, source: 'project-local' });
    assert.deepEqual(await resolveAutoCompactWindow(OPUS, world(platform, { project: per(300000), local: { autoCompactWindow: 220000 } }).deps), { window: 220000, source: 'project-local' });
    assert.deepEqual(await resolveAutoCompactWindow(OPUS, world(platform, { local: { autoCompactWindow: 220000, ...per(240000) } }).deps), { window: 240000, source: 'project-local' });
    assert.deepEqual(await resolveAutoCompactWindow(OPUS, world(platform, { managed: { autoCompactWindow: 150000 }, local: per(250000) }).deps), { window: 150000, source: 'managed' });
  }
});

test('environment wins, auto stops the search, out-of-range and malformed values fall through', async () => {
  assert.deepEqual(await resolveAutoCompactWindow(OPUS, world('linux', { local: per(250000) }, { CLAUDE_CODE_AUTO_COMPACT_WINDOW: '200000' }).deps), { window: 200000, source: 'env' });
  assert.equal(await resolveAutoCompactWindow(OPUS, world('linux', { local: per(250000) }, { CLAUDE_CODE_AUTO_COMPACT_WINDOW: 'auto' }).deps), null);
  assert.deepEqual(await resolveAutoCompactWindow(OPUS, world('linux', { local: per(250000) }, { CLAUDE_CODE_AUTO_COMPACT_WINDOW: 'x' }).deps), { window: 250000, source: 'project-local' });
  assert.equal(await resolveAutoCompactWindow(OPUS, world('darwin', { user: per(500000), local: per('auto') }).deps), null);
  assert.deepEqual(await resolveAutoCompactWindow(OPUS, world('darwin', { project: per(300000), local: { autoCompactWindow: 5000 } }).deps), { window: 300000, source: 'project' });
  assert.deepEqual(await resolveAutoCompactWindow(OPUS, world('darwin', { project: per(300000), local: { autoCompactWindow: 5000000 } }).deps), { window: 300000, source: 'project' });
  assert.deepEqual(await resolveAutoCompactWindow(OPUS, world('win32', { project: '{broken', user: per(500000) }).deps), { window: 500000, source: 'user' });
  assert.equal(await resolveAutoCompactWindow(OPUS, world('linux', {}).deps), null);
  assert.equal(await resolveAutoCompactWindow(null, world('linux', { user: per(500000) }).deps), null);
});

test('family alias applies, the exact id is preferred, another model is ignored', async () => {
  assert.deepEqual(await resolveAutoCompactWindow(OPUS, world('darwin', { local: { modelSettings: { opus: { autoCompactWindow: 260000 } } } }).deps), { window: 260000, source: 'project-local' });
  assert.deepEqual(await resolveAutoCompactWindow(OPUS, world('darwin', { local: { modelSettings: { opus: { autoCompactWindow: 260000 }, [OPUS]: { autoCompactWindow: 270000 } } } }).deps), { window: 270000, source: 'project-local' });
  assert.equal(await resolveAutoCompactWindow('claude-haiku-5-5', world('darwin', { user: per(500000) }).deps), null);
});

test('managed settings paths per platform', () => {
  assert.equal(managedSettingsFile('darwin'), '/Library/Application Support/ClaudeCode/managed-settings.json');
  assert.equal(managedSettingsFile('linux'), '/etc/claude-code/managed-settings.json');
  assert.equal(managedSettingsFile('win32'), 'C:\\Program Files\\ClaudeCode\\managed-settings.json');
  assert.equal(managedSettingsFile('freebsd'), null);
});
