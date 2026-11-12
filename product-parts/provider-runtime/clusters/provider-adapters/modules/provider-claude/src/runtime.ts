// Shared state of one Claude provider instance: located programs, the cached claude version,
// readers of ~/.claude.json, transcripts (bridge ids and the conversation) and the panel records,
// plus the guards every action uses.
import { randomBytes } from 'node:crypto';
import { cleanEnv } from '#process-supervisor';
import { ProviderError, providerLogsDir, providerSessionsFile } from '#provider-registry';
import type { Project, ProviderContext } from '#provider-registry';
import { claudeConfigFile, createClaudeConfigReader } from './claude-config.ts';
import type { ClaudeConfigReader } from './claude-config.ts';
import { PTY_SCRIPTS } from './pty.ts';
import type { PtyLauncher, PtyScripts } from './pty.ts';
import { findClaudePrograms, parseVersion, ptyUnavailableReason } from './programs.ts';
import type { ClaudePrograms } from './programs.ts';
import { createChatReader } from './chat.ts';
import type { ChatReader } from './chat.ts';
import { createRecordStore } from './records.ts';
import type { RecordStore } from './records.ts';
import { createBridgeReader } from './transcripts.ts';
import type { BridgeReader } from './transcripts.ts';

/** Registry id of the provider (also the hook journal client). */
export const PROVIDER_ID = 'claude';

/** Tunables; tests shorten the waits and imitate concurrent writes of ~/.claude.json. */
export interface ClaudeProviderOptions {
  scripts?: PtyScripts;
  /** Wait for SESSION_URL (or the debug file), ms. */
  sessionTimeoutMs?: number;
  /** Extra wait for the debug file after NO_SESSION_URL, ms. */
  debugGraceMs?: number;
  /** Wait for the environment to start, ms. */
  environmentTimeoutMs?: number;
  /** Called after each write of ~/.claude.json by grantTrust, before it is read back (tests only). */
  afterConfigWrite?: (attempt: number) => Promise<void>;
  pollMs?: number;
  /** TERM → KILL grace of stopSession and the environment stop, ms. */
  stopGraceMs?: number;
  /** sendDirect: wait for the previous and for its own <debug>.message file to be taken, ms. */
  directWaitMs?: number;
}

/** Everything the provider parts share. */
export interface ClaudeRuntime {
  readonly context: ProviderContext;
  readonly options: Required<ClaudeProviderOptions>;
  readonly store: RecordStore;
  readonly bridge: BridgeReader;
  /** Conversation of transcripts (readMessages). */
  readonly chat: ChatReader;
  readonly claudeConfig: ClaudeConfigReader;
  readonly logsDir: string;
  /** Located programs (cached; refresh re-locates them). */
  programs(): Promise<ClaudePrograms>;
  /** claude version from the last refresh, null before it. */
  version(): string | null;
  checkedAt(): string | null;
  /** Re-locates programs and reads `claude --version` (start of the service and "Обновить"). */
  refresh(): Promise<void>;
  /** Why pty actions are unavailable, or null. */
  ptyReason(): Promise<string | null>;
  /** Programs for a pty action; throws ProviderError("unavailable") with the reason. */
  requirePty(): Promise<{ claude: string; launcher: PtyLauncher }>;
  /** Throws ProviderError("not-trusted") unless ~/.claude.json trusts the folder. */
  requireTrust(project: Project): Promise<void>;
  /** Cheap liveness of a supervisor record (polling, D11); false for unknown records. */
  isAlive(processId: string | null): Promise<boolean>;
  /** A unique, sortable key for log file names. */
  newKey(prefix: string): string;
  /** "YYYY-MM-DD HH:MM" in local time. */
  formatTime(iso: string): string;
  /** Service environment without CLAUDE* (D5), plus extra variables. */
  childEnv(extra?: Record<string, string>): Record<string, string>;
}

/** Creates the runtime of a provider instance. */
export function createRuntime(context: ProviderContext, options: ClaudeProviderOptions = {}): ClaudeRuntime {
  const resolved: Required<ClaudeProviderOptions> = {
    scripts: options.scripts ?? PTY_SCRIPTS,
    sessionTimeoutMs: options.sessionTimeoutMs ?? 120_000,
    debugGraceMs: options.debugGraceMs ?? 10_000,
    environmentTimeoutMs: options.environmentTimeoutMs ?? 45_000,
    afterConfigWrite: options.afterConfigWrite ?? (async () => undefined),
    pollMs: options.pollMs ?? 250,
    stopGraceMs: options.stopGraceMs ?? 5000,
    directWaitMs: options.directWaitMs ?? 5000,
  };
  let located: Promise<ClaudePrograms> | undefined;
  let version: string | null = null;
  let checkedAt: string | null = null;
  const locate = (): Promise<ClaudePrograms> =>
    findClaudePrograms({ programs: context.config.programs, env: context.env, homedir: context.homedir, platform: context.platform });

  const runtime: ClaudeRuntime = {
    context,
    options: resolved,
    store: createRecordStore(providerSessionsFile(context.dirs, PROVIDER_ID)),
    bridge: createBridgeReader(),
    chat: createChatReader(),
    claudeConfig: createClaudeConfigReader(claudeConfigFile(context.homedir)),
    logsDir: providerLogsDir(context.dirs, PROVIDER_ID),
    programs: () => (located ??= locate()),
    version: () => version,
    checkedAt: () => checkedAt,
    async refresh() {
      located = locate();
      const programs = await located;
      version = null;
      if (programs.claude) {
        const result = await context.runCommand(programs.claude, ['--version'], { env: runtime.childEnv(), timeoutMs: 15_000 });
        version = result.code === 0 ? parseVersion(result.stdout) : null;
        if (result.code !== 0) context.log(`claude --version failed: ${result.startError ?? (result.stderr.trim() || String(result.code))}`);
      }
      checkedAt = context.now().toISOString();
    },
    async ptyReason() {
      return ptyUnavailableReason(context.platform, await runtime.programs(), version);
    },
    async requirePty() {
      const programs = await runtime.programs();
      const reason = ptyUnavailableReason(context.platform, programs, version);
      const launcher: PtyLauncher | null =
        context.platform === 'win32' ? { kind: 'host', node: process.execPath } : programs.expect ? { kind: 'expect', expect: programs.expect } : null;
      if (reason || !programs.claude || !launcher) {
        throw new ProviderError('unavailable', `Claude: ${reason ?? 'недоступно'}`, { hint: 'Нажмите «Перепроверить» после установки недостающего.' });
      }
      return { claude: programs.claude, launcher };
    },
    async requireTrust(project) {
      const trust = await runtime.claudeConfig.trustOf(project.path);
      if (trust.trusted !== true) {
        throw new ProviderError('not-trusted', `Папка «${project.name}» не доверена Claude`, {
          hint: trust.note ?? 'Сначала «Предпросмотр доверия…» → «Доверять»: без доверия Remote Control отвечает «Workspace not trusted».',
        });
      }
    },
    async isAlive(processId) {
      if (!processId) return false;
      try {
        return (await context.supervisor.quickCheck(processId)) === 'alive';
      } catch {
        return false;
      }
    },
    newKey(prefix) {
      const stamp = context.now().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '');
      return `${prefix}-${stamp}-${randomBytes(3).toString('hex')}`;
    },
    childEnv: (extra) => cleanEnv(context.env, { extra, platform: context.platform }),
    formatTime(iso) {
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return iso;
      const pad = (n: number): string => String(n).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    },
  };
  return runtime;
}
