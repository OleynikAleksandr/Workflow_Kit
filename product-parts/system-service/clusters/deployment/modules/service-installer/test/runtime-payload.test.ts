import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { runServiceCommand } from '../src/index.ts';
import { MemoryFs, standardMachine } from './fakes.ts';
import { seedPayload, seedSpeechData } from './payload-fixtures.ts';

const MAC_DATA = '/Users/me/Library/Application Support/Workflow Kit';
const SPEECH = `${MAC_DATA}/speech`;
const sha = (text: string): string => createHash('sha256').update(text).digest('hex');

test('macOS ARM64 install: runtime packages, lock and notices in the copy, no Cargo target; the helper with helper.json', async () => {
  const m = standardMachine('darwin');
  seedPayload(m.fs, '/src/clone', { helper: 'release v1' });
  const result = await runServiceCommand('install', m.deps);
  assert.equal(result.exitCode, 0, result.message);
  assert.match(result.message, /диктовка: helper установлен/);
  const app = `${MAC_DATA}/app/0.1.0`;
  for (const file of ['package-lock.json', 'THIRD_PARTY_NOTICES.md', 'node_modules/ws/package.json', 'node_modules/ws/lib/websocket.js']) {
    assert.ok(m.fs.existsSync(`${app}/${file}`), file);
  }
  assert.ok(!m.fs.existsSync(`${app}/node_modules/esbuild`), 'dev packages stay out');
  assert.ok(![...m.fs.files.keys()].some((key) => key.startsWith(app) && key.includes('/target/')), 'no Cargo target in the copy');
  assert.equal(m.fs.readTextSync(`${SPEECH}/wfk-speech-helper`), 'release v1');
  assert.equal(m.fs.mode(`${SPEECH}/wfk-speech-helper`), 0o755);
  assert.deepEqual(JSON.parse(m.fs.readTextSync(`${SPEECH}/helper.json`) ?? ''), { version: '0.1.0', sha256: sha('release v1') });
  assert.equal(m.fs.readTextSync(`${SPEECH}/THIRD_PARTY_NOTICES.md`), '# Notices\n');
  assert.ok(![...m.fs.files.keys()].some((key) => key.endsWith('.tmp')), 'no temporary file is left');
});

test('DEPENDENCY_MISSING: a source without its runtime packages is refused before any change', async () => {
  for (const platform of ['darwin', 'linux', 'win32'] as const) {
    const m = standardMachine(platform);
    seedPayload(m.fs, m.deps.sourceRoot!, { packages: false, helper: 'x' });
    const before = new Set(m.fs.files.keys());
    const result = await runServiceCommand('install', m.deps);
    assert.equal(result.exitCode, 1, platform);
    assert.match(result.message, /DEPENDENCY_MISSING: .*нет ws — запустите npm ci/, platform);
    assert.deepEqual([...m.fs.files.keys()].filter((key) => !before.has(key)), [], `${platform}: nothing written`);
    assert.deepEqual([m.calls.length, m.spawned.length], [0, 0], `${platform}: no command, no start`);
  }
});

test('update: a new release helper replaces the old one; models and speech settings stay', async () => {
  const m = standardMachine('darwin');
  const kept = seedSpeechData(m.fs, MAC_DATA);
  m.fs.seed(`${SPEECH}/wfk-speech-helper`, 'old', 0o755);
  m.fs.seed(`${SPEECH}/helper.json`, JSON.stringify({ version: '0.0.9', sha256: sha('old') }));
  seedPayload(m.fs, '/src/clone', { helper: 'release v2' });
  assert.equal((await runServiceCommand('install', m.deps)).exitCode, 0);
  assert.equal(m.fs.readTextSync(`${SPEECH}/wfk-speech-helper`), 'release v2');
  assert.equal(JSON.parse(m.fs.readTextSync(`${SPEECH}/helper.json`) ?? '').version, '0.1.0');
  for (const file of kept) assert.equal(m.fs.readTextSync(file), 'user data', file);
});

test('no new artifact: a helper of this version with matching bytes stays, any other is removed with a warning', async () => {
  const cases = [
    { record: { version: '0.1.0', sha256: sha('same') }, text: 'same', stays: true },
    { record: { version: '0.0.9', sha256: sha('same') }, text: 'same', stays: false },
    { record: { version: '0.1.0', sha256: sha('other') }, text: 'same', stays: false },
    { record: null, text: 'same', stays: false },
  ];
  for (const item of cases) {
    const m = standardMachine('darwin');
    const kept = seedSpeechData(m.fs, MAC_DATA);
    m.fs.seed(`${SPEECH}/wfk-speech-helper`, item.text, 0o755);
    if (item.record) m.fs.seed(`${SPEECH}/helper.json`, JSON.stringify(item.record));
    seedPayload(m.fs, '/src/clone');
    const result = await runServiceCommand('install', m.deps);
    assert.equal(result.exitCode, 0, result.message);
    assert.equal(m.fs.existsSync(`${SPEECH}/wfk-speech-helper`), item.stays, JSON.stringify(item));
    if (item.stays) assert.doesNotMatch(result.message, /диктовка недоступна/);
    else assert.match(result.message, /ВНИМАНИЕ: диктовка недоступна: helper версии 0\.1\.0 не собран/);
    assert.equal(m.fs.existsSync(`${SPEECH}/helper.json`), item.stays);
    for (const file of kept) assert.equal(m.fs.readTextSync(file), 'user data', file);
  }
});

test('a failed replacement leaves no helper and warns; the install goes on and the user data stays', async () => {
  class FailingFs extends MemoryFs {
    override async rename(from: string, to: string): Promise<void> {
      if (to.endsWith('wfk-speech-helper')) throw new Error('EBUSY: resource busy');
      return super.rename(from, to);
    }
  }
  const fs = new FailingFs('darwin');
  const m = standardMachine('darwin');
  for (const [key, entry] of m.fs.files) fs.seed(key, entry.text, entry.mode);
  const kept = seedSpeechData(fs, MAC_DATA);
  fs.seed(`${SPEECH}/wfk-speech-helper`, 'old', 0o755);
  fs.seed(`${SPEECH}/helper.json`, JSON.stringify({ version: '0.0.9', sha256: sha('old') }));
  seedPayload(fs, '/src/clone', { helper: 'release v2' });
  const result = await runServiceCommand('install', { ...m.deps, fs });
  assert.equal(result.exitCode, 0, result.message);
  assert.match(result.message, /диктовка недоступна: helper версии 0\.1\.0 не установлен: EBUSY/);
  for (const name of ['wfk-speech-helper', 'helper.json']) assert.ok(!fs.existsSync(`${SPEECH}/${name}`), name);
  assert.ok(![...fs.files.keys()].some((key) => key.endsWith('.tmp')));
  for (const file of kept) assert.equal(fs.readTextSync(file), 'user data', file);
});

test('reinstall from the installed copy copies nothing and keeps the helper of its version; uninstall removes only the helper files', async () => {
  const m = standardMachine('darwin');
  const kept = seedSpeechData(m.fs, MAC_DATA);
  seedPayload(m.fs, '/src/clone', { helper: 'release v1' });
  assert.equal((await runServiceCommand('install', m.deps)).exitCode, 0);
  const again = await runServiceCommand('install', { ...m.deps, sourceRoot: `${MAC_DATA}/app/0.1.0` });
  assert.equal(again.exitCode, 0, again.message);
  assert.match(again.message, /копия уже на месте/);
  assert.match(again.message, /диктовка: helper той же версии, сохранён/);
  const removed = await runServiceCommand('uninstall', m.deps);
  assert.equal(removed.exitCode, 0, removed.message);
  for (const name of ['wfk-speech-helper', 'helper.json', 'THIRD_PARTY_NOTICES.md']) assert.ok(!m.fs.existsSync(`${SPEECH}/${name}`), name);
  for (const file of kept) assert.equal(m.fs.readTextSync(file), 'user data', file);
});

test('Linux, Windows and Intel macOS: packages are copied, the helper is neither copied nor removed', async () => {
  const machines = [
    { m: standardMachine('linux'), data: '/home/me/.local/share/workflow-kit', sep: '/' },
    { m: standardMachine('win32'), data: 'C:\\Users\\me\\AppData\\Local\\Workflow Kit', sep: '\\' },
    { m: standardMachine('darwin'), data: MAC_DATA, sep: '/', arch: 'x64' },
  ];
  for (const { m, data, sep, arch } of machines) {
    const deps = arch ? { ...m.deps, arch } : m.deps;
    seedPayload(m.fs, m.deps.sourceRoot!, { helper: 'release' });
    m.fs.seed([data, 'speech', 'wfk-speech-helper'].join(sep), 'foreign', 0o755);
    const result = await runServiceCommand('install', deps);
    assert.equal(result.exitCode, 0, result.message);
    assert.doesNotMatch(result.message, /диктовка/, data);
    assert.ok(m.fs.existsSync([data, 'app', '0.1.0', 'node_modules', 'ws', 'package.json'].join(sep)), data);
    assert.equal(m.fs.readTextSync([data, 'speech', 'wfk-speech-helper'].join(sep)), 'foreign', `${data}: untouched`);
    assert.ok(!m.fs.existsSync([data, 'speech', 'helper.json'].join(sep)));
  }
});
