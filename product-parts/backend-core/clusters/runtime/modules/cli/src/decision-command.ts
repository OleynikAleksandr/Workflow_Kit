// wfk decision <kind> (spec M40 2.2): the agent tells Workflow Kit only the meaning of what the
// user wrote in the chat — «the user accepts the result», «the user confirms the delivery». The
// service records the decision in Kit by a host operation and takes the note from the user's
// delivered message of the current turn; the agent passes no quote, so the command has no flag
// for the user's words. The session is found like `wfk session plan`.
import os from 'node:os';
import { requestJson, serviceUrl } from './hook-service.ts';
import type { SessionCommandDeps } from './session-command.ts';
import { callingSession, candidateLines } from './session-command.ts';

export const DECISION_KINDS = ['accept', 'adopt-commits', 'approve-install', 'choose', 'close', 'confirm-delivery', 'unblock'] as const;

export const DECISION_USAGE =
  `Использование: wfk decision ${DECISION_KINDS.join('|')} [--task <ID>] [--option sequential|orchestrated|refine]\n` +
  '  Сообщает Workflow Kit решение, которое пользователь принял в чате в этом ходе; слова пользователя Kit берёт сам.\n' +
  '  --task: задача поставки для confirm-delivery; --option: способ выполнения для choose\n' +
  '  Сессию можно назвать явно: --client <id провайдера> --session <id сессии>\n';

type Flags = { client?: string; sessionId?: string; task?: string; option?: string };

/** Splits the flags from the kind; null on an unknown flag, a flag without a value or extra words. */
export function decisionFlags(args: readonly string[]): ({ kind: string } & Flags) | null {
  const words: string[] = [];
  const flags: Flags = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    const match = /^--(client|session|task|option)(?:=(.*))?$/.exec(arg);
    if (!match) {
      if (arg.startsWith('--')) return null;
      words.push(arg);
      continue;
    }
    const value = match[2] ?? args[(i += 1)];
    if (value === undefined || value === '') return null;
    if (match[1] === 'session') flags.sessionId = value;
    else flags[match[1] as 'client' | 'task' | 'option'] = value;
  }
  return words.length === 1 ? { kind: words[0]!, ...flags } : null;
}

/** Runs `wfk decision …`; 0 when the decision is recorded, 1 on a refusal, 64 on bad usage. */
export async function runDecisionCommand(args: readonly string[], deps: SessionCommandDeps): Promise<number> {
  const parsed = decisionFlags(args);
  const known = parsed !== null && (DECISION_KINDS as readonly string[]).includes(parsed.kind);
  if (!parsed || !known || (parsed.client === undefined) !== (parsed.sessionId === undefined) || (parsed.kind === 'choose') !== (parsed.option !== undefined) || (parsed.task !== undefined && parsed.kind !== 'confirm-delivery')) {
    deps.stderr(DECISION_USAGE);
    return 64;
  }
  const session = parsed.client !== undefined ? { client: parsed.client, sessionId: parsed.sessionId } : callingSession(deps.env);
  const body = {
    kind: parsed.kind,
    ...(parsed.task ? { task: parsed.task } : {}),
    ...(parsed.option ? { option: parsed.option } : {}),
    cwd: deps.cwd,
    projectDir: deps.env['CLAUDE_PROJECT_DIR'] ?? null,
    ...session,
  };
  try {
    const base = await serviceUrl(deps.env, deps.homedir ?? os.homedir(), deps.platform ?? process.platform);
    // A host operation runs the Kit of the project: it may take longer than a plain request.
    const reply = await (deps.request ?? requestJson)(`${base}/api/sessions/decision`, body, 120_000);
    const answer = (reply.body ?? {}) as { kind?: string; decisionId?: string | null; already?: boolean; text?: string; error?: { code?: string; message?: string; nextAction?: string; candidates?: unknown } };
    if (reply.status < 300) {
      deps.stdout(`decision: ${answer.kind ?? parsed.kind}\nrecorded: ${answer.already ? 'already' : 'yes'}\ndecisionId: ${answer.decisionId ?? 'none'}\n${answer.text ?? ''}\n`);
      return 0;
    }
    deps.stderr(`wfk decision ${parsed.kind}: ${answer.error?.message ?? `HTTP ${reply.status}`}\n`);
    if (answer.error?.code) deps.stderr(`code: ${answer.error.code}\n`);
    if (answer.error?.code === 'session-ambiguous') deps.stderr(candidateLines(answer.error.candidates));
    if (answer.error?.nextAction) deps.stderr(`${answer.error.nextAction}\n`);
    return 1;
  } catch (error) {
    deps.stderr(`wfk decision ${parsed.kind}: служба Workflow Kit недоступна (${error instanceof Error ? error.message : String(error)})\n`);
    return 1;
  }
}
