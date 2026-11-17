// User decisions of a `decisions: host` project (spec M40 2.2, contract sections 3–5). The service
// records a decision in Kit itself, by a host operation with a one-time ticket: from a panel
// button (the card's request id and digest), from the user's delivered message of the current
// turn (`wfk decision <kind>`: the agent names only the meaning, the words are the service's own)
// or from the advance instruction of an autopilot run (source `grant`). The request is the one
// Kit registers for the manual form of the command; a project in the `agent` mode or on Kit 2.3.x
// gets null and keeps the old forms.
import type { TurnUserSource } from '#agent-channel';
import type { KitRunner } from '#kit-runner';
import type { KitChoiceOption, KitDecision, KitDecisionKind } from '#plan-view';
import { WorkflowActionError } from './autopilot-types.ts';
import type { DecisionJournal, DecisionRecord, DecisionSourceRecord } from './decision-journal.ts';
import type { HostOperation, HostTickets } from './host-ticket.ts';
import { hostInputDigest } from './host-ticket.ts';
import { realRoot } from './root-path.ts';
import { FINAL_PHASES } from './run-journal.ts';
import type { RunJournal } from './run-journal.ts';

/** Where the decision comes from. */
export type DecisionOrigin =
  /** A panel button; `requestId` is the id of the press (a double press repeats it). */
  | { kind: 'button'; requestId?: string | null; session?: string | null }
  /** `wfk decision` of the session `key`: the user's delivered message of its current turn. */
  | { kind: 'message'; key: string }
  /** The advance instruction of an autopilot run. */
  | { kind: 'grant'; runId: string };

export interface DecisionAsk {
  kind: KitDecisionKind;
  origin: DecisionOrigin;
  /** The words of a button press; a message decision takes the user's message instead. */
  note?: string;
  /** What the card showed (`status.decisions`): another id or digest is DECISION_STALE. */
  expected?: { id: string; inputDigest?: string | null } | null;
  /** `confirm-delivery`. */
  taskId?: string;
  /** `close`. */
  scopeId?: string;
  /** `choose`: the session is the raw session id. */
  choice?: { generation: number; option: KitChoiceOption; session: string; expectedDigest?: string | null };
}

const idOf = (key: string): string => key.slice(key.indexOf(':') + 1);

/** How a panel action or `wfk decision` names the user's decision. */
export interface DecisionBy {
  /** `wfk decision`: the key of the calling session, whose current turn the user's message began. */
  message?: string;
  /** The request the card showed (`status.decisions`). */
  expected?: { id: string; inputDigest?: string | null } | null;
  /** The id of the button press. */
  requestId?: string | null;
  /** `confirm-delivery`: the task the command names; another next task is refused. */
  taskId?: string;
}

export function originOf(session: string | undefined, by: DecisionBy | undefined): DecisionOrigin {
  if (by?.message) return { kind: 'message', key: by.message };
  return { kind: 'button', requestId: by?.requestId ?? null, session: session ? idOf(session) : null };
}

/** `runLive` of the decisions: the run still acts — not final, paused, blocked or revoked. */
export function runMayDecide(journal: Pick<RunJournal, 'read'>): (root: string, runId: string) => Promise<boolean> {
  return async (root, runId) => {
    const run = await journal.read(root, runId);
    return Boolean(run && !FINAL_PHASES.has(run.phase) && run.phase !== 'paused' && run.phase !== 'blocked' && !run.authority?.revocation);
  };
}

export interface DecisionDone {
  /** null when Kit ran the command without a user decision (a delivery the live grant covers). */
  decisionId: string | null;
  kind: KitDecisionKind;
  /** The decision was applied before: nothing was written again. */
  already: boolean;
  note: string;
  result: Record<string, unknown> | null;
}

export interface DecisionsDeps {
  runner: KitRunner;
  tickets: HostTickets;
  journal: DecisionJournal;
  /** The user's delivered message of the session's current turn (agent-channel `userSource`). */
  userSource(key: string): TurnUserSource | null;
  /** Whether the run may still decide: not paused, stopped or revoked (asked before the ticket). */
  runLive?(root: string, runId: string): Promise<boolean>;
  now?: () => Date;
  log?: (line: string) => void;
}

/** The longest note taken from a user's message. */
export const DECISION_NOTE_MAX = 500;
const RETRIES = 3;
/** Runner failures that say nothing about what Kit did. */
const UNKNOWN_OUTCOME: ReadonlySet<string> = new Set(['KIT_OUTPUT', 'KIT_SPAWN', 'KIT_TIMEOUT']);

export const DECISION_TEXTS = {
  button: 'Решение пользователя в панели Workflow Kit',
  grant: (runId: string) => `Автоматически, по предварительному поручению запуска ${runId}`,
  sourceMissing: 'Служба не видит сообщения пользователя, которым начат этот ход: решение не записано.',
  sourceNext: 'Решение остаётся за пользователем: кнопка на карточке в панели Workflow Kit.',
  sourceUsed: 'Это сообщение пользователя уже записано как другое решение: одно сообщение — одно решение.',
  stale: 'Данные решения изменились после показа карточки: решение не записано.',
  staleNext: 'Обновите панель и примите решение по новой карточке.',
  runNotLive: 'Запуск автопилота остановлен, на паузе или отозван: автоматическое решение не записано.',
} as const;

const fail = (code: string, message: string, nextAction: string | null = null, status = 409): never => {
  throw new WorkflowActionError(code, message, status, nextAction);
};

/** A Kit refusal as the refusal of the panel action, with its details (`paths` of DIRTY_TREE). */
function refusal(outcome: { code: string; message: string; nextAction: string | null; details?: unknown }): WorkflowActionError {
  const details = outcome.details && typeof outcome.details === 'object' && !Array.isArray(outcome.details) ? (outcome.details as Record<string, unknown>) : undefined;
  return new WorkflowActionError(outcome.code, outcome.message, 409, outcome.nextAction, details);
}

/** The Kit command whose manual form registers the request of `ask` (without host flags). */
function commandOf(ask: DecisionAsk): string[] {
  switch (ask.kind) {
    case 'accept':
      return ['accept'];
    case 'close':
      return ['close', '--scope', ask.scopeId ?? fail('bad-request', 'Нужен scope закрываемого плана', null, 400)];
    case 'unblock':
      return ['task:unblock'];
    case 'adopt-commits':
      return ['commits:adopt'];
    case 'confirm-delivery':
      return ['task:start', ask.taskId ?? fail('bad-request', 'Нужна задача поставки', null, 400)];
    case 'choose': {
      const choice = ask.choice ?? fail('bad-request', 'Нужны поколение предложения и способ выполнения', null, 400);
      return ['scope:choose', '--generation', String(choice.generation), '--option', choice.option, '--session', choice.session, ...(choice.expectedDigest ? ['--expected-digest', choice.expectedDigest] : [])];
    }
    default:
      // The request of an install is registered by the agent's own `quality:apply --input`.
      return ['quality:apply'];
  }
}

function isDecision(value: unknown): value is KitDecision {
  const v = value as Record<string, unknown> | null;
  return Boolean(v) && typeof v === 'object' && typeof v!['id'] === 'string' && typeof v!['inputDigest'] === 'string' && typeof v!['kind'] === 'string';
}

export function createDecisions(deps: DecisionsDeps) {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? (() => undefined);

  /** `host` only for a project whose Kit says so; an older Kit and the `agent` mode keep the old forms. */
  async function mode(root: string): Promise<'agent' | 'host'> {
    if (!deps.runner.installed(root)) return 'agent';
    const status = await deps.runner.status(root);
    return status.ok && status.result.decisionsMode === 'host' ? 'host' : 'agent';
  }

  function sourceOf(ask: DecisionAsk): { sourceId: string; source: DecisionSourceRecord; note: string } {
    const origin = ask.origin;
    const words = ask.note?.trim();
    const given = words && words.length >= 3 ? words.slice(0, DECISION_NOTE_MAX) : null;
    if (origin.kind === 'grant') return { sourceId: `grant:${origin.runId}`, source: { kind: 'grant', messageId: null, runId: origin.runId, session: null }, note: given ?? DECISION_TEXTS.grant(origin.runId) };
    if (origin.kind === 'button') {
      return { sourceId: `button:${origin.requestId ?? '-'}`, source: { kind: 'button', messageId: null, runId: null, session: origin.session ?? null }, note: given ?? DECISION_TEXTS.button };
    }
    const message = deps.userSource(origin.key) ?? fail('decision-source-missing', DECISION_TEXTS.sourceMissing, DECISION_TEXTS.sourceNext);
    return { sourceId: `message:${message.id}`, source: { kind: 'message', messageId: message.id, runId: null, session: idOf(origin.key) }, note: message.text.trim().slice(0, DECISION_NOTE_MAX) };
  }

  /** The request Kit registers for the manual form; `done` when Kit needed no decision. */
  async function request(root: string, ask: DecisionAsk, args: string[]): Promise<{ view: KitDecision } | { done: Record<string, unknown> | null }> {
    if (ask.kind === 'approve-install') {
      const status = await deps.runner.status(root);
      const pending = status.ok ? (status.result.decisions ?? []).filter((item) => item.kind === 'approve-install') : [];
      const view = pending.find((item) => item.id === ask.expected?.id) ?? (ask.expected ? undefined : pending.at(-1));
      return view ? { view } : fail('DECISION_STALE', DECISION_TEXTS.stale, DECISION_TEXTS.staleNext);
    }
    const outcome = await deps.runner.run<Record<string, unknown>>(root, args);
    if (outcome.ok) return { done: outcome.result };
    const view = outcome.code === 'USER_DECISION_REQUIRED' ? (outcome.details as { decision?: unknown } | null)?.decision : null;
    if (!isDecision(view)) throw refusal(outcome);
    return { view };
  }

  /** Applies an issued record by its host operation; Kit applies a decision id at most once. */
  async function finish(root: string, record: DecisionRecord): Promise<DecisionDone> {
    const { source } = record;
    let last = { code: 'KIT_UNAVAILABLE', message: 'Kit проекта не ответил' };
    for (let attempt = 0; attempt < RETRIES; attempt += 1) {
      if (source.kind === 'grant' && deps.runLive && !(await deps.runLive(root, source.runId!))) {
        await deps.journal.put(root, { ...record, state: 'failed', error: { code: 'run-not-live', message: DECISION_TEXTS.runNotLive } });
        return fail('run-not-live', DECISION_TEXTS.runNotLive);
      }
      const status = await deps.runner.run<{ revision: number; authorization?: { ownerSession?: string | null } | null }>(root, ['autopilot:status']);
      if (!status.ok) {
        last = { code: status.code, message: status.message };
        break;
      }
      const revision = status.result.revision;
      const verifier = deps.tickets.issue({
        decisionId: record.decisionId,
        expectedRevision: revision,
        inputDigest: hostInputDigest({ decision: record.inputDigest, note: record.note, source }),
        operation: record.args[0] as HostOperation,
        ownerSession: status.result.authorization?.ownerSession ?? null,
        root: realRoot(root),
        runId: source.runId,
        scopeId: record.scopeId ?? 'NONE',
      });
      // The host form names only the request: Kit applies what the request holds.
      const args = [
        record.args[0]!, '--decision', record.decisionId, '--source', source.kind, '--note', record.note, '--expected-revision', String(revision),
        ...(source.messageId ? ['--message-id', source.messageId] : []),
        ...(source.session ? ['--decision-session', source.session] : []),
        ...(source.runId ? ['--autopilot-run', source.runId] : []),
      ];
      const outcome = await deps.runner.runHost<{ already?: boolean; result?: Record<string, unknown> | null }>(root, args, verifier);
      if (outcome.ok) {
        const result = outcome.result?.result ?? null;
        await deps.journal.put(root, { ...record, state: 'applied', result, error: null });
        log(`decisions: ${record.kind} ${record.decisionId} applied (${record.sourceId})`);
        return { decisionId: record.decisionId, kind: record.kind, already: outcome.result?.already === true, note: record.note, result };
      }
      last = { code: outcome.code, message: outcome.message };
      // No answer of Kit (a timeout, a broken output): whether it applied the decision is unknown.
      // The record stays `issued` and the next request reconciles it by its decision id.
      if (UNKNOWN_OUTCOME.has(outcome.code)) throw refusal(outcome);
      if (outcome.code !== 'REVISION_MISMATCH') {
        await deps.journal.put(root, { ...record, state: 'failed', error: last });
        log(`decisions: ${record.kind} ${record.decisionId} refused: ${outcome.code}`);
        if (outcome.code === 'DECISION_STALE') return fail('DECISION_STALE', DECISION_TEXTS.stale, DECISION_TEXTS.staleNext);
        throw refusal(outcome);
      }
    }
    // The record stays `issued`: the next request with the same source reconciles it with Kit.
    return fail(last.code, last.message);
  }

  return {
    mode,

    /** Records the decision in Kit; null in the `agent` mode (the caller keeps the old form). */
    async apply(root: string, projectId: string, ask: DecisionAsk): Promise<DecisionDone | null> {
      if ((await mode(root)) !== 'host') return null;
      const { sourceId, source, note } = sourceOf(ask);
      // A run that was paused, stopped or revoked asks nothing of Kit: no request, no card.
      if (source.kind === 'grant' && deps.runLive && !(await deps.runLive(root, source.runId!))) fail('run-not-live', DECISION_TEXTS.runNotLive);
      const taskId = ask.taskId ?? null;
      const records = await deps.journal.list(root);
      const args = commandOf(ask);
      const same = (r: DecisionRecord): boolean => r.kind === ask.kind && r.taskId === taskId && r.args.join('\u0000') === args.join('\u0000');
      // One message — one decision: the same message never records another kind or target.
      if (source.kind === 'message' && records.some((r) => r.sourceId === sourceId && r.state !== 'failed' && !same(r))) {
        fail('decision-source-used', DECISION_TEXTS.sourceUsed, DECISION_TEXTS.sourceNext);
      }
      // A lost answer or a restart of the service: an issued record of the same command is
      // reconciled with Kit first (Kit applies a decision id at most once), whoever asks again.
      const open = records.find((r) => r.state === 'issued' && same(r));
      if (open) {
        try {
          return { ...(await finish(root, open)), already: true };
        } catch (error) {
          if ((error as { code?: string }).code !== 'DECISION_STALE') throw error;
        }
      }
      // A second press of the same card: its request is applied already, Kit is not called.
      const shown = ask.expected ? records.find((r) => r.state === 'applied' && r.kind === ask.kind && r.decisionId === ask.expected!.id) : undefined;
      if (shown) return { decisionId: shown.decisionId, kind: shown.kind, already: true, note: shown.note, result: shown.result };
      // A repeated command of the same message or run: the stored result, Kit is not called.
      const repeated = source.kind === 'button' ? undefined : records.find((r) => r.state === 'applied' && r.sourceId === sourceId && same(r));
      if (repeated) return { decisionId: repeated.decisionId, kind: repeated.kind, already: true, note: repeated.note, result: repeated.result };
      const asked = await request(root, ask, args);
      if ('done' in asked) return { decisionId: null, kind: ask.kind, already: false, note, result: asked.done };
      const { view } = asked;
      if (ask.expected && (ask.expected.id !== view.id || (ask.expected.inputDigest && ask.expected.inputDigest !== view.inputDigest))) {
        fail('DECISION_STALE', DECISION_TEXTS.stale, DECISION_TEXTS.staleNext);
      }
      const key = hostInputDigest({ inputDigest: view.inputDigest, kind: view.kind, projectId, scopeId: view.scopeId, sourceId, taskId: view.taskId });
      const known = records.find((r) => r.key === key);
      if (known?.state === 'applied') return { decisionId: known.decisionId, kind: known.kind, already: true, note: known.note, result: known.result };
      if (source.kind === 'message' && records.some((r) => r.sourceId === sourceId && r.state !== 'failed' && r.key !== key)) {
        fail('decision-source-used', DECISION_TEXTS.sourceUsed, DECISION_TEXTS.sourceNext);
      }
      const at = now().toISOString();
      const record = await deps.journal.put(root, {
        key, decisionId: view.id, kind: view.kind, scopeId: view.scopeId, taskId: view.taskId, inputDigest: view.inputDigest,
        sourceId, source, note, args, state: 'issued', result: null, error: null, at, updatedAt: at,
      });
      return finish(root, record);
    },
  };
}

export type Decisions = ReturnType<typeof createDecisions>;
