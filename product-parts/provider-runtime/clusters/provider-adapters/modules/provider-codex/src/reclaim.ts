// Remote control stays with the Kit daemon (spec M43). There is one remote-control slot per Codex
// installation: the first app-server online gets it, the next one gets 409 "Remote app server
// already online". When the app-server built into the ChatGPT app took it (the daemon restarted or
// lost its link while the app ran), a phone or an iPad reaches that server and cannot open a Kit
// chat ("the task is used in another Codex session": the daemon is the writer of the thread).
// Kit gives the slot back to the daemon: the app quits the normal way, the daemon reconnects, the
// app starts again in the background and finds the slot taken (checked 2026-11-11). macOS only.
import { powershell } from '#process-supervisor';
import type { ProviderAction } from '#provider-registry';
import type { CodexRuntime } from './runtime.ts';

/** Bundle id of ChatGPT for Mac 26.11 (CFBundleIdentifier of /Applications/ChatGPT.app). */
export const CHATGPT_BUNDLE_ID = 'com.openai.codex';

/** How long the app may take to quit, and the poll of the process list meanwhile. */
export const QUIT_WAIT_MS = 30_000;
export const QUIT_POLL_MS = 2_000;

/** How long the daemon may take to get remote control back, and the poll of its state. */
export const RECLAIM_WAIT_MS = 90_000;
export const RECLAIM_POLL_MS = 5_000;

/** Automatic attempts per window (manual ones are not counted and reset the window). */
export const AUTO_LIMIT = 3;
export const AUTO_WINDOW_MS = 60 * 60_000;

/** Id of the provider action that gives remote control back to the daemon. */
export const RECLAIM_ACTION = 'reclaim-remote';

/** Note of the status while the remote control is given back. */
export const RECLAIM_REASON =
  'Удалённое управление держало приложение ChatGPT: Kit закрывает и снова открывает ChatGPT — около минуты, чаты Kit продолжаются.';

/** Note of the status when the app holds remote control and Kit does not take it back by itself. */
export const APP_OWNER_NOTE =
  'Удалённое управление держит приложение ChatGPT — чаты Kit не откроются на телефоне. «Вернуть управление Kit» или закройте ChatGPT и откройте снова.';

/** The same on Windows, where Kit has no checked way to quit and start the packaged app. */
export const WINDOWS_APP_OWNER_NOTE =
  'Удалённое управление держит приложение ChatGPT: закройте ChatGPT, дождитесь «подключён» и откройте снова.';

/** Confirmation of the manual action. */
export const RECLAIM_CONFIRM =
  'Закрыть ChatGPT и открыть снова, чтобы удалённое управление вернулось демону Kit? Незавершённые ходы в собственных чатах приложения прервутся.';

/** Why the manual action is off on Windows. */
export const RECLAIM_WINDOWS_REASON = 'на Windows закройте ChatGPT вручную, дождитесь «подключён» и откройте снова';

/** Note of the provider status when the app holds remote control; null otherwise. */
export function appOwnerNote(platform: NodeJS.Platform, remoteOwner: 'app' | null): string | null {
  if (remoteOwner !== 'app') return null;
  return platform === 'darwin' ? APP_OWNER_NOTE : WINDOWS_APP_OWNER_NOTE;
}

/** The action «Вернуть управление Kit»: on while the app holds remote control on macOS, off on Windows, none on Linux. */
export function reclaimAction(platform: NodeJS.Platform, remoteOwner: 'app' | null, active: boolean): ProviderAction | null {
  if (remoteOwner !== 'app' || (platform !== 'darwin' && platform !== 'win32')) return null;
  const action: ProviderAction = { id: RECLAIM_ACTION, title: 'Вернуть управление Kit', scope: 'provider', enabled: true, confirm: RECLAIM_CONFIRM };
  if (platform === 'win32') return { ...action, enabled: false, reason: RECLAIM_WINDOWS_REASON };
  return active ? { ...action, enabled: false, reason: RECLAIM_REASON } : action;
}

export type ReclaimResult = 'reclaimed' | 'app-kept' | 'not-connected' | `failed: ${string}`;
export type ReclaimReason = 'maintain' | 'create-session' | 'manual';

/**
 * True for the command line of the app-server built into the ChatGPT app: macOS
 * `/Applications/ChatGPT.app/…/codex … app-server`; Windows — codex.exe of the app package
 * (a folder with OpenAI.Codex or ChatGPT in its name). Other platforms have none.
 */
export function isChatgptAppServer(commandLine: string, platform: NodeJS.Platform): boolean {
  if (!/(^|\s)app-server(\s|$)/.test(commandLine)) return false;
  if (platform === 'darwin') return commandLine.includes('/ChatGPT.app/');
  if (platform === 'win32') return /[\\/][^\\/]*(OpenAI\.Codex|ChatGPT)[^\\/]*[\\/]/i.test(commandLine);
  return false;
}

/** True for the main process of ChatGPT for Mac (not its helpers and not its app-server). */
export function isChatgptApp(commandLine: string): boolean {
  return /\/ChatGPT\.app\/Contents\/MacOS\/ChatGPT(\s|$)/.test(commandLine);
}

function pidsOf(listing: string, match: (commandLine: string) => boolean): number[] {
  const pids: number[] = [];
  for (const line of listing.split(/\r?\n/)) {
    const found = /^\s*(\d+)\s+(.*)$/.exec(line);
    if (found && match(found[2] ?? '')) pids.push(Number(found[1]));
  }
  return pids;
}

/** "<pid> <command line>" lines → pids of the ChatGPT app's app-server. */
export function appServerPids(listing: string, platform: NodeJS.Platform): number[] {
  return pidsOf(listing, (commandLine) => isChatgptAppServer(commandLine, platform));
}

/** Lists "<pid> <command line>" of the running processes (null when the list cannot be read). */
export async function processListing(rt: CodexRuntime): Promise<string | null> {
  const { platform, runCommand } = rt.context;
  if (platform === 'win32') {
    const script = "Get-CimInstance Win32_Process -Filter \"Name='codex.exe'\" | ForEach-Object { \"$($_.ProcessId) $($_.CommandLine)\" }";
    return powershell(runCommand, script);
  }
  const result = await runCommand('ps', ['-axo', 'pid=,command='], { timeoutMs: 10_000 });
  return result.code === 0 ? result.stdout : null;
}

/** What the steps of a reclaim do to the system (tests replace it: no real app is touched). */
export interface ReclaimSystem {
  /** Pids of the app's app-server and of the app itself; null when the process list is unreadable. */
  processes(): Promise<{ servers: number[]; apps: number[] } | null>;
  /** Asks the app to quit the normal way; an error text or null. */
  quitApp(apps: number[]): Promise<string | null>;
  /** Asks the running daemon to connect now (`codex remote-control start --json`). */
  nudgeDaemon(): Promise<string | null>;
  /** Starts the app again in the background; an error text or null. */
  openApp(): Promise<string | null>;
}

export interface ReclaimDeps {
  system?: Partial<ReclaimSystem>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  quitWaitMs?: number;
  quitPollMs?: number;
  waitMs?: number;
  pollMs?: number;
}

export interface Reclaim {
  /** True while remote control is being given back. */
  readonly active: boolean;
  /** The last finished reclaim. */
  readonly lastResult: { result: ReclaimResult; reason: ReclaimReason; at: string } | null;
  /** True when Kit can give remote control back on this platform. */
  readonly supported: boolean;
  /** One reclaim when it is needed and allowed; a line for the log or null. */
  request(reason: ReclaimReason): Promise<string | null>;
  /** The upkeep step of the backend (once a minute). */
  maintain(): Promise<string | null>;
}

function defaultSystem(rt: CodexRuntime): ReclaimSystem {
  const { runCommand, platform } = rt.context;
  const failure = (result: { code: number | null; startError?: string | null; stderr: string }): string | null =>
    result.startError ?? (result.code === 0 ? null : result.stderr.trim().slice(0, 200) || `код ${result.code}`);
  return {
    async processes() {
      const listing = await processListing(rt);
      if (listing === null) return null;
      return { servers: appServerPids(listing, platform), apps: platform === 'darwin' ? pidsOf(listing, isChatgptApp) : [] };
    },
    async quitApp(apps) {
      const asked = await runCommand('osascript', ['-e', `tell application id "${CHATGPT_BUNDLE_ID}" to quit`], { timeoutMs: 20_000 });
      const error = failure(asked);
      if (error === null) return null;
      // Apple Events may be refused to a background service (no Automation consent): SIGTERM is
      // the same normal quit of the app, never SIGKILL.
      try {
        for (const pid of apps) process.kill(pid, 'SIGTERM');
        return null;
      } catch (signalError) {
        return `${error}; SIGTERM: ${(signalError as Error).message}`;
      }
    },
    async nudgeDaemon() {
      const result = await runCommand(rt.command(), ['remote-control', 'start', '--json'], { cwd: rt.context.homedir, env: rt.childEnv(), timeoutMs: 30_000 });
      rt.forgetDaemon();
      return result.startError ?? null;
    },
    async openApp() {
      return failure(await runCommand('open', ['-g', '-b', CHATGPT_BUNDLE_ID], { timeoutMs: 20_000 }));
    },
  };
}

export function createReclaim(rt: CodexRuntime, deps: ReclaimDeps = {}): Reclaim {
  const system: ReclaimSystem = { ...defaultSystem(rt), ...deps.system };
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = deps.now ?? (() => Date.now());
  const quitWaitMs = deps.quitWaitMs ?? QUIT_WAIT_MS;
  const quitPollMs = deps.quitPollMs ?? QUIT_POLL_MS;
  const waitMs = deps.waitMs ?? RECLAIM_WAIT_MS;
  const pollMs = deps.pollMs ?? RECLAIM_POLL_MS;
  const supported = rt.context.platform === 'darwin';
  let active = false;
  let lastResult: Reclaim['lastResult'] = null;
  let attempts: number[] = [];
  // Automatic attempts stop after a failure: for the app pids that refused to quit, or ('*')
  // until the daemon is seen free or the user asks; a manual request always runs.
  let halted: string | null = null;

  const waitUntil = async (limitMs: number, stepMs: number, done: () => Promise<boolean>): Promise<boolean> => {
    const start = now();
    for (;;) {
      if (await done()) return true;
      if (now() - start >= limitMs) return false;
      await sleep(stepMs);
    }
  };

  const run = async (reason: ReclaimReason): Promise<string | null> => {
    if (!supported || active) return null;
    if (rt.program.installed !== true || rt.program.unsupported) return null;
    const daemon = await rt.daemon(true);
    if (!daemon.running || daemon.remoteOwner !== 'app') {
      if (daemon.running && daemon.remoteControl === 'connected') halted = null;
      return null;
    }
    const before = await system.processes();
    if (before === null || before.servers.length === 0) return null;
    const key = before.servers.join(',');
    if (reason === 'manual') {
      attempts = [];
      halted = null;
    } else {
      if (halted === '*' || halted === key) return null;
      attempts = attempts.filter((at) => now() - at < AUTO_WINDOW_MS);
      if (attempts.length >= AUTO_LIMIT) return null;
      attempts.push(now());
    }
    active = true;
    let result: ReclaimResult;
    try {
      result = await giveBack(before.apps);
    } catch (error) {
      result = `failed: ${(error as Error).message}`;
    } finally {
      active = false;
    }
    if (result === 'app-kept') halted = key;
    if (result === 'not-connected') halted = '*';
    lastResult = { result, reason, at: new Date(now()).toISOString() };
    return `reclaim (${reason}): ${result}`;
  };

  const giveBack = async (apps: number[]): Promise<ReclaimResult> => {
    const quitError = await system.quitApp(apps);
    if (quitError !== null) return `failed: ${quitError}`;
    const quit = await waitUntil(quitWaitMs, quitPollMs, async () => {
      const list = await system.processes();
      return list !== null && list.servers.length === 0;
    });
    // The app asked for a confirmation or refused: it keeps running and is left alone.
    if (!quit) return 'app-kept';
    await system.nudgeDaemon();
    const connected = await waitUntil(waitMs, pollMs, async () => {
      const state = await rt.daemon(true);
      return state.remoteControl === 'connected' && state.remoteOwner !== 'app';
    });
    // The app comes back in both cases: the user is never left without it.
    const openError = await system.openApp();
    if (!connected) return 'not-connected';
    return openError === null ? 'reclaimed' : `failed: ChatGPT не открылся снова: ${openError}`;
  };

  return {
    get active() {
      return active;
    },
    get lastResult() {
      return lastResult;
    },
    supported,
    request: run,
    maintain: () => run('maintain'),
  };
}
