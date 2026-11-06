// wfk session title "<text>": the agent names its session once it understands the task (spec
// section 11). The service finds the project by the folder and the session by its running turn.
import os from 'node:os';
import { requestJson, serviceUrl } from './hook-service.ts';
import type { RequestJson } from './hook-service.ts';

export const SESSION_USAGE = 'Использование: wfk session title "<коротко о задаче>"\n';

export interface SessionCommandDeps {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  env: Readonly<Record<string, string | undefined>>;
  cwd: string;
  homedir?: string;
  platform?: NodeJS.Platform;
  request?: RequestJson;
}

/** Runs `wfk session …`; 0 on success, 1 on a refusal, 64 on bad usage. */
export async function runSessionCommand(args: readonly string[], deps: SessionCommandDeps): Promise<number> {
  const [sub, ...rest] = args;
  const title = rest.join(' ').trim();
  if (sub !== 'title' || title === '') {
    deps.stderr(SESSION_USAGE);
    return 64;
  }
  try {
    const base = await serviceUrl(deps.env, deps.homedir ?? os.homedir(), deps.platform ?? process.platform);
    const reply = await (deps.request ?? requestJson)(
      `${base}/api/sessions/title`,
      { title, cwd: deps.cwd, projectDir: deps.env['CLAUDE_PROJECT_DIR'] ?? null },
      10_000,
    );
    const body = (reply.body ?? {}) as { title?: { name?: string }; message?: string; error?: { message?: string } };
    if (reply.status < 300) {
      deps.stdout(`Имя сессии в Workflow Kit: ${body.title?.name ?? title}\n`);
      return 0;
    }
    deps.stderr(`wfk session title: ${body.error?.message ?? body.message ?? `HTTP ${reply.status}`}\n`);
    return 1;
  } catch (error) {
    deps.stderr(`wfk session title: служба Workflow Kit недоступна (${error instanceof Error ? error.message : String(error)})\n`);
    return 1;
  }
}
