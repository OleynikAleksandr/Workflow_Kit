// The provider contract (docs/planning/M1-providers.md, section 1). The server and the panel know
// providers only through these types; Claude and Codex implement them in provider-adapters.
import path from 'node:path';
import type { DataDirs, EventLog, WfkConfig } from '#data-store';
import type { CommandRunner, ProcessSupervisor } from '#process-supervisor';
import type { Project } from '#project-registry';
import type { SharedAccess } from './shared-access.ts';

export type { Project };

/** Registry key of a provider ("claude", "codex", ...); the set is open for new providers. */
export type ProviderId = string;

/** Uniform error shape of the contract; hint tells the user what to do. */
export interface ProviderErrorInfo {
  code: string;
  message: string;
  hint?: string;
}

/** Error a provider throws; routes and operations pass code, message, hint and details on. */
export class ProviderError extends Error {
  readonly code: string;
  readonly hint: string | undefined;
  /** HTTP status for synchronous routes (default 409). */
  readonly status: number;
  /** Extra fields of the error object, e.g. { files } or { blockers }. */
  readonly details: Readonly<Record<string, unknown>> | undefined;

  constructor(code: string, message: string, options: { hint?: string; status?: number; details?: Record<string, unknown> } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.hint = options.hint;
    this.status = options.status ?? 409;
    this.details = options.details;
  }
}

/** One capability: available, or not with the reason shown by the panel (D4). */
export interface Capability {
  available: boolean;
  reason?: string;
}

/**
 * Capabilities by name. Common names: trust, hooks, sessions, createSession, resumeSession,
 * stopSession, environment, daemon; a provider may add its own. Two names describe the provider's
 * part in a plan, and a provider that does not report them has them: orchestration (its session
 * may run a scope with executors) and reviewer (its session may review another provider's plan).
 */
export type Capabilities = Record<string, Capability>;

/** Short name of a provider on buttons, badges and in messages: its label, else its title. */
export function providerLabel(provider: Pick<Provider, 'title' | 'label'>): string {
  return provider.label ?? provider.title;
}

/** The letter of a provider on buttons: its mark, else the first letter of its short name. */
export function providerMark(provider: Pick<Provider, 'title' | 'label' | 'mark'>): string {
  const first = [...(provider.mark ?? providerLabel(provider)).trim()][0];
  return first ? first.toUpperCase() : '?';
}

/** One capability of a provider: a name it does not report is available; no provider — unavailable. */
export async function providerCapability(provider: Pick<Provider, 'capabilities'> | undefined, name: string): Promise<Capability> {
  if (!provider) return { available: false, reason: 'провайдер не подключён' };
  const found = (await provider.capabilities().catch(() => ({}) as Capabilities))[name];
  return found ?? { available: true };
}

/** Overall state of a provider for the panel. */
export type ProviderState = 'ready' | 'not-implemented' | 'not-installed' | 'unavailable' | 'error' | 'unknown';

/** Read-only, cached status (D11): installation, versions, daemon. */
export interface ProviderStatus {
  /** False for a stub provider. */
  implemented: boolean;
  state: ProviderState;
  /** Short human-readable state, e.g. "не реализовано". */
  label: string;
  /** null when not checked yet. */
  installed: boolean | null;
  version: string | null;
  /** Absolute path of the CLI (D12), null when not found. */
  path: string | null;
  note?: string;
  /** When the cached values were read from external programs; null when never. */
  checkedAt: string | null;
  /** Provider-specific details, e.g. { daemon: { running, pid } }. */
  details?: Record<string, unknown>;
}

/** A key or file the trust action will write (D7 preview). */
export interface TrustWrite {
  file: string;
  key?: string;
  value?: unknown;
  description: string;
}

/** An autorun point found in the project folder (hooks, permissions, MCP servers, foreign hooks). */
export interface AutorunPoint {
  file: string;
  kind: string;
  detail: string;
}

/** One answer of a trust choice. */
export interface TrustChoiceOption {
  id: string;
  title: string;
  description?: string;
}

/**
 * A decision the user makes in the trust preview (e.g. allow or deny external imports). The panel
 * draws it from the contract; grantTrust gets the answers as { <choice id>: <option id> }.
 */
export interface TrustChoice {
  id: string;
  title: string;
  description: string;
  options: TrustChoiceOption[];
  /** True when "Доверять" must not be sent without an answer; there is no default option. */
  required: boolean;
}

/** Answers to the trust choices: { <choice id>: <option id> }. */
export type TrustChoices = Record<string, string>;

/**
 * Only a parent folder is trusted, not the folder itself: the provider's interactive client may
 * not ask, while other features still need the folder's own trust.
 */
export interface TrustInherited {
  /** The trusted parent folder. */
  from: string;
  /** What it means for this provider, shown as a separate mark next to the trust state. */
  note: string;
}

/** Preview of the trust action; grantTrust accepts only this token (D7). */
export interface TrustPreview {
  provider: ProviderId;
  /** Trust of the folder itself; when true and writes is empty nothing has to be written. */
  trusted: boolean;
  writes: TrustWrite[];
  autorun: AutorunPoint[];
  /** Decisions made before "Доверять"; absent or empty when there are none. */
  choices?: TrustChoice[];
  inherited?: TrustInherited;
  token: string;
  expiresAt: string;
  notes?: string[];
}

/** Trust of a project folder as read from the provider's config (null when unknown). */
export interface TrustState {
  trusted: boolean | null;
  note?: string;
  /** Set when only a parent folder is trusted. */
  inherited?: TrustInherited;
  /** Copy of the foreign config taken before the last write (after grantTrust). */
  backup?: string | null;
}

/** One hook of the project with its approval state. */
export interface HookEntry {
  command: string;
  hash: string;
  /** True for the Kit hook (spec section 7); only it can be approved. */
  kit: boolean;
  status: 'approved' | 'pending' | 'modified' | 'unknown';
  /** Provider key of the approval, e.g. Codex "…/hooks.json:session_start:0:0". */
  key?: string;
}

/** Hooks of the project for a provider. */
export interface HookState {
  kitHook: HookEntry | null;
  hooks: HookEntry[];
  /** False when the session list is incomplete because the Kit hook is not active; null when unknown. */
  complete: boolean | null;
  note?: string;
  /**
   * What approveHooks would write (file and added text): the hook is shown before the approval and
   * approved with the shown command and hash. Absent when the provider only records an approval.
   */
  writes?: TrustWrite[];
}

/** Links of a session; the panel picks mobile on touch devices, otherwise desktop, web as fallback. */
export interface SessionLinks {
  desktop?: string;
  mobile?: string;
  web?: string;
}

/** A session as listed by its provider. */
export interface SessionInfo {
  provider: ProviderId;
  localId: string;
  remoteId?: string;
  title: string;
  createdAt: string;
  origin: 'panel' | 'hook';
  state: 'running' | 'stopped' | 'unknown';
  links: SessionLinks;
  /** E.g. "без Remote Control — ссылки нет". */
  note?: string;
  cwd?: string;
  model?: string;
}

/** A special action drawn by the panel from the contract. */
export interface ProviderAction {
  id: string;
  title: string;
  scope: 'provider' | 'project';
  enabled: boolean;
  reason?: string;
  /** Confirmation text shown before running. */
  confirm?: string;
}

/** Everything about one project for one provider, as shown in /api/state. */
export interface ProjectProviderState {
  provider: ProviderId;
  trust: TrustState | null;
  hooks: HookState | null;
  sessions: SessionInfo[];
  actions: ProviderAction[];
  /** Failures of individual reads by method name (trust, hooks, sessions, actions). */
  errors: Record<string, ProviderErrorInfo>;
}

/** Result of renameSession. */
export interface RenameResult {
  synced: boolean;
  note?: string;
}

/**
 * How a provider's hooks talk to Kit: 'claude' (Claude Code and Codex: a Stop may be answered with
 * a block, UserPromptSubmit with hookSpecificOutput.additionalContext, the prompt is a string) or
 * 'kimi' (the prompt is an array of parts, UserPromptSubmit is answered with { message }).
 */
export type HookDialect = 'claude' | 'kimi';

/** The provider contract. All read methods must be cheap and read-only (D11). */
export interface Provider {
  readonly id: ProviderId;
  readonly title: string;
  /** Short name on buttons, badges and in messages ("ChatGPT"); absent means the title. */
  readonly label?: string;
  /** One letter drawn on the provider's buttons; absent means the first letter of the label. */
  readonly mark?: string;
  /** Dialect of the provider's hooks (wfk hook --client <id>); absent means 'claude'. */
  readonly hookDialect?: HookDialect;
  /**
   * The app takes a session name from the answer of the UserPromptSubmit hook
   * (hookSpecificOutput.sessionTitle), and renameSession is safe only outside a turn: a name set
   * during a turn waits for the Stop hook or the next prompt.
   */
  readonly promptTitle?: boolean;
  capabilities(): Promise<Capabilities>;
  status(): Promise<ProviderStatus>;
  /** Re-reads versions and daemons with external programs (POST /api/refresh, start of the service). */
  refresh?(): Promise<ProviderStatus>;
  previewTrust(project: Project): Promise<TrustPreview>;
  /**
   * Writes trust after the preview; choices answer TrustPreview.choices (the routes always pass an
   * object, {} when the body has none; omitted means {}).
   */
  grantTrust(project: Project, token: string, choices?: TrustChoices): Promise<TrustState>;
  /** Current trust as read from the provider config (extension of section 1: the panel shows it). */
  trust(project: Project): Promise<TrustState>;
  hooks(project: Project): Promise<HookState>;
  approveHooks?(project: Project, expected: { command: string; hash: string }): Promise<HookState>;
  /** The final list: hook journal (readHookSessions) plus the provider's own records. */
  listSessions(project: Project): Promise<SessionInfo[]>;
  /**
   * firstMessage: the agent's first instruction instead of the provider's service turn. detached:
   * return as soon as that turn has started, without waiting for it (a cross reviewer, whose turn
   * the service itself holds); a provider that never waits ignores it.
   */
  createSession(project: Project, opts: { title: string; firstMessage?: string; detached?: boolean }): Promise<SessionInfo>;
  resumeSession?(project: Project, sessionId: string): Promise<SessionInfo>;
  stopSession?(project: Project, sessionId: string): Promise<void>;
  /**
   * Gives a session a new name in the provider app when that is safe now; synced false with a
   * note when the name stays only in Workflow Kit (for now or for good).
   */
  renameSession?(project: Project, sessionId: string, name: string): Promise<RenameResult>;
  /**
   * Wakes an idle session so that it picks up messages the panel queued for it (the prompt hook
   * delivers them). Resolves false when the provider cannot reach the session.
   */
  wakeSession?(project: Project, sessionId: string): Promise<boolean>;
  /**
   * How a cross reviewer of this provider gets its brief: 'queue' (queued, the session is woken)
   * or 'first-message' (the first message of the reviewer's chat). Absent means 'queue' when the
   * provider has wakeSession, else 'first-message'.
   */
  readonly reviewBrief?: 'queue' | 'first-message';
  /**
   * For a provider whose Stop hook cannot be held (spec M8 section 3): no turn runs in the session
   * now (no live session lock), the text of its last answer (null for a turn without text; rejects
   * when it cannot be read) and a message sent as a prompt (true when it was accepted; delivery.id
   * is the same on every retry, so an accepted prompt never runs twice).
   */
  sessionIdle?(project: Project, sessionId: string): Promise<boolean>;
  lastAnswer?(project: Project, sessionId: string): Promise<string | null>;
  sendMessage?(project: Project, sessionId: string, text: string, delivery: { id: string }): Promise<boolean>;
  /** Name of the setting that turns session locks off; without locks the turn end cannot be told. */
  readonly lockSwitch?: string;
  actions(project: Project | null): Promise<ProviderAction[]>;
  runAction(id: string, project: Project | null): Promise<ProviderStatus | ProjectProviderState>;
  /** Reasons the project cannot be removed (e.g. a running environment); live sessions are found by the registry. */
  removeBlockers?(project: Project): Promise<string[]>;
  /**
   * Drops the provider's records (sessions, environments) of projects whose ids are not in keep:
   * a removed project takes its records with it. Resolves to the number of records dropped.
   */
  forgetProjects?(keep: ReadonlySet<string>): Promise<number>;
  /**
   * Brings back the project's sessions whose process ended without a stop on purpose (a reboot, a
   * crash); start of the service. Resolves to the session ids resumed.
   */
  resumeInterrupted?(project: Project): Promise<string[]>;
  /**
   * Brings up at the start of the service what the provider needs for the whole Mac (Codex: the
   * daemon). Resolves to a line for the log, or null when nothing had to be done.
   */
  autostart?(): Promise<string | null>;
  /**
   * Upkeep the service runs every minute (Codex: hands remote control to the running ChatGPT app,
   * spec M7 remark 2). Resolves to a line for the log, or null when nothing had to be done.
   */
  maintain?(): Promise<string | null>;
  /** Shared access to the provider's chats (spec M12); absent where the provider has none. */
  readonly sharedAccess?: SharedAccess;
  /**
   * Deletion of the project from disk: deletes its sessions in the provider app (Codex:
   * thread/delete). Resolves to the ids deleted; the ones the app refuses wait for retryDeletes.
   */
  deleteSessions?(project: Project): Promise<string[]>;
  /** Tries again the deletions the app refused (a chat still open); resolves to the ids deleted now. */
  retryDeletes?(): Promise<string[]>;
  /**
   * Archive of the project (sessionId null) or of one session in Workflow Kit: stops the running
   * or interrupted sessions and marks them, so nothing brings them back until a restore. Resolves
   * to the session ids stopped.
   */
  archiveSessions?(project: Project, sessionId: string | null): Promise<string[]>;
  /**
   * Restore of the project (sessionId null) or of one session: clears the archive mark and brings
   * the sessions back at once. Resolves to the session ids resumed.
   */
  restoreSessions?(project: Project, sessionId: string | null): Promise<string[]>;
}

/** What the backend gives a provider factory; everything machine-specific is injectable. */
export interface ProviderContext {
  platform: NodeJS.Platform;
  /** Service environment (PATH from D12); strip CLAUDE* before starting children. */
  env: Readonly<Record<string, string | undefined>>;
  homedir: string;
  dirs: DataDirs;
  config: WfkConfig;
  events: EventLog;
  supervisor: ProcessSupervisor;
  /** Runner of external programs (`--version`, `app-server`); tests pass fakes. */
  runCommand: CommandRunner;
  now: () => Date;
  log: (line: string) => void;
}

/** Each provider module exports a factory of this type from its src/index.ts. */
export type ProviderFactory = (context: ProviderContext) => Provider;

/** Panel records of a provider: <state>/sessions/<id>.json (spec section 6). */
export function providerSessionsFile(dirs: DataDirs, id: ProviderId): string {
  return path.join(dirs.stateDir, 'sessions', `${id}.json`);
}

/** Per-provider log directory: <logs>/<id> (pty and debug logs of sessions). */
export function providerLogsDir(dirs: DataDirs, id: ProviderId): string {
  return path.join(dirs.logsDir, id);
}
