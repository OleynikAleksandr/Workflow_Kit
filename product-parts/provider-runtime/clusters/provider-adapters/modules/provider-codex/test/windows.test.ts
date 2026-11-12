// Windows branches of the Codex provider (spec M5 section 5): codex.exe search, FILETIME start
// time, config keys, hooks with commandWindows, and the `codex app-server proxy` transport.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { codexProjectKey, filetimeMs, projectTrustLevel, readDaemonPid, sameFolder, tomlKey } from '../src/codex-files.ts';
import { HARNESS_CODEX_HOOK_COMMAND, buildHookState, kitCodexCommand, localHooks, sameHookKey } from '../src/hooks.ts';
import { proxyStream } from '../src/proxy.ts';
import { MIN_WINDOWS_CODEX, compareVersions, findProgram, windowsCodexCandidates } from '../src/runtime.ts';

const HOST = { platform: 'win32' as const, node: 'C:\\nodejs\\node.exe', launcher: 'C:\\Users\\u\\AppData\\Local\\Workflow Kit\\wfk.mjs' };

test('daemon.pid on Windows: the FILETIME start time becomes unix ms', async () => {
  // 2026-11-09T08:34:46Z = 1794213286 s → FILETIME (s + 11644473600) * 1e7.
  const filetime = (1_794_213_286 + 11_644_473_600) * 1e7;
  assert.equal(filetimeMs(filetime), 1_794_213_286_000);
  assert.equal(filetimeMs(String(filetime)), 1_794_213_286_000);
  assert.equal(filetimeMs(1_794_213_286), null);
  assert.equal(filetimeMs('Mon Nov  9 08:34:46 2026'), null);
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wfk-codex-pid-'));
  const file = path.join(dir, 'daemon.pid');
  await writeFile(file, JSON.stringify({ pid: 42, processStartTime: filetime }));
  assert.deepEqual(await readDaemonPid(file), { pid: 42, startedAt: null, startMs: 1_794_213_286_000 });
  await writeFile(file, JSON.stringify({ pid: 42, processStartTime: 'x', processIdentity: { creationTime: filetime } }));
  assert.equal((await readDaemonPid(file))?.startMs, 1_794_213_286_000);
  await rm(dir, { recursive: true, force: true });
});

test('config keys on Windows: escaped backslashes, lower case, case-insensitive trust', () => {
  assert.equal(tomlKey('C:\\a"b'), '"C:\\\\a\\"b"');
  assert.equal(codexProjectKey('C:\\Users\\Me\\Proj'), 'c:\\users\\me\\proj');
  assert.equal(codexProjectKey('/Users/Me/Proj'), '/Users/Me/Proj');
  assert.ok(sameFolder('C:\\Users\\Me\\Proj\\', 'c:/users/me/proj'));
  assert.ok(!sameFolder('/Users/Me', '/users/me'));
  const toml = '[projects."c:\\\\users\\\\me\\\\proj"]\ntrust_level = "trusted"\n';
  assert.equal(projectTrustLevel(toml, 'C:\\Users\\Me\\Proj'), 'trusted');
  assert.equal(projectTrustLevel("[projects]\n'c:\\users\\me\\other'.trust_level = \"untrusted\"\n", 'C:\\Users\\Me\\Other'), 'untrusted');
});

test('Codex hooks on Windows: commandWindows is the command compared, keys match across case and slashes', () => {
  const command = kitCodexCommand('SessionStart', HOST);
  assert.match(command, /^\[Console\]::InputEncoding=.*& 'C:\/nodejs\/node\.exe' 'C:\/Users\/u\/AppData\/Local\/Workflow Kit\/wfk\.mjs' hook session-start --client codex; exit 0$/);
  const file = 'C:\\p\\.codex\\hooks.json';
  const config = { hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'posix', commandWindows: command }] }] } };
  assert.deepEqual(localHooks(file, config, 'win32'), [{ key: `${file}:session_start:0:0`, event: 'SessionStart', command }]);
  assert.equal(localHooks(file, config, 'darwin')[0]?.command, 'posix');
  assert.ok(sameHookKey(`${file}:session_start:0:0`, 'c:/p/.codex/hooks.json:session_start:0:0'));
  assert.ok(!sameHookKey(`${file}:session_start:0:0`, `${file}:stop:0:0`));
  const listedKey = 'c:\\p\\.codex\\hooks.json:session_start:0:0';
  const state = buildHookState({
    local: { text: '{}', hooks: localHooks(file, config, 'win32'), error: null },
    listed: [{ key: listedKey, eventName: 'session_start', command, sourcePath: 'c:\\p\\.codex\\hooks.json', currentHash: 'h1', trustStatus: 'trusted' }],
    trusted: true,
  });
  // One entry under the key Codex reports (approvals are written under it), with its status.
  // (Kit recognition uses the templates of this machine, so on a test Mac it counts as foreign.)
  const all = [...(state.kitHook ? [state.kitHook] : []), ...state.hooks];
  assert.equal(all.length, 1);
  assert.equal(all[0]?.key, listedKey);
  assert.equal(all[0]?.status, 'approved');
});

test('Codex hooks on Windows: the Harness hook has no commandWindows, its command is compared and approved under the reported key', () => {
  const file = 'C:\\p\\.codex\\hooks.json';
  const config = { hooks: { SessionStart: [{ hooks: [{ type: 'command', command: HARNESS_CODEX_HOOK_COMMAND }] }] } };
  assert.deepEqual(localHooks(file, config, 'win32'), [{ key: `${file}:session_start:0:0`, event: 'SessionStart', command: HARNESS_CODEX_HOOK_COMMAND }]);
  const listedKey = 'c:/p/.codex/hooks.json:session_start:0:0';
  const state = buildHookState({
    local: { text: '{}', hooks: localHooks(file, config, 'win32'), error: null },
    listed: [{ key: listedKey, eventName: 'sessionStart', command: HARNESS_CODEX_HOOK_COMMAND, sourcePath: 'c:/p/.codex/hooks.json', currentHash: 'h', trustStatus: 'untrusted' }],
    trusted: true,
  });
  // The Harness command is the same on every OS, so it is a Kit hook here too; without the Kit
  // SessionStart hook nothing is shown as the Kit hook and nothing is listed as foreign.
  assert.equal(state.kitHook, null);
  assert.deepEqual(state.hooks, []);
});

test('codex.exe search on Windows: only .exe, the installer, the managed package and the npm package', async () => {
  const candidates = windowsCodexCandidates({ LOCALAPPDATA: 'C:\\L', PATH: 'C:\\npm' }, 'C:\\Users\\u', 'arm64');
  assert.deepEqual(candidates, [
    'C:\\L\\Programs\\OpenAI\\Codex\\bin\\codex.exe',
    'C:\\Users\\u\\.codex\\packages\\standalone\\current\\bin\\codex.exe',
    'C:\\npm\\node_modules\\@openai\\codex\\node_modules\\@openai\\codex-win32-arm64\\vendor\\aarch64-pc-windows-msvc\\bin\\codex.exe',
  ]);
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wfk-codex-exe-'));
  await writeFile(path.join(dir, 'codex.cmd'), '@echo off\r\n');
  assert.equal(await findProgram('codex', { PATH: dir }, 'win32'), null);
  await writeFile(path.join(dir, 'other.exe'), '');
  assert.equal(await findProgram('codex', { PATH: dir }, 'win32', [path.join(dir, 'other.exe')]), path.join(dir, 'other.exe'));
  await rm(dir, { recursive: true, force: true });
  assert.ok(compareVersions('0.167.0', MIN_WINDOWS_CODEX) > 0);
  assert.ok(compareVersions('0.159.3', MIN_WINDOWS_CODEX) < 0);
});

test('the proxy transport: codex app-server proxy --sock with a hidden window, bytes both ways', () => {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    exitCode: null as number | null,
    signalCode: null as string | null,
    killed: 0,
    kill() {
      this.killed += 1;
      return true;
    },
  });
  let call: { command: string; args: string[]; options: Record<string, unknown> } | null = null;
  const fakeSpawn = ((command: string, args: string[], options: Record<string, unknown>) => {
    call = { command, args, options };
    return child;
  }) as unknown as Parameters<typeof proxyStream>[1];
  const stream = proxyStream({ command: 'C:\\codex.exe', env: { A: '1' }, socketPath: 'C:\\s.sock' }, fakeSpawn);
  assert.deepEqual(call!.args, ['app-server', 'proxy', '--sock', 'C:\\s.sock']);
  assert.equal(call!.options['windowsHide'], true);
  const received: string[] = [];
  stream.onData((chunk) => received.push(chunk.toString()));
  child.stdout.write('pong');
  let written = '';
  child.stdin.on('data', (chunk: Buffer) => (written += chunk.toString()));
  stream.write('ping');
  return new Promise<void>((resolve) => {
    setImmediate(() => {
      assert.deepEqual(received, ['pong']);
      assert.equal(written, 'ping');
      stream.destroy();
      stream.destroy();
      assert.equal(child.killed, 1);
      assert.equal(stream.destroyed, true);
      resolve();
    });
  });
});
