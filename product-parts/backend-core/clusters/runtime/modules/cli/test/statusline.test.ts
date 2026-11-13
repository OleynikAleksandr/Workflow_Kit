import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { resolveDataDirs } from '#data-store';
import { limitsFile, readSnapshot, snapshotFile } from '#provider-registry';
import { runStatusline, readStatuslineInput, STATUSLINE_MAX_INPUT, userStatusline } from '../src/statusline.ts';
import { runStatuslineCommand, statuslineShell } from '../src/statusline-shell.ts';

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wfk-sl-')); const cwd = path.join(root, 'project'); const home = path.join(root, 'home');
  for (const dir of [cwd, home]) await mkdir(path.join(dir, '.claude'), { recursive: true });
  const platform = process.platform;
  const dirs = resolveDataDirs({ platform, homedir: home, env: { WFK_DATA_DIR: path.join(root, 'data') } });
  const input = Buffer.from(JSON.stringify({ session_id: 'test-session', model: { id: 'claude-opus-5-5', display_name: 'Opus 5.5', secret: 'not stored' }, effort: { level: 'high' }, context_window: { context_window_size: 200000, used_percentage: 25, total_input_tokens: 50000 }, fast_mode: false, version: '2.1.323', rate_limits: { five_hour: { used_percentage: 42, resets_at: '2026-11-13T18:00:00Z' } }, transcript: 'Never capture chat' }) + '\n');
  const settings = async (where: 'local' | 'project' | 'user', command: string) => writeFile(path.join(where === 'user' ? home : cwd, '.claude', where === 'local' ? 'settings.local.json' : 'settings.json'), JSON.stringify({ statusLine: { type: 'command', command } }));
  return { root, cwd, home, platform, dirs, input, settings, close: () => rm(root, { recursive: true, force: true }) };
}
test('captures whitelisted metadata/limits, preserves bytes, prunes old snapshots', async () => {
  const f = await fixture();
  try {
    await f.settings('project', 'user-command');
    const old = snapshotFile(f.dirs, 'claude', 'old'); await mkdir(path.dirname(old), { recursive: true }); await writeFile(old, '{}'); await utimes(old, new Date(0), new Date(0));
    let output: Buffer = Buffer.alloc(0); const expected = Buffer.from([0xff, 0x20, ...Buffer.from('Юникод "кавычки"\nвторая строка\n')]);
    const code = await runStatusline(['--client', 'claude'], { ...f, homedir: f.home, write: bytes => { output = bytes; }, execute: async (command, input) => { assert.equal(command, 'user-command'); assert.deepEqual(input, f.input); return expected; } });
    assert.equal(code, 0); assert.deepEqual(output, expected);
    const saved = await readSnapshot<Record<string, unknown>>(snapshotFile(f.dirs, 'claude', 'test-session'));
    assert.deepEqual(saved?.model, { id: 'claude-opus-5-5', display_name: 'Opus 5.5' });
    assert.ok(!JSON.stringify(saved).includes('Never capture chat')); assert.ok(!JSON.stringify(saved).includes('not stored'));
    assert.deepEqual((await readSnapshot<Record<string, unknown>>(limitsFile(f.dirs, 'claude')))?.rate_limits, { five_hour: { used_percentage: 42, resets_at: '2026-11-13T18:00:00Z' } });
    await assert.rejects(stat(old), { code: 'ENOENT' });
  } finally { await f.close(); }
});
test('local → project → user and wrapper recursion is skipped', async () => {
  const f = await fixture();
  try {
    assert.equal(await userStatusline(f.cwd, f.home), null);
    await f.settings('user', 'user'); await f.settings('project', 'project'); await f.settings('local', 'local');
    assert.equal(await userStatusline(f.cwd, f.home), 'local');
    await f.settings('local', '"/some path/wfk" statusline --client claude'); assert.equal(await userStatusline(f.cwd, f.home), 'project');
    await f.settings('project', 'node /bin/wfk.mjs statusline --client claude'); assert.equal(await userStatusline(f.cwd, f.home), 'user');
  } finally { await f.close(); }
});
test('no service, snapshot write failure, malformed JSON and missing shell never change exit code or user output', async () => {
  const f = await fixture();
  try {
    await f.settings('user', 'user'); const bytes = Buffer.from('ok\n'); let output: Buffer | null = null;
    const blocked = path.join(f.root, 'blocked'); await writeFile(blocked, 'file');
    assert.equal(await runStatusline(['--client', 'claude'], { ...f, homedir: f.home, dirs: { ...f.dirs, stateDir: blocked }, write: b => { output = b; }, execute: async (_c, input) => { assert.deepEqual(input, f.input); return bytes; } }), 0);
    assert.deepEqual(output, bytes);
    assert.equal(await runStatusline(['--client', 'claude'], { ...f, homedir: f.home, input: Buffer.from('invalid json'), execute: async () => bytes, write: b => { output = b; } }), 0); assert.deepEqual(output, bytes);
    assert.deepEqual(await runStatuslineCommand('unused', f.input, { platform: f.platform, env: {}, cwd: f.cwd, shell: { command: path.join(f.root, 'absent'), args: [] } }), Buffer.alloc(0));
  } finally { await f.close(); }
});
test('stdin is bounded while streaming and empty settings do not execute anything', async () => {
  assert.deepEqual(await readStatuslineInput(Readable.from([Buffer.from('a'), Buffer.from('б')])), Buffer.from('aб'));
  assert.deepEqual(await readStatuslineInput(Readable.from([Buffer.alloc(STATUSLINE_MAX_INPUT), Buffer.from('x')])), Buffer.alloc(0));
  const f = await fixture();
  try { assert.equal(await runStatusline([], { ...f, homedir: f.home, execute: async () => { throw new Error('should not run'); } }), 0); }
  finally { await f.close(); }
});
for (const platform of ['darwin', 'linux', 'win32'] as const) test(`${platform}: shell choice and execution use injected platform`, async () => {
  const env = { CLAUDE_CODE_GIT_BASH_PATH: 'C:\\Git\\bin\\bash.exe', PATH: 'C:\\bin' };
  if (platform === 'win32') {
    assert.deepEqual(await statuslineShell(platform, env, async p => p === env.CLAUDE_CODE_GIT_BASH_PATH), { command: env.CLAUDE_CODE_GIT_BASH_PATH, args: ['-c'] });
    assert.equal((await statuslineShell(platform, { PATH: 'C:\\bin' }, async p => p === 'C:\\bin\\bash.exe')).command, 'C:\\bin\\bash.exe');
    assert.deepEqual(await statuslineShell(platform, {}, async () => false), { command: 'powershell', args: ['-NoProfile', '-Command'] });
  } else assert.deepEqual(await statuslineShell(platform, env), { command: '/bin/sh', args: ['-c'] });
});
test('native shell preserves Unicode, quotes, multiline stdin and stdout', async () => {
  const f = await fixture();
  try {
    const script = path.join(f.root, 'echo.mjs'); await writeFile(script, 'process.stdin.pipe(process.stdout);');
    const input = Buffer.from('Кириллица "quoted" \'single\'\nстрока 2\n');
    const command = `"${process.execPath}" "${script}"`;
    assert.deepEqual(await runStatuslineCommand(command, input, { platform: f.platform, cwd: f.cwd, env: process.env }), input);
  } finally { await f.close(); }
});
test('timeout kills the native command and its child process, discards output', async () => {
  const f = await fixture(); const pids: number[] = [];
  try {
    const script = path.join(f.root, 'hang.mjs'); const pidFile = path.join(f.root, 'pids.json');
    await writeFile(script, `import {spawn} from 'node:child_process';import {writeFileSync} from 'node:fs';const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'inherit'});writeFileSync(${JSON.stringify(pidFile)},JSON.stringify([process.pid,child.pid]));process.stdout.write('discard me');setInterval(()=>{},1000);`);
    const output = await runStatuslineCommand(`"${process.execPath}" "${script}"`, Buffer.alloc(0), { platform: f.platform, cwd: f.cwd, env: process.env, timeoutMs: 2000 });
    assert.deepEqual(output, Buffer.alloc(0)); pids.push(...JSON.parse(await readFile(pidFile, 'utf8')));
    for (const pid of pids) {
      let gone = false;
      for (let i = 0; i < 100; i++) { try { process.kill(pid, 0); } catch { gone = true; break; } await new Promise(r => setTimeout(r, 20)); }
      assert.equal(gone, true, `owned child ${pid} survived timeout`);
    }
  } finally { for (const pid of pids) { try { process.kill(pid, 'SIGKILL'); } catch {} } await f.close(); }
});
test('Windows timeout invokes public taskkill with /T /F', async () => {
  const f = await fixture(); const calls: { command: string; args: readonly string[] }[] = [];
  try {
    const out = await runStatuslineCommand('setInterval(()=>{},1000)', Buffer.alloc(0), { platform: 'win32', cwd: f.cwd, env: process.env, timeoutMs: 100,
      shell: { command: process.execPath, args: ['-e'] }, run: async (command, args) => { calls.push({ command, args }); try { process.kill(Number(args[1]), 'SIGKILL'); } catch {} return { code: 0, stdout: '', stderr: '', timedOut: false, signal: null, startError: null }; } });
    assert.deepEqual(out, Buffer.alloc(0)); assert.equal(calls[0]?.command, 'taskkill'); assert.deepEqual(calls[0]?.args.slice(2), ['/T', '/F']);
  } finally { await f.close(); }
});
test('newest account limits survive an older concurrent snapshot', async () => {
  const f = await fixture();
  try {
    await Promise.all([new Date('2026-11-13T11:00:00Z'), new Date('2026-11-13T10:00:00Z')].map(now => runStatusline(['--client', 'claude'], { ...f, homedir: f.home, now: () => now })));
    assert.equal((await readSnapshot<{ at: string }>(limitsFile(f.dirs, 'claude')))?.at, '2026-11-13T11:00:00.000Z');
  } finally { await f.close(); }
});
test('timeout completion waits for both process close and the tree-kill operation', async () => {
  const f = await fixture(); let treeFinished = false; let resolved = false;
  try {
    const result = runStatuslineCommand('setInterval(()=>{},1000)', Buffer.alloc(0), { platform: 'win32', cwd: f.cwd, env: process.env, timeoutMs: 100,
      shell: { command: process.execPath, args: ['-e'] }, run: async (_command, args) => {
        try { process.kill(Number(args[1]), 'SIGKILL'); } catch {}
        await new Promise(r => setTimeout(r, 100));
        assert.equal(resolved, false, 'process close alone must not complete tree termination');
        treeFinished = true;
        return { code: 0, stdout: '', stderr: '', timedOut: false, signal: null, startError: null };
      } }).then(value => { resolved = true; return value; });
    assert.deepEqual(await result, Buffer.alloc(0)); assert.equal(treeFinished, true);
    // Resolving only after close is observable on Windows: cwd may now be removed immediately.
    await rm(f.cwd, { recursive: true });
  } finally { await f.close(); }
});
