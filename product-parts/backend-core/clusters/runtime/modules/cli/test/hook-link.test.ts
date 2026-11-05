import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { hookCommand, installStructure } from '#kit-structure';
import { LAUNCHER_MARK, REPO_ROOT, launcherPath, main } from '../src/index.ts';

const posix = process.platform !== 'win32';
let tmp = '';
let home = '';
let project = '';

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-cli-hook-'));
  home = path.join(tmp, 'home');
  project = path.join(home, 'project');
  await mkdir(path.join(project, 'src'), { recursive: true });
  await installStructure(project);
});
after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

interface Run {
  code: number;
  out: string;
  err: string;
}

async function run(argv: string[], extra: Record<string, unknown> = {}): Promise<Run> {
  let out = '';
  let err = '';
  const code = await main(argv, { stdout: (t) => (out += t), stderr: (t) => (err += t), ...extra });
  return { code, out, err };
}

async function journal(): Promise<Array<Record<string, unknown>>> {
  const text = await readFile(path.join(project, '.workflow-kit/local/sessions.jsonl'), 'utf8').catch(() => '');
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

/** Runs a program with stdin text; resolves with exit code, output and elapsed time. */
function exec(file: string, args: string[], env: NodeJS.ProcessEnv, input: string): Promise<Run & { ms: number }> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { env, cwd: tmp });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? -1, out, err, ms: Date.now() - started }));
    child.stdin.end(input);
  });
}

test('wfk hook session-start records the session from a substituted stdin', async () => {
  const stdin = JSON.stringify({ session_id: 's-1', source: 'startup', cwd: path.join(project, 'src') });
  const result = await run(['hook', 'session-start', '--client', 'claude'], {
    app: { env: { CLAUDE_PROJECT_DIR: project } },
    cwd: tmp,
    readStdin: async () => stdin,
  });
  assert.deepEqual([result.code, result.out], [0, '']);
  const last = (await journal()).at(-1);
  assert.equal(last?.['session_id'], 's-1');
  assert.equal(last?.['client'], 'claude');
});

test('hook gives up within its budget when stdin never closes', async () => {
  const started = Date.now();
  const result = await run(['hook', 'session-start', '--client=codex'], {
    app: { env: {} },
    cwd: project,
    readStdin: () => new Promise<string>(() => undefined),
  });
  assert.deepEqual([result.code, result.out], [0, '']);
  assert.ok(Date.now() - started < 2000);
});

test('wfk link writes the launcher into a substituted HOME and refuses foreign files', { skip: !posix }, async () => {
  const fakeHome = path.join(tmp, 'link-home');
  const env = { PATH: '/usr/bin' };
  const first = await run(['link'], { app: { homedir: fakeHome, env, platform: 'darwin' } });
  assert.equal(first.code, 0, first.err);
  assert.match(first.out, /создан/);
  assert.match(first.out, /не в PATH/);
  const launcher = launcherPath(fakeHome);
  const script = await readFile(launcher, 'utf8');
  assert.ok(script.startsWith('#!/bin/sh\n'));
  assert.ok(script.includes(LAUNCHER_MARK));
  assert.ok(script.includes(`'${path.join(REPO_ROOT, 'bin', 'wfk.mjs')}' "$@"`));
  assert.ok(script.includes(`'${process.execPath}'`));
  assert.equal((await stat(launcher)).mode & 0o777, 0o755);

  const again = await run(['link'], { app: { homedir: fakeHome, env: { PATH: path.dirname(launcher) }, platform: 'darwin' } });
  assert.equal(again.code, 0);
  assert.match(again.out, /обновлён/);
  assert.doesNotMatch(again.out, /не в PATH/);

  await writeFile(launcher, '#!/bin/sh\necho foreign\n');
  const refused = await run(['link'], { app: { homedir: fakeHome, env, platform: 'darwin' } });
  assert.equal(refused.code, 1);
  assert.match(refused.err, /--force/);
  assert.equal(await readFile(launcher, 'utf8'), '#!/bin/sh\necho foreign\n');
  assert.equal((await run(['link', '--force'], { app: { homedir: fakeHome, env, platform: 'darwin' } })).code, 0);
  assert.ok((await readFile(launcher, 'utf8')).includes(LAUNCHER_MARK));
  assert.equal((await run(['link', '--bogus'], { app: { homedir: fakeHome } })).code, 64);
  assert.equal((await run(['link'], { app: { homedir: fakeHome, platform: 'win32' } })).code, 1);
});

test('the hook command from settings runs the linked launcher end to end', { skip: !posix }, async () => {
  assert.equal((await run(['link'], { app: { homedir: home, env: {}, platform: 'darwin' } })).code, 0);
  const before = (await journal()).length;
  const env = { HOME: home, PATH: '/usr/bin:/bin', CLAUDE_PROJECT_DIR: project };
  const input = JSON.stringify({ session_id: 'e2e-1', transcript_path: '/tmp/e2e.jsonl', model: 'm' });
  const result = await exec('/bin/sh', ['-c', hookCommand('claude')], env, input);
  assert.equal(result.code, 0, result.err);
  assert.equal(result.out, '');
  assert.ok(result.ms < 2000, `hook took ${result.ms} ms`);
  const lines = await journal();
  assert.equal(lines.length, before + 1);
  assert.equal(lines.at(-1)?.['session_id'], 'e2e-1');

  // Without a launcher the command does nothing and still exits with 0.
  const missing = await exec('/bin/sh', ['-c', hookCommand('codex')], { HOME: path.join(tmp, 'nobody'), PATH: '/usr/bin:/bin' }, '{}');
  assert.deepEqual([missing.code, missing.out], [0, '']);
});
