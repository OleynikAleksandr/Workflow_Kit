// What the shared access setup writes (spec M12 section 2.2, Windows: M13 section 2.3): the key,
// authorized_keys, ~/.ssh/config, the shell profile and, on Windows, the administrator script.
// buildPlan only reads files; createSharedAccess shows the plan, writes it and checks it again.
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { TrustWrite } from '#provider-registry';
import {
  KEY_COMMENT,
  KEY_FROM,
  KEY_NAME,
  SHARED_ALIAS,
  authorizedLine,
  keyBlob,
  profileBlock,
  profileFiles,
  removeManualHost,
  removeProbeProfile,
  sshConfigBlock,
  upsertManagedBlock,
  withAuthorizedKey,
} from './shared-files.ts';
import { ADMIN_ROLLBACK_NAME, ADMIN_SCRIPT_NAME, adminCommand, adminScript, toGitBashPath } from './shared-windows-setup.ts';

export async function readOrNull(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8');
  } catch {
    return null;
  }
}

export async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

/** Windows part of the inputs: the Git shell and whether the user is an administrator. */
export interface WindowsPlanInputs {
  gitShell: string;
  admin: boolean;
}

export interface PlanInputs {
  home: string;
  stateDir: string;
  user: string;
  loginShell: string | null;
  codexDir: string | null;
  nodeDir: string;
  /** Present on Windows only. */
  windows: WindowsPlanInputs | null;
}

export interface Plan {
  user: string;
  keyFile: string;
  publicFile: string;
  configFile: string;
  authorizedFile: string;
  profiles: string[] | null;
  /** The administrator script and its rollback (Windows); null elsewhere. */
  adminFile: string | null;
  rollbackFile: string | null;
  key: string | null;
  texts: Map<string, string | null>;
  desired: Map<string, string>;
  writes: TrustWrite[];
  notes: string[];
  manualProfile: string | null;
  fingerprint: string;
}

/** Reads the files and says what the setup still has to write. */
export async function buildPlan(inputs: PlanInputs): Promise<Plan> {
  const { home, user, windows } = inputs;
  const sshDir = path.join(home, '.ssh');
  const keyFile = path.join(sshDir, KEY_NAME);
  const publicFile = `${keyFile}.pub`;
  const configFile = path.join(sshDir, 'config');
  const authorizedFile = path.join(sshDir, 'authorized_keys');
  const adminFile = windows ? path.join(inputs.stateDir, ADMIN_SCRIPT_NAME) : null;
  const rollbackFile = windows ? path.join(inputs.stateDir, ADMIN_ROLLBACK_NAME) : null;
  const present = new Set<string>();
  for (const file of ['.bash_profile', '.bash_login', '.profile']) if (await exists(path.join(home, file))) present.add(path.join(home, file));
  // Git Bash is the shell of an SSH session on Windows (DefaultShell): its login profile.
  const profiles = profileFiles(windows ? 'bash' : inputs.loginShell, home, (file) => present.has(file));
  const files = [publicFile, configFile, authorizedFile, ...(profiles ?? []), ...(adminFile ? [adminFile] : [])];
  const texts = new Map<string, string | null>();
  for (const file of files) texts.set(file, await readOrNull(file));
  const publicKey = texts.get(publicFile) ?? null;
  const writes: TrustWrite[] = [];
  const notes: string[] = [];
  const desired = new Map<string, string>();
  const hasPrivate = await exists(keyFile);
  const key = publicKey && hasPrivate ? publicKey : null;
  if (!key) {
    writes.push({ file: keyFile, description: 'новый ключ SSH ed25519 без пароля (ssh-keygen), только для подключения ChatGPT к этому компьютеру' });
  }
  // An administrator of Windows: sshd reads administrators_authorized_keys, the script writes it.
  const userKeys = !windows?.admin;
  if (userKeys) {
    const authorized = texts.get(authorizedFile) ?? '';
    if (key) {
      const next = withAuthorizedKey(authorized, key);
      if (next !== authorized) desired.set(authorizedFile, next);
    }
    if (!key || desired.has(authorizedFile)) {
      writes.push({ file: authorizedFile, value: `${KEY_FROM} ssh-ed25519 … ${KEY_COMMENT}`, description: 'строка ключа Kit: вход по нему разрешён только с этого компьютера (127.0.0.1, ::1)' });
    }
  }
  const config = texts.get(configFile) ?? '';
  const manual = removeManualHost(config);
  const configNext = upsertManagedBlock(manual.text, sshConfigBlock(user), 'start');
  if (configNext !== config) {
    desired.set(configFile, configNext);
    writes.push({ file: configFile, value: sshConfigBlock(user), description: `блок Host ${SHARED_ALIAS} в начале файла, между метками Kit` });
    if (manual.found) notes.push(`В ${configFile} есть блок Host ${SHARED_ALIAS}, записанный вручную: Kit заменит его своим.`);
  }
  const dirs = [inputs.codexDir ?? '', inputs.nodeDir].filter((dir) => dir !== '');
  const block = profileBlock(windows ? dirs.map(toGitBashPath) : dirs);
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
    notes.push(`Оболочку ${inputs.loginShell ?? '?'} Kit не меняет: вставьте блок «manualProfile» в её профиль, который читается и в SSH-сеансах.`);
  }
  if (windows && adminFile) {
    const script = adminScript({ gitShell: windows.gitShell, adminKeyLine: windows.admin && key ? authorizedLine(key) : null, keyBlob: key ? keyBlob(key) : null });
    if (!key || texts.get(adminFile) !== script) {
      if (key) desired.set(adminFile, script);
      writes.push({ file: adminFile, description: 'скрипт администратора: ставит и запускает сервер OpenSSH, задаёт DefaultShell = sh.exe Git' + (windows.admin ? ', дописывает ключ Kit в administrators_authorized_keys' : '') + '. Kit его не запускает' });
    }
    notes.push(`Вручную: запустите скрипт администратора в PowerShell от имени администратора — ${adminCommand(adminFile)}; затем подключение в ChatGPT (Настройки → Подключения → SSH).`);
    notes.push(`DefaultShell меняет оболочку всех входов по SSH на этот компьютер на ${windows.gitShell}.`);
    if (windows.admin) notes.push('Вы администратор: ключ Kit в administrators_authorized_keys открывает вход любого администратора этого компьютера, но только с 127.0.0.1 и ::1.');
  } else {
    notes.push('Вручную: «Удалённый вход» в настройках macOS и подключение в ChatGPT (Настройки → Подключения → SSH).');
  }
  const hash = createHash('sha256');
  for (const file of files) hash.update(`${file}\u0000${texts.get(file) ?? '\u0001'}\u0000`);
  hash.update(`${hasPrivate}|${windows ? `${windows.gitShell}|${windows.admin}` : ''}`);
  return { user, keyFile, publicFile, configFile, authorizedFile, profiles, adminFile, rollbackFile, key, texts, desired, writes, notes, manualProfile, fingerprint: hash.digest('hex') };
}
