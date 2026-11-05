import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { EXIT_NOT_IMPLEMENTED, EXIT_USAGE, main } from '../src/index.ts';

interface Run {
  code: number;
  out: string;
  err: string;
}

async function run(...argv: string[]): Promise<Run> {
  let out = '';
  let err = '';
  const code = await main(argv, { stdout: (t) => (out += t), stderr: (t) => (err += t) });
  return { code, out, err };
}

test('help and version', async () => {
  const help = await run('--help');
  assert.equal(help.code, 0);
  for (const command of ['serve', 'open', 'install', 'uninstall', 'service', 'doctor', 'link', 'hook']) {
    assert.match(help.out, new RegExp(`\\b${command}\\b`));
  }
  const version = await run('--version');
  assert.match(version.out, /^\d+\.\d+\.\d+\n$/);
  assert.equal((await run()).code, EXIT_USAGE);
});

test('commands of later tasks answer "не реализовано"', async () => {
  for (const command of ['open', 'doctor', 'link', 'install', 'uninstall']) {
    const result = await run(command);
    assert.equal(result.code, EXIT_NOT_IMPLEMENTED, command);
    assert.match(result.err, /не реализовано/, command);
    assert.equal(result.out, '', command);
  }
  for (const sub of ['start', 'stop']) {
    const result = await run('service', sub);
    assert.equal(result.code, EXIT_NOT_IMPLEMENTED);
    assert.match(result.err, new RegExp(`service ${sub}: не реализовано`));
  }
});

test('hook never fails and never writes to stdout', async () => {
  const result = await run('hook', 'session-start', '--client', 'claude');
  assert.equal(result.code, 0);
  assert.equal(result.out, '');
});

test('service status comes from the service-installer stub', async () => {
  const result = await run('service', 'status');
  assert.equal(result.code, 0);
  assert.match(result.out, /не установлена/);
  assert.equal((await run('service')).code, EXIT_USAGE);
  assert.equal((await run('service', 'bogus')).code, EXIT_USAGE);
});

test('unknown commands are usage errors', async () => {
  const result = await run('bogus');
  assert.equal(result.code, EXIT_USAGE);
  assert.match(result.err, /неизвестная команда «bogus»/);
});

test('bin/wfk.mjs checks Node and loads the cli module through #cli', async () => {
  const bin = fileURLToPath(new URL('../../../../../../../bin/wfk.mjs', import.meta.url));
  const exec = promisify(execFile);
  const { stdout } = await exec(process.execPath, [bin, '--version']);
  assert.match(stdout, /^\d+\.\d+\.\d+\n$/);
  await assert.rejects(exec(process.execPath, [bin, 'link']), (error: { code?: number; stderr?: string }) => {
    assert.equal(error.code, EXIT_NOT_IMPLEMENTED);
    assert.match(error.stderr ?? '', /не реализовано/);
    return true;
  });
});
