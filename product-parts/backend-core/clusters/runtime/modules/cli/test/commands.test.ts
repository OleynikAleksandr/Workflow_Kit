import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EXIT_USAGE, main } from '../src/index.ts';
import type { CliDeps } from '../src/index.ts';

interface Run {
  code: number;
  out: string;
  err: string;
}

async function run(deps: Partial<CliDeps>, ...argv: string[]): Promise<Run> {
  let out = '';
  let err = '';
  const code = await main(argv, { ...deps, stdout: (t) => (out += t), stderr: (t) => (err += t) });
  return { code, out, err };
}

test('help and version', async () => {
  const help = await run({}, '--help');
  assert.equal(help.code, 0);
  for (const command of ['serve', 'open', 'install', 'uninstall', 'service', 'doctor', 'link', 'hook']) {
    assert.match(help.out, new RegExp(`\\b${command}\\b`));
  }
  const version = await run({}, '--version');
  assert.match(version.out, /^\d+\.\d+\.\d+\n$/);
  assert.equal((await run({})).code, EXIT_USAGE);
});

test('service commands go to service-installer with the machine context and injected effects', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-cli-service-'));
  try {
    const spawned: string[][] = [];
    const deps = {
      app: { env: { WFK_DATA_DIR: path.join(tmp, 'data'), WFK_PORT: '45999', PATH: '/usr/bin' }, homedir: tmp },
      service: {
        health: async () => null,
        spawnDetached: async (_command: string, args: readonly string[]) => {
          spawned.push([...args]);
        },
        run: async () => ({ code: 1, signal: null, stdout: '', stderr: '', timedOut: false, startError: null }),
        sleep: async () => undefined,
        readyTimeoutMs: 0,
      },
    };
    const status = await run(deps, 'service', 'status');
    assert.equal(status.code, 0);
    assert.match(status.out, /служба: не отвечает на порту 45999/);
    const start = await run(deps, 'service', 'start');
    assert.equal(start.code, 1);
    assert.match(start.err, /не ответила на \/api\/health/);
    assert.equal(spawned[0]?.at(-1), 'serve');
    // M17 2.1: restart is stop, then start.
    const restart = await run(deps, 'service', 'restart');
    assert.equal(restart.code, 1);
    assert.equal(spawned.length, 2, 'restart starts the service again');
    assert.match(restart.err, /не ответила на \/api\/health/);
    const doctor = await run(deps, 'doctor', '--installed');
    assert.equal(doctor.code, 1);
    assert.match(doctor.out + doctor.err, /нет .*current\.json/);
    assert.equal((await run(deps, 'doctor', '--bogus')).code, EXIT_USAGE);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('hook never fails and never writes to stdout', async () => {
  let out = '';
  const deps = {
    stdout: (t: string) => (out += t),
    stderr: () => undefined,
    app: { env: {} },
    cwd: '/',
    readStdin: async () => 'not json',
  };
  assert.equal(await main(['hook', 'session-start', '--client', 'claude'], deps), 0);
  assert.equal(await main(['hook', 'unknown-event'], deps), 0);
  assert.equal(await main(['hook'], deps), 0);
  assert.equal(out, '');
});

test('service needs a subcommand', async () => {
  assert.equal((await run({}, 'service')).code, EXIT_USAGE);
  assert.equal((await run({}, 'service', 'bogus')).code, EXIT_USAGE);
});

test('unknown commands are usage errors', async () => {
  const result = await run({}, 'bogus');
  assert.equal(result.code, EXIT_USAGE);
  assert.match(result.err, /неизвестная команда «bogus»/);
});

test('bin/wfk.mjs checks Node and loads the cli module through #cli', async () => {
  const bin = fileURLToPath(new URL('../../../../../../../bin/wfk.mjs', import.meta.url));
  const exec = promisify(execFile);
  const { stdout } = await exec(process.execPath, [bin, '--version']);
  assert.match(stdout, /^\d+\.\d+\.\d+\n$/);
  await assert.rejects(exec(process.execPath, [bin, 'bogus']), (error: { code?: number; stderr?: string }) => {
    assert.equal(error.code, EXIT_USAGE);
    assert.match(error.stderr ?? '', /неизвестная команда/);
    return true;
  });
});
