// Hand-over of Codex remote control to the ChatGPT app (spec M7, remark 2). One thread has one
// writer process: a chat the ChatGPT app runs on this computer cannot be opened through the
// daemon, so a phone or an iPad that reaches the computer through the daemon gets "the task is
// used in another Codex session". Remote control belongs to whoever connected first; when the
// daemon holds it and the ChatGPT app runs, the daemon lets it go: the app takes it within a
// minute by itself (checked 2026-11-09) and the daemon comes back as the local app-server of Kit.
import { powershell } from '#process-supervisor';
import type { CodexRuntime } from './runtime.ts';

/** Pause between the stop of the daemon and its start (the app took remote control in ≤ 65 s). */
export const HANDOVER_WAIT_MS = 60_000;

/** Why a session cannot be created while the hand-over runs. */
export const HANDOVER_REASON = 'удалённое управление передаётся приложению ChatGPT — около минуты';

/**
 * True for the command line of the app-server built into the ChatGPT app: macOS
 * `/Applications/ChatGPT.app/…/codex … app-server`; Windows — codex.exe of the app package
 * (a folder with OpenAI.Codex or ChatGPT in its name; to be confirmed on Windows). Other platforms have none.
 */
export function isChatgptAppServer(commandLine: string, platform: NodeJS.Platform): boolean {
  if (!/(^|\s)app-server(\s|$)/.test(commandLine)) return false;
  if (platform === 'darwin') return commandLine.includes('/ChatGPT.app/');
  if (platform === 'win32') return /[\\/][^\\/]*(OpenAI\.Codex|ChatGPT)[^\\/]*[\\/]/i.test(commandLine);
  return false;
}

/** "<pid> <command line>" lines → pids of the ChatGPT app's app-server. */
export function appServerPids(listing: string, platform: NodeJS.Platform): number[] {
  const pids: number[] = [];
  for (const line of listing.split(/\r?\n/)) {
    const match = /^\s*(\d+)\s+(.*)$/.exec(line);
    if (match && isChatgptAppServer(match[2] ?? '', platform)) pids.push(Number(match[1]));
  }
  return pids;
}

/** Lists "<pid> <command line>" of the running processes (null when the list cannot be read). */
async function processListing(rt: CodexRuntime): Promise<string | null> {
  const { platform, runCommand } = rt.context;
  if (platform === 'win32') {
    const script = "Get-CimInstance Win32_Process -Filter \"Name='codex.exe'\" | ForEach-Object { \"$($_.ProcessId) $($_.CommandLine)\" }";
    return powershell(runCommand, script);
  }
  const result = await runCommand('ps', ['-axo', 'pid=,command='], { timeoutMs: 10_000 });
  return result.code === 0 ? result.stdout : null;
}

export interface HandoverDeps {
  waitMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** True while Kit itself works through the daemon (a session is being created). */
  busy?: () => boolean;
}

export interface Handover {
  /** True while the daemon is stopped for the hand-over. */
  readonly active: boolean;
  /** One upkeep step: hands remote control over when it is needed and safe; a line for the log or null. */
  maintain(): Promise<string | null>;
}

export function createHandover(rt: CodexRuntime, deps: HandoverDeps = {}): Handover {
  const waitMs = deps.waitMs ?? HANDOVER_WAIT_MS;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  // One attempt per set of app pids: an app that did not take remote control is not asked again
  // every minute (the daemon pid changes with the restart, the app pid does not).
  const tried = new Set<string>();
  let active = false;
  const command = (args: string[]) => rt.context.runCommand(rt.command(), args, { cwd: rt.context.homedir, env: rt.childEnv(), timeoutMs: 90_000 });

  return {
    get active() {
      return active;
    },
    async maintain() {
      const platform = rt.context.platform;
      if (active || deps.busy?.() || (platform !== 'darwin' && platform !== 'win32')) return null;
      if (rt.program.installed !== true || rt.program.unsupported) return null;
      const daemon = await rt.daemon(true);
      if (!daemon.running || daemon.pid === null || daemon.remoteControl !== 'connected') return null;
      const listing = await processListing(rt);
      const apps = listing === null ? [] : appServerPids(listing, platform);
      if (apps.length === 0) return null;
      const key = apps.join(',');
      if (tried.has(key)) return null;
      // A thread loaded in the daemon is a chat opened through it (a phone): stopping the daemon
      // would break it, so the hand-over waits for the next minute.
      const loaded = await rt
        .withDaemon(async (session) => (await session.request<{ data?: unknown[] }>('thread/loaded/list', {})).data ?? [])
        .catch(() => null);
      if (loaded === null || loaded.length > 0) return null;
      tried.add(key);
      active = true;
      try {
        const stopped = await command(['remote-control', 'stop']);
        rt.forgetDaemon();
        if (stopped.startError || stopped.code !== 0) return `handover: the daemon did not stop (${stopped.startError ?? `code ${stopped.code}`})`;
        await sleep(waitMs);
        const started = await command(['remote-control', 'start', '--json']);
        rt.forgetDaemon();
        if (started.startError) return `handover: the daemon did not start again (${started.startError})`;
        const after = await rt.daemon(true);
        if (after.remoteOwner === 'app') return 'remote control handed to the ChatGPT app; the daemon serves Kit locally';
        if (after.remoteControl === 'connected') return 'the ChatGPT app did not take remote control; the daemon keeps it';
        return `handover: remote control of the daemon is ${after.remoteControl ?? 'unknown'}`;
      } finally {
        active = false;
      }
    },
  };
}
