import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { snapshotFile } from '#provider-registry';
import { resolveDataDirs } from '#data-store';
import { nativeStatuslineCommand, runNativeStatusline } from '../src/native-statusline.ts';
for (const platform of ['darwin', 'linux', 'win32'] as const) test(`${platform}: host-bound metadata and original user line retain identity, bytes and errors`, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wfk-native-sl-')); const hostId = randomUUID(); const sessionId = randomUUID(); const file = path.join(root, 'own.parameters-native');
  const dirs = resolveDataDirs({ platform: process.platform, homedir: root, env: { WFK_DATA_DIR: path.join(root, 'data') } });
  try {
    await mkdir(path.join(root, '.claude')); await writeFile(path.join(root, '.claude', 'settings.json'), JSON.stringify({ statusLine: { type: 'command', command: 'user-original' } }));
    const input = Buffer.from(JSON.stringify({ session_id: sessionId, cwd: root, version: '2.1.324', model: { id: 'claude-sonnet-5-5', display_name: 'Sonnet 5.5' }, effort: { level: 'high' }, fast_mode: false, secret: 'must not capture' }) + '\n');
    const output = Buffer.from([0xff, ...Buffer.from('родная строка\n')]); let got: Buffer | null = null;
    const deps = { dirs, platform, cwd: root, homedir: root, input, env: { WFK_DATA_DIR: path.join(root, 'data') }, execute: async (command: string, bytes: Buffer) => { assert.equal(command, 'user-original'); assert.deepEqual(bytes, input); return output; }, write: (bytes: Buffer) => { got = bytes; } };
    await runNativeStatusline({ file, hostId }, deps); assert.deepEqual(got, output);
    const saved = JSON.parse(await readFile(file, 'utf8')); assert.equal(saved.hostId, hostId); assert.equal(saved.sessionId, sessionId); assert.equal(saved.effort, 'high'); assert.equal(JSON.stringify(saved).includes('must not capture'), false);
    got = null; await runNativeStatusline({ file: path.join(root, 'absent', 'own.parameters-native'), hostId: 'invalid' }, deps); assert.deepEqual(got, output);
    const hostile = '/tmp/$(touch BAD)`touch BAD` "кириллица".parameters-native'; const command = nativeStatuslineCommand({ file: hostile, hostId });
    assert.equal(command.includes(hostile), false); assert.equal(command.includes('$(touch'), false); assert.equal(command.includes('`'), false);
  } finally { await rm(snapshotFile(dirs, 'claude', sessionId, platform), { force: true }); await rm(root, { recursive: true, force: true }); }
});
