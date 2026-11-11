// The shared daemon mode of Codex sessions (spec M12 section 2.3): on while the shared access is
// active. In the mode the ChatGPT app is a client of the Kit daemon: a chat opens with the
// hostId of the SSH connection, a new chat is not unloaded, an idle chat can be woken, and remote
// control stays with the daemon. Anything else (another OS, a broken setup) keeps the old ways.
import type { SessionLinks, SharedAccess, SharedAccessState } from '#provider-registry';
import { SHARED_HOST_ID } from './shared-files.ts';

/** Why remote control should come back to the daemon in the mode (the app took it first). */
export const SHARED_APP_OWNER_REASON =
  'Удалённое управление держит приложение ChatGPT: закройте ChatGPT, дождитесь «подключён» и откройте снова — тогда чаты Kit откроются и на iPad.';

/** Note of the provider status when the app holds remote control in the active mode; else null. */
export function appOwnerNote(shared: SharedAccessState | null, remoteOwner: 'app' | null): string | null {
  return shared?.state === 'active' && remoteOwner === 'app' ? SHARED_APP_OWNER_REASON : null;
}

const THREAD_ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Links of a thread in the mode: the Mac app opens the copy of the SSH connection (the local
 * copy cannot be written, "Этот чат открыт в другом приложении"); a phone needs no hostId.
 */
export function sharedThreadLinks(threadId: string): SessionLinks {
  if (!THREAD_ID.test(threadId)) return {};
  const mobile = `codex://threads/${threadId}`;
  return { desktop: `${mobile}?hostId=${encodeURIComponent(SHARED_HOST_ID)}`, mobile };
}

/**
 * True for an app-server the ChatGPT app started over SSH next to the Kit daemon (no
 * CODEX_SSH_SKIP_APP_SERVER_BOOT in the session): `codex -c features.code_mode_host=true app-server
 * --listen unix://` (seen in ChatGPT 26.1106). Two servers on one socket break the mode. The app's
 * own server (macOS: inside ChatGPT.app; Windows: inside its WindowsApps package) is not one.
 */
export function isSecondAppServer(commandLine: string): boolean {
  const ownApp = commandLine.includes('/ChatGPT.app/') || /[\\/]WindowsApps[\\/]OpenAI\.Codex/i.test(commandLine);
  return /(^|\s|")app-server(\s|$)/.test(commandLine) && commandLine.includes('--listen') && commandLine.includes('code_mode_host') && !ownApp;
}

/** The mode as the session parts see it. */
export interface SharedMode {
  /** On by the last check of the shared access (no new checks). */
  active(): boolean;
  /** Checks again when the last check is old (SHARED_TTL_MS); resolves to active(). */
  refresh(): Promise<boolean>;
}

/** The mode over the shared access of the provider. */
export function createSharedMode(shared: SharedAccess): SharedMode {
  const active = (): boolean => shared.cached()?.state === 'active';
  return {
    active,
    async refresh() {
      await shared.state(false).catch(() => null);
      return active();
    },
  };
}
