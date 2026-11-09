// Trust of a project folder in Codex and approval of the Kit hook (D7): a preview with a token,
// writes made by Codex itself (`codex app-server`, config/value/write) after a copy of
// ~/.codex/config.toml, and a check after the write.
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { backupFile } from '#data-store';
import { ProviderError } from '#provider-registry';
import type { AutorunPoint, HookState, Project, TrustPreview, TrustState, TrustWrite } from '#provider-registry';
import { hookTrustKeyPath, projectTrustLevel, tomlKey, trustKeyPath } from './codex-files.ts';
import { KIT_HOOK_COMMAND, buildHookState, isExactKitCommand, listedProjectHooks, projectHooksFile, readLocalHooks } from './hooks.ts';
import type { ListedHook } from './hooks.ts';
import type { CodexRuntime } from './runtime.ts';

/** How long hooks() waits for a first hooks/list before answering "проверяется…". */
export const HOOKS_WAIT_MS = 2000;

/** Trust and hook methods of the provider. */
export interface TrustParts {
  trust(project: Project): Promise<TrustState>;
  previewTrust(project: Project): Promise<TrustPreview>;
  grantTrust(project: Project, token: string): Promise<TrustState>;
  hooks(project: Project): Promise<HookState>;
  approveHooks(project: Project, expected: { command: string; hash: string }): Promise<HookState>;
  clearCache(): void;
}

type HookCacheEntry = { stamp: string; listed: ListedHook[] | null; error: string | null; read: Promise<void> | null };

async function mtime(file: string): Promise<string> {
  try {
    return String((await stat(file)).mtimeMs);
  } catch {
    return '-';
  }
}

/** Throws unless Codex features can run here (Windows: Q2; the CLI must be found). */
export function requireCodex(rt: CodexRuntime): void {
  if (rt.context.platform === 'win32') {
    throw new ProviderError('unsupported-os', 'Codex на Windows в вехе 1 не поддерживается', { status: 501, hint: 'Используйте Mac (вопрос Q2 спецификации).' });
  }
  if (rt.program.installed === false) {
    throw new ProviderError('not-installed', 'codex не найден', { hint: 'Установите Codex CLI и нажмите «Перепроверить».' });
  }
}

function quotedPath(project: Project): string {
  try {
    return tomlKey(project.path);
  } catch {
    throw new ProviderError('unsupported-path', 'Путь папки содержит кавычку или обратную косую черту', {
      hint: 'Codex не примет такой ключ доверия; переименуйте папку.',
    });
  }
}

/** Creates the trust and hook methods over the runtime. */
export function createTrustParts(rt: CodexRuntime): TrustParts {
  const { context, paths } = rt;
  const backups = new Map<string, string | null>();
  const hookCache = new Map<string, HookCacheEntry>();

  const trustLevel = async (project: Project, fresh = false): Promise<{ text: string | null; level: string | null }> => {
    let text: string | null;
    if (fresh) text = await readFile(paths.config, 'utf8').catch(() => null);
    else text = await rt.readText(paths.config);
    return { text, level: text === null ? null : projectTrustLevel(text, project.path) };
  };

  const fingerprint = async (project: Project): Promise<string> => {
    const { level } = await trustLevel(project, true);
    const local = await readLocalHooks(project.path);
    const projectConfig = await mtime(path.join(project.path, '.codex', 'config.toml'));
    return createHash('sha256').update(JSON.stringify({ path: project.path, level, hooks: local.text, projectConfig: projectConfig !== '-' })).digest('hex');
  };

  const listHooks = (project: Project): Promise<ListedHook[]> =>
    rt.withAppServer(project.path, async (session) => listedProjectHooks(await session.request('hooks/list', { cwds: [project.path] }), project.path));

  const stampOf = async (project: Project): Promise<string> => `${await mtime(projectHooksFile(project.path))}|${await mtime(paths.config)}`;

  const parts: TrustParts = {
    async trust(project) {
      if (context.platform === 'win32') return { trusted: null, note: 'Windows: недоступно (Q2)' };
      const { text, level } = await trustLevel(project);
      const backup = backups.get(project.id);
      const state: TrustState = { trusted: level === 'trusted' };
      if (text === null) state.note = '~/.codex/config.toml ещё нет';
      else if (level && level !== 'trusted') state.note = `trust_level = "${level}"`;
      if (backup !== undefined) state.backup = backup;
      return state;
    },

    async previewTrust(project) {
      requireCodex(rt);
      const key = quotedPath(project);
      const { level } = await trustLevel(project, true);
      const trusted = level === 'trusted';
      const writes: TrustWrite[] = trusted
        ? []
        : [{ file: paths.config, key: `projects.${key}.trust_level`, value: 'trusted', description: 'Codex начнёт читать .codex/ проекта: config, hooks, exec policies' }];
      const local = await readLocalHooks(project.path);
      const autorun: AutorunPoint[] = local.hooks.map((hook) => ({
        file: '.codex/hooks.json',
        kind: isExactKitCommand(hook.command) ? 'kit-hook' : 'hook',
        detail: `${hook.event}: ${hook.command}`,
      }));
      if (local.error) autorun.push({ file: '.codex/hooks.json', kind: 'invalid', detail: local.error });
      if ((await mtime(path.join(project.path, '.codex', 'config.toml'))) !== '-') {
        autorun.push({ file: '.codex/config.toml', kind: 'config', detail: 'локальный конфиг Codex: применяется после доверия' });
      }
      const notes = [
        'Перед записью сохраняется копия ~/.codex/config.toml (каталог backups).',
        'Ключ пишет сам Codex (codex app-server, config/value/write); после записи он проверяется.',
        'Хуки проекта не выполняются, пока каждый не одобрен по хешу; Kit одобряет только свой хук.',
      ];
      if (level && !trusted) notes.push(`Сейчас: trust_level = "${level}".`);
      const issued = rt.tokens.issue(`codex:${project.id}`, await fingerprint(project));
      return { provider: 'codex', trusted, writes, autorun, token: issued.token, expiresAt: issued.expiresAt, notes };
    },

    async grantTrust(project, token) {
      requireCodex(rt);
      quotedPath(project);
      const shown = rt.tokens.consume(`codex:${project.id}`, token);
      if (!shown) throw new ProviderError('invalid-token', 'Предпросмотр устарел или уже использован', { hint: 'Откройте предпросмотр доверия заново.' });
      if (shown !== (await fingerprint(project))) {
        throw new ProviderError('preview-stale', 'Конфиг Codex или хуки папки изменились после предпросмотра', { hint: 'Откройте предпросмотр доверия заново.' });
      }
      if ((await trustLevel(project, true)).level === 'trusted') return { trusted: true, note: 'уже доверено', backup: backups.get(project.id) ?? null };
      const backup = await backupFile(paths.config, { backupsDir: context.dirs.backupsDir, now: context.now });
      backups.set(project.id, backup);
      await rt.withAppServer(context.homedir, (session) =>
        session.request('config/value/write', { keyPath: trustKeyPath(project.path), value: 'trusted', mergeStrategy: 'upsert' }));
      hookCache.delete(project.path);
      if ((await trustLevel(project, true)).level !== 'trusted') {
        throw new ProviderError('not-recorded', 'Codex не записал доверие в ~/.codex/config.toml', {
          hint: 'Проверьте файл вручную; копия до записи сохранена.',
          details: { backup },
        });
      }
      context.log(`codex: trusted ${project.path}`);
      return { trusted: true, backup };
    },

    async hooks(project) {
      if (context.platform === 'win32') return { kitHook: null, hooks: [], complete: null, note: 'Windows: недоступно (Q2)' };
      const local = await readLocalHooks(project.path);
      const { level } = await trustLevel(project);
      const trusted = level === 'trusted';
      if (local.text === null || !trusted || rt.program.installed === false) {
        const pendingNote = rt.program.installed === false ? 'codex не найден — хеши хуков неизвестны' : null;
        return buildHookState({ local, listed: null, trusted, pendingNote });
      }
      const stamp = await stampOf(project);
      let entry = hookCache.get(project.path);
      if (!entry || (entry.stamp !== stamp && !entry.read)) {
        const next: HookCacheEntry = { stamp, listed: entry?.listed ?? null, error: null, read: null };
        next.read = listHooks(project)
          .then((listed) => {
            next.listed = listed;
          })
          .catch((error: Error) => {
            next.listed = null;
            next.error = error.message;
          })
          .finally(() => {
            next.read = null;
          });
        hookCache.set(project.path, next);
        entry = next;
      }
      if (entry.read) await Promise.race([entry.read, new Promise((resolve) => setTimeout(resolve, HOOKS_WAIT_MS).unref())]);
      const fresh = entry.stamp === stamp && !entry.read;
      const pendingNote = entry.error ? `hooks/list: ${entry.error}` : fresh ? null : 'проверяется…';
      return buildHookState({ local, listed: entry.error ? null : entry.listed, trusted, pendingNote });
    },

    async approveHooks(project, expected) {
      requireCodex(rt);
      if (expected.command !== KIT_HOOK_COMMAND) {
        throw new ProviderError('not-kit-hook', 'Kit одобряет только свой хук с командой из шаблона', {
          status: 400,
          hint: 'Чужие хуки одобряйте в самом Codex, если доверяете им.',
        });
      }
      if ((await trustLevel(project, true)).level !== 'trusted') {
        throw new ProviderError('not-trusted', 'Папка не доверена Codex: хуки проекта не читаются', { hint: 'Сначала «Доверять» папке в Codex.' });
      }
      const listed = await listHooks(project);
      const kit = listed.filter((hook) => hook.command === KIT_HOOK_COMMAND);
      if (kit.length === 0) throw new ProviderError('kit-hook-missing', 'Codex не видит хук Kit в .codex/hooks.json', { hint: 'Установите структуру Kit (карточка «Структура»).' });
      const matching = kit.filter((hook) => hook.currentHash === expected.hash);
      if (matching.length === 0) {
        throw new ProviderError('hash-changed', 'Хеш хука Kit не совпадает с показанным', {
          hint: 'Обновите карточку и сверьте команду и хеш заново.',
          details: { current: kit.map((hook) => hook.currentHash) },
        });
      }
      // The user confirmed the SessionStart hash; the Stop and prompt hooks of the same structure
      // are approved with it when their commands are exactly the Kit templates.
      const others = listed.filter((hook) => hook.command !== KIT_HOOK_COMMAND && isExactKitCommand(hook.command));
      const pending = [...matching, ...others].filter((hook) => hook.trustStatus !== 'trusted');
      const local = await readLocalHooks(project.path);
      if (pending.length > 0) {
        // Approval keys start with the project path: the same quoting rule applies.
        quotedPath(project);
        const backup = await backupFile(paths.config, { backupsDir: context.dirs.backupsDir, now: context.now });
        backups.set(project.id, backup);
        await rt.withAppServer(project.path, async (session) => {
          for (const hook of pending) {
            await session.request('config/value/write', { keyPath: hookTrustKeyPath(hook.key), value: hook.currentHash, mergeStrategy: 'upsert' });
          }
        });
        const after = await listHooks(project);
        const missed = pending.filter((hook) => after.find((h) => h.key === hook.key)?.trustStatus !== 'trusted');
        hookCache.set(project.path, { stamp: await stampOf(project), listed: after, error: null, read: null });
        if (missed.length > 0) {
          throw new ProviderError('not-recorded', 'Codex не подтвердил одобрение хука', { hint: 'Проверьте ~/.codex/config.toml; копия до записи сохранена.', details: { backup } });
        }
        context.log(`codex: approved Kit hook ${pending.map((h) => h.key).join(', ')}`);
        return buildHookState({ local, listed: after, trusted: true });
      }
      hookCache.set(project.path, { stamp: await stampOf(project), listed, error: null, read: null });
      return buildHookState({ local, listed, trusted: true });
    },

    clearCache() {
      hookCache.clear();
    },
  };
  return parts;
}
