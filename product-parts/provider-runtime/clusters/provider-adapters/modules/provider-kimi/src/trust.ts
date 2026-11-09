// Trust of a project folder in Kimi (spec M8, section 2.5): read from the files of
// <home>/workspace-trust only, written by the server of Kimi and read back from the file.
import { createHash } from 'node:crypto';
import { ProviderError } from '#provider-registry';
import type { Project, TokenStore, TrustPreview, TrustState, TrustWrite } from '#provider-registry';
import type { KimiClient } from './client.ts';
import { describeKimiError, KimiError } from './client.ts';
import { pathApi } from './paths.ts';
import type { KimiPaths } from './paths.ts';
import { parseTrusted } from './shapes.ts';
import { folderTrusted } from './workspace.ts';
import type { KimiWorkspaces } from './workspace.ts';

/** Trust methods of the provider. */
export interface KimiTrustParts {
  trust(project: Project): Promise<TrustState>;
  previewTrust(project: Project): Promise<TrustPreview>;
  grantTrust(project: Project, token: string): Promise<TrustState>;
}

/** What the trust methods need from the provider. */
export interface KimiTrustDeps {
  platform: NodeJS.Platform;
  paths: KimiPaths;
  tokens: TokenStore;
  workspaces: KimiWorkspaces;
  /** Client of the running server, or null; never starts one. */
  current(): Promise<KimiClient | null>;
  /** Client of a ready provider; throws a ProviderError with the status note otherwise. */
  requireReady(): Promise<KimiClient>;
  /** Throws when the program is missing or too old. */
  requireProgram(): void;
  /** Why the provider is not ready now, or null. */
  notReady(): string | null;
  version(): string | null;
  log(line: string): void;
}

const STALE_HINT = 'Откройте предпросмотр доверия заново.';

/** Creates the trust methods. */
export function createKimiTrust(deps: KimiTrustDeps): KimiTrustParts {
  const { paths, platform } = deps;
  const trusted = (project: Project): Promise<boolean> => folderTrusted(paths, project.path, platform);
  const fingerprint = (project: Project, isTrusted: boolean): string => createHash('sha256').update(JSON.stringify({ path: project.path, trusted: isTrusted })).digest('hex');

  return {
    async trust(project) {
      return { trusted: await trusted(project) };
    },

    async previewTrust(project) {
      deps.requireProgram();
      const isTrusted = await trusted(project);
      const writes: TrustWrite[] = [];
      const notes = ['Обе записи делает сам сервер Kimi; после записи доверие читается из файла.', 'Проектных хуков у Kimi нет: доверие папке ничего не запускает само.'];
      if (!isTrusted) {
        const client = await deps.current();
        let workspace: 'known' | 'missing' | 'unchecked' = 'unchecked';
        if (client) {
          workspace = await deps.workspaces.find(client, project.path).then(
            (found) => (found ? 'known' : 'missing'),
            () => 'unchecked' as const,
          );
        }
        if (workspace !== 'known') {
          writes.push({
            file: pathApi(platform).join(paths.home, 'projects.json'),
            description: workspace === 'missing' ? 'Kimi создаст рабочую область этой папки' : 'Kimi создаст рабочую область этой папки, если её ещё нет',
          });
        }
        writes.push({ file: paths.trustDir, description: 'Kimi запишет файл доверия этой папке: агент сможет работать в ней без вопроса о доверии' });
        const reason = deps.notReady();
        if (reason) notes.push(`Сейчас Kimi не готов: ${reason}.`);
      }
      const issued = deps.tokens.issue(`kimi:${project.id}`, fingerprint(project, isTrusted));
      return { provider: 'kimi', trusted: isTrusted, writes, autorun: [], token: issued.token, expiresAt: issued.expiresAt, notes };
    },

    async grantTrust(project, token) {
      deps.requireProgram();
      const shown = deps.tokens.consume(`kimi:${project.id}`, token);
      if (!shown) throw new ProviderError('invalid-token', 'Предпросмотр устарел или уже использован', { hint: STALE_HINT });
      const before = await trusted(project);
      if (shown !== fingerprint(project, before)) throw new ProviderError('preview-stale', 'Доверие Kimi этой папке изменилось после предпросмотра', { hint: STALE_HINT });
      if (before) return { trusted: true, note: 'уже доверено' };
      const client = await deps.requireReady();
      try {
        const workspace = await deps.workspaces.ensure(client, project.path);
        parseTrusted(await client.post(`/api/v1/workspaces/${encodeURIComponent(workspace.id)}/trust`, {}));
      } catch (error) {
        if (!(error instanceof KimiError)) throw error;
        throw new ProviderError('kimi-trust', `Kimi не записал доверие: ${describeKimiError(error, deps.version())}`, { hint: 'Нажмите «Перепроверить» и повторите.' });
      }
      if (!(await trusted(project))) {
        throw new ProviderError('not-recorded', 'Kimi не записал доверие папке в workspace-trust', { hint: 'Откройте папку в Kimi Code и подтвердите доверие там.' });
      }
      deps.log(`kimi: trusted ${project.path}`);
      return { trusted: true };
    },
  };
}
