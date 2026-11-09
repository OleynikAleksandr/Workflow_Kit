// Trust of a project folder (D7). Remote Control needs the folder's own key
// projects["<folder>"].hasTrustDialogAccepted in ~/.claude.json; a trusted parent (e.g. ~) only
// silences the interactive dialog and is shown as a separate mark. The preview lists the keys, the
// folder's autorun points and the external CLAUDE.md imports with a required "allow / deny" choice,
// and issues a token bound to all of it. grantTrust passes no dialog: after the token check it
// copies ~/.claude.json and writes the keys itself (config-writer.ts), verifying the result.
import { createHash } from 'node:crypto';
import { backupFile } from '#data-store';
import { ProviderError } from '#provider-registry';
import type { Project, TokenStore, TrustChoice, TrustChoices, TrustPreview, TrustState, TrustWrite } from '#provider-registry';
import { scanAutorun } from './autorun.ts';
import type { AutorunScan } from './autorun.ts';
import { IMPORTS_APPROVED_KEY, IMPORTS_SHOWN_KEY, TRUST_KEY, trustFromSnapshot } from './claude-config.ts';
import type { ClaudeConfigSnapshot, ProjectEntry } from './claude-config.ts';
import { CONFIG_WRITE_ATTEMPTS, patchProjectEntry } from './config-writer.ts';
import { scanExternalImports } from './imports.ts';
import type { ImportScan } from './imports.ts';
import { trustUnavailableReason } from './programs.ts';
import { PROVIDER_ID } from './runtime.ts';
import type { ClaudeRuntime } from './runtime.ts';
import { folderKey } from './folder-key.ts';

/** Id of the external-imports choice and its answers. */
export const IMPORTS_CHOICE = 'external-imports';
export const IMPORTS_ALLOW = 'allow';
export const IMPORTS_DENY = 'deny';

/** Everything the preview shows and the grant checks again. */
interface Situation {
  snapshot: ClaudeConfigSnapshot;
  entry: ProjectEntry | undefined;
  trust: TrustState;
  autorun: AutorunScan;
  imports: ImportScan;
  /** External imports exist and the folder has no recorded answer yet. */
  importsPending: boolean;
  fingerprint: string;
}

function scopeOf(project: Project): string {
  return `${PROVIDER_ID}:${project.id}`;
}

async function situation(rt: ClaudeRuntime, project: Project): Promise<Situation> {
  const [autorun, snapshot, imports] = await Promise.all([
    scanAutorun(project.path),
    rt.claudeConfig.read(),
    scanExternalImports(project.path, rt.context.homedir),
  ]);
  const entry = snapshot.projects.get(folderKey(project.path));
  const trust = trustFromSnapshot(snapshot, project.path);
  const importsPending = imports.imports.length > 0 && entry?.importsDecided !== true;
  const fingerprint = createHash('sha256')
    .update([autorun.fingerprint, imports.fingerprint, String(trust.trusted), String(entry?.importsDecided), String(entry?.importsApproved)].join('\0'))
    .digest('hex');
  return { snapshot, entry, trust, autorun, imports, importsPending, fingerprint };
}

function importsChoice(imports: ImportScan): TrustChoice {
  const list = imports.imports.map((i) => `${i.file} (из ${i.from})`).join('; ');
  return {
    id: IMPORTS_CHOICE,
    title: 'Внешние импорты CLAUDE.md',
    description: `CLAUDE.md этой папки или родительских папок импортирует файлы вне папки проекта: ${list}. Claude спрашивает об этом при первом запуске; ответ запишется вместе с доверием. Не разрешайте это для чужих репозиториев.`,
    options: [
      { id: IMPORTS_ALLOW, title: 'Разрешить внешние импорты', description: 'Claude загрузит эти файлы в контекст каждой сессии папки.' },
      { id: IMPORTS_DENY, title: 'Запретить внешние импорты', description: 'Claude не будет загружать файлы вне папки проекта.' },
    ],
    required: false,
  };
}

/**
 * Choices the preview shows: none. External imports are allowed by default (decision of the
 * user, 2026-11-06: the setting belongs to the Claude app); the panel asks nothing.
 */
function choicesOf(_current: Situation): TrustChoice[] {
  return [];
}

/** Answers grantTrust accepts: an explicit "deny" of the imports through the API still works. */
function acceptedChoices(current: Situation): TrustChoice[] {
  return current.importsPending ? [importsChoice(current.imports)] : [];
}

function writesOf(current: Situation, file: string, project: Project): TrustWrite[] {
  const key = (name: string): string => `projects["${project.path}"].${name}`;
  const writes: TrustWrite[] = [];
  if (current.trust.trusted !== true) writes.push({ file, key: key(TRUST_KEY), value: true, description: 'доверие к папке: Remote Control проверяет именно этот ключ' });
  if (current.importsPending) {
    writes.push({ file, key: key(IMPORTS_APPROVED_KEY), value: true, description: 'внешние импорты CLAUDE.md разрешены (по умолчанию; меняется в настройках Claude)' });
    writes.push({ file, key: key(IMPORTS_SHOWN_KEY), value: true, description: 'вопрос о внешних импортах решён: Claude не покажет диалог' });
  }
  return writes;
}

/** Current trust for the panel (read-only, cached by mtime of ~/.claude.json). */
export async function readTrust(rt: ClaudeRuntime, project: Project): Promise<TrustState> {
  return rt.claudeConfig.trustOf(project.path);
}

/** Builds the preview and issues its token. */
export async function previewTrust(rt: ClaudeRuntime, tokens: TokenStore, project: Project): Promise<TrustPreview> {
  const current = await situation(rt, project);
  const file = rt.claudeConfig.file;
  const writes = writesOf(current, file, project);
  const notes: string[] = [];
  if (writes.length > 0) {
    notes.push(`Kit сам запишет ключи в ${file}: сначала копия файла, затем запись через временный файл с теми же правами и проверка чтением; если Claude перезапишет файл в это время, запись повторится (до ${CONFIG_WRITE_ATTEMPTS} раз).`);
    notes.push('Kit не проходит диалоги Claude и не нажимает в них клавиш. Сессии и окружение папки запускают Claude в папке: сработают хуки, MCP-серверы и команды из списка точек автозапуска.');
  } else {
    notes.push('Папка уже доверена: записывать нечего.');
  }
  if (current.imports.imports.length > 0 && !current.importsPending) {
    notes.push(`Внешние импорты CLAUDE.md: решение уже записано — ${current.entry?.importsApproved === true ? 'разрешены' : 'запрещены'}.`);
  }
  notes.push('Remote Control проверяет ключ самой папки: доверие подпапок и родительских папок не в счёт.');
  if (current.trust.trusted === null) notes.push(`${file} сейчас не читается: доверие неизвестно, записи не будет.`);
  const reason = trustUnavailableReason(rt.context.platform, await rt.programs());
  if (reason && writes.length > 0) notes.push(`Сейчас недоступно: ${reason}`);
  const issued = tokens.issue(scopeOf(project), current.fingerprint);
  return {
    provider: PROVIDER_ID,
    trusted: current.trust.trusted === true,
    writes,
    autorun: current.autorun.autorun,
    choices: choicesOf(current),
    ...(current.trust.inherited ? { inherited: current.trust.inherited } : {}),
    ...issued,
    notes,
  };
}

/** Checks the answers against the choices of the preview. */
function checkChoices(pending: TrustChoice[], choices: TrustChoices): void {
  for (const id of Object.keys(choices)) {
    if (!pending.some((c) => c.id === id)) throw new ProviderError('invalid-choice', `Нет такого выбора: ${id}`, { status: 400, hint: 'Откройте предпросмотр доверия снова.' });
  }
  for (const choice of pending) {
    const answer = choices[choice.id];
    if (answer === undefined) {
      if (choice.required) throw new ProviderError('choice-required', `Нужен ответ: «${choice.title}»`, { status: 400, hint: 'Выберите ответ в предпросмотре доверия и нажмите «Доверять» снова.' });
    } else if (!choice.options.some((o) => o.id === answer)) {
      throw new ProviderError('invalid-choice', `Нет такого ответа для «${choice.title}»: ${answer}`, { status: 400, hint: 'Откройте предпросмотр доверия снова.' });
    }
  }
}

/** Writes trust (and the imports answer) after checking the preview token; returns the verified state. */
export async function grantTrust(rt: ClaudeRuntime, tokens: TokenStore, project: Project, token: string, choices: TrustChoices = {}): Promise<TrustState> {
  const expected = tokens.consume(scopeOf(project), token);
  if (expected === undefined) {
    throw new ProviderError('invalid-token', 'Предпросмотр доверия устарел или уже использован', { hint: 'Откройте предпросмотр доверия снова.' });
  }
  const current = await situation(rt, project);
  if (current.fingerprint !== expected) {
    throw new ProviderError('preview-changed', 'Папка, её импорты или доверие изменились после предпросмотра', {
      hint: 'Откройте предпросмотр снова и проверьте точки автозапуска и выбор.',
    });
  }
  const file = rt.claudeConfig.file;
  if (current.snapshot.error) throw new ProviderError('config-broken', `${file}: ${current.snapshot.error}`, { hint: 'Kit не пишет в битый файл: исправьте его вручную.' });
  checkChoices(acceptedChoices(current), choices);
  const patch: Record<string, boolean> = {};
  if (current.trust.trusted !== true) patch[TRUST_KEY] = true;
  if (current.importsPending) {
    patch[IMPORTS_APPROVED_KEY] = choices[IMPORTS_CHOICE] !== IMPORTS_DENY;
    patch[IMPORTS_SHOWN_KEY] = true;
  }
  if (Object.keys(patch).length === 0) return { trusted: true, note: 'папка уже доверена' };
  const reason = trustUnavailableReason(rt.context.platform, await rt.programs());
  if (reason) throw new ProviderError('unavailable', `Claude: ${reason}`, { hint: 'Нажмите «Перепроверить» после установки недостающего.' });
  const backup = await backupFile(file, { backupsDir: rt.context.dirs.backupsDir, now: rt.context.now });
  let attempts: number;
  try {
    attempts = (await patchProjectEntry(file, project.path, patch, { afterWrite: rt.options.afterConfigWrite })).attempts;
  } catch (error) {
    if (!(error instanceof ProviderError)) throw error;
    const hint = backup ? `${error.hint ?? ''} Копия до записи: ${backup}`.trim() : error.hint;
    throw new ProviderError(error.code, error.message, { ...(hint ? { hint } : {}), details: { backup } });
  }
  rt.context.log(`claude: trust of ${project.path} written to ${file} (attempts: ${attempts}, keys: ${Object.keys(patch).join(', ')})`);
  const state: TrustState = { trusted: true, backup };
  if (IMPORTS_APPROVED_KEY in patch) state.note = `внешние импорты CLAUDE.md ${patch[IMPORTS_APPROVED_KEY] ? 'разрешены' : 'запрещены'}`;
  return state;
}
