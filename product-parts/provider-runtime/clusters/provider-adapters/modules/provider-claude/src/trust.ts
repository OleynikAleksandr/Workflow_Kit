// Trust of a project folder (D7). The preview lists what will be written and the folder's autorun
// points and issues a token bound to their fingerprint; grantTrust checks the token, copies
// ~/.claude.json, passes Claude's own trust dialog under a pty (trust.exp, WFK_SERVICE_SESSION=trust
// so the dialog's session is hidden) and verifies the file afterwards. Kit never edits the file.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { backupFile } from '#data-store';
import { ProviderError } from '#provider-registry';
import type { Project, TokenStore, TrustPreview, TrustState } from '#provider-registry';
import { SERVICE_SESSION_ENV } from '#kit-structure';
import { scanAutorun } from './autorun.ts';
import { parseClaudeConfig } from './claude-config.ts';
import { logTail } from './pty.ts';
import { PROVIDER_ID } from './runtime.ts';
import type { ClaudeRuntime } from './runtime.ts';

/** Value of WFK_SERVICE_SESSION for the trust dialog. */
export const TRUST_SERVICE_MARK = 'trust';

function scopeOf(project: Project): string {
  return `${PROVIDER_ID}:${project.id}`;
}

async function fingerprint(rt: ClaudeRuntime, project: Project): Promise<{ value: string; trusted: boolean | null; scan: Awaited<ReturnType<typeof scanAutorun>> }> {
  const [scan, trust] = await Promise.all([scanAutorun(project.path), rt.claudeConfig.trustOf(project.path)]);
  const value = createHash('sha256').update(`${scan.fingerprint}\0${String(trust.trusted)}`).digest('hex');
  return { value, trusted: trust.trusted, scan };
}

/** Current trust for the panel (read-only, cached by mtime of ~/.claude.json). */
export async function readTrust(rt: ClaudeRuntime, project: Project): Promise<TrustState> {
  return rt.claudeConfig.trustOf(project.path);
}

/** Builds the preview and issues its token. */
export async function previewTrust(rt: ClaudeRuntime, tokens: TokenStore, project: Project): Promise<TrustPreview> {
  const current = await fingerprint(rt, project);
  const trusted = current.trusted === true;
  const file = rt.claudeConfig.file;
  const notes: string[] = [];
  if (!trusted) {
    notes.push('Kit не правит файл сам: он проходит диалог доверия Claude под pty, Claude Code записывает ключ, затем Kit проверяет файл.');
    notes.push('Диалог доверия запускает сессию Claude в папке: сработают хуки, MCP-серверы и команды из списка точек автозапуска.');
    notes.push(`Служебная сессия помечена ${SERVICE_SESSION_ENV}=${TRUST_SERVICE_MARK} и не попадает в список сессий.`);
    notes.push(`Перед диалогом Kit сохранит копию ${file}.`);
  } else {
    notes.push('Папка уже доверена: записывать нечего.');
  }
  notes.push('Подпапки доверие не наследуют.');
  if (current.trusted === null) notes.push(`${file} сейчас не читается: доверие неизвестно.`);
  const reason = await rt.ptyReason();
  if (reason && !trusted) notes.push(`Сейчас недоступно: ${reason}`);
  const issued = tokens.issue(scopeOf(project), current.value);
  return {
    provider: PROVIDER_ID,
    trusted,
    writes: trusted
      ? []
      : [
          {
            file,
            key: `projects["${project.path}"].hasTrustDialogAccepted`,
            value: true,
            description: 'доверие к папке; запишет Claude Code, когда Kit примет диалог доверия',
          },
        ],
    autorun: current.scan.autorun,
    ...issued,
    notes,
  };
}

/** Passes the trust dialog after checking the preview token; returns the verified state. */
export async function grantTrust(rt: ClaudeRuntime, tokens: TokenStore, project: Project, token: string): Promise<TrustState> {
  const expected = tokens.consume(scopeOf(project), token);
  if (expected === undefined) {
    throw new ProviderError('invalid-token', 'Предпросмотр доверия устарел или уже использован', { hint: 'Откройте предпросмотр доверия снова.' });
  }
  const current = await fingerprint(rt, project);
  if (current.value !== expected) {
    throw new ProviderError('preview-changed', 'Папка или доверие изменились после предпросмотра', {
      hint: 'Откройте предпросмотр снова и проверьте точки автозапуска.',
    });
  }
  if (current.trusted === true) return { trusted: true, note: 'папка уже доверена' };
  const { claude, expect } = await rt.requirePty();
  const file = rt.claudeConfig.file;
  const backup = await backupFile(file, { backupsDir: rt.context.dirs.backupsDir, now: rt.context.now });
  const logFile = path.join(rt.logsDir, `${rt.newKey('trust')}.log`);
  const result = await rt.context.runCommand(expect, [rt.options.scripts.trust, project.path, claude, String(rt.options.trustPaceMs)], {
    cwd: project.path,
    env: rt.childEnv({ [SERVICE_SESSION_ENV]: TRUST_SERVICE_MARK }),
    timeoutMs: rt.options.trustTimeoutMs,
  });
  const output = `${result.stdout}${result.stderr ? `\n[stderr]\n${result.stderr}` : ''}`;
  await mkdir(rt.logsDir, { recursive: true, mode: 0o700 });
  await writeFile(logFile, output, { mode: 0o600 });
  const details = { backup, log: logFile };
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    throw new ProviderError('trust-failed', `Диалог доверия не создал ${file}`, { hint: `Журнал диалога: ${logFile}`, details });
  }
  const after = parseClaudeConfig(file, text);
  if (after.error) {
    throw new ProviderError('config-broken', `${file} после диалога: ${after.error}`, {
      hint: backup ? `Восстановите копию: ${backup}` : `Журнал диалога: ${logFile}`,
      details,
    });
  }
  if (!after.trusted.has(project.path)) {
    const tail = logTail(output);
    const why = result.startError ? `expect не запустился (${result.startError})` : result.timedOut ? 'диалог не завершился вовремя' : 'доверие не записано';
    throw new ProviderError('trust-failed', `Диалог доверия: ${why}${tail ? `\n${tail}` : ''}`, {
      hint: `Журнал диалога: ${logFile}. Можно запустить claude в папке вручную и принять диалог доверия.`,
      details,
    });
  }
  return { trusted: true, backup };
}
