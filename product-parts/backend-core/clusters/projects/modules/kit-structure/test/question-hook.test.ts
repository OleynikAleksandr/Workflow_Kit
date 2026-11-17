// The question hooks of structure v4 (spec M33 section 2.3): PreToolUse and PermissionRequest of
// AskUserQuestion only for Claude, the exec form on Windows, a v3 project (and a v4 one written before
// the PreToolUse hook, live check T008) is "outdated" and the update adds the hooks, and
// .codex/hooks.json stays byte for byte the same.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import {
  MANIFEST_PATH,
  QUESTION_HOOK_TIMEOUT_S,
  QUESTION_PRETOOL_TIMEOUT_S,
  STRUCTURE_VERSION,
  checkStructure,
  expectedKitHooksText,
  findKitHook,
  installStructure,
  isKitHookEntry,
  kitHookEntry,
  kitHookEvents,
  kitHooksText,
  sha256,
  withKitHooks,
} from '../src/index.ts';

let tmp = '';
before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-question-hook-'));
});
after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

const read = (root: string, name: string): Promise<string> => readFile(path.join(root, name), 'utf8');

test('the question hook entry on darwin, linux and win32; only Claude gets the event', () => {
  for (const platform of ['darwin', 'linux'] as const) {
    assert.deepEqual(kitHookEntry('claude', 'PermissionRequest', { platform, node: '', launcher: '' }), {
      type: 'command',
      command: '[ -x "$HOME/.local/bin/wfk" ] && "$HOME/.local/bin/wfk" hook question --client claude; exit 0',
      timeout: QUESTION_HOOK_TIMEOUT_S,
    });
  }
  const win = { platform: 'win32' as const, node: 'C:\\Program Files\\nodejs\\node.exe', launcher: 'C:\\Users\\u\\AppData\\Local\\Workflow Kit\\wfk.mjs' };
  const entry = kitHookEntry('claude', 'PermissionRequest', win);
  assert.equal(entry['command'], 'C:/Program Files/nodejs/node.exe');
  assert.deepEqual(entry['args'], ['C:/Users/u/AppData/Local/Workflow Kit/wfk.mjs', 'hook', 'question', '--client', 'claude']);
  assert.equal(entry['timeout'], 43_200);
  assert.ok(isKitHookEntry(entry));
  assert.deepEqual(kitHookEvents('claude'), ['SessionStart', 'Stop', 'UserPromptSubmit', 'PreToolUse', 'PermissionRequest']);
  assert.deepEqual(kitHookEvents('codex'), ['SessionStart', 'Stop', 'UserPromptSubmit']);
  const codex = withKitHooks(undefined, 'codex', win) as { hooks: Record<string, unknown> };
  assert.equal('PermissionRequest' in codex.hooks, false);
  assert.equal('PreToolUse' in codex.hooks, false);
});

test('the PreToolUse hook of the question: same command, short timeout, exec form on win32', () => {
  for (const platform of ['darwin', 'linux'] as const) {
    assert.deepEqual(kitHookEntry('claude', 'PreToolUse', { platform, node: '', launcher: '' }), {
      type: 'command',
      command: '[ -x "$HOME/.local/bin/wfk" ] && "$HOME/.local/bin/wfk" hook question --client claude; exit 0',
      timeout: QUESTION_PRETOOL_TIMEOUT_S,
    });
  }
  assert.equal(QUESTION_PRETOOL_TIMEOUT_S, 30);
  const win = { platform: 'win32' as const, node: 'C:\\Program Files\\nodejs\\node.exe', launcher: 'C:\\Users\\u\\AppData\\Local\\Workflow Kit\\wfk.mjs' };
  const entry = kitHookEntry('claude', 'PreToolUse', win);
  assert.equal(entry['command'], 'C:/Program Files/nodejs/node.exe');
  assert.deepEqual(entry['args'], ['C:/Users/u/AppData/Local/Workflow Kit/wfk.mjs', 'hook', 'question', '--client', 'claude']);
  assert.equal(entry['timeout'], 30);
  for (const host of [{ platform: 'linux' as const, node: '', launcher: '' }, win]) {
    const foreign = { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo check' }] };
    const written = withKitHooks({ hooks: { PreToolUse: [foreign] } }, 'claude', host) as { hooks: { PreToolUse: unknown[] } };
    assert.deepEqual(written.hooks.PreToolUse, [foreign, { matcher: 'AskUserQuestion', hooks: [kitHookEntry('claude', 'PreToolUse', host)] }]);
    assert.deepEqual(withKitHooks(written, 'claude', host), written, 'a second write changes nothing');
    assert.equal(findKitHook(written, 'PreToolUse').kind, 'found');
  }
});

test('foreign PermissionRequest groups stay first; the Kit group is appended once with the matcher', () => {
  const host = { platform: 'linux' as const, node: '', launcher: '' };
  const foreign = { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo approve' }] };
  const once = withKitHooks({ hooks: { PermissionRequest: [foreign] } }, 'claude', host) as { hooks: { PermissionRequest: unknown[] } };
  assert.deepEqual(once.hooks.PermissionRequest, [foreign, { matcher: 'AskUserQuestion', hooks: [kitHookEntry('claude', 'PermissionRequest', host)] }]);
  const twice = withKitHooks(once, 'claude', host);
  assert.deepEqual(twice, once, 'a second write changes nothing');
  assert.equal(findKitHook(twice, 'PermissionRequest').kind, 'found');
  assert.equal(kitHooksText(twice), expectedKitHooksText('claude', host));
});

test('a structure v3 project is "outdated"; the update adds the question hook and keeps the Codex file byte for byte', async () => {
  const root = path.join(tmp, 'v3');
  await mkdir(root, { recursive: true });
  await installStructure(root);
  // Back to v3: Claude settings without the question hook, the manifest of that time.
  const settingsFile = path.join(root, '.claude', 'settings.json');
  const settings = JSON.parse(await read(root, '.claude/settings.json')) as { hooks: Record<string, unknown> };
  delete settings.hooks['PermissionRequest'];
  delete settings.hooks['PreToolUse'];
  await writeFile(settingsFile, `${JSON.stringify(settings, null, 2)}\n`);
  const manifest = JSON.parse(await read(root, MANIFEST_PATH)) as { version: number; fragments: Record<string, { sha256: string; version: number }> };
  manifest.version = 3;
  for (const record of Object.values(manifest.fragments)) record.version = 3;
  manifest.fragments['claude-hook']!.sha256 = sha256(kitHooksText(settings)!);
  await writeFile(path.join(root, MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`);
  const codexBefore = await read(root, '.codex/hooks.json');

  const report = await checkStructure(root);
  assert.equal(report.fragments.find((f) => f.id === 'claude-hook')?.status, 'outdated');
  assert.equal(report.fragments.find((f) => f.id === 'codex-hook')?.status, 'ok');
  const result = await installStructure(root);
  assert.ok(result.written.includes('claude-hook'));
  assert.equal(result.written.includes('codex-hook'), false);
  assert.equal(result.report.status, 'ok');
  const updated = JSON.parse(await read(root, '.claude/settings.json')) as { hooks: Record<string, Array<{ matcher?: string }>> };
  assert.equal(updated.hooks['PermissionRequest']?.[0]?.matcher, 'AskUserQuestion');
  assert.equal(updated.hooks['PreToolUse']?.[0]?.matcher, 'AskUserQuestion');
  assert.equal(await read(root, '.codex/hooks.json'), codexBefore, '.codex/hooks.json is not touched');
  assert.equal((JSON.parse(await read(root, MANIFEST_PATH)) as { version: number }).version, STRUCTURE_VERSION);
  assert.equal(STRUCTURE_VERSION, 6);
});

test('a v4 project written before the PreToolUse hook is "outdated"; the update adds it', async () => {
  const root = path.join(tmp, 'v4-before-pretool');
  await mkdir(root, { recursive: true });
  await installStructure(root);
  const settingsFile = path.join(root, '.claude', 'settings.json');
  const settings = JSON.parse(await read(root, '.claude/settings.json')) as { hooks: Record<string, unknown> };
  delete settings.hooks['PreToolUse'];
  await writeFile(settingsFile, `${JSON.stringify(settings, null, 2)}\n`);
  const manifest = JSON.parse(await read(root, MANIFEST_PATH)) as { fragments: Record<string, { sha256: string }> };
  manifest.fragments['claude-hook']!.sha256 = sha256(kitHooksText(settings)!);
  await writeFile(path.join(root, MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`);

  assert.equal((await checkStructure(root)).fragments.find((f) => f.id === 'claude-hook')?.status, 'outdated');
  const result = await installStructure(root);
  assert.ok(result.written.includes('claude-hook'));
  assert.equal(result.report.status, 'ok');
  const updated = JSON.parse(await read(root, '.claude/settings.json')) as { hooks: Record<string, Array<{ matcher?: string }>> };
  assert.equal(updated.hooks['PreToolUse']?.[0]?.matcher, 'AskUserQuestion');
});
