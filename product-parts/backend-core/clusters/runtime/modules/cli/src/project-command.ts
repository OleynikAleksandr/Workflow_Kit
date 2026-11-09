// wfk project publish: publishes the project of the current folder to its git upstream through the
// service (spec publication-order, section 3.3). The service refuses while a scope is open.
import { realpath } from 'node:fs/promises';
import os from 'node:os';
import { isInside } from '#project-registry';
import { requestJson, serviceUrl } from './hook-service.ts';
import type { RequestJson } from './hook-service.ts';

export const PROJECT_USAGE = 'Использование: wfk project publish\n';

export type GetJson = (url: string) => Promise<unknown>;

export interface ProjectCommandDeps {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  env: Readonly<Record<string, string | undefined>>;
  cwd: string;
  homedir?: string;
  platform?: NodeJS.Platform;
  request?: RequestJson;
  getJson?: GetJson;
}

const getJson: GetJson = async (url) => (await fetch(url, { cache: 'no-store' })).json();

/** The deepest registered project that contains the folder. */
export function projectOfFolder(projects: Array<{ id: string; path: string; archivedAt?: string }>, folders: string[], platform: NodeJS.Platform): { id: string; path: string } | null {
  return (
    projects
      .filter((p) => !p.archivedAt && folders.some((folder) => isInside(folder, p.path, platform, true)))
      .sort((a, b) => b.path.length - a.path.length)[0] ?? null
  );
}

/** Runs `wfk project …`; 0 on success, 1 on a refusal, 64 on bad usage. */
export async function runProjectCommand(args: readonly string[], deps: ProjectCommandDeps): Promise<number> {
  if (args[0] !== 'publish' || args.length !== 1) {
    deps.stderr(PROJECT_USAGE);
    return 64;
  }
  const platform = deps.platform ?? process.platform;
  try {
    const base = await serviceUrl(deps.env, deps.homedir ?? os.homedir(), platform);
    const list = ((await (deps.getJson ?? getJson)(`${base}/api/projects`)) as { projects?: Array<{ id: string; path: string; archivedAt?: string }> }).projects ?? [];
    const folders = [deps.cwd, await realpath(deps.cwd).catch(() => deps.cwd)];
    const project = projectOfFolder(list, folders, platform);
    if (!project) {
      deps.stderr('wfk project publish: эта папка не входит ни в один проект Workflow Kit\n');
      return 1;
    }
    const reply = await (deps.request ?? requestJson)(`${base}/api/projects/${encodeURIComponent(project.id)}/publish`, {}, 120_000);
    const body = (reply.body ?? {}) as { commits?: number; sha?: string; error?: { message?: string; details?: { output?: string } } };
    if (reply.status < 300) {
      deps.stdout(`Опубликовано: коммитов ${body.commits ?? 0}, ${String(body.sha ?? '').slice(0, 7)}\n`);
      return 0;
    }
    const output = body.error?.details?.output;
    deps.stderr(`wfk project publish: ${body.error?.message ?? `HTTP ${reply.status}`}\n${output ? `${output}\n` : ''}`);
    return 1;
  } catch (error) {
    deps.stderr(`wfk project publish: служба Workflow Kit недоступна (${error instanceof Error ? error.message : String(error)})\n`);
    return 1;
  }
}
