// Remote control back to the Kit daemon (spec M43) on a fake runtime and a fake system: no real
// codex, no real ChatGPT app is touched; the platform is injected, so every branch runs on every OS.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AUTO_LIMIT, AUTO_WINDOW_MS, CHATGPT_BUNDLE_ID, RECLAIM_ACTION, RECLAIM_REASON, RECLAIM_WINDOWS_REASON, appServerPids, createReclaim, isChatgptApp, isChatgptAppServer, processListing, reclaimAction } from '../src/reclaim.ts';
import type { ReclaimSystem } from '../src/reclaim.ts';
import { isSettling, SETTLE_MS } from '../src/runtime.ts';
import type { CodexRuntime, DaemonState } from '../src/runtime.ts';

const MAC_APP_SERVER = '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex -c features.x=true app-server --analytics-default-enabled';
const MAC_APP = '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT';
const MAC_DAEMON = '/Users/u/.codex/packages/app-server-daemon/releases/0.170.0/bin/codex app-server --remote-control --listen unix://';
const WIN_APP = 'C:\\Program Files\\WindowsApps\\OpenAI.ChatGPT-Desktop_1.2.3_x64__abc\\app\\resources\\codex.exe app-server';

function daemonState(over: Partial<DaemonState> = {}): DaemonState {
  return { running: true, pid: 100, remoteControl: 'errored', serverName: 'mac', userAgent: null, tokenError: null, staleLogin: false, remoteOwner: 'app', settling: false, error: null, checkedAt: '', ...over };
}

const FREE = daemonState({ remoteControl: 'connected', remoteOwner: null });

interface World {
  rt: CodexRuntime;
  calls: string[];
  /** The daemon as the probe sees it; after the nudge it becomes `afterNudge`. */
  state: { daemon: DaemonState; afterNudge: DaemonState; servers: number[]; apps: number[]; quits: boolean; clock: number };
  system: ReclaimSystem;
}

function world(platform: NodeJS.Platform): World {
  const calls: string[] = [];
  const state = { daemon: daemonState(), afterNudge: FREE, servers: [200], apps: [190], quits: true, clock: 0 };
  let nudged = false;
  const rt = {
    context: {
      platform,
      homedir: '/home/u',
      runCommand: async (command: string) => {
        calls.push(`run ${command}`);
        return { code: 0, stdout: '', stderr: '', timedOut: false };
      },
    },
    program: { installed: true, unsupported: null },
    daemon: async () => (nudged ? state.afterNudge : state.daemon),
    forgetDaemon: () => undefined,
    command: () => 'codex',
    childEnv: () => ({}),
  } as unknown as CodexRuntime;
  const system: ReclaimSystem = {
    processes: async () => ({ servers: state.servers, apps: state.apps }),
    quitApp: async (apps) => {
      calls.push(`quit ${apps.join(',')}`);
      if (state.quits) state.servers = [];
      return null;
    },
    nudgeDaemon: async () => {
      calls.push('nudge');
      nudged = true;
      return null;
    },
    openApp: async () => {
      calls.push('open');
      state.servers = [300];
      state.apps = [290];
      return null;
    },
  };
  return { rt, calls, state, system };
}

function reclaimOf(w: World) {
  return createReclaim(w.rt, { system: w.system, sleep: async (ms) => { w.state.clock += ms; }, now: () => w.state.clock, quitWaitMs: 10, quitPollMs: 5, waitMs: 20, pollMs: 5 });
}

test('the app-server of the ChatGPT app and the app itself are told from the daemon and other codex app-servers', () => {
  assert.equal(isChatgptAppServer(MAC_APP_SERVER, 'darwin'), true);
  assert.equal(isChatgptAppServer(MAC_DAEMON, 'darwin'), false);
  assert.equal(isChatgptAppServer(MAC_APP, 'darwin'), false, 'the app itself is not its app-server');
  assert.equal(isChatgptAppServer(WIN_APP, 'win32'), true);
  assert.equal(isChatgptAppServer('C:\\Users\\u\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\codex.exe app-server', 'win32'), false);
  assert.equal(isChatgptAppServer(MAC_APP_SERVER, 'linux'), false, 'Linux has no ChatGPT app');
  assert.deepEqual(appServerPids(`  100 ${MAC_DAEMON}\r\n  200 ${MAC_APP_SERVER}\n\n`, 'darwin'), [200]);
  assert.equal(isChatgptApp(MAC_APP), true);
  assert.equal(isChatgptApp(MAC_APP_SERVER), false);
  assert.equal(isChatgptApp('/Applications/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Helpers/browser_crashpad_handler'), false);
});

test('macOS: the app quits, the daemon is nudged and connects, the app starts again', async () => {
  const w = world('darwin');
  const reclaim = reclaimOf(w);
  assert.equal(reclaim.supported, true);
  assert.equal(await reclaim.request('create-session'), 'reclaim (create-session): reclaimed');
  assert.deepEqual(w.calls, ['quit 190', 'nudge', 'open']);
  assert.equal(reclaim.lastResult?.result, 'reclaimed');
  assert.equal(reclaim.lastResult?.reason, 'create-session');
  assert.equal(reclaim.active, false);
  w.state.daemon = FREE;
  assert.equal(await reclaim.maintain(), null, 'the daemon holds remote control: nothing to do');
});

test('the default system quits with osascript by bundle id and starts the app with open -g -b', async () => {
  const commands: string[] = [];
  const w = world('darwin');
  (w.rt.context as { runCommand: unknown }).runCommand = async (command: string, args: string[]) => {
    commands.push([command, ...args].join(' '));
    const listing = commands.some((c) => c.startsWith('osascript')) ? `100 ${MAC_DAEMON}\n` : `100 ${MAC_DAEMON}\n190 ${MAC_APP}\n200 ${MAC_APP_SERVER}\n`;
    return { code: 0, stdout: command === 'ps' ? listing : '', stderr: '', timedOut: false };
  };
  (w.rt as { daemon: unknown }).daemon = async () => (commands.some((c) => c.startsWith('codex remote-control start')) ? FREE : daemonState());
  const reclaim = createReclaim(w.rt, { sleep: async () => undefined, quitWaitMs: 0, waitMs: 0 });
  assert.equal(await reclaim.request('maintain'), 'reclaim (maintain): reclaimed');
  assert.deepEqual(commands.filter((c) => !c.startsWith('ps')), [
    `osascript -e tell application id "${CHATGPT_BUNDLE_ID}" to quit`,
    'codex remote-control start --json',
    `open -g -b ${CHATGPT_BUNDLE_ID}`,
  ]);
});

test('an app that does not quit is left alone and not asked again until its pid changes', async () => {
  const w = world('darwin');
  w.state.quits = false;
  const reclaim = reclaimOf(w);
  assert.equal(await reclaim.maintain(), 'reclaim (maintain): app-kept');
  assert.deepEqual(w.calls, ['quit 190'], 'no nudge and no new start of a running app');
  assert.equal(await reclaim.maintain(), null);
  assert.equal(await reclaim.request('create-session'), null);
  w.state.servers = [201];
  assert.equal(await reclaim.maintain(), 'reclaim (maintain): app-kept', 'a new app process is asked again');
});

test('a daemon that does not connect: the app still starts again; automatic attempts stop until the daemon is free', async () => {
  const w = world('darwin');
  w.state.afterNudge = daemonState();
  const reclaim = reclaimOf(w);
  assert.equal(await reclaim.maintain(), 'reclaim (maintain): not-connected');
  assert.deepEqual(w.calls, ['quit 190', 'nudge', 'open']);
  assert.equal(await reclaim.maintain(), null, 'halted');
  w.state.afterNudge = FREE;
  assert.equal(await reclaim.maintain(), null, 'the daemon is free now: the halt is lifted');
  w.state.afterNudge = daemonState();
  w.state.servers = [400];
  assert.match((await reclaim.maintain()) ?? '', /not-connected/, 'the app took it again later: a new attempt');
});

test('at most three automatic attempts an hour; a manual request resets the limit', async () => {
  const w = world('darwin');
  const reclaim = reclaimOf(w);
  const retake = () => {
    w.state.servers = [500 + w.calls.length];
    w.state.afterNudge = FREE;
  };
  // The app takes remote control back every time (the probe after the nudge says free, the next
  // one held again): only the limit stops the loop.
  (w.rt as { daemon: unknown }).daemon = async () => (w.calls.at(-1) === 'nudge' ? FREE : daemonState());
  for (let i = 0; i < AUTO_LIMIT; i += 1) {
    retake();
    assert.match((await reclaim.maintain()) ?? '', /reclaimed/);
  }
  retake();
  assert.equal(await reclaim.maintain(), null, 'the limit is reached');
  assert.match((await reclaim.request('manual')) ?? '', /reclaim \(manual\): reclaimed/);
  retake();
  assert.match((await reclaim.maintain()) ?? '', /reclaimed/, 'the manual request reset the window');
  w.state.clock += AUTO_WINDOW_MS;
  retake();
  assert.match((await reclaim.maintain()) ?? '', /reclaimed/);
});

test('one reclaim at a time; nothing without the app, without codex or with a stopped daemon', async () => {
  const w = world('darwin');
  let release: () => void = () => undefined;
  w.system.quitApp = async () => {
    await new Promise<void>((resolve) => { release = resolve; });
    w.state.servers = [];
    return null;
  };
  const reclaim = reclaimOf(w);
  const first = reclaim.request('create-session');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(reclaim.active, true);
  assert.equal(await reclaim.request('create-session'), null, 'a second request while the first runs');
  release();
  assert.match((await first) ?? '', /reclaimed/);

  const idle = world('darwin');
  idle.state.servers = [];
  assert.equal(await reclaimOf(idle).maintain(), null, 'the app does not run');
  const stopped = world('darwin');
  stopped.state.daemon = daemonState({ running: false, pid: null });
  assert.equal(await reclaimOf(stopped).maintain(), null);
  const missing = world('darwin');
  (missing.rt as { program: unknown }).program = { installed: false, unsupported: null };
  assert.equal(await reclaimOf(missing).maintain(), null);
  assert.deepEqual([...idle.calls, ...stopped.calls, ...missing.calls], []);
});

test('Windows and Linux: no automatic reclaim, no command at all', async () => {
  for (const platform of ['win32', 'linux'] as const) {
    const w = world(platform);
    const reclaim = reclaimOf(w);
    assert.equal(reclaim.supported, false);
    assert.equal(await reclaim.maintain(), null);
    assert.equal(await reclaim.request('manual'), null);
    assert.deepEqual(w.calls, [], platform);
  }
});

test('the action «Вернуть управление Kit»: on in macOS, off with a reason on Windows, none on Linux or with a free daemon', () => {
  const mac = reclaimAction('darwin', 'app', false);
  assert.deepEqual([mac?.id, mac?.enabled, mac?.scope], [RECLAIM_ACTION, true, 'provider']);
  assert.deepEqual([reclaimAction('darwin', 'app', true)?.enabled, reclaimAction('darwin', 'app', true)?.reason], [false, RECLAIM_REASON]);
  assert.deepEqual([reclaimAction('win32', 'app', false)?.enabled, reclaimAction('win32', 'app', false)?.reason], [false, RECLAIM_WINDOWS_REASON]);
  assert.equal(reclaimAction('linux', 'app', false), null);
  assert.equal(reclaimAction('darwin', null, false), null);
  assert.equal(reclaimAction('win32', null, false), null);
});

test('Windows lists codex.exe through PowerShell CIM; macOS and Linux through ps', async () => {
  const seen: string[] = [];
  const rt = (platform: NodeJS.Platform) => ({
    context: { platform, runCommand: async (command: string) => { seen.push(command); return { code: 0, stdout: `4321 ${WIN_APP}\r\n`, stderr: '', timedOut: false }; } },
  }) as unknown as CodexRuntime;
  assert.match((await processListing(rt('win32'))) ?? '', /4321/);
  await processListing(rt('linux'));
  assert.deepEqual(seen, ['powershell.exe', 'ps']);
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
