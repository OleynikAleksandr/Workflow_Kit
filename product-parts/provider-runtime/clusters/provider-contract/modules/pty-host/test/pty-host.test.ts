import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { PtyUnavailableError, loadNodePty, ptyUnavailable, startTerminal, vendorDir } from '../src/index.ts';
import type { NodePty } from '../src/index.ts';

test('the vendored build exists for win32-x64 and win32-arm64 only', () => {
  assert.equal(ptyUnavailable('win32', 'x64'), null);
  assert.equal(ptyUnavailable('win32', 'arm64'), null);
  assert.match(ptyUnavailable('win32', 'ia32') ?? '', /нет сборки node-pty для win32-ia32/);
  assert.match(ptyUnavailable('darwin', 'arm64') ?? '', /только на Windows/);
  assert.throws(() => loadNodePty('linux', 'x64'), PtyUnavailableError);
  assert.ok(vendorDir().endsWith(`node-pty-1.1.0${path.sep}`));
});

test('a build without OpenConsole.exe is refused', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wfk-pty-'));
  await mkdir(path.join(dir, 'prebuilds', 'win32-x64', 'conpty'), { recursive: true });
  await writeFile(path.join(dir, 'prebuilds', 'win32-x64', 'conpty.node'), '');
  await writeFile(path.join(dir, 'prebuilds', 'win32-x64', 'conpty', 'conpty.dll'), '');
  assert.match(ptyUnavailable('win32', 'x64', dir) ?? '', /нет сборки/);
  await rm(dir, { recursive: true, force: true });
});

function fakePty() {
  const writes: Buffer[] = [];
  let kills = 0;
  let exit: ((e: { exitCode: number }) => void)[] = [];
  let data: ((t: string) => void)[] = [];
  let spawned: { file: string; args: unknown; options: Record<string, unknown> } | null = null;
  const pty: NodePty = {
    spawn(file, args, options) {
      spawned = { file, args, options: options as never };
      return {
        pid: 4242,
        onData: (l) => (data.push(l), { dispose: () => undefined }),
        onExit: (l) => (exit.push(l as never), { dispose: () => undefined }),
        write: (d) => void writes.push(Buffer.from(d as never)),
        resize: () => undefined,
        kill: () => {
          kills += 1;
          if (kills > 1) throw new Error('second kill crashes node-pty (#983)');
        },
      };
    },
  };
  return {
    pty,
    writes,
    kills: () => kills,
    spawned: () => spawned,
    emit: (t: string) => data.forEach((l) => l(t)),
    exit: (code: number) => exit.forEach((l) => l({ exitCode: code })),
  };
}

test('the terminal uses ConPTY with the bundled dll, writes UTF-8 and kills once plus the tree', async () => {
  const fake = fakePty();
  const trees: number[] = [];
  const term = startTerminal(fake.pty, { file: 'C:/x/claude.exe', args: ['--remote-control', 'Склад'], cwd: 'C:/p', env: { A: '1', B: undefined }, cols: 160, rows: 40 }, async (pid) => void trees.push(pid));
  assert.deepEqual([fake.spawned()!.options['useConpty'], fake.spawned()!.options['useConptyDll'], fake.spawned()!.options['cols']], [true, true, 160]);
  assert.deepEqual(fake.spawned()!.options['env'], { A: '1' });
  const seen: string[] = [];
  term.onData((t) => seen.push(t));
  fake.emit('claude.ai/code/session_X');
  assert.deepEqual(seen, ['claude.ai/code/session_X']);
  assert.equal(term.write('Привет'), true);
  assert.equal(fake.writes[0]!.toString('utf8'), 'Привет');
  term.kill();
  term.kill();
  assert.equal(fake.kills(), 1);
  assert.deepEqual(trees, [4242]);
});

test('after exit nothing is written and kill only ends the tree', () => {
  const fake = fakePty();
  const trees: number[] = [];
  const term = startTerminal(fake.pty, { file: 'a.exe', args: [], cwd: '.', env: {}, cols: 80, rows: 24 }, async (pid) => void trees.push(pid));
  const codes: number[] = [];
  term.onExit((c) => codes.push(c));
  fake.exit(3);
  assert.equal(term.exited, true);
  assert.deepEqual(codes, [3]);
  assert.equal(term.write('x'), false);
  term.kill();
  assert.equal(fake.kills(), 0);
  assert.deepEqual(trees, [4242]);
});
