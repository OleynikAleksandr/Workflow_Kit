import assert from 'node:assert/strict';
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { ProviderContext, Project } from '#provider-registry';
import { createClaudeParameterReader, contextUsage, claudeModelLabel, sessionSettings, statuslineCommand } from '../src/index.ts';
import type { ClaudeRuntime } from '../src/runtime.ts';
import { parseHostArgs } from '../src/pty/host.ts';

const obj = (v: unknown) => v as Record<string, unknown>;
for (const platform of ['darwin', 'linux', 'win32'] as const) test(`${platform}: snapshots, transcript fallback, rare mode and expired account windows`, async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-cp-')); const file = path.join(tmp, 'transcript');
  let snapshot: unknown = { model: { id: 'claude-fable-5-2', display_name: 'Fable 5.2' }, effort: { level: 'high' }, context_window: { used_percentage: 25, context_window_size: 200000, total_input_tokens: 50000 } };
  const context = { platform, dirs: { stateDir: tmp }, now: () => new Date('2026-11-13T12:00:00Z'), runCommand: () => { throw new Error('read launched a program'); } } as unknown as ProviderContext;
  const reader = createClaudeParameterReader(context, async name => name.endsWith('account.limits.json')
    ? { rate_limits: { five_hour: { used_percentage: 42, resets_at: '2026-11-13T14:00:00Z' }, seven_day: { used_percentage: 9, resets_at: '2026-11-12T12:00:00Z' } } } : snapshot);
  try {
    await writeFile(file, JSON.stringify({ type: 'permission-mode', permissionMode: 'auto' }) + '\n'
      + JSON.stringify({ type: 'noise', content: 'x'.repeat(1024 * 1024 + 100) }) + '\n'
      + JSON.stringify({ type: 'assistant', message: { model: 'claude-opus-5-5' }, effort: 'xhigh' }) + '\n');
    const first = await reader.read('s', file);
    assert.deepEqual(first.items.map(i => i.label), ['Fable 5.2', 'High', 'Auto']);
    assert.equal(first.context?.windowTokens, 200000); assert.equal(first.context.usedPercent, 25);
    assert.equal(first.context.modelWindowTokens, undefined);
    assert.equal(first.editable, false); assert.equal(first.reason, undefined); assert.equal(first.style.ring, 'last'); assert.equal(first.style.accent, '#4c8dff');
    assert.deepEqual(first.limits.map(l => l.label), ['5 ч']);
    snapshot = null;
    await appendFile(file, JSON.stringify({ type: 'assistant', message: { model: 'claude-opus-5-5' }, effort: 'ultra' }) + '\n');
    const fallback = await reader.read('s', file);
    assert.deepEqual(fallback.items.map(i => i.label), ['Opus 5.5', 'Ultracode', 'Auto']); assert.equal(fallback.context, null);
    await appendFile(file, JSON.stringify({ type: 'permission-mode', permissionMode: 'future-mode' }) + '\n');
    assert.equal((await reader.read('s', file)).items.at(-1)?.label, 'future-mode');
    assert.deepEqual((await reader.read('empty', null)).items, []);
    reader.clear(); assert.equal((await reader.read('s', file)).items.at(-1)?.label, 'future-mode');
  } finally { await rm(tmp, { recursive: true, force: true }); }
});
for (const platform of ['darwin', 'linux', 'win32'] as const) test(`${platform}: simultaneous launches get immutable independent settings and timing values`, async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-csettings-'));
  try {
    const projects = ['a', 'b'].map(id => ({ id, name: id, path: path.join(tmp, id) } as Project));
    for (const [index, project] of projects.entries()) {
      await mkdir(path.join(project.path, '.claude'), { recursive: true });
      await writeFile(path.join(project.path, '.claude', 'settings.local.json'), JSON.stringify({ statusLine: { type: 'command', command: 'user-command', padding: index + 1, refreshInterval: 100 + index } }));
    }
    const rt = { context: { platform, env: { LOCALAPPDATA: 'C:\\Local' }, homedir: tmp }, logsDir: path.join(tmp, 'logs') } as unknown as ClaudeRuntime;
    const files = await Promise.all(projects.map((project, i) => sessionSettings(rt, project, `session-${i}`)));
    assert.notEqual(files[0], files[1]);
    for (const [index, file] of files.entries()) {
      const line = obj(obj(JSON.parse(await readFile(file, 'utf8'))).statusLine);
      assert.equal(line.padding, index + 1); assert.equal(line.refreshInterval, 100 + index); assert.equal(line.command, statuslineCommand(rt));
      assert.ok(String(line.command).includes('statusline --client claude'));
      await assert.rejects(sessionSettings(rt, projects[index]!, `session-${index}`), { code: 'EEXIST' });
    }
    const parsed = parseHostArgs(['session', 'dir', 'claude', 'title', 'debug', 'resume-id'], { WFK_STATUSLINE_SETTINGS: files[0] });
    assert.equal(parsed?.mode.kind === 'session' && parsed.mode.settings, files[0]);
  } finally { await rm(tmp, { recursive: true, force: true }); }
});
test('unknown model identifiers are kept, known family/version rendered natively', () => {
  assert.equal(claudeModelLabel('claude-opus-5-5'), 'Opus 5.5'); assert.equal(claudeModelLabel('new-vendor-model'), 'new-vendor-model');
});
test('ConPTY forwards the unique settings file and leaves folder environments alone', async () => {
  const { runHost, claudeEnv } = await import('../src/pty/host.ts');
  for (const kind of ['session', 'environment'] as const) {
    const parsed = parseHostArgs([kind, 'dir', 'claude', 'label', 'debug'], { WFK_STATUSLINE_SETTINGS: 'C:/unique.settings.json' })!;
    let argv: string[] = [];
    await runHost(parsed.mode, { start: (_file, args) => { argv = args; return { pid: 1, onData: () => {}, onExit: fn => { queueMicrotask(() => fn(0)); }, write: () => true, kill: () => {} }; }, print: () => {}, takeFile: async () => null, sleep: ms => new Promise(r => setTimeout(r, ms)), now: Date.now, exit: () => {} }, { sessionMs: 10, environmentMs: 10, pollMs: 1 });
    assert.equal(argv.includes('--settings'), kind === 'session');
    if (kind === 'session') assert.equal(argv[argv.indexOf('--settings') + 1], 'C:/unique.settings.json');
    const env = claudeEnv(parsed.mode, { WFK_STATUSLINE_BASH: 'C:/Git/bin/bash.exe', WFK_STATUSLINE_SETTINGS: 'hidden' });
    assert.equal(env['CLAUDE_CODE_GIT_BASH_PATH'], 'C:/Git/bin/bash.exe'); assert.equal(env['WFK_STATUSLINE_SETTINGS'], undefined); assert.equal(env['WFK_STATUSLINE_BASH'], undefined);
  }
});

test('M28: context counts against the auto-compact window, the model window stays as a second figure', () => {
  assert.deepEqual(contextUsage({ context_window_size: 1000000, used_percentage: 8, total_input_tokens: 78451, auto_compact_window: 500000 }, 8),
    { usedTokens: 78451, windowTokens: 500000, usedPercent: 16, modelWindowTokens: 1000000 });
  assert.deepEqual(contextUsage({ context_window_size: 200000, used_percentage: 25, total_input_tokens: 50000, auto_compact_window: 500000 }, 25),
    { usedTokens: 50000, windowTokens: 200000, usedPercent: 25 });
  assert.deepEqual(contextUsage({ context_window_size: 1000000, used_percentage: 8, total_input_tokens: 78451 }, 8), { usedTokens: 78451, windowTokens: 1000000, usedPercent: 8 });
  assert.equal(contextUsage({ context_window_size: 1000000, total_input_tokens: 999999, auto_compact_window: 500000 }, null).usedPercent, 100);
});
test('M28 T014: an old host snapshot without a threshold gets it from the service; a new one keeps its own', async () => {
  const asked: Array<[string, string]> = [];
  let snapshot: Record<string, unknown> = { model: { id: 'claude-opus-5-5', display_name: 'Opus 5.5' }, context_window: { used_percentage: 31, context_window_size: 1000000, total_input_tokens: 313356 } };
  const context = { platform: 'darwin', dirs: { stateDir: '/tmp/none' }, now: () => new Date('2026-11-14T12:00:00Z'),
    autoCompactWindow: async (modelId: string, cwd: string) => { asked.push([modelId, cwd]); return { window: 500000, source: 'user' }; } } as unknown as ProviderContext;
  const reader = createClaudeParameterReader(context, async name => name.endsWith('account.limits.json') ? null : snapshot);
  const old = await reader.read('s', null, '/Users/user/project');
  assert.deepEqual(old.context, { usedTokens: 313356, windowTokens: 500000, usedPercent: 63, modelWindowTokens: 1000000 });
  assert.deepEqual(asked, [['claude-opus-5-5', '/Users/user/project']]);
  snapshot = { ...snapshot, context_window: { ...obj(snapshot['context_window']), auto_compact_window: 400000, auto_compact_source: 'project' } };
  assert.equal((await reader.read('s', null, '/Users/user/project')).context?.windowTokens, 400000, 'the host value wins');
  assert.equal(asked.length, 1, 'the service is not asked when the snapshot has the threshold');
  const none = createClaudeParameterReader({ ...context, autoCompactWindow: async () => null } as ProviderContext, async name => name.endsWith('account.limits.json') ? null : { ...snapshot, context_window: { context_window_size: 1000000, total_input_tokens: 10, used_percentage: 0 } });
  assert.equal((await none.read('s', null, '/x')).context?.windowTokens, 1000000, 'no threshold: the model window');
});
