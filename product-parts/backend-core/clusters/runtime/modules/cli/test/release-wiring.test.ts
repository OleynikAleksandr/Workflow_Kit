// M29 3.1: a panel-run session that can be woken is not held by its Stop hook; what comes later
// is queued and the session woken. The service is createApp on loopback with stub providers.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { sessionKey } from '#agent-channel';
import { createStubProvider } from '#provider-registry';
import type { Provider } from '#provider-registry';
import { createApp, main } from '../src/index.ts';
import type { App } from '../src/index.ts';
import { releasable } from '../src/session-wiring.ts';

let tmp = '';
let app: App;
let env: Record<string, string> = {};
let folder = '';
const woken: string[] = [];
const waker = (id: string): Provider => ({
  ...createStubProvider({ id, title: id, task: 'T' }),
  marksPanelProcess: true,
  wakeSession: async (_project, sessionId) => (woken.push(`${id}:${sessionId}`), true),
});

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-release-'));
  folder = path.join(tmp, 'Projects', 'demo');
  await mkdir(folder, { recursive: true });
  app = await createApp({ env: { WFK_DATA_DIR: path.join(tmp, 'data'), WFK_PORT: '0' }, homedir: tmp, providers: [() => waker('mark')] });
  const bound = await app.start();
  env = { WFK_DATA_DIR: path.join(tmp, 'data'), WFK_PORT: String(bound.port) };
  await app.projects.open(folder);
});
after(async () => {
  await app.stop();
  await rm(tmp, { recursive: true, force: true });
});

async function stopHook(sessionId: string, extraEnv: Record<string, string>): Promise<{ code: number; out: string; ms: number }> {
  let out = ''; const started = Date.now();
  const code = await main(['hook', 'stop', '--client', 'mark'], {
    stdout: (text) => (out += text), stderr: () => undefined,
    app: { env: { ...env, ...extraEnv }, homedir: tmp },
    readStdin: async () => JSON.stringify({ session_id: sessionId, cwd: folder, hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: 'Жду' }),
    hookClients: ['mark'],
  });
  return { code, out, ms: Date.now() - started };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

test('releasable: only a panel-run session of a provider that wakes and has no sendMessage', () => {
  const claude = { marksPanelProcess: true, wakeSession: async () => true } as unknown as Provider;
  assert.equal(releasable(claude, { external: false }), true);
  assert.equal(releasable(claude, { external: true }), false, 'led outside the panel');
  assert.equal(releasable(claude, undefined), false);
  assert.equal(releasable({ wakeSession: async () => true } as unknown as Provider, { external: false }), false, 'no panel mark (Codex)');
  assert.equal(releasable({ ...claude, sendMessage: async () => true } as unknown as Provider, { external: false }), false, 'detached (Kimi)');
  assert.equal(releasable(undefined, { external: false }), false);
});

test('a hold of a panel-run session answers the Stop hook at once; a panel message wakes it', async () => {
  app.channel.setDecider(() => ({ kind: 'hold', reason: 'waiting-for-plan-start' }));
  const key = sessionKey('mark', 'r-panel');
  const result = await stopHook('r-panel', { WFK_PANEL_SESSION: '1' });
  assert.equal(result.code, 0);
  assert.equal(result.out.trim(), '', 'no block answer');
  assert.ok(result.ms < 5000, 'the hook is not held');
  assert.equal(app.channel.get(key)!.state, 'holding');
  assert.equal(app.channel.get(key)!.holdReason, 'waiting-for-plan-start');
  app.channel.enqueue(key, 'Workflow Kit: пользователь начал план', 'panel');
  await settle();
  assert.deepEqual(woken, [key]);
});

test('wake of a released hold asks the decider again and wakes the session for its answer', async () => {
  woken.length = 0;
  let ready = false;
  app.channel.setDecider(() => (ready ? { kind: 'continue', text: 'Workflow Kit: начни T001' } : { kind: 'hold', reason: 'waiting-for-plan-start' }));
  const key = sessionKey('mark', 'r-wake');
  await stopHook('r-wake', { WFK_PANEL_SESSION: '1' });
  ready = true;
  app.channel.wake(key);
  await settle();
  assert.deepEqual(woken, [key]);
  assert.equal(app.channel.queued(key)[0]?.text, 'Workflow Kit: начни T001');
});
