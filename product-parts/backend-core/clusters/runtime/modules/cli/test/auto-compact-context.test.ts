// M28 T014: the service gives providers Claude's auto-compact threshold for old host snapshots.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createStubProvider } from '#provider-registry';
import type { ProviderContext } from '#provider-registry';
import { createApp } from '../src/index.ts';

const PREFIX = 'wfk-acw-';
// Each variant runs only on its own OS family (M35). Off Windows the injected win32 layout turns
// the POSIX temp folder into a name like "\var\folders\...\data", and the app would create it in
// the working directory; on Windows the darwin/linux data folder cannot be made in its temp folder.
// The win32 branch of the threshold lookup itself is covered on every OS by auto-compact-window.test.ts.
const skipOn = (platform: NodeJS.Platform) => {
  const windows = process.platform === 'win32';
  if (platform === 'win32' && !windows) return 'Windows paths of a POSIX temp folder';
  if (platform !== 'win32' && windows) return 'POSIX paths of a Windows temp folder';
  return false;
};
for (const platform of ['darwin', 'linux', 'win32'] as const) test(`${platform}: the provider context reads the threshold from settings files, never from the service environment`, { skip: skipOn(platform) }, async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), PREFIX));
  let context: ProviderContext | null = null;
  const app = await createApp({
    platform,
    env: { WFK_DATA_DIR: path.join(tmp, 'data'), WFK_PORT: '0', CLAUDE_CODE_AUTO_COMPACT_WINDOW: '300000' },
    homedir: tmp,
    getInterfaces: () => ({}),
    providers: [(ctx) => { context = ctx; return createStubProvider({ id: 'mock', title: 'Mock', task: 'T000' }); }],
  });
  try {
    await mkdir(path.join(tmp, '.claude'), { recursive: true });
    await writeFile(path.join(tmp, '.claude', 'settings.json'), JSON.stringify({ modelSettings: { 'claude-opus-5-5': { autoCompactWindow: 500000 } } }));
    const project = path.join(tmp, 'project');
    const opus = await context!.autoCompactWindow!('claude-opus-5-5', project);
    assert.notEqual(opus?.window, 300000, 'the service environment is never used');
    assert.deepEqual(opus, { window: 500000, source: 'user' });
    assert.equal(await context!.autoCompactWindow!('claude-sonnet-5-5', project), null, 'no threshold for another model');
  } finally { await app.stop().catch(() => undefined); await rm(tmp, { recursive: true, force: true }); }
});

// Runs after the variants: none of them may leave a folder of its own in the working directory (M35).
test('no variant leaves a folder in the working directory', async () => {
  const leaked = (await readdir(process.cwd())).filter((name) => name.includes(PREFIX));
  assert.deepEqual(leaked, [], 'folders left in the working directory');
});
