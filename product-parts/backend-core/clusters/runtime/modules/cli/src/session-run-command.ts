// The agent's commands of an autopiloting run (spec M39 runtime 5, T007):
// `wfk session progress --input <file.json>` reports a wait for CI of a pushed SHA (runId,
// actionId, stage, targetSha, ciPolicyDigest, waitReason) — a wait, never a CI result;
// `wfk session run pause|stop` pauses or stops the run of the calling session when the user
// asked for it in the chat. The session is found like `wfk session plan`.
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { requestJson, serviceUrl } from './hook-service.ts';
import type { SessionCommandDeps } from './session-command.ts';
import { callingSession, candidateLines, sessionFlags } from './session-command.ts';

export const RUN_USAGE =
  'Использование: wfk session progress --input <файл.json> | wfk session run pause|stop\n' +
  '  progress: { "runId", "actionId", "stage": "pushed|waiting", "targetSha", "ciPolicyDigest", "waitReason" } — ожидание CI, не его результат\n' +
  '  Сессию можно назвать явно: --client <id провайдера> --session <id сессии>\n';

/** Splits `--input <file>` (also `--input=<file>`) from the arguments; null on a flag without a value. */
export function inputFlag(args: readonly string[]): { input: string | null; rest: string[] } | null {
  const rest: string[] = [];
  let input: string | null = null;
  for (let i = 0; i < args.length; i += 1) {
    const match = /^--input(?:=(.*))?$/.exec(args[i]!);
    if (!match) {
      rest.push(args[i]!);
      continue;
    }
    const value = match[1] ?? args[(i += 1)];
    if (!value) return null;
    input = value;
  }
  return { input, rest };
}

export async function runSessionRunCommand(sub: 'progress' | 'run', args: readonly string[], deps: SessionCommandDeps): Promise<number> {
  const split = inputFlag(args);
  const parsed = split ? sessionFlags(split.rest) : null;
  const usage = (): number => (deps.stderr(RUN_USAGE), 64);
  if (!split || !parsed || (parsed.client === undefined) !== (parsed.sessionId === undefined)) return usage();
  let body: Record<string, unknown>;
  if (sub === 'progress') {
    if (!split.input || parsed.text !== '') return usage();
    try {
      body = { progress: JSON.parse(await readFile(path.resolve(deps.cwd, split.input), 'utf8')) as unknown };
    } catch (error) {
      deps.stderr(`wfk session progress: файл ${split.input} не читается как JSON (${error instanceof Error ? error.message : String(error)})\n`);
      return 1;
    }
  } else {
    if (split.input || (parsed.text !== 'pause' && parsed.text !== 'stop')) return usage();
    body = { action: parsed.text };
  }
  const session = parsed.client !== undefined ? { client: parsed.client, sessionId: parsed.sessionId } : callingSession(deps.env);
  const where = { cwd: deps.cwd, projectDir: deps.env['CLAUDE_PROJECT_DIR'] ?? null, ...session };
  try {
    const base = await serviceUrl(deps.env, deps.homedir ?? os.homedir(), deps.platform ?? process.platform);
    const reply = await (deps.request ?? requestJson)(`${base}/api/sessions/${sub}`, { ...body, ...where }, 10_000);
    const answer = (reply.body ?? {}) as { runId?: string; phase?: string; note?: string; error?: { code?: string; message?: string; nextAction?: string; candidates?: unknown } };
    if (reply.status < 300) {
      deps.stdout(sub === 'progress' ? `recorded: wait for CI (run ${answer.runId ?? '?'})\n${answer.note ?? ''}\n` : `run ${answer.runId ?? '?'}: ${answer.phase ?? '?'}\n`);
      return 0;
    }
    deps.stderr(`wfk session ${sub}: ${answer.error?.message ?? `HTTP ${reply.status}`}\n`);
    if (answer.error?.code === 'session-ambiguous') deps.stderr(candidateLines(answer.error.candidates));
    if (answer.error?.nextAction) deps.stderr(`${answer.error.nextAction}\n`);
    return 1;
  } catch (error) {
    deps.stderr(`wfk session ${sub}: служба Workflow Kit недоступна (${error instanceof Error ? error.message : String(error)})\n`);
    return 1;
  }
}
