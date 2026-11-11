// Shared access to the ChatGPT chats (spec M12 section 2.2). The ChatGPT app connects to this
// Mac over SSH (`codex app-server proxy`) and becomes a client of the Kit daemon, so Kit, the app
// and a phone share one chat. Kit writes everything it can (key, authorized_keys, ~/.ssh/config,
// the zsh profile) after a preview with a token and copies of the files; the user turns on Remote
// Login and the connection in the app. Only macOS: there is no ChatGPT app for Linux, Windows is
// not checked yet.
import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { backupFile } from '#data-store';
import { ProviderError } from '#provider-registry';
import type { SharedAccess, SharedAccessPreview, SharedAccessState, SharedAccessStateName, SharedAccessTarget, TrustWrite } from '#provider-registry';
import { processListing } from './handover.ts';
import { isSecondAppServer } from './shared-mode.ts';
import type { CodexRuntime } from './runtime.ts';
import {
  SHARED_ALIAS,
  SHARED_HOST_ID,
  KEY_NAME,
  KEY_COMMENT,
  KEY_FROM,
  BLOCK_BEGIN,
  BLOCK_END,
  CONNECTIONS_LINK,
  REMOTE_LOGIN_LINK,
  managedBlock,
  removeManagedBlock,
  upsertManagedBlock,
  removeManualHost,
  removeProbeProfile,
  sshConfigBlock,
  profileBlock,
  keyBlob,
  authorizedLine,
  withAuthorizedKey,
  withoutAuthorizedKey,
  profileFiles,
  SSH_CHECK_COMMAND,
  isSharedConnection,
  parseSshCheck,
} from './shared-files.ts';

export {
  SHARED_ALIAS,
  SHARED_HOST_ID,
  KEY_NAME,
  KEY_COMMENT,
  KEY_FROM,
  BLOCK_BEGIN,
  BLOCK_END,
  CONNECTIONS_LINK,
  REMOTE_LOGIN_LINK,
  managedBlock,
  removeManagedBlock,
  upsertManagedBlock,
  removeManualHost,
  removeProbeProfile,
  sshConfigBlock,
  profileBlock,
  keyBlob,
  authorizedLine,
  withAuthorizedKey,
  withoutAuthorizedKey,
  profileFiles,
  SSH_CHECK_COMMAND,
  isSharedConnection,
  parseSshCheck,
} from './shared-files.ts';

/** How long state(false) reuses the last check. */
export const SHARED_TTL_MS = 60_000;
/** Places of the ChatGPT app. */
const APP_BUNDLES = ['/Applications/ChatGPT.app'];

/** Injectable parts (tests pass fakes). */
export interface SharedAccessDeps {
  /** True when something listens on 127.0.0.1:port. */
  probePort?: (port: number) => Promise<boolean>;
  /** Login shell of the user (default os.userInfo().shell). */
  loginShell?: () => string | null;
  userName?: () => string;
  /** True when the ChatGPT app is installed. */
  appInstalled?: () => Promise<boolean>;
  /** Directory of the node binary that runs an npm-installed codex. */
  nodeDir?: string;
}

async function readOrNull(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8');
  } catch {
    return null;
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
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
  'needs-connection': 'Нужно подключение в ChatGPT',
  active: 'Работает',
  broken: 'Не работает',
};

/** Why the platform has no shared access (null on macOS). */
export function unsupportedReason(platform: NodeJS.Platform): string | null {
  if (platform === 'darwin') return null;
  if (platform === 'linux') return 'приложения ChatGPT для Linux нет: чаты работают как раньше';
  if (platform === 'win32') return 'на Windows общий доступ пока не поддерживается (нужен сервер OpenSSH, не проверено): чаты работают как раньше';
  return 'на этой ОС общий доступ не поддерживается';
}

interface Plan {
  user: string;
  keyFile: string;
  publicFile: string;
  configFile: string;
  authorizedFile: string;
  profiles: string[] | null;
  key: string | null;
  texts: Map<string, string | null>;
  desired: Map<string, string>;
  writes: TrustWrite[];
  notes: string[];
  manualProfile: string | null;
  fingerprint: string;
}

/** Creates the shared access part of the Codex provider. */
export function createSharedAccess(rt: CodexRuntime, deps: SharedAccessDeps = {}): SharedAccess {
  const { context } = rt;
  const home = context.homedir;
  const sshDir = path.join(home, '.ssh');
  const seenFile = path.join(context.dirs.stateDir, 'codex-shared-access.json');
  const probePort = deps.probePort ?? ((port: number) => probeLocalPort(port));
  const loginShell = deps.loginShell ?? (() => os.userInfo().shell);
  const userName = deps.userName ?? (() => os.userInfo().username);
  const appInstalled = deps.appInstalled ?? (async () => (await Promise.all(APP_BUNDLES.map(exists))).some(Boolean));
  const nodeDir = deps.nodeDir ?? path.dirname(process.execPath);
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

  const plan = async (): Promise<Plan> => {
    const user = userName();
    const keyFile = path.join(sshDir, KEY_NAME);
    const publicFile = `${keyFile}.pub`;
    const configFile = path.join(sshDir, 'config');
    const authorizedFile = path.join(sshDir, 'authorized_keys');
    const present = new Set<string>();
    for (const file of ['.bash_profile', '.bash_login', '.profile']) if (await exists(path.join(home, file))) present.add(path.join(home, file));
    const profiles = profileFiles(loginShell(), home, (file) => present.has(file));
    const files = [publicFile, configFile, authorizedFile, ...(profiles ?? [])];
    const texts = new Map<string, string | null>();
    for (const file of files) texts.set(file, await readOrNull(file));
    const key = texts.get(publicFile) ?? null;
    const writes: TrustWrite[] = [];
    const notes: string[] = [];
    const desired = new Map<string, string>();
    const hasPrivate = await exists(keyFile);
    if (!key || !hasPrivate) {
      writes.push({ file: keyFile, description: 'новый ключ SSH ed25519 без пароля (ssh-keygen), только для подключения ChatGPT к этому компьютеру' });
    }
    const authorized = texts.get(authorizedFile) ?? '';
    if (key && hasPrivate) {
      const next = withAuthorizedKey(authorized, key);
      if (next !== authorized) desired.set(authorizedFile, next);
    }
    if (!key || !hasPrivate || desired.has(authorizedFile)) {
      writes.push({ file: authorizedFile, value: `${KEY_FROM} ssh-ed25519 … ${KEY_COMMENT}`, description: 'строка ключа Kit: вход по нему разрешён только с этого компьютера (127.0.0.1, ::1)' });
    }
    const config = texts.get(configFile) ?? '';
    const manual = removeManualHost(config);
    const configNext = upsertManagedBlock(manual.text, sshConfigBlock(user), 'start');
    if (configNext !== config) {
      desired.set(configFile, configNext);
      writes.push({ file: configFile, value: sshConfigBlock(user), description: `блок Host ${SHARED_ALIAS} в начале файла, между метками Kit` });
      if (manual.found) notes.push(`В ${configFile} есть блок Host ${SHARED_ALIAS}, записанный вручную: Kit заменит его своим.`);
    }
    const block = profileBlock([codexDir() ?? '', nodeDir]);
    let manualProfile: string | null = null;
    if (profiles) {
      for (const file of profiles) {
        const text = texts.get(file) ?? '';
        const probe = removeProbeProfile(text);
        const next = upsertManagedBlock(probe.text, block, 'end');
        if (next !== text) {
          desired.set(file, next);
          writes.push({ file, value: block, description: 'для SSH-сеансов с этого компьютера: путь к codex и запрет второго app-server в приложении ChatGPT' });
          if (probe.found) notes.push(`В ${file} есть блок пробы Workflow Kit: Kit заменит его своим.`);
        }
      }
    } else {
      manualProfile = block;
      notes.push(`Оболочку ${loginShell() ?? '?'} Kit не меняет: вставьте блок «manualProfile» в её профиль, который читается и в SSH-сеансах.`);
    }
    notes.push('Вручную: «Удалённый вход» в настройках macOS и подключение в ChatGPT (Настройки → Подключения → SSH).');
    const hash = createHash('sha256');
    for (const file of files) hash.update(`${file}\u0000${texts.get(file) ?? '\u0001'}\u0000`);
    hash.update(String(hasPrivate));
    return { user, keyFile, publicFile, configFile, authorizedFile, profiles, key: key && hasPrivate ? key : null, texts, desired, writes, notes, manualProfile, fingerprint: hash.digest('hex') };
  };

  const check = async (): Promise<SharedAccessState> => {
    const reason = unsupportedReason(context.platform);
    if (reason) return result('unsupported', { reason });
    if (rt.program.installed === false) return result('unsupported', { reason: 'codex не найден', hint: 'Установите Codex CLI и нажмите «Перепроверить».' });
    if (!(await appInstalled())) return result('unsupported', { reason: 'приложение ChatGPT не установлено', hint: 'Установите ChatGPT для macOS и нажмите «Перепроверить».' });
    const current = await plan();
    const manualProfile = current.manualProfile;
    if (current.writes.length > 0) {
      return result('not-configured', { reason: 'Kit ещё не настроил доступ ChatGPT к демону по SSH', hint: 'Нажмите «Настроить».', manualProfile });
    }
    const connectionSeenAt = await readSeen();
    const base = { configured: true, manualProfile, connectionSeenAt };
    if (!(await probePort(22))) {
      return result('needs-remote-login', { ...base, reason: '«Удалённый вход» macOS выключен: порт 22 не отвечает', hint: 'Системные настройки → Основные → Общий доступ → «Удалённый вход»: включите, доступ — только вашему пользователю.' });
    }
    const configFile = path.join(sshDir, 'config');
    const probe = await context.runCommand(
      'ssh',
      ['-F', configFile, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5', SHARED_ALIAS, SSH_CHECK_COMMAND],
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
    let seen = connectionSeenAt;
    if (connected && !seen) {
      seen = context.now().toISOString();
      await writeSeen(seen);
    }
    if (!seen) {
      return result('needs-connection', { ...base, connected, reason: `приложение ChatGPT ещё не подключалось к ${SHARED_ALIAS}`, hint: `Откройте в ChatGPT Настройки → Подключения → SSH и включите ${SHARED_ALIAS}.` });
    }
    return result('active', { ...base, connectionSeenAt: seen, connected });
  };

  const writeText = async (file: string, text: string): Promise<void> => {
    await writeFile(file, text, { mode: 0o600 });
    await chmod(file, 0o600);
  };

  return {
    async state(force = false) {
      if (!force && last && Date.now() - lastAt < SHARED_TTL_MS) return last;
      return check();
    },
    cached: () => last,
    async preview(): Promise<SharedAccessPreview> {
      const reason = unsupportedReason(context.platform);
      if (reason) throw new ProviderError('not-supported', reason, { status: 409 });
      const current = await plan();
      const issued = rt.tokens.issue('shared-access', current.fingerprint);
      return { writes: current.writes, token: issued.token, expiresAt: issued.expiresAt, notes: current.notes };
    },
    async apply(token) {
      const reason = unsupportedReason(context.platform);
      if (reason) throw new ProviderError('not-supported', reason, { status: 409 });
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
      for (const [file, text] of current.desired) {
        await backupFile(file, backup);
        await writeText(file, text);
      }
      last = null;
      const after = await plan();
      if (after.writes.length > 0) {
        throw new ProviderError('verify-failed', `После записи не на месте: ${after.writes.map((w) => w.file).join(', ')}`);
      }
      return check();
    },
    async remove() {
      const reason = unsupportedReason(context.platform);
      if (reason) throw new ProviderError('not-supported', reason, { status: 409 });
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
      for (const file of [current.keyFile, current.publicFile]) {
        await backupFile(file, backup);
        await rm(file, { force: true });
      }
      await writeSeen(null);
      last = null;
      return check();
    },
    async open(target: SharedAccessTarget) {
      const reason = unsupportedReason(context.platform);
      if (reason) throw new ProviderError('not-supported', reason, { status: 409 });
      const url = target === 'remote-login' ? REMOTE_LOGIN_LINK : CONNECTIONS_LINK;
      const opened = await context.runCommand('open', [url], { timeoutMs: 10_000 });
      if (opened.code !== 0) throw new ProviderError('open-failed', `Не удалось открыть ${url}`);
    },
  };
}
