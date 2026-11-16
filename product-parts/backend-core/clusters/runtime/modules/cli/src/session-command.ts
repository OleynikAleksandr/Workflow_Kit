// wfk session title "<text>": the agent names its session once it understands the task (spec
// section 11). wfk session plan "<text>": the agent asks the user whether a development task gets
// a specification and a plan (spec M4 section 12). The service finds the project by the folder and
// the session by --client <id> --session <id>, else by the agent's id from the environment, else
// by the only running turn of the project (spec M8 section 5); it never guesses between several.
import os from 'node:os';
import { requestJson, serviceUrl } from './hook-service.ts';
import type { RequestJson } from './hook-service.ts';
import { SESSION_ENV } from './provider-list.ts';
import { runSessionRunCommand } from './session-run-command.ts';

export const SESSION_USAGE =
  'Использование: wfk session title "<коротко о задаче>" | wfk session plan "<что собираемся сделать>" [--authorized "<точные слова пользователя>"]\n' +
  '  Сессию можно назвать явно: --client <id провайдера> --session <id сессии>\n' +
  '  --authorized: пользователь прямо поручил составить спецификацию и план (M39); без вопроса в панели\n' +
  '  wfk session progress --input <файл.json> | wfk session run pause|stop — запуск автопилота (M39)\n';

/** What the agent reads after `wfk session plan`. */
export const PLAN_ASKED = 'Вопрос о спецификации и плане показан пользователю в панели Workflow Kit. Закончи ход, ничего не создавая: ответ придёт сообщением «Workflow Kit:».\n';

export interface SessionCommandDeps {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  env: Readonly<Record<string, string | undefined>>;
  cwd: string;
  homedir?: string;
  platform?: NodeJS.Platform;
  request?: RequestJson;
}

/**
 * The session that runs the command: an agent that leaves its session id in the environment of
 * every command it runs (the SESSION_ENV table) is found by it.
 */
export function callingSession(env: Readonly<Record<string, string | undefined>>): { client?: string; sessionId?: string } {
  for (const { client, variable } of SESSION_ENV) {
    const sessionId = env[variable];
    if (sessionId) return { client, sessionId };
  }
  return {};
}

/**
 * Splits `--client <id>`, `--session <id>` and `--authorized <words>` (also `--name=value`) from
 * the text; null on a flag without a value.
 */
export function sessionFlags(args: readonly string[]): { text: string; client?: string; sessionId?: string; authorized?: string } | null {
  const words: string[] = [];
  const flags: { client?: string; sessionId?: string; authorized?: string } = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    const match = /^--(client|session|authorized)(?:=(.*))?$/.exec(arg);
    if (!match) {
      words.push(arg);
      continue;
    }
    const value = match[2] ?? args[(i += 1)];
    if (value === undefined || value === '') return null;
    if (match[1] === 'client') flags.client = value;
    else if (match[1] === 'authorized') flags.authorized = value;
    else flags.sessionId = value;
  }
  return { text: words.join(' ').trim(), ...flags };
}

/** What the agent reads after `wfk session plan --authorized` (M39): the run and its instruction. */
export function preparedText(body: { instruction?: string; runId?: string | null; policy?: string }): string {
  return `action: prepare\nrunId: ${body.runId ?? 'none'}\npolicy: ${body.policy ?? 'unknown'}\n${body.instruction ?? ''}\n`;
}

interface Candidate {
  client?: unknown;
  session?: unknown;
  state?: unknown;
  name?: unknown;
}

/** The sessions the service could not choose between, one per line with the flags that name it. */
export function candidateLines(candidates: unknown): string {
  if (!Array.isArray(candidates)) return '';
  return (candidates as Candidate[])
    .filter((c) => typeof c?.client === 'string' && typeof c?.session === 'string')
    .map((c) => `  --client ${String(c.client)} --session ${String(c.session)}  (${String(c.state ?? '?')}${c.name ? `, «${String(c.name)}»` : ''})\n`)
    .join('');
}

/** Runs `wfk session …`; 0 on success, 1 on a refusal, 64 on bad usage. */
export async function runSessionCommand(args: readonly string[], deps: SessionCommandDeps): Promise<number> {
  const [sub, ...rest] = args;
  if (sub === 'progress' || sub === 'run') return runSessionRunCommand(sub, rest, deps);
  const parsed = sessionFlags(rest);
  const text = parsed?.text ?? '';
  // A named session takes both flags; one of them alone is a usage error.
  const misplaced = sub !== 'plan' && parsed?.authorized !== undefined;
  if ((sub !== 'title' && sub !== 'plan') || !parsed || text === '' || misplaced || (parsed.client === undefined) !== (parsed.sessionId === undefined)) {
    deps.stderr(SESSION_USAGE);
    return 64;
  }
  const session = parsed.client !== undefined ? { client: parsed.client, sessionId: parsed.sessionId } : callingSession(deps.env);
  const where = { cwd: deps.cwd, projectDir: deps.env['CLAUDE_PROJECT_DIR'] ?? null, ...session };
  try {
    const base = await serviceUrl(deps.env, deps.homedir ?? os.homedir(), deps.platform ?? process.platform);
    const reply = await (deps.request ?? requestJson)(
      `${base}/api/sessions/${sub}`,
      sub === 'title' ? { title: text, ...where } : { summary: text, ...where, ...(parsed.authorized !== undefined ? { authorized: parsed.authorized } : {}) },
      10_000,
    );
    const body = (reply.body ?? {}) as { title?: { name?: string }; message?: string; instruction?: string; runId?: string | null; policy?: string; error?: { code?: string; message?: string; nextAction?: string; candidates?: unknown } };
    if (reply.status < 300 && parsed.authorized !== undefined) {
      deps.stdout(preparedText(body));
      return 0;
    }
    if (reply.status < 300) {
      deps.stdout(sub === 'title' ? `Имя сессии в Workflow Kit: ${body.title?.name ?? text}\n` : PLAN_ASKED);
      return 0;
    }
    deps.stderr(`wfk session ${sub}: ${body.error?.message ?? body.message ?? `HTTP ${reply.status}`}\n`);
    if (body.error?.code === 'session-ambiguous') deps.stderr(candidateLines(body.error.candidates));
    if (body.error?.nextAction) deps.stderr(`${body.error.nextAction}\n`);
    return 1;
  } catch (error) {
    deps.stderr(`wfk session ${sub}: служба Workflow Kit недоступна (${error instanceof Error ? error.message : String(error)})\n`);
    return 1;
  }
}
