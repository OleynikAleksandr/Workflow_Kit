// Contract of the shared access to a provider's chats (spec M12 section 2.2; the administrator
// step of Windows: M13 section 2.3), part of the provider contract (contract.ts): Provider.sharedAccess.
import type { TrustWrite } from './contract.ts';

/**
 * State of the shared access to the provider's chats (spec M12 section 2.2): the provider app
 * becomes a client of the daemon Kit runs, so Kit, the app and a phone share one chat.
 */
export type SharedAccessStateName = 'unsupported' | 'not-configured' | 'needs-remote-login' | 'needs-admin-setup' | 'needs-connection' | 'active' | 'broken';

/** A script Kit wrote for the user to run as administrator (Windows); Kit never runs it. */
export interface SharedAccessAdminStep {
  /** setup: OpenSSH server, DefaultShell, the key of an administrator; rollback: undoes it. */
  purpose: 'setup' | 'rollback';
  file: string;
  /** The command to paste into a PowerShell started as administrator. */
  command: string;
  /** The text of the script, shown before it runs. */
  text: string;
}

/** What a check of the shared access found. */
export interface SharedAccessState {
  state: SharedAccessStateName;
  /** Short text for the panel ("Работает", "Не настроено"). */
  label: string;
  /** Why the state is not active; null when active. */
  reason: string | null;
  /** What the user should do; null when nothing. */
  hint: string | null;
  /** Every file Kit writes is in place. */
  configured: boolean;
  /** The provider app was connected through the alias at least once; null when never. */
  connectionSeenAt: string | null;
  /** The provider app is connected right now; null when the process list cannot be read. */
  connected: boolean | null;
  /** Host alias the provider app connects to. */
  alias: string;
  /** Text to paste into the shell profile by hand (a shell Kit does not edit); null when not needed. */
  manualProfile: string | null;
  /** The administrator script to run (Windows); null when there is none. */
  admin: SharedAccessAdminStep | null;
  checkedAt: string;
}

/** Preview of the shared access setup: every write, a token and notes (as TrustPreview). */
export interface SharedAccessPreview {
  writes: TrustWrite[];
  token: string;
  expiresAt: string;
  notes: string[];
}

/** Places the panel asks the provider to open: the OS sharing settings or the app's connections. */
export type SharedAccessTarget = 'remote-login' | 'connections';

/** Shared access to the provider's chats; optional part of the contract. */
export interface SharedAccess {
  /** Current state; force runs every check again instead of reusing the last one. */
  state(force?: boolean): Promise<SharedAccessState>;
  /** The last state found without new checks; null before the first check. */
  cached(): SharedAccessState | null;
  preview(): Promise<SharedAccessPreview>;
  /** Writes what the preview listed; rejects when the token is not valid or the files changed. */
  apply(token: string): Promise<SharedAccessState>;
  /** Removes everything Kit wrote. */
  remove(): Promise<SharedAccessState>;
  open(target: SharedAccessTarget): Promise<void>;
}
