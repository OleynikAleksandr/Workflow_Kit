// M28 T014: the service gives providers Claude's auto-compact threshold for old host snapshots.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createStubProvider } from '#provider-registry';
import type { ProviderContext } from '#provider-registry';
import { createApp } from '../src/index.ts';

for (const platform of ['darwin', 'linux', 'win32'] as const) test(`${platform}: the provider context reads the threshold from settings files, never from the service environment`, async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-acw-'));
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
    // win32 paths of a POSIX temp folder are unreachable off Windows; Windows CI reads them for real.
    if (platform === 'win32' && process.platform !== 'win32') return;
    assert.deepEqual(opus, { window: 500000, source: 'user' });
    assert.equal(await context!.autoCompactWindow!('claude-sonnet-5-5', project), null, 'no threshold for another model');
  } finally { await app.stop().catch(() => undefined); await rm(tmp, { recursive: true, force: true }); }
});
