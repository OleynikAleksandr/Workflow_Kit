// Shared access to the ChatGPT chats (spec M12 section 2.2, Windows: M13 section 2.3). The ChatGPT
// app connects to this computer over SSH (`codex app-server proxy`) and becomes a client of the Kit
// daemon, so Kit, the app and a phone share one chat. Kit writes everything it can (key,
// authorized_keys, ~/.ssh/config, the shell profile; on Windows also the administrator script)
// after a preview with a token and copies of the files. The user turns on the SSH server (macOS:
// Remote Login; Windows: runs the administrator script) and the connection in the app. There is no
// ChatGPT app for Linux.
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { backupFile } from '#data-store';
import { powershell } from '#process-supervisor';
import { ProviderError } from '#provider-registry';
import type { SharedAccess, SharedAccessAdminStep, SharedAccessPreview, SharedAccessState, SharedAccessStateName, SharedAccessTarget } from '#provider-registry';
import { processListing } from './handover.ts';
import { isSecondAppServer } from './shared-mode.ts';
import type { CodexRuntime } from './runtime.ts';
import { findProgram } from './runtime.ts';
import { CONNECTIONS_LINK, KEY_COMMENT, REMOTE_LOGIN_LINK, SHARED_ALIAS, SSH_CHECK_COMMAND, isSharedConnection, keyBlob, managedBlock, parseSshCheck, removeManagedBlock, withoutAuthorizedKey } from './shared-files.ts';
import { buildPlan, exists, readOrNull } from './shared-plan.ts';
import type { Plan, WindowsPlanInputs } from './shared-plan.ts';
import { WINDOWS_APP_PACKAGE, diagnoseWindows, windowsVerdict } from './shared-windows.ts';
import { ADMIN_ROLLBACK_NAME, ADMIN_SCRIPT_NAME, adminCommand, adminRollbackScript, gitShellCandidates, openInAppScript, windowsIsAdmin } from './shared-windows-setup.ts';

/** How long state(false) reuses the last check. */
export const SHARED_TTL_MS = 60_000;
/** Places of the ChatGPT app on macOS. */
const APP_BUNDLES = ['/Applications/ChatGPT.app'];

/** Injectable parts (tests pass fakes). */
export interface SharedAccessDeps {
  /** True when something listens on 127.0.0.1:port. */
  probePort?: (port: number) => Promise<boolean>;
  /** Login shell of the user (default os.userInfo().shell). */
  loginShell?: () => string | null;
  userName?: () => string;
  /** True when the ChatGPT app is installed (macOS; Windows reads the app package). */
  appInstalled?: () => Promise<boolean>;
  /** Directory of the node binary that runs an npm-installed codex. */
  nodeDir?: string;
  /** sh.exe of Git for Windows; default: next to git.exe or under Program Files. */
  gitShell?: () => Promise<string | null>;
  /** Whether the Windows user is in the Administrators group; null when unknown. */
  windowsAdmin?: () => Promise<boolean | null>;
}

/** Probes a TCP port of 127.0.0.1. */
export function probeLocalPort(port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const done = (ok: boolean): void => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

const LABELS: Record<SharedAccessStateName, string> = {
  unsupported: 'Недоступно',
  'not-configured': 'Не настроено',
  'needs-remote-login': 'Нужен «Удалённый вход»',
  'needs-admin-setup': 'Нужен шаг администратора',
  'needs-connection': 'Нужно подключение в ChatGPT',
  active: 'Работает',
  broken: 'Не работает',
};

/** Why the platform has no shared access (null on macOS and Windows). */
export function unsupportedReason(platform: NodeJS.Platform): string | null {
  if (platform === 'darwin' || platform === 'win32') return null;
  if (platform === 'linux') return 'приложения ChatGPT для Linux нет: чаты работают как раньше';
  return 'на этой ОС общий доступ не поддерживается';
}

/** Creates the shared access part of the Codex provider. */
export function createSharedAccess(rt: CodexRuntime, deps: SharedAccessDeps = {}): SharedAccess {
  const { context } = rt;
  const home = context.homedir;
  const win = context.platform === 'win32';
  const sshDir = path.join(home, '.ssh');
  const seenFile = path.join(context.dirs.stateDir, 'codex-shared-access.json');
  const adminFile = path.join(context.dirs.stateDir, ADMIN_SCRIPT_NAME);
  const rollbackFile = path.join(context.dirs.stateDir, ADMIN_ROLLBACK_NAME);
  const probePort = deps.probePort ?? ((port: number) => probeLocalPort(port));
  const loginShell = deps.loginShell ?? (() => os.userInfo().shell);
  const userName = deps.userName ?? (() => os.userInfo().username);
  const appInstalled = deps.appInstalled ?? (async () => (await Promise.all(APP_BUNDLES.map(exists))).some(Boolean));
  const nodeDir = deps.nodeDir ?? path.dirname(process.execPath);
  const gitShell =
    deps.gitShell ??
    (async () => {
      const git = await findProgram('git', context.env, 'win32');
      for (const file of gitShellCandidates(context.env, git)) if (await exists(file)) return file;
      return null;
    });
  const askAdmin = deps.windowsAdmin ?? (() => windowsIsAdmin(context.runCommand));
  let adminKnown: boolean | null = null;
  let last: SharedAccessState | null = null;
  let lastAt = 0;

  const result = (state: SharedAccessStateName, fields: Partial<SharedAccessState> = {}): SharedAccessState => {
    last = {
      state,
      label: LABELS[state],
      reason: null,
      hint: null,
      configured: false,
      connectionSeenAt: null,
      connected: null,
      alias: SHARED_ALIAS,
      manualProfile: null,
      admin: null,
      checkedAt: context.now().toISOString(),
      ...fields,
    };
    lastAt = Date.now();
    return last;
  };

  const readSeen = async (): Promise<string | null> => {
    try {
      const value = JSON.parse(await readFile(seenFile, 'utf8')) as { connectionSeenAt?: unknown };
      return typeof value.connectionSeenAt === 'string' ? value.connectionSeenAt : null;
    } catch {
      return null;
    }
  };
  const writeSeen = async (at: string | null): Promise<void> => {
    await mkdir(path.dirname(seenFile), { recursive: true });
    await writeFile(seenFile, `${JSON.stringify({ connectionSeenAt: at })}\n`);
  };

  const codexDir = (): string | null => (rt.program.path ? path.dirname(rt.program.path) : null);

  const isAdmin = async (): Promise<boolean> => {
    if (adminKnown === null) adminKnown = await askAdmin();
    return adminKnown === true;
  };

  const windowsInputs = async (): Promise<WindowsPlanInputs | null> => {
    if (!win) return null;
    const shell = await gitShell();
    if (!shell) throw new ProviderError('git-missing', 'не найден Git for Windows (sh.exe)', { hint: 'Установите Git for Windows и нажмите «Перепроверить».', status: 409 });
    return { gitShell: shell, admin: await isAdmin() };
  };

  const plan = async (): Promise<Plan> =>
    buildPlan({ home, stateDir: context.dirs.stateDir, user: userName(), loginShell: loginShell(), codexDir: codexDir(), nodeDir, windows: await windowsInputs() });

  /** The administrator script on disk: the setup one, else the rollback one (Windows). */
  const adminStep = async (): Promise<SharedAccessAdminStep | null> => {
    if (!win) return null;
    for (const [purpose, file] of [['setup', adminFile], ['rollback', rollbackFile]] as const) {
      const text = await readOrNull(file);
      if (text !== null) return { purpose, file, command: adminCommand(file), text: text.replace(/^﻿/, '') };
    }
    return null;
  };

  /**
   * needs-connection until the app was seen connected once, then active. A connection counts only
   * while the Kit daemon runs (M14): without it the app's attempt cannot work.
   */
  const byConnection = async (base: Partial<SharedAccessState>, seenProcess: boolean | null): Promise<SharedAccessState> => {
    const connected = seenProcess === true && !(await rt.daemon()).running ? false : seenProcess;
    let seen = await readSeen();
    if (connected && !seen) {
      seen = context.now().toISOString();
      await writeSeen(seen);
    }
    if (!seen) {
      return result('needs-connection', { ...base, connected, reason: `приложение ChatGPT ещё не подключалось к ${SHARED_ALIAS}`, hint: `Откройте в ChatGPT Настройки → Подключения → SSH и включите ${SHARED_ALIAS}.` });
    }
    return result('active', { ...base, connectionSeenAt: seen, connected });
  };

  const checkWindows = async (): Promise<SharedAccessState> => {
    const shell = await gitShell();
    const sshFound = (await findProgram('ssh', context.env, 'win32')) !== null;
    const checks = await diagnoseWindows({ runCommand: context.runCommand, homedir: home, codexInstalled: rt.program.installed, sshFound, gitShell: shell, readText: readOrNull });
    const configured = shell !== null && (await plan()).writes.length === 0;
    const admin = await adminStep();
    const verdict = windowsVerdict(checks, { configured, admin: adminKnown === true });
    if (verdict) return result(verdict.state, { reason: verdict.reason, hint: verdict.hint, configured, admin });
    const factsRead = !checks.some((c) => c.id === 'facts');
    return byConnection({ configured: true, admin }, factsRead ? checks.some((c) => c.id === 'connection' && c.status === 'ok') : null);
  };

  const check = async (): Promise<SharedAccessState> => {
    if (win) return checkWindows();
    const reason = unsupportedReason(context.platform);
    if (reason) return result('unsupported', { reason });
    if (rt.program.installed === false) return result('unsupported', { reason: 'codex не найден', hint: 'Установите Codex CLI и нажмите «Перепроверить».' });
    if (!(await appInstalled())) return result('unsupported', { reason: 'приложение ChatGPT не установлено', hint: 'Установите ChatGPT для macOS и нажмите «Перепроверить».' });
    const current = await plan();
    const manualProfile = current.manualProfile;
    if (current.writes.length > 0) {
      return result('not-configured', { reason: 'Kit ещё не настроил доступ ChatGPT к демону по SSH', hint: 'Нажмите «Настроить».', manualProfile });
    }
    const base = { configured: true, manualProfile, connectionSeenAt: await readSeen() };
    if (!(await probePort(22))) {
      return result('needs-remote-login', { ...base, reason: '«Удалённый вход» macOS выключен: порт 22 не отвечает', hint: 'Системные настройки → Основные → Общий доступ → «Удалённый вход»: включите, доступ — только вашему пользователю.' });
    }
    const probe = await context.runCommand(
      'ssh',
      ['-F', current.configFile, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5', SHARED_ALIAS, SSH_CHECK_COMMAND],
      { timeoutMs: 15_000 },
    );
    if (probe.code !== 0) {
      const text = (probe.startError ?? probe.stderr).trim().split('\n').pop() ?? `код ${probe.code}`;
      return result('broken', { ...base, reason: `ssh ${SHARED_ALIAS}: ${text.slice(0, 200)}`, hint: 'Проверьте, что «Удалённый вход» разрешён вашему пользователю, и нажмите «Перепроверить».' });
    }
    const answer = parseSshCheck(probe.stdout);
    if (!answer.codex) return result('broken', { ...base, reason: 'в SSH-сеансе не найден codex', hint: manualProfile ? 'Вставьте блок в профиль оболочки.' : 'Нажмите «Настроить» ещё раз.' });
    if (!answer.skip) return result('broken', { ...base, reason: 'в SSH-сеансе не задан CODEX_SSH_SKIP_APP_SERVER_BOOT', hint: manualProfile ? 'Вставьте блок в профиль оболочки.' : 'Нажмите «Настроить» ещё раз.' });
    const listing = await processListing(rt);
    const connected = listing === null ? null : listing.split(/\r?\n/).some((line) => isSharedConnection(line));
    if (listing !== null && listing.split(/\r?\n/).some((line) => isSecondAppServer(line))) {
      return result('broken', { ...base, connected, reason: 'приложение ChatGPT подняло по SSH второй app-server рядом с демоном Kit', hint: 'Закройте ChatGPT, нажмите «Настроить» ещё раз и откройте ChatGPT снова.' });
    }
    return byConnection({ configured: true, manualProfile }, connected);
  };

  const writeText = async (file: string, text: string): Promise<void> => {
    await writeFile(file, text, { mode: 0o600 });
    await chmod(file, 0o600);
  };

  const guard = (): void => {
    const reason = unsupportedReason(context.platform);
    if (reason) throw new ProviderError('not-supported', reason, { status: 409 });
  };

  return {
    async state(force = false) {
      if (!force && last && Date.now() - lastAt < SHARED_TTL_MS) return last;
      return check();
    },
    cached: () => last,
    async preview(): Promise<SharedAccessPreview> {
      guard();
      const current = await plan();
      const issued = rt.tokens.issue('shared-access', current.fingerprint);
      return { writes: current.writes, token: issued.token, expiresAt: issued.expiresAt, notes: current.notes };
    },
    async apply(token) {
      guard();
      const fingerprint = rt.tokens.consume('shared-access', token);
      if (fingerprint === undefined) throw new ProviderError('invalid-token', 'Предпросмотр устарел', { hint: 'Откройте предпросмотр снова' });
      let current = await plan();
      if (current.fingerprint !== fingerprint) {
        throw new ProviderError('preview-stale', 'Файлы изменились после предпросмотра', { hint: 'Откройте предпросмотр снова', status: 409 });
      }
      const backup = { backupsDir: context.dirs.backupsDir, now: context.now };
      await mkdir(sshDir, { recursive: true, mode: 0o700 });
      await chmod(sshDir, 0o700);
      if (!current.key) {
        await rm(current.keyFile, { force: true });
        await rm(current.publicFile, { force: true });
        const made = await context.runCommand('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', KEY_COMMENT, '-f', current.keyFile], { timeoutMs: 30_000 });
        if (made.code !== 0) {
          throw new ProviderError('keygen-failed', `ssh-keygen: ${(made.startError ?? made.stderr).trim().slice(0, 200) || `код ${made.code}`}`);
        }
        current = await plan();
      }
      if (current.adminFile) await mkdir(path.dirname(current.adminFile), { recursive: true });
      for (const [file, text] of current.desired) {
        await backupFile(file, backup);
        await writeText(file, text);
      }
      // A new setup replaces the rollback of an earlier removal (Windows).
      if (current.rollbackFile) await rm(current.rollbackFile, { force: true });
      last = null;
      const after = await plan();
      if (after.writes.length > 0) {
        throw new ProviderError('verify-failed', `После записи не на месте: ${after.writes.map((w) => w.file).join(', ')}`);
      }
      return check();
    },
    async remove() {
      guard();
      const current = await plan();
      const backup = { backupsDir: context.dirs.backupsDir, now: context.now };
      const edits: Array<[string, string]> = [];
      const config = current.texts.get(current.configFile);
      if (config != null && managedBlock(config) !== null) edits.push([current.configFile, removeManagedBlock(config)]);
      const authorized = current.texts.get(current.authorizedFile);
      if (authorized != null) {
        const next = withoutAuthorizedKey(authorized, current.key ? keyBlob(current.key) : null);
        if (next !== authorized) edits.push([current.authorizedFile, next]);
      }
      for (const file of current.profiles ?? []) {
        const text = current.texts.get(file);
        if (text != null && managedBlock(text) !== null) edits.push([file, removeManagedBlock(text)]);
      }
      for (const [file, text] of edits) {
        await backupFile(file, backup);
        await writeText(file, text);
      }
      // Windows: the setup script goes, a rollback script for the administrator takes its place.
      if (current.adminFile && current.rollbackFile && current.texts.get(current.adminFile) != null) {
        const shell = (await windowsInputs())!.gitShell;
        await writeText(current.rollbackFile, adminRollbackScript({ gitShell: shell, keyBlob: current.key ? keyBlob(current.key) : null }));
        await backupFile(current.adminFile, backup);
        await rm(current.adminFile, { force: true });
      }
      for (const file of [current.keyFile, current.publicFile]) {
        await backupFile(file, backup);
        await rm(file, { force: true });
      }
      await writeSeen(null);
      last = null;
      return check();
    },
    async open(target: SharedAccessTarget) {
      guard();
      if (win) {
        if (target === 'remote-login') {
          throw new ProviderError('not-supported', 'На Windows нет «Удалённого входа»: сервер SSH ставит скрипт администратора', { status: 409 });
        }
        const out = await powershell(context.runCommand, openInAppScript(CONNECTIONS_LINK, WINDOWS_APP_PACKAGE), 15_000);
        if (out === null) throw new ProviderError('open-failed', `Не удалось открыть ${CONNECTIONS_LINK} в приложении ChatGPT`);
        return;
      }
      const url = target === 'remote-login' ? REMOTE_LOGIN_LINK : CONNECTIONS_LINK;
      const opened = await context.runCommand('open', [url], { timeoutMs: 10_000 });
      if (opened.code !== 0) throw new ProviderError('open-failed', `Не удалось открыть ${url}`);
    },
  };
}
