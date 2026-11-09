// The Kit hook of Kimi (spec M8 section 2.3): the shell line per OS, the TOML text of the blocks,
// and the generated command executed through the shell of this OS with a stand-in launcher.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { KIMI_HOOK_EVENTS, isKimiKitCommand, kimiHookBlocks, kimiHookCommand, kimiHooksSection, tomlString } from '../src/kimi-hook.ts';
import type { HookHost } from '../src/hook-host.ts';

const MAC: HookHost = { platform: 'darwin', node: '/usr/local/bin/node', launcher: '' };
const LINUX: HookHost = { platform: 'linux', node: '/usr/bin/node', launcher: '' };
const WIN: HookHost = { platform: 'win32', node: 'C:\\Program Files\\nodejs\\node.exe', launcher: "C:\\Users\\O'Neil\\AppData\\Local\\Workflow Kit\\wfk.mjs" };
const POSIX_STOP = '[ -x "$HOME/.local/bin/wfk" ] && "$HOME/.local/bin/wfk" hook turn-end --client kimi; exit 0';
// A folder name with a space, Cyrillic letters and an apostrophe.
const AWKWARD = "wfk дом o'neil ";

/** Runs a hook command the way Kimi does: through the shell of the OS, the hook input on stdin. */
function runThroughShell(command: string, env: NodeJS.ProcessEnv, input: string): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    // Node's `shell: true` is /bin/sh -c on macOS and Linux; on Windows the same call is spelled out.
    const child =
      process.platform === 'win32'
        ? spawn(env['ComSpec'] ?? 'cmd.exe', ['/d', '/s', '/c', `"${command}"`], { env, windowsVerbatimArguments: true })
        : spawn('/bin/sh', ['-c', command], { env });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
    child.stdout.resume();
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stderr }));
    child.stdin.on('error', () => undefined);
    child.stdin.end(input);
  });
}

test('macOS and Linux get the POSIX line, Windows the quoted absolute node.exe and wfk.mjs', () => {
  for (const host of [MAC, LINUX]) {
    const plan = kimiHookBlocks(host);
    assert.equal(plan.ok, true);
    assert.deepEqual(
      plan.ok && plan.blocks.map((block) => [block.event, block.timeout]),
      KIMI_HOOK_EVENTS.map(({ event }) => [event, 30]),
    );
    assert.equal(plan.ok && plan.blocks[2]!.command, POSIX_STOP);
  }
  assert.equal(kimiHookCommand('session-start', LINUX), '[ -x "$HOME/.local/bin/wfk" ] && "$HOME/.local/bin/wfk" hook session-start --client kimi; exit 0');
  const win = kimiHookBlocks(WIN);
  assert.deepEqual(win.ok && win.blocks.map((block) => block.command.replace(/^.*wfk\.mjs" /, '')), [
    'hook session-start --client kimi',
    'hook prompt --client kimi',
    'hook turn-end --client kimi',
    'hook turn-end --client kimi',
    'hook turn-end --client kimi',
  ]);
  assert.equal(win.ok && win.blocks[0]!.command, `"C:\\Program Files\\nodejs\\node.exe" "C:\\Users\\O'Neil\\AppData\\Local\\Workflow Kit\\wfk.mjs" hook session-start --client kimi`);
});

test('a Windows path that cmd.exe cannot quote gives a reason instead of blocks', () => {
  for (const [launcher, word] of [
    ['C:\\100%\\wfk.mjs', 'знак %'],
    ['C:\\a"b\\wfk.mjs', 'кавычку'],
    ['C:\\a\nb\\wfk.mjs', 'перевод строки'],
  ] as const) {
    const plan = kimiHookBlocks({ ...WIN, launcher });
    assert.equal(plan.ok, false);
    assert.match(plan.ok ? '' : plan.reason, new RegExp(word));
  }
  const noNode = kimiHookBlocks({ ...WIN, node: '' });
  assert.match(noNode.ok ? '' : noNode.reason, /node\.exe/);
  // The POSIX line holds no path of the machine: nothing to refuse.
  assert.equal(kimiHookBlocks({ ...MAC, node: '/a "b" %c/node' }).ok, true);
});

test('the TOML text: literal strings, a basic string for an apostrophe, the marker above five blocks', () => {
  assert.equal(tomlString('a "b" \\ c'), `'a "b" \\ c'`);
  assert.equal(tomlString(`it's "x" \\ y`), `"it's \\"x\\" \\\\ y"`);
  const plan = kimiHookBlocks(MAC);
  assert.equal(plan.ok, true);
  const section = kimiHooksSection(plan.ok ? plan.blocks : []);
  assert.equal(section.split('\n')[0], '# Workflow Kit');
  assert.equal(section.split('[[hooks]]').length - 1, 5);
  assert.equal(section.endsWith('timeout = 30\n'), true);
  assert.equal(section.includes(`[[hooks]]\nevent = "Stop"\ncommand = '${POSIX_STOP}'\ntimeout = 30\n\n[[hooks]]\nevent = "StopFailure"`), true);
  const win = kimiHookBlocks(WIN);
  // The apostrophe of the Windows path switches the block to a basic string with doubled backslashes.
  assert.equal(kimiHooksSection(win.ok ? win.blocks : [], '\r\n').includes(`command = "\\"C:\\\\Program Files\\\\nodejs\\\\node.exe\\" \\"C:\\\\Users\\\\O'Neil\\\\`), true);
  assert.equal(kimiHooksSection(win.ok ? win.blocks : [], '\r\n').includes('\r\n\r\n[[hooks]]\r\n'), true);
});

test('Kit recognises its Kimi commands and no others', () => {
  assert.equal(isKimiKitCommand(POSIX_STOP), true);
  assert.equal(isKimiKitCommand(kimiHookCommand('prompt', WIN)), true);
  assert.equal(isKimiKitCommand(`${POSIX_STOP} # edited`), true);
  assert.equal(isKimiKitCommand('"$HOME/.local/bin/wfk" hook stop --client claude; exit 0'), false);
  assert.equal(isKimiKitCommand('python3 hooklog.py --client kimi'), false);
  assert.equal(isKimiKitCommand(undefined), false);
});

test('/bin/sh runs the generated command: stdin reaches the launcher under a home with a space, Cyrillic and an apostrophe', { skip: process.platform === 'win32' }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wfk-kimi-hook-'));
  try {
    const home = path.join(root, AWKWARD);
    const input = JSON.stringify({ hook_event_name: 'Stop', session_id: 's1', cwd: '/проект' });
    const env = { HOME: home, PATH: process.env['PATH'] ?? '/usr/bin:/bin' };
    const command = kimiHookCommand('turn-end', { platform: process.platform, node: process.execPath, launcher: '' });
    // Without the launcher the command is silent and ends with 0 (Kit is not installed).
    await mkdir(home, { recursive: true });
    assert.deepEqual(await runThroughShell(command, env, input), { code: 0, stderr: '' });
    const launcher = path.join(home, '.local', 'bin', 'wfk');
    await mkdir(path.dirname(launcher), { recursive: true });
    await writeFile(launcher, '#!/bin/sh\nprintf \'%s\\n\' "$@" > "$HOME/args.txt"\ncat > "$HOME/stdin.txt"\nexit 7\n');
    await chmod(launcher, 0o755);
    // The exit code of the launcher never reaches Kimi.
    assert.deepEqual(await runThroughShell(command, env, input), { code: 0, stderr: '' });
    assert.equal(await readFile(path.join(home, 'stdin.txt'), 'utf8'), input);
    assert.equal(await readFile(path.join(home, 'args.txt'), 'utf8'), 'hook\nturn-end\n--client\nkimi\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('cmd.exe runs the generated command: stdin reaches wfk.mjs under a folder with a space, Cyrillic and an apostrophe', { skip: process.platform !== 'win32' }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wfk-kimi-hook-'));
  try {
    const folder = path.join(root, AWKWARD.trim());
    await mkdir(folder, { recursive: true });
    const launcher = path.join(folder, 'wfk.mjs');
    await writeFile(
      launcher,
      [
        "import { writeFileSync } from 'node:fs';",
        "import path from 'node:path';",
        "import { fileURLToPath } from 'node:url';",
        'const chunks = [];',
        'for await (const chunk of process.stdin) chunks.push(chunk);',
        "const seen = { args: process.argv.slice(2), stdin: Buffer.concat(chunks).toString('utf8') };",
        "writeFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'seen.json'), JSON.stringify(seen));",
        '',
      ].join('\n'),
    );
    const plan = kimiHookBlocks({ platform: 'win32', node: process.execPath, launcher });
    assert.equal(plan.ok, true);
    const input = JSON.stringify({ hook_event_name: 'Stop', session_id: 's1', cwd: 'C:\\проект' });
    const result = await runThroughShell(plan.ok ? plan.blocks[2]!.command : '', process.env, input);
    assert.deepEqual(result, { code: 0, stderr: '' });
    assert.deepEqual(JSON.parse(await readFile(path.join(folder, 'seen.json'), 'utf8')), { args: ['hook', 'turn-end', '--client', 'kimi'], stdin: input });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
