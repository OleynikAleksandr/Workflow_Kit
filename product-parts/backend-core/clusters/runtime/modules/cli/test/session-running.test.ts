// `wfk session title|plan` without hooks (spec M9 2.3): when the channel knows no running turn,
// the service takes the only session the providers list as running (a Kimi turn by its lock).
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createStubProvider } from '#provider-registry';
import type { SessionInfo } from '#provider-registry';
import { createApp } from '../src/index.ts';

test('/api/sessions/plan without a session takes the only session the providers list as running', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-running-'));
  let listed: SessionInfo[] = [];
  const session = (localId: string, state: SessionInfo['state']): SessionInfo => ({ provider: 'kimi', localId, title: localId, createdAt: new Date().toISOString(), origin: 'hook', state, links: {} });
  const app = await createApp({
    env: { WFK_DATA_DIR: path.join(tmp, 'data'), WFK_PORT: '0' },
    homedir: tmp,
    getInterfaces: () => ({}),
    providers: [
      () => createStubProvider({ id: 'codex', title: 'codex', task: 'T000' }),
      () => ({ ...createStubProvider({ id: 'kimi', title: 'kimi', task: 'T000' }), listSessions: async () => listed }),
    ],
  });
  try {
    const base = `http://127.0.0.1:${(await app.start()).port}`;
    const folder = path.join(tmp, 'Projects', 'sklad');
    await mkdir(folder, { recursive: true });
    await app.projects.open(folder);
    const post = async (): Promise<{ status: number; key?: string; code?: string }> => {
      const reply = await fetch(`${base}/api/sessions/plan`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ summary: 'Склад', cwd: folder }) });
      const body = (await reply.json()) as { key?: string; error?: { code?: string } };
      return { status: reply.status, ...(body.key ? { key: body.key } : {}), ...(body.error?.code ? { code: body.error.code } : {}) };
    };
    listed = [session('session_old', 'stopped'), session('session_live', 'running')];
    assert.deepEqual(await post(), { status: 200, key: 'kimi:session_live' });
    listed = [session('session_a', 'running'), session('session_b', 'running')];
    assert.deepEqual(await post(), { status: 409, code: 'session-ambiguous' });
    listed = [session('session_old', 'stopped')];
    assert.deepEqual(await post(), { status: 409, code: 'session-ambiguous' });
  } finally {
    await app.stop();
    await rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});
