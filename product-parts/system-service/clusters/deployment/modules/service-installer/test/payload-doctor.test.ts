import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runServiceCommand } from '../src/index.ts';
import { standardMachine } from './fakes.ts';
import { seedPayload } from './payload-fixtures.ts';

const MAC_DATA = '/Users/me/Library/Application Support/Workflow Kit';
const launchctlLoaded = (m: ReturnType<typeof standardMachine>) => (command: string, args: string[]) =>
  command === '/bin/launchctl' && args[0] === 'print' && m.backend.health ? { code: 0 } : undefined;

test('doctor --installed: the runtime packages of the copy and the helper of its version (macOS ARM64)', async () => {
  const m: ReturnType<typeof standardMachine> = standardMachine('darwin', { extra: (c, a) => launchctlLoaded(m)(c, a) });
  seedPayload(m.fs, '/src/clone', { helper: 'release v1' });
  await runServiceCommand('install', m.deps);
  const good = await runServiceCommand('doctor', m.deps, ['--installed']);
  assert.equal(good.exitCode, 0, good.message);
  assert.match(good.message, /\[ok\]\s+зависимости копии: ws/);
  assert.match(good.message, /\[ok\]\s+диктовка: helper: .*wfk-speech-helper, версия 0\.1\.0/);

  m.fs.seed(`${MAC_DATA}/speech/helper.json`, JSON.stringify({ version: '0.0.9', sha256: 'x' }));
  const stale = await runServiceCommand('doctor', m.deps, ['--installed']);
  assert.equal(stale.exitCode, 0, 'a dictation problem warns, it does not fail the installed service');
  assert.match(stale.message, /\[предупреждение\] диктовка: helper: диктовка недоступна: helper версии 0\.0\.9, копия 0\.1\.0/);

  await m.fs.remove(`${MAC_DATA}/app/0.1.0/node_modules/ws`);
  const broken = await runServiceCommand('doctor', m.deps, ['--installed']);
  assert.equal(broken.exitCode, 1);
  assert.match(broken.message, /\[ошибка\] зависимости копии: нет ws в node_modules копии/);
});

test('doctor --installed on Linux and Windows checks the packages and has no helper line', async () => {
  for (const platform of ['linux', 'win32'] as const) {
    const m = standardMachine(platform);
    seedPayload(m.fs, m.deps.sourceRoot!, { helper: 'release' });
    await runServiceCommand('install', m.deps);
    const report = await runServiceCommand('doctor', m.deps, ['--installed']);
    assert.match(report.message, /\[ok\]\s+зависимости копии: ws/, platform);
    assert.doesNotMatch(report.message, /диктовка/, platform);
  }
});

test('doctor --installed of a copy without a lock (before 0.17.0) needs no packages', async () => {
  const m = standardMachine('linux');
  await runServiceCommand('install', m.deps);
  assert.match((await runServiceCommand('doctor', m.deps, ['--installed'])).message, /\[ok\]\s+зависимости копии: не нужны/);
});
