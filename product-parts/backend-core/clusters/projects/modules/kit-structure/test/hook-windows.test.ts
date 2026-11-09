// Kit hooks on Windows (spec M5 section 6): the Claude exec form, the Codex commandWindows, their
// recognition, and macOS hooks kept exactly as before.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { expectedKitHooksText, findKitHook, isKitHookEntry, kitHookEntry, withKitHooks } from '../src/hook-config.ts';
import { defaultHookHost, hookText, powershellHookCommand } from '../src/hook-host.ts';
import { hookCommand } from '../src/templates.ts';

const WIN = { platform: 'win32' as const, node: 'C:\\Program Files\\nodejs\\node.exe', launcher: "C:\\Users\\O'Neil\\AppData\\Local\\Workflow Kit\\wfk.mjs" };
const MAC = { platform: 'darwin' as const, node: '/usr/local/bin/node', launcher: '' };

test('the Windows host: node of the service and wfk.mjs in %LOCALAPPDATA%\\Workflow Kit', () => {
  assert.deepEqual(defaultHookHost({ LOCALAPPDATA: 'D:\\Local' }, 'C:\\Users\\u', 'win32', 'C:\\node.exe'), {
    platform: 'win32',
    node: 'C:\\node.exe',
    launcher: 'D:\\Local\\Workflow Kit\\wfk.mjs',
  });
  assert.equal(defaultHookHost({}, 'C:\\Users\\u', 'win32', 'n').launcher, 'C:\\Users\\u\\AppData\\Local\\Workflow Kit\\wfk.mjs');
  assert.equal(defaultHookHost({}, '/Users/u', 'darwin', 'n').launcher, '');
});

test('Claude on Windows: the exec form node.exe + wfk.mjs with forward slashes, no shell', () => {
  assert.deepEqual(kitHookEntry('claude', 'Stop', WIN), {
    type: 'command',
    command: 'C:/Program Files/nodejs/node.exe',
    args: ["C:/Users/O'Neil/AppData/Local/Workflow Kit/wfk.mjs", 'hook', 'stop', '--client', 'claude'],
    timeout: 600,
  });
  assert.equal(hookText(kitHookEntry('claude', 'SessionStart', WIN)), "C:/Program Files/nodejs/node.exe C:/Users/O'Neil/AppData/Local/Workflow Kit/wfk.mjs hook session-start --client claude");
});

test('Codex on Windows: the POSIX command stays, commandWindows runs node through PowerShell', () => {
  const entry = kitHookEntry('codex', 'UserPromptSubmit', WIN);
  assert.equal(entry['command'], hookCommand('codex', 'UserPromptSubmit'));
  assert.equal(entry['timeoutSec'], 30);
  assert.equal(entry['commandWindows'], powershellHookCommand(WIN, 'prompt', 'codex'));
  assert.equal(
    entry['commandWindows'],
    "[Console]::InputEncoding=[Text.UTF8Encoding]::new($false); [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); " +
      "$OutputEncoding=[Text.UTF8Encoding]::new($false); [Console]::In.ReadToEnd() | & 'C:/Program Files/nodejs/node.exe' " +
      "'C:/Users/O''Neil/AppData/Local/Workflow Kit/wfk.mjs' hook prompt --client codex; exit 0",
  );
});

test('Kit recognises its Windows hooks, rewrites them in place and keeps macOS hooks unchanged', () => {
  const config = withKitHooks({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo foreign' }] }] } }, 'claude', WIN);
  const stop = findKitHook(config, 'Stop');
  assert.equal(stop.kind, 'found');
  assert.equal(stop.kind === 'found' && stop.group, 1);
  assert.equal(isKitHookEntry(kitHookEntry('codex', 'Stop', WIN)), true);
  assert.equal(isKitHookEntry({ type: 'command', command: 'node', args: ['other.mjs', 'hook', 'stop', '--x'] }), false);
  // A moved node is a different expected text (the check shows "устарело"), rewritten in place.
  const moved = { ...WIN, node: 'D:\\node\\node.exe' };
  assert.notEqual(expectedKitHooksText('claude', moved), expectedKitHooksText('claude', WIN));
  const rewritten = withKitHooks(config, 'claude', moved) as { hooks: Record<string, unknown[]> };
  assert.equal(rewritten.hooks['Stop']!.length, 2);
  assert.deepEqual(kitHookEntry('claude', 'Stop', MAC), { type: 'command', command: hookCommand('claude', 'Stop'), timeout: 600 });
  assert.deepEqual(kitHookEntry('codex', 'Stop', MAC), { type: 'command', command: hookCommand('codex', 'Stop'), timeoutSec: 600 });
});
