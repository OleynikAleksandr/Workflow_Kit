// Real processes here are only `node -e` children started by the test itself; nothing else is signalled.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createProcessSupervisor, processesFile } from '../src/index.ts';
import type { ProcessInfo, ProcessRecord, ProcessSupervisor } from '../src/index.ts';

const posix = process.platform !== 'win32';
let tmp = '';
let supervisor: ProcessSupervisor;

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-proc-'));
  supervisor = createProcessSupervisor({ file: processesFile(tmp), graceMs: 3000, pollMs: 50 });
});

after(async () => {
  if (supervisor) for (const record of await supervisor.list()) await supervisor.stop(record.id, { graceMs: 200 });
  await rm(tmp, { recursive: true, force: true });
});

function exists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitFor<T>(read: () => Promise<T | undefined>, ms = 3000): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = await read();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 25));
  }
}

async function logLine(file: string): Promise<string> {
  return waitFor(async () => {
    const text = await readFile(file, 'utf8').catch(() => '');
    return text.includes('\n') ? text.split('\n')[0] : undefined;
  });
}

const owner = { provider: 'test', project: 'p1', kind: 'session' };

test('spawn: own group, output to a file, CLAUDE* removed, identity recorded; stop ends it with TERM', { skip: !posix }, async () => {
  const logFile = path.join(tmp, 'logs', 'a.log');
  const script =
    "console.log(JSON.stringify({ claude: Object.keys(process.env).filter((k) => k.startsWith('CLAUDE')), svc: process.env.WFK_SERVICE_SESSION })); setInterval(() => {}, 1000);";
  const record = await supervisor.spawn({
    owner: { ...owner, ref: 's1' },
    command: process.execPath,
    args: ['-e', script],
    cwd: tmp,
    env: { ...process.env, CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'cli' },
    extraEnv: { WFK_SERVICE_SESSION: 'test' },
    logFile,
  });
  assert.equal(record.pgid, record.pid);
  assert.match(record.commandLine, /-e/);
  assert.ok(record.startToken.length > 0);
  assert.ok(record.startedAt);
  assert.notEqual(record.bootId, null);
  assert.deepEqual(JSON.parse(await logLine(logFile)), { claude: [], svc: 'test' });
  assert.equal(await supervisor.check(record.id), 'alive');
  assert.equal(await supervisor.quickCheck(record.id), 'alive');
  assert.equal((await supervisor.list({ provider: 'test', ref: 's1' })).length, 1);
  assert.equal((await supervisor.list({ provider: 'other' })).length, 0);
  const saved = JSON.parse(await readFile(processesFile(tmp), 'utf8')) as { processes: ProcessRecord[] };
  assert.equal(saved.processes[0]?.pid, record.pid);

  const stopped = await supervisor.stop(record.id);
  assert.equal(stopped.outcome, 'stopped');
  assert.equal(exists(record.pid), false);
  assert.equal(await supervisor.get(record.id), undefined);
});

test('stop: a process ignoring TERM gets KILL after the grace period, with its group', { skip: !posix }, async () => {
  const logFile = path.join(tmp, 'logs', 'b.log');
  const script = [
    "const { spawn } = require('node:child_process');",
    "const c = spawn(process.execPath, ['-e', \"process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)\"], { stdio: 'ignore' });",
    "process.on('SIGTERM', () => {});",
    'console.log(String(c.pid));',
    'setInterval(() => {}, 1000);',
  ].join(' ');
  const record = await supervisor.spawn({ owner, command: process.execPath, args: ['-e', script], cwd: tmp, env: process.env, logFile });
  const grandchild = Number(await logLine(logFile));
  assert.ok(exists(grandchild));
  const stopped = await supervisor.stop(record.id, { graceMs: 300 });
  assert.equal(stopped.outcome, 'killed');
  await waitFor(async () => (exists(record.pid) || exists(grandchild) ? undefined : true));
});

test('track adds a verified child that stop also ends', { skip: !posix }, async () => {
  const leaderLog = path.join(tmp, 'logs', 'c.log');
  const leader = await supervisor.spawn({ owner, command: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'], cwd: tmp, env: process.env, logFile: leaderLog });
  // A second process in its own group stands for the `claude` child that `expect` reports.
  const other = await supervisor.spawn({ owner, command: process.execPath, args: ['-e', 'setInterval(() => {}, 999)'], cwd: tmp, env: process.env, logFile: leaderLog });
  await supervisor.forget(other.id);
  const tracked = await supervisor.track(leader.id, other.pid);
  assert.deepEqual(tracked.children.map((c) => c.pid), [other.pid]);
  assert.equal((await supervisor.stop(leader.id)).outcome, 'stopped');
  await waitFor(async () => (exists(other.pid) ? undefined : true));
});

function fakeRecord(pid: number, bootId: string): ProcessRecord {
  return {
    id: `proc-${pid}`,
    owner: { ...owner, ref: null },
    pid,
    pgid: pid,
    command: 'node',
    args: [],
    cwd: '/',
    logFile: '/dev/null',
    startToken: 'Thu Nov 5 10:00:00 2026',
    startedAt: '2026-11-05T10:00:00.000Z',
    commandLine: 'node session.js',
    bootId,
    children: [{ pid: pid + 1, startToken: 'Thu Nov 5 10:00:01 2026', commandLine: 'claude' }],
  };
}

test('a reused pid, another boot or a foreign child are never signalled', async () => {
  const file = path.join(tmp, 'fake', 'processes.json');
  const signals: Array<[number, NodeJS.Signals | 0]> = [];
  const live = new Map<number, ProcessInfo>();
  const fake = createProcessSupervisor({
    file,
    platform: 'darwin',
    bootId: async () => 'darwin:2',
    inspect: async (pid) => live.get(pid),
    signal: (pid, sig) => {
      signals.push([pid, sig]);
      if (!live.has(Math.abs(pid))) throw Object.assign(new Error('no such process'), { code: 'ESRCH' });
    },
  });
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ version: 1, processes: [fakeRecord(900001, 'darwin:2'), fakeRecord(900011, 'darwin:1')] }));
  // Same pids are alive but belong to other programs.
  live.set(900001, { pid: 900001, pgid: 1, startToken: 'Fri Nov 6 09:00:00 2026', startedAt: null, commandLine: 'vim' });
  live.set(900002, { pid: 900002, pgid: 1, startToken: 'Fri Nov 6 09:00:00 2026', startedAt: null, commandLine: 'zsh' });
  assert.equal(await fake.check('proc-900001'), 'mismatch');
  assert.equal(await fake.check('proc-900011'), 'gone');
  assert.equal(await fake.quickCheck('proc-900011'), 'gone');
  assert.equal((await fake.stop('proc-900001')).outcome, 'mismatch');
  assert.equal((await fake.stop('proc-900011')).outcome, 'already-gone');
  assert.deepEqual(signals.filter(([, sig]) => sig !== 0), []);
  assert.deepEqual(await fake.list(), []);

  await writeFile(file, JSON.stringify({ version: 1, processes: [fakeRecord(900021, 'darwin:1'), fakeRecord(900031, 'darwin:2')] }));
  const { removed } = await fake.reconcile();
  assert.deepEqual(removed.map((r) => r.id).sort(), ['proc-900021', 'proc-900031']);
  await assert.rejects(fake.check('proc-900021'), /No process record/);
});

test('Windows: the process tree is stopped with taskkill, forced only after the identity matches again (M5 3)', async () => {
  const file = path.join(tmp, 'win', 'processes.json');
  await mkdir(path.dirname(file), { recursive: true });
  const identity = { startToken: '2026-11-09T10:00:00.0000000Z', commandLine: '"C:/node.exe" host.mjs' };
  const record = (pid: number): ProcessRecord => ({
    id: `proc-${pid}`, owner: { ...owner, ref: null }, pid, pgid: null, command: 'node', args: [], cwd: 'C:/p', logFile: 'C:/l.log',
    startedAt: '2026-11-09T10:00:00.000Z', bootId: 'win32:2026-11-09T09:00:00Z', children: [], ...identity,
  });
  await writeFile(file, JSON.stringify({ version: 1, processes: [record(7001), record(7002)] }));
  const alive = new Set([7001, 7002]);
  const calls: string[][] = [];
  const windows = createProcessSupervisor({
    file,
    platform: 'win32',
    graceMs: 60,
    killWaitMs: 60,
    pollMs: 10,
    bootId: async () => 'win32:2026-11-09T09:00:00Z',
    inspect: async (pid) => (alive.has(pid) ? ({ pid, pgid: null, startedAt: null, ...identity } as ProcessInfo) : undefined),
    signal: (pid) => {
      if (!alive.has(pid)) throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
    },
    run: async (command, args) => {
      calls.push([command, ...args]);
      // 7001 ignores the polite taskkill (a console program), 7002 ends on it.
      if (args.includes('/F') || args[1] === '7002') alive.delete(Number(args[1]));
      return { code: 0, signal: null, stdout: '', stderr: '', timedOut: false, startError: null };
    },
  });
  assert.equal(await windows.check('proc-7001'), 'alive');
  assert.equal((await windows.stop('proc-7002')).outcome, 'stopped');
  assert.equal((await windows.stop('proc-7001')).outcome, 'killed');
  assert.deepEqual(calls, [
    ['taskkill', '/PID', '7002', '/T'],
    ['taskkill', '/PID', '7001', '/T'],
    ['taskkill', '/PID', '7001', '/T', '/F'],
  ]);
  assert.deepEqual(await windows.list(), []);
});
