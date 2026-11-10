// The start of the Kimi Code app with --workspace=<folder> (spec M9 section 8.1): the bundle and
// open -n -a on macOS, the program of the kimi-code handler and Start-Process on Windows, nothing
// on Linux (no app; the link opens the project). The platform is injected; nothing real runs.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { RunResult } from '#process-supervisor';
import { KIMI_APP_NAME, KIMI_SCHEME_KEYS, kimiWorkspaceCommand, parseHandlerProgram } from '../src/app-link.ts';

const result = (code: number, stdout = ''): RunResult => ({ code, signal: null, stdout, stderr: '', timedOut: false, startError: null });

test('macOS: open -n -a with the bundle of the app and --workspace=<folder>; no bundle, no command', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wfk-kimi-launch-'));
  try {
    const check = { platform: 'darwin' as const, env: {}, homedir: root, runCommand: async () => assert.fail('no program runs to find the app'), appFolders: [path.join(root, 'system'), path.join(root, 'user')] };
    assert.equal(await kimiWorkspaceCommand(check, '/Users/me/My project'), null);
    const bundle = path.join(root, 'user', KIMI_APP_NAME);
    await mkdir(bundle, { recursive: true });
    assert.deepEqual(await kimiWorkspaceCommand(check, '/Users/me/My project'), { command: 'open', args: ['-n', '-a', bundle, '--args', '--workspace=/Users/me/My project'] });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Linux: no command, the link opens the project', async () => {
  const check = { platform: 'linux' as const, env: {}, homedir: '/home/me', runCommand: async () => assert.fail('nothing runs on Linux') };
  assert.equal(await kimiWorkspaceCommand(check, '/home/me/app'), null);
});

test('Windows: the program of the kimi-code handler from the registry, started by Start-Process', async () => {
  const calls: Array<[string, readonly string[]]> = [];
  const answers: RunResult[] = [
    result(1),
    result(0, '\r\nHKEY_CLASSES_ROOT\\kimi-code\\shell\\open\\command\r\n    (Default)    REG_EXPAND_SZ    "%LOCALAPPDATA%\\Programs\\Kimi Code\\Kimi Code.exe" "%1"\r\n\r\n'),
  ];
  const check = {
    platform: 'win32' as const,
    env: { SystemRoot: 'D:\\Win', LOCALAPPDATA: "C:\\Users\\O'Neil\\AppData\\Local" },
    homedir: "C:\\Users\\O'Neil",
    runCommand: async (command: string, args: readonly string[]) => {
      calls.push([command, args]);
      return answers.shift() ?? result(1);
    },
  };
  const launch = await kimiWorkspaceCommand(check, 'C:\\Work\\Мой проект');
  assert.deepEqual(calls, KIMI_SCHEME_KEYS.map((key) => ['D:\\Win\\System32\\reg.exe', ['query', `${key}\\shell\\open\\command`, '/ve']]));
  assert.equal(launch?.command, 'D:\\Win\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.deepEqual(launch?.args.slice(0, -1), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command']);
  // Single quotes of PowerShell are doubled; the folder is quoted for the app.
  assert.equal(launch?.args.at(-1), `Start-Process -FilePath 'C:\\Users\\O''Neil\\AppData\\Local\\Programs\\Kimi Code\\Kimi Code.exe' -ArgumentList '--workspace="C:\\Work\\Мой проект"'`);
  // No handler or no program in it: no command.
  assert.equal(await kimiWorkspaceCommand({ ...check, runCommand: async () => result(1) }, 'C:\\Work'), null);
  assert.equal(await kimiWorkspaceCommand({ ...check, runCommand: async () => result(0, '(Default) REG_SZ rundll32.dll,Run %1') }, 'C:\\Work'), null);
});

test('parseHandlerProgram: a quoted or bare .exe; unknown variables and other programs give null', () => {
  const env = { ProgramFiles: 'C:\\Program Files' };
  assert.equal(parseHandlerProgram('    (Default)    REG_SZ    "C:\\Apps\\Kimi Code.exe" --open "%1"', env), 'C:\\Apps\\Kimi Code.exe');
  assert.equal(parseHandlerProgram('    (Default)    REG_EXPAND_SZ    %ProgramFiles%\\Kimi\\kimi.exe %1', env), 'C:\\Program Files\\Kimi\\kimi.exe');
  assert.equal(parseHandlerProgram('    (Default)    REG_EXPAND_SZ    "%NOPE%\\kimi.exe" "%1"', env), null);
  assert.equal(parseHandlerProgram('    (Default)    REG_SZ    "C:\\Apps\\kimi.cmd" "%1"', env), null);
  assert.equal(parseHandlerProgram('ERROR: The system was unable to find the specified registry key or value.', env), null);
});
