// Workspaces (folders known to Kimi) and the trust files of folders (spec M8, sections 2.4, 2.5).
import { createHash } from 'node:crypto';
import { readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { readJsonFile } from '#data-store';
import type { KimiClient } from './client.ts';
import { sameFolder } from './paths.ts';
import type { KimiPaths } from './paths.ts';
import { parseWorkspace, parseWorkspaces } from './shapes.ts';
import type { KimiWorkspace } from './shapes.ts';

/** realpath of a folder, or the folder itself when it cannot be resolved. */
export async function realFolder(folder: string): Promise<string> {
  return realpath(folder).catch(() => folder);
}

/** Key of POST /workspaces: the same folder never gets two workspaces from Kit. */
export function workspaceKey(real: string): string {
  return `workflow-kit:${createHash('sha256').update(real).digest('hex')}`;
}

/** The workspace of a folder among the known ones: most sessions first, then the smaller id. */
export function pickWorkspace(items: readonly KimiWorkspace[], folders: readonly string[], platform: NodeJS.Platform): KimiWorkspace | undefined {
  return items
    .filter((item) => folders.some((folder) => sameFolder(item.root, folder, platform)))
    .sort((a, b) => b.sessionCount - a.sessionCount || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
}

/** Workspaces of the server of Kit. */
export interface KimiWorkspaces {
  /** The workspace of the folder, or undefined. */
  find(client: KimiClient, folder: string): Promise<KimiWorkspace | undefined>;
  /** The workspace of the folder, created when there is none; calls at the same time share one request. */
  ensure(client: KimiClient, folder: string): Promise<KimiWorkspace>;
}

/** Creates the workspace helper. */
export function createKimiWorkspaces(platform: NodeJS.Platform): KimiWorkspaces {
  const inflight = new Map<string, Promise<KimiWorkspace>>();

  const find = async (client: KimiClient, folder: string): Promise<KimiWorkspace | undefined> =>
    pickWorkspace(parseWorkspaces(await client.get('/api/v1/workspaces')), [folder, await realFolder(folder)], platform);

  return {
    find,
    async ensure(client, folder) {
      const real = await realFolder(folder);
      const key = platform === 'win32' ? real.replace(/\\/g, '/').toLowerCase() : real;
      const running = inflight.get(key);
      if (running) return running;
      const work = (async (): Promise<KimiWorkspace> => {
        const known = await find(client, folder);
        if (known) return known;
        return parseWorkspace(await client.post('/api/v1/workspaces', { root: real, idempotency_key: workspaceKey(real) }));
      })().finally(() => inflight.delete(key));
      inflight.set(key, work);
      return work;
    },
  };
}

/** True when a file of <home>/workspace-trust names the folder (or its realpath). */
export async function folderTrusted(paths: KimiPaths, folder: string, platform: NodeJS.Platform): Promise<boolean> {
  const names = await readdir(paths.trustDir).catch(() => [] as string[]);
  if (names.length === 0) return false;
  const folders = [folder, await realFolder(folder)];
  for (const name of names) {
    const data = await readJsonFile(path.join(paths.trustDir, name)).catch(() => undefined);
    const root = typeof data === 'object' && data !== null ? (data as Record<string, unknown>)['root'] : undefined;
    if (typeof root === 'string' && folders.some((item) => sameFolder(root, item, platform))) return true;
  }
  return false;
}
