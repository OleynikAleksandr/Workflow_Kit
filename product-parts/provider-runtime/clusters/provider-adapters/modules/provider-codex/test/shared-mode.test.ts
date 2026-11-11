// The shared daemon mode (spec M12 section 2.3) without a machine: links, the second app-server,
// the mode over a shared access, and the wake turn on a fake RPC session.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SharedAccess, SharedAccessState } from '#provider-registry';
import { SHARED_APP_OWNER_REASON, appOwnerNote, createSharedMode, isSecondAppServer, sharedThreadLinks } from '../src/shared-mode.ts';
import { WAKE_TEXT, wakeThread } from '../src/thread-ops.ts';
import type { RpcSession } from '../src/rpc.ts';

test('links of the mode: the Mac opens the copy of the SSH connection, a phone the plain link', () => {
  assert.deepEqual(sharedThreadLinks('019a-1'), {
    desktop: 'codex://threads/019a-1?hostId=remote-ssh-discovered%3Awfk-local',
    mobile: 'codex://threads/019a-1',
  });
  assert.deepEqual(sharedThreadLinks('bad id'), {});
});

test('the second app-server of the ChatGPT app is told from the Kit daemon and the app itself', () => {
  assert.equal(isSecondAppServer('  77 /Users/u/.npm-global/bin/codex -c features.code_mode_host=true app-server --listen unix://'), true);
  assert.equal(isSecondAppServer('  12 /Users/u/.codex/packages/app-server-daemon/bin/codex app-server --remote-control --listen unix://'), false);
  assert.equal(isSecondAppServer('  13 /Applications/ChatGPT.app/Contents/Resources/codex -c features.code_mode_host=true app-server'), false);
});

test('the mode is on only while the shared access is active', async () => {
  let state: SharedAccessState['state'] = 'needs-connection';
  let checks = 0;
  const shared = {
    cached: () => ({ state }) as SharedAccessState,
    state: async () => (checks++, { state }) as SharedAccessState,
  } as unknown as SharedAccess;
  const mode = createSharedMode(shared);
  assert.equal(mode.active(), false);
  state = 'active';
  assert.equal(await mode.refresh(), true);
  assert.equal(checks, 1);
  state = 'broken';
  assert.equal(mode.active(), false);
});

function fakeSession(loaded: string[]): { session: RpcSession; calls: string[] } {
  const calls: string[] = [];
  const session = {
    request: async (method: string, params: { threadId?: string; input?: Array<{ text: string }> }) => {
      calls.push(method === 'turn/start' ? `${method}:${params.input?.[0]?.text}` : method);
      return method === 'thread/loaded/list' ? { data: loaded, nextCursor: null } : {};
    },
  } as unknown as RpcSession;
  return { session, calls };
}

test('wake: an unloaded chat is resumed first, a loaded one gets the turn at once', async () => {
  const idle = fakeSession([]);
  await wakeThread(idle.session, 't1');
  assert.deepEqual(idle.calls, ['thread/loaded/list', 'thread/resume', `turn/start:${WAKE_TEXT}`, 'thread/unsubscribe']);
  const open = fakeSession(['t1']);
  await wakeThread(open.session, 't1', 'hi');
  assert.deepEqual(open.calls, ['thread/loaded/list', 'turn/start:hi', 'thread/unsubscribe']);
});

test('the app holding remote control is explained only in the active mode', () => {
  const active = { state: 'active' } as SharedAccessState;
  assert.equal(appOwnerNote(active, 'app'), SHARED_APP_OWNER_REASON);
  assert.equal(appOwnerNote(active, null), null);
  assert.equal(appOwnerNote({ state: 'broken' } as SharedAccessState, 'app'), null);
  assert.equal(appOwnerNote(null, 'app'), null);
});
