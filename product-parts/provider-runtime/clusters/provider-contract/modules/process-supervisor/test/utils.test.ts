import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanEnv, parsePsLine, psInspector, runCommand, systemBootId } from '../src/index.ts';
import type { RunResult } from '../src/index.ts';

test('cleanEnv removes CLAUDE* and undefined values, adds extra', () => {
  const env = cleanEnv(
    { PATH: '/bin', CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'cli', HOME: undefined, MY_CLAUDE: 'kept' },
    { extra: { WFK_SERVICE_SESSION: 'trust', CLAUDE_X: 'no' }, platform: 'darwin' },
  );
  assert.deepEqual(env, { PATH: '/bin', MY_CLAUDE: 'kept', WFK_SERVICE_SESSION: 'trust' });
  assert.deepEqual(cleanEnv({ claude_x: '1', A: '2' }, { platform: 'win32' }), { A: '2' });
  assert.deepEqual(cleanEnv({ claude_x: '1' }, { platform: 'linux' }), { claude_x: '1' });
});

test('parsePsLine reads group, start time and the full command line', () => {
  const info = parsePsLine(42, '  4242 Thu Nov  5 17:07:08 2026     /usr/bin/expect -f session.exp "a  b"\n');
  assert.deepEqual(info, {
    pid: 42,
    pgid: 4242,
    startToken: 'Thu Nov 5 17:07:08 2026',
    startedAt: new Date(2026, 10, 5, 17, 7, 8).toISOString(),
    commandLine: '/usr/bin/expect -f session.exp "a  b"',
  });
  assert.equal(parsePsLine(1, 'garbage'), undefined);
});

test('psInspector inspects the current process and never runs on Windows', async () => {
  if (process.platform !== 'win32') {
    const info = await psInspector()(process.pid);
    assert.ok(info);
    assert.match(info.commandLine, /node/);
    assert.equal(await psInspector()(2 ** 30), undefined);
  }
  let calls = 0;
  const run = async (): Promise<RunResult> => {
    calls += 1;
    return { code: 0, signal: null, stdout: '', stderr: '', timedOut: false, startError: null };
  };
  assert.equal(await psInspector({ platform: 'win32', run })(process.pid), undefined);
  assert.equal(calls, 0);
});

test('systemBootId reads Linux boot_id and macOS boottime, null elsewhere', async () => {
  const linux = systemBootId({ platform: 'linux', readText: async () => 'abc-123\n' });
  assert.equal(await linux(), 'linux:abc-123');
  const run = async (): Promise<RunResult> => ({
    code: 0,
    signal: null,
    stdout: '{ sec = 1793861039, usec = 881716 } Thu Nov  5 07:43:59 2026\n',
    stderr: '',
    timedOut: false,
    startError: null,
  });
  assert.equal(await systemBootId({ platform: 'darwin', run })(), 'darwin:1793861039');
  assert.equal(await systemBootId({ platform: 'win32' })(), null);
});

test('runCommand passes stdin, keeps the exit code and reports start errors and timeouts', async () => {
  const echo = await runCommand(process.execPath, ['-e', 'process.stdin.pipe(process.stdout); process.exitCode = 3'], { input: 'hi' });
  assert.equal(echo.stdout, 'hi');
  assert.equal(echo.code, 3);
  assert.equal(echo.startError, null);
  const missing = await runCommand('/nonexistent/wfk-program', []);
  assert.equal(missing.code, null);
  assert.equal(missing.startError, 'ENOENT');
  const slow = await runCommand(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], { timeoutMs: 200 });
  assert.equal(slow.timedOut, true);
  assert.equal(slow.code, null);
  const env = await runCommand(process.execPath, ['-e', 'process.stdout.write(process.env.X || "")'], { env: { X: 'y', PATH: process.env['PATH'] } });
  assert.equal(env.stdout, 'y');
});

test('Windows identity comes from CIM and the boot id from the last boot time (M5 3)', async () => {
  const { cimInspector, parseCimLine, windowsBootId } = await import('../src/windows.ts');
  assert.deepEqual(parseCimLine(5, '\uFEFF2026-11-09T10:00:00.1234567Z\t"C:\\x\\node.exe" host.mjs «Склад»\r\n'), {
    pid: 5, pgid: null, startToken: '2026-11-09T10:00:00.1234567Z', startedAt: '2026-11-09T10:00:00.123Z', commandLine: '"C:\\x\\node.exe" host.mjs «Склад»',
  });
  assert.equal(parseCimLine(5, ''), undefined);
  const scripts: string[] = [];
  const run = async (command: string, args: readonly string[]) => {
    scripts.push(`${command} ${args.at(-1)}`);
    const out = String(args.at(-1)).includes('Win32_OperatingSystem') ? '2026-11-09T09:00:00Z' : '2026-11-09T10:00:00.0000000Z\tnode.exe';
    return { code: 0, signal: null, stdout: out, stderr: '', timedOut: false, startError: null };
  };
  assert.equal((await cimInspector({ run })(42))?.commandLine, 'node.exe');
  assert.match(scripts[0]!, /^powershell\.exe .*UTF8.*ProcessId=42/);
  assert.equal(await windowsBootId({ run })(), 'win32:2026-11-09T09:00:00Z');
  assert.equal(await cimInspector({ run })(-1), undefined);
});
