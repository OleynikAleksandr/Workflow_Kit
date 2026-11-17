// Separate processes (spec speech-integration 2.3): a copy of the source without node_modules
// runs `wfk --version`, refuses `install` with DEPENDENCY_MISSING before any change, gives a
// message for `serve`, and `doctor --installed` of an installed copy without ws reports it.
// Every instance is a development one (WFK_DATA_DIR): no launchctl, systemctl, launcher or autostart.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../../../../../../', import.meta.url));
const SKIP = new Set(['test', 'node_modules', 'target', '.git']);
let temp = '';
let source = '';
let port = 0;

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port: found } = server.address() as { port: number };
  await new Promise((resolve) => server.close(resolve));
  return found;
}

/** Copies what the installer copies, without node_modules. */
async function copySource(to: string): Promise<void> {
  for (const part of ['bin', 'product-parts', 'package.json', 'package-lock.json']) {
    await cp(path.join(REPO, part), path.join(to, part), { recursive: true, filter: (from) => !SKIP.has(path.basename(from)) });
  }
}

function wfk(root: string, args: string[]): { code: number | null; output: string } {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) if (!/^(WFK_|GIT_|HARNESS_)/u.test(key)) env[key] = value;
  Object.assign(env, { HOME: path.join(temp, 'home'), USERPROFILE: path.join(temp, 'home'), WFK_DATA_DIR: path.join(temp, 'data'), WFK_PORT: String(port) });
  const result = spawnSync(process.execPath, [path.join(root, 'bin', 'wfk.mjs'), ...args], { env, encoding: 'utf8', timeout: 60_000 });
  return { code: result.status, output: `${result.stdout}${result.stderr}` };
}

before(async () => {
  temp = await mkdtemp(path.join(os.tmpdir(), 'wfk-no-ws-'));
  source = path.join(temp, 'source');
  await copySource(source);
  port = await freePort();
});

after(async () => {
  await rm(temp, { recursive: true, force: true, maxRetries: 5 });
});

test('a copy without ws: --version works, install refuses with DEPENDENCY_MISSING and writes nothing, serve explains', async () => {
  const version = (JSON.parse(await readFile(path.join(REPO, 'package.json'), 'utf8')) as { version: string }).version;
  const shown = wfk(source, ['--version']);
  assert.deepEqual([shown.code, shown.output.trim()], [0, version]);
  const install = wfk(source, ['install']);
  assert.equal(install.code, 1, install.output);
  assert.match(install.output, /DEPENDENCY_MISSING: .*нет ws/u);
  assert.equal(existsSync(path.join(temp, 'data')), false, 'the data directory stays absent');
  const serve = wfk(source, ['serve']);
  assert.equal(serve.code, 1, serve.output);
  assert.match(serve.output, /зависимость ws не найдена/u);
  assert.doesNotMatch(serve.output, /ERR_MODULE_NOT_FOUND|at async/u, 'no stack trace');
});

test('doctor --installed of an installed copy without ws reports the dependency instead of crashing', async () => {
  const version = (JSON.parse(await readFile(path.join(REPO, 'package.json'), 'utf8')) as { version: string }).version;
  const app = path.join(temp, 'data', 'app', version);
  await copySource(app);
  const entry = path.join(app, 'bin', 'wfk.mjs');
  await writeFile(path.join(temp, 'data', 'app', 'current.json'), JSON.stringify({
    version, appPath: app, entry, node: process.execPath, installedAt: new Date().toISOString(),
    integrated: false, mechanism: null, autostartEntry: null, launcher: null, icon: null,
  }));
  const report = wfk(app, ['doctor', '--installed']);
  assert.equal(report.code, 1, report.output);
  assert.match(report.output, /\[ошибка\] зависимости копии: нет ws в node_modules копии/u);
  assert.doesNotMatch(report.output, /ERR_MODULE_NOT_FOUND/u);
});
