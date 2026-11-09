// Hand-over of remote control to the ChatGPT app (spec M7, remark 2) on a fake runtime: no real
// codex, no processes; the platform is injected, so every branch runs on every OS.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appServerPids, createHandover, isChatgptAppServer } from '../src/handover.ts';
import { isSettling, SETTLE_MS } from '../src/runtime.ts';
import type { CodexRuntime, DaemonState } from '../src/runtime.ts';

const MAC_APP = '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex -c features.x=true app-server --analytics-default-enabled';
const MAC_DAEMON = '/Users/u/.codex/packages/app-server-daemon/releases/0.167.0/bin/codex app-server --remote-control --listen unix://';
const WIN_APP = 'C:\\Program Files\\WindowsApps\\OpenAI.ChatGPT-Desktop_1.2.3_x64__abc\\app\\resources\\codex.exe app-server';

function daemonState(over: Partial<DaemonState> = {}): DaemonState {
  return { running: true, pid: 100, remoteControl: 'connected', serverName: 'mac', userAgent: null, tokenError: null, staleLogin: false, remoteOwner: null, settling: false, error: null, checkedAt: '', ...over };
}

interface Fake {
  rt: CodexRuntime;
  calls: string[];
  state: { daemon: DaemonState; after: DaemonState; loaded: unknown[]; listing: string };
}

function fakeRuntime(platform: NodeJS.Platform): Fake {
  const calls: string[] = [];
  const state = { daemon: daemonState(), after: daemonState({ pid: 101, remoteControl: 'errored', remoteOwner: 'app' }), loaded: [] as unknown[], listing: `  100 ${MAC_DAEMON}\n  200 ${MAC_APP}\n` };
  let stopped = false;
  const ok = (stdout: string) => ({ code: 0, stdout, stderr: '', timedOut: false });
  const rt = {
    context: {
      platform,
      homedir: '/home/u',
      runCommand: async (command: string, args: string[]) => {
        calls.push([command, ...args.slice(0, 2)].join(' '));
        if (command === 'ps' || command === 'powershell.exe') return ok(state.listing);
        if (args[1] === 'stop') stopped = true;
        if (args[1] === 'start') stopped = false;
        return ok('{}');
      },
    },
    program: { installed: true, unsupported: null },
    daemon: async () => (stopped ? daemonState({ running: false, pid: null }) : calls.some((c) => c.endsWith('remote-control start')) ? state.after : state.daemon),
    withDaemon: async (fn: (session: { request: () => Promise<unknown> }) => Promise<unknown>) => fn({ request: async () => ({ data: state.loaded }) }),
    forgetDaemon: () => calls.push('forget'),
    command: () => 'codex',
    childEnv: () => ({}),
  } as unknown as CodexRuntime;
  return { rt, calls, state };
}

test('the app-server of the ChatGPT app is told from the daemon and other codex app-servers', () => {
  assert.equal(isChatgptAppServer(MAC_APP, 'darwin'), true);
  assert.equal(isChatgptAppServer(MAC_DAEMON, 'darwin'), false);
  assert.equal(isChatgptAppServer('/Applications/ChatGPT.app/Contents/MacOS/ChatGPT', 'darwin'), false, 'the app itself is not its app-server');
  assert.equal(isChatgptAppServer(WIN_APP, 'win32'), true);
  assert.equal(isChatgptAppServer('C:\\Users\\u\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\codex.exe app-server', 'win32'), false);
  assert.equal(isChatgptAppServer(MAC_APP, 'linux'), false, 'Linux has no ChatGPT app');
  assert.deepEqual(appServerPids(`  100 ${MAC_DAEMON}\r\n  200 ${MAC_APP}\n\n`, 'darwin'), [200]);
});

test('an idle daemon hands remote control to the running ChatGPT app once (macOS)', async () => {
  const { rt, calls } = fakeRuntime('darwin');
  const sleeps: number[] = [];
  let activeWhileWaiting = false;
  const handover = createHandover(rt, { waitMs: 5, sleep: async (ms) => { sleeps.push(ms); activeWhileWaiting = handover.active; } });
  assert.match((await handover.maintain()) ?? '', /handed to the ChatGPT app/);
  assert.deepEqual(sleeps, [5]);
  assert.equal(activeWhileWaiting, true);
  assert.equal(handover.active, false);
  assert.deepEqual(calls, ['ps -axo pid=,command=', 'codex remote-control stop', 'forget', 'codex remote-control start', 'forget']);
});

test('no hand-over while a thread is loaded in the daemon, Kit is busy, or the app does not run', async () => {
  const fake = fakeRuntime('darwin');
  let busy = true;
  const handover = createHandover(fake.rt, { waitMs: 0, sleep: async () => undefined, busy: () => busy });
  assert.equal(await handover.maintain(), null, 'Kit creates a session through the daemon');
  busy = false;
  fake.state.loaded = ['thread-1'];
  assert.equal(await handover.maintain(), null, 'a chat opened through the daemon (a phone)');
  fake.state.listing = `  100 ${MAC_DAEMON}\n`;
  fake.state.loaded = [];
  assert.equal(await handover.maintain(), null, 'the ChatGPT app is not running');
  assert.ok(!fake.calls.some((c) => c.includes('remote-control')), 'the daemon was never stopped');
  fake.state.listing = `  200 ${MAC_APP}\n`;
  fake.state.daemon = daemonState({ remoteControl: 'errored', remoteOwner: 'app' });
  assert.equal(await handover.maintain(), null, 'the app already holds remote control');
});

test('an app that did not take remote control is not asked again; a new app process is', async () => {
  const fake = fakeRuntime('darwin');
  fake.state.after = daemonState({ pid: 101 });
  const handover = createHandover(fake.rt, { waitMs: 0, sleep: async () => undefined });
  assert.match((await handover.maintain()) ?? '', /did not take remote control; the daemon keeps it/);
  const before = fake.calls.length;
  assert.equal(await handover.maintain(), null);
  assert.equal(fake.calls.filter((c) => c.includes('remote-control')).length, 2);
  fake.state.listing = `  300 ${MAC_APP}\n`;
  assert.notEqual(await handover.maintain(), null, 'the app was restarted');
  assert.ok(fake.calls.length > before);
});

test('Windows lists codex.exe through PowerShell CIM; Linux does nothing', async () => {
  const win = fakeRuntime('win32');
  win.state.listing = `4321 ${WIN_APP}\r\n`;
  const handover = createHandover(win.rt, { waitMs: 0, sleep: async () => undefined });
  assert.match((await handover.maintain()) ?? '', /handed/);
  assert.equal(win.calls[0], 'powershell.exe -NoProfile -NonInteractive');
  const linux = fakeRuntime('linux');
  assert.equal(await createHandover(linux.rt).maintain(), null);
  assert.deepEqual(linux.calls, []);
});

test('an errored daemon without a login error settles for a minute after its start', () => {
  const errored = { remoteControl: 'errored', tokenError: null, remoteOwner: null };
  assert.equal(isSettling(errored, 1_000, 1_000 + SETTLE_MS - 1), true);
  assert.equal(isSettling(errored, 1_000, 1_000 + SETTLE_MS), false);
  assert.equal(isSettling(errored, null, 1_000), false, 'unknown start time');
  assert.equal(isSettling({ ...errored, tokenError: '401 Unauthorized' }, 1_000, 1_001), false, 'a real login error');
  assert.equal(isSettling({ ...errored, remoteOwner: 'app' }, 1_000, 1_001), false, 'the 409 is already known');
  assert.equal(isSettling({ ...errored, remoteControl: 'connected' }, 1_000, 1_001), false);
});
