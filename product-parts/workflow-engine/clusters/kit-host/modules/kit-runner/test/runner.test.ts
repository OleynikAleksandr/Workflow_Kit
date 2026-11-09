import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { RunResult } from '#process-supervisor';
import { createKitRunner, parseEnvelope, projectBundlePath, readEnv } from '../src/index.ts';

const result = (over: Partial<RunResult> = {}): RunResult => ({
  code: 0,
  signal: null,
  stdout: '',
  stderr: '',
  timedOut: false,
  startError: null,
  ...over,
});

test('parseEnvelope reads success, Kit errors and garbage', () => {
  assert.deepEqual(parseEnvelope('{"command":"status","ok":true,"result":{"a":1}}', ''), {
    ok: true,
    command: 'status',
    result: { a: 1 },
  });
  const kitError = parseEnvelope('{"ok":false,"code":"UNKNOWN_COMMAND","message":"Unknown","nextAction":"Run help","details":{}}', '');
  assert.deepEqual(kitError, { ok: false, code: 'UNKNOWN_COMMAND', message: 'Unknown', nextAction: 'Run help', details: {} });
  assert.equal(parseEnvelope('Error: boom', 'stack').ok, false);
  assert.equal((parseEnvelope('Error: boom', 'stack') as { code: string }).code, 'KIT_OUTPUT');
  assert.equal((parseEnvelope('{"x":1}', '') as { code: string }).code, 'KIT_OUTPUT');
  assert.equal((parseEnvelope('null', '') as { code: string }).code, 'KIT_OUTPUT');
});

test('runner failures: spawn, timeout, missing bundles', async () => {
  const calls: string[][] = [];
  let next = result();
  const runner = createKitRunner({
    nodePath: '/node',
    appBundle: async () => '/app/kit.mjs',
    runCommand: async (command, args) => {
      calls.push([command, ...args]);
      return next;
    },
  });
  next = result({ code: null, startError: 'ENOENT' });
  assert.equal(((await runner.inspect('/p')) as { code: string }).code, 'KIT_SPAWN');
  next = result({ code: null, timedOut: true });
  assert.equal(((await runner.install('/p', { update: true, name: 'P' })) as { code: string }).code, 'KIT_TIMEOUT');
  assert.deepEqual(calls[0], ['/node', '/app/kit.mjs', 'inspect', '/p']);
  assert.deepEqual(calls[1], ['/node', '/app/kit.mjs', 'install', '/p', '--host', 'harness', '--update', '--name', 'P']);
  const status = await runner.status('/definitely/not/a/project');
  assert.equal((status as { code: string }).code, 'KIT_NOT_INSTALLED');
  assert.equal(calls.length, 2);

  const noBundle = createKitRunner({
    appBundle: async () => {
      throw new Error('Нет бандла Kit');
    },
    runCommand: async () => result(),
  });
  const inspect = await noBundle.inspect('/p');
  assert.deepEqual([inspect.ok, (inspect as { code: string }).code], [false, 'KIT_NO_BUNDLE']);
});

test('the reads of the service (status, scope:proposal) take no optional git locks; other commands keep the env', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wfk-kit-env-'));
  try {
    await mkdir(path.dirname(projectBundlePath(root)), { recursive: true });
    await writeFile(projectBundlePath(root), '');
    const envs: Array<Readonly<Record<string, string | undefined>> | undefined> = [];
    const runner = createKitRunner({
      nodePath: '/node',
      appBundle: async () => '/app/kit.mjs',
      env: { PATH: '/bin', HOME: '/h' },
      runCommand: async (_command, _args, options) => {
        envs.push(options?.env);
        return result({ stdout: '{"command":"x","ok":true,"result":null}' });
      },
    });
    await runner.status(root);
    await runner.proposal(root);
    await runner.run(root, ['commit', '--task', 'T001']);
    assert.deepEqual(envs, [
      { PATH: '/bin', HOME: '/h', GIT_OPTIONAL_LOCKS: '0' },
      { PATH: '/bin', HOME: '/h', GIT_OPTIONAL_LOCKS: '0' },
      { PATH: '/bin', HOME: '/h' },
    ]);
    assert.equal(readEnv(undefined)['GIT_OPTIONAL_LOCKS'], '0');
    assert.equal(readEnv(undefined)['PATH'], process.env['PATH']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
