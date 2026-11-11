// Text of the files the shared access writes (spec M12 section 2.2): the managed blocks of
// ~/.ssh/config and the shell profile, the authorized_keys line of the Kit key, removal of the
// probe blocks of 2026-11-11, and parsing of the checks. Pure functions, the same on every OS.
import path from 'node:path';

/** Host alias of the connection in ~/.ssh/config and in the ChatGPT app. */
export const SHARED_ALIAS = 'wfk-local';
/** hostId of the chats the ChatGPT app runs through the alias (links of M12 section 2.1). */
export const SHARED_HOST_ID = `remote-ssh-discovered:${SHARED_ALIAS}`;
/** Name of the key Kit creates in ~/.ssh. */
export const KEY_NAME = 'wfk_local';
/** Comment of the key and of its authorized_keys line. */
export const KEY_COMMENT = 'workflow-kit';
/** Addresses the key is accepted from (only this computer). */
export const KEY_FROM = 'from="127.0.0.1,::1"';
export const BLOCK_BEGIN = '# >>> workflow-kit >>>';
export const BLOCK_END = '# <<< workflow-kit <<<';
/** The SSH connections page of the ChatGPT app (checked 2026-11-11: the app finds the alias there itself). */
export const CONNECTIONS_LINK = 'codex://settings/connections/ssh';
/** Sharing settings of macOS (Remote Login). */
export const REMOTE_LOGIN_LINK = 'x-apple.systempreferences:com.apple.Sharing-Settings.extension';
/** Text between the markers, markers included, or null. */
export function managedBlock(text: string): string | null {
  const start = text.indexOf(BLOCK_BEGIN);
  if (start < 0) return null;
  const end = text.indexOf(BLOCK_END, start);
  if (end < 0) return null;
  return text.slice(start, end + BLOCK_END.length);
}

/** Text without the managed block (and the blank line Kit put around it). */
export function removeManagedBlock(text: string): string {
  const block = managedBlock(text);
  if (block === null) return text;
  const start = text.indexOf(block);
  let before = text.slice(0, start);
  let after = text.slice(start + block.length);
  if (after.startsWith('\n')) after = after.slice(1);
  // The blank line Kit put between the block and the rest of the file.
  if (before === '' && after.startsWith('\n')) after = after.slice(1);
  else if (before.endsWith('\n\n')) before = before.slice(0, -1);
  return before + after;
}

/** Puts the block at the start (ssh config: the first value of an option wins) or the end of text. */
export function upsertManagedBlock(text: string, block: string, where: 'start' | 'end'): string {
  const rest = removeManagedBlock(text);
  if (where === 'start') return rest === '' ? `${block}\n` : `${block}\n\n${rest}`;
  if (rest === '') return `${block}\n`;
  return `${rest}${rest.endsWith('\n') ? '' : '\n'}\n${block}\n`;
}

/**
 * Removes a `Host <alias>` stanza written by hand (the probe of 2026-11-11) outside the managed
 * block: from its Host line to the next Host or Match line.
 */
export function removeManualHost(text: string, alias: string = SHARED_ALIAS): { text: string; found: boolean } {
  const block = managedBlock(text);
  const outside = block === null ? text : text.replace(block, '\u0000');
  const lines = outside.split('\n');
  const out: string[] = [];
  let skipping = false;
  let found = false;
  for (const line of lines) {
    const host = /^\s*(Host|Match)\s+(.*)$/i.exec(line);
    if (host) {
      const wasSkipping = skipping;
      skipping = host[1]!.toLowerCase() === 'host' && host[2]!.trim().split(/\s+/).includes(alias);
      if (skipping) {
        found = true;
        while (out.length > 0 && out[out.length - 1]!.trim() === '') out.pop();
        continue;
      }
      // The stanza after a removed one keeps one blank line before it.
      if (wasSkipping && out.length > 0) out.push('');
    }
    if (!skipping) out.push(line);
  }
  let result = out.join('\n');
  if (block !== null) result = result.replace('\u0000', block);
  if (text.endsWith('\n') && !result.endsWith('\n')) result += '\n';
  return { text: result, found };
}

/** Removes the probe block of the zsh profile ("# Workflow Kit probe:" up to its `fi`). */
export function removeProbeProfile(text: string): { text: string; found: boolean } {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.startsWith('# Workflow Kit probe:'));
  if (start < 0) return { text, found: false };
  let end = start + 1;
  while (end < lines.length && lines[end]!.trim() !== 'fi') end += 1;
  if (end >= lines.length) return { text, found: false };
  let from = start;
  while (from > 0 && lines[from - 1]!.trim() === '') from -= 1;
  lines.splice(from, end - from + 1);
  let result = lines.join('\n');
  if (text.endsWith('\n') && !result.endsWith('\n')) result += '\n';
  return { text: result, found: true };
}

/** The managed Host block of ~/.ssh/config. */
export function sshConfigBlock(user: string): string {
  return [
    BLOCK_BEGIN,
    '# Workflow Kit: the ChatGPT app reaches the Codex daemon of Kit on this computer.',
    `Host ${SHARED_ALIAS}`,
    '  HostName 127.0.0.1',
    `  User ${user}`,
    `  IdentityFile ~/.ssh/${KEY_NAME}`,
    '  IdentitiesOnly yes',
    `  HostKeyAlias ${SHARED_ALIAS}`,
    '  StrictHostKeyChecking accept-new',
    BLOCK_END,
  ].join('\n');
}

function shellQuoted(dir: string): string {
  return dir.replace(/(["\\$`])/g, '\\$1');
}

/** The managed block of the shell profile: only SSH sessions from this computer get it. */
export function profileBlock(dirs: readonly string[]): string {
  const unique = [...new Set(dirs.filter((dir) => dir !== ''))];
  const prefix = unique.map(shellQuoted).join(':');
  return [
    BLOCK_BEGIN,
    '# Workflow Kit: SSH sessions from this computer reuse the running Codex daemon.',
    'case "${SSH_CONNECTION:-}" in',
    '  "127.0.0.1 "*|"::1 "*)',
    ...(prefix ? [`    export PATH="${prefix}:$PATH"`] : []),
    '    export CODEX_SSH_SKIP_APP_SERVER_BOOT=true',
    '    ;;',
    'esac',
    BLOCK_END,
  ].join('\n');
}

/** Second field of a public key line (the key itself). */
export function keyBlob(publicKey: string): string | null {
  const parts = publicKey.trim().split(/\s+/);
  const index = parts.findIndex((part) => part.startsWith('ssh-') || part.startsWith('ecdsa-'));
  return index >= 0 ? (parts[index + 1] ?? null) : null;
}

/** authorized_keys line of the Kit key: accepted only from this computer. */
export function authorizedLine(publicKey: string): string {
  const parts = publicKey.trim().split(/\s+/);
  const index = parts.findIndex((part) => part.startsWith('ssh-') || part.startsWith('ecdsa-'));
  return `${KEY_FROM} ${parts[index]} ${parts[index + 1]} ${KEY_COMMENT}`;
}

/** authorized_keys with exactly one line of the key (other lines of the same key are dropped). */
export function withAuthorizedKey(text: string, publicKey: string): string {
  const blob = keyBlob(publicKey);
  const kept = text.split('\n').filter((line) => line.trim() !== '' && !(blob && line.split(/\s+/).includes(blob)));
  return [...kept, authorizedLine(publicKey)].join('\n') + '\n';
}

/** authorized_keys without the lines of the key. */
export function withoutAuthorizedKey(text: string, blob: string | null): string {
  const kept = text.split('\n').filter((line) => {
    if (line.trim() === '') return false;
    const fields = line.split(/\s+/);
    return !(blob ? fields.includes(blob) : line.startsWith(KEY_FROM) && fields[fields.length - 1] === KEY_COMMENT);
  });
  return kept.length > 0 ? kept.join('\n') + '\n' : '';
}

/**
 * Profile files Kit edits for a login shell; null when Kit does not edit that shell. The ChatGPT
 * app runs its commands through `$SHELL -l -i -c` (seen 2026-11-11): zsh reads ~/.zshenv always,
 * a bash login shell reads the first of ~/.bash_profile, ~/.bash_login, ~/.profile.
 */
export function profileFiles(shell: string | null, homedir: string, exists: (file: string) => boolean = () => false): string[] | null {
  const name = shell ? path.posix.basename(shell) : '';
  if (name === 'zsh') return [path.join(homedir, '.zshenv')];
  if (name === 'bash') {
    const files = ['.bash_profile', '.bash_login', '.profile'].map((file) => path.join(homedir, file));
    return [files.find(exists) ?? files[0]!];
  }
  return null;
}

/** Remote command of the SSH check: the same login shell the ChatGPT app starts. */
export const SSH_CHECK_COMMAND =
  'exec "$SHELL" -l -i -c \'printf "\\n%s|%s\\n" "$(command -v codex)" "${CODEX_SSH_SKIP_APP_SERVER_BOOT:-}"\'';

/** True when a "<pid> <command>" line is the ChatGPT app connected through the alias. */
export function isSharedConnection(commandLine: string, alias: string = SHARED_ALIAS): boolean {
  return /(^|[\s/])ssh(\s|$)/.test(commandLine) && commandLine.split(/\s+/).includes(alias) && /app-server\s+proxy/.test(commandLine);
}

/** Parses the answer of the SSH check: "<codex path>|<CODEX_SSH_SKIP_APP_SERVER_BOOT>". */
export function parseSshCheck(stdout: string): { codex: string | null; skip: boolean } {
  const line = stdout.trim().split('\n').pop() ?? '';
  const [codex = '', skip = ''] = line.split('|');
  return { codex: codex.trim() || null, skip: skip.trim() === 'true' };
}
