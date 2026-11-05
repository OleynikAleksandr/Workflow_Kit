// The provider contract (docs/planning/M1-providers.md, section 1). The server and the panel know
// providers only through these types; Claude and Codex implement them in provider-adapters.
import path from 'node:path';
import type { DataDirs, EventLog, WfkConfig } from '#data-store';
import type { CommandRunner, ProcessSupervisor } from '#process-supervisor';
import type { Project } from '#project-registry';

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
 * stopSession, environment, daemon; a provider may add its own.
 */
export type Capabilities = Record<string, Capability>;

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

/** Preview of the trust action; grantTrust accepts only this token (D7). */
export interface TrustPreview {
  provider: ProviderId;
  /** Current state; when true nothing has to be written. */
  trusted: boolean;
  writes: TrustWrite[];
  autorun: AutorunPoint[];
  token: string;
  expiresAt: string;
  notes?: string[];
}

/** Trust of a project folder as read from the provider's config (null when unknown). */
export interface TrustState {
  trusted: boolean | null;
  note?: string;
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

/** The provider contract. All read methods must be cheap and read-only (D11). */
export interface Provider {
  readonly id: ProviderId;
  readonly title: string;
  capabilities(): Promise<Capabilities>;
  status(): Promise<ProviderStatus>;
  /** Re-reads versions and daemons with external programs (POST /api/refresh, start of the service). */
  refresh?(): Promise<ProviderStatus>;
  previewTrust(project: Project): Promise<TrustPreview>;
  grantTrust(project: Project, token: string): Promise<TrustState>;
  /** Current trust as read from the provider config (extension of section 1: the panel shows it). */
  trust(project: Project): Promise<TrustState>;
  hooks(project: Project): Promise<HookState>;
  approveHooks?(project: Project, expected: { command: string; hash: string }): Promise<HookState>;
  /** The final list: hook journal (readHookSessions) plus the provider's own records. */
  listSessions(project: Project): Promise<SessionInfo[]>;
  createSession(project: Project, opts: { title: string }): Promise<SessionInfo>;
  resumeSession?(project: Project, sessionId: string): Promise<SessionInfo>;
  stopSession?(project: Project, sessionId: string): Promise<void>;
  actions(project: Project | null): Promise<ProviderAction[]>;
  runAction(id: string, project: Project | null): Promise<ProviderStatus | ProjectProviderState>;
  /** Reasons the project cannot be removed (e.g. a running environment); live sessions are found by the registry. */
  removeBlockers?(project: Project): Promise<string[]>;
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
