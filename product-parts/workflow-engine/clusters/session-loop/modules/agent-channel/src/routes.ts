// HTTP side of the channel: POST /api/hooks/stop, /api/hooks/prompt, /api/hooks/turn-end and
// /api/hooks/question (spec M33, loopback only),
// POST /api/projects/:id/sessions/:sid/message (a message from the panel: direct or queued; 409 for a
// session out of the Kit process) and the "channel" section of /api/state.
import { HttpError, classifyAddress } from '#http-server';
import type { Router, StateRegistry } from '#http-server';
import type { QuestionHookReply, QuestionHookRequest } from '#provider-registry';
import { TURN_END_EVENTS, USER_MESSAGE_SOURCE } from './types.ts';
import type { AgentChannel, HookReply, QueuedMessage, TurnEndEvent } from './types.ts';
import { parseHookInput, sessionStartAnswer } from './hook-input.ts';
import type { HookDialects, HookInput } from './hook-input.ts';

export interface ChannelRoutesOptions {
  router: Router;
  state: StateRegistry;
  channel: AgentChannel;
  /** Where panel messages are queued (the service passes a channel that also wakes the session). */
  messages?: Pick<AgentChannel, 'enqueue' | 'get'>;
  /**
   * Whether a session the channel has not seen belongs to the project (the provider lists it):
   * after a restart of the service its agent has not run a hook yet.
   */
  owns?: (projectId: string, key: string) => Promise<boolean>;
  /** Hook clients by the provider registry; a hook of an unknown client is refused (400). */
  dialects?: HookDialects;
  /**
   * Hands a checked panel message to the agent at once as a user's message; true means the
   * provider took it and nothing is queued. False, an error or no option keeps the queue path.
   */
  /**
   * True: delivered; 'unconfirmed': pasted, but no prompt hook took it (M45); `{ refused }`: the
   * terminal is not free, not pasted (M46) — both answer undelivered and queue nothing; false: queue it.
   */
  direct?: (projectId: string, key: string, text: string) => Promise<DirectAnswer>;
  /**
   * M40: a checked panel message of the user, as the service receives it — before it is given
   * to the agent or queued behind a running turn. The service reads the user's «стоп» and
   * «пауза» for an autopilot run here; a failure never loses the message.
   */
  onUserMessage?: (projectId: string, key: string, text: string) => Promise<void>;
  interrupt?: (projectId: string, key: string, body: unknown) => Promise<unknown>;
  interruptions?: () => Promise<Record<string, unknown>>;
  /**
   * M44: the one line about the autopilot a new session gets in its context (wfk hook
   * session-start); without it the route is not registered.
   */
  sessionStart?: (input: HookInput) => Promise<string>;
  /** Holds a question hook request (wfk hook question); without it the route is not registered. */
  question?: (request: QuestionHookRequest, signal: AbortSignal) => Promise<QuestionHookReply>;
}

const WAITER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The question hook request of a body { client, input, projectDir, panelProcess, waiterId }; null when unusable. */
export function questionHookRequest(body: unknown, dialects?: HookDialects): QuestionHookRequest | null {
  const raw = hookBody(body);
  const waiterId = (body as Record<string, unknown>)['waiterId'];
  const input = parseHookInput(raw.client, raw.input, raw.projectDir, dialects, raw.panelProcess);
  if (!input || typeof waiterId !== 'string' || !WAITER_ID.test(waiterId)) return null;
  const value = raw.input as Record<string, unknown>;
  const toolName = typeof value['tool_name'] === 'string' ? value['tool_name'] : null;
  return { client: input.client, sessionId: input.sessionId, transcriptPath: input.transcriptPath, cwd: input.cwd, projectDir: input.projectDir, waiterId, toolName, toolInput: value['tool_input'] ?? null };
}

/** Longest panel message, in characters (a task from the panel can be long). */
export const MESSAGE_MAX_CHARS = 20_000;

/**
 * Checks a message from the panel for a session of the project and returns its clean text. The
 * session must be known to the channel (it ran a hook) and belong to the project, or be owned by
 * the project as the provider lists it (owned); the text is non-empty and not too long.
 */
export function checkSessionMessage(
  channel: Pick<AgentChannel, 'get'>,
  projectId: string,
  key: string,
  text: unknown,
  owned = false,
): string {
  const clean = typeof text === 'string' ? text.trim() : '';
  if (!clean) throw new HttpError(400, 'empty-message', 'Напишите сообщение агенту');
  if (clean.length > MESSAGE_MAX_CHARS) throw new HttpError(400, 'message-too-long', `Сообщение длиннее ${MESSAGE_MAX_CHARS} символов`);
  const activity = channel.get(key);
  const known = activity ? activity.projectId === projectId || (owned && activity.projectId === null) : owned;
  if (!known) {
    throw new HttpError(404, 'unknown-session', 'Сессия не найдена', { hint: 'Агент этой сессии ещё не отвечал панели: дождитесь его первого ответа.' });
  }
  return clean;
}

/** Queues a message from the panel for a session of the project after checkSessionMessage. */
export function queueSessionMessage(
  channel: Pick<AgentChannel, 'enqueue' | 'get'>,
  projectId: string,
  key: string,
  text: unknown,
  owned = false,
): QueuedMessage {
  const clean = checkSessionMessage(channel, projectId, key, text, owned);
  return channel.enqueue(key, clean, USER_MESSAGE_SOURCE, projectId);
}

/** M45: the reason the panel shows for a pasted message Claude did not take. */
export const UNDELIVERED_REASON = 'Claude не начал ход с этим сообщением: терминал занят или в нём открыт диалог';

/** An answer of the direct path: delivered, pasted without a turn, refused with a reason, or queue it. */
export type DirectAnswer = boolean | 'unconfirmed' | { refused: string };

/** A thrown error or an unknown answer counts as false (the message is queued). */
async function sendDirect(direct: ChannelRoutesOptions['direct'], projectId: string, key: string, text: string): Promise<DirectAnswer> {
  if (!direct) return false;
  try {
    const result = await direct(projectId, key, text);
    if (typeof result === 'object' && result !== null && typeof result.refused === 'string') return { refused: result.refused };
    return result === true || result === 'unconfirmed' ? result : false;
  } catch {
    return false;
  }
}

function hookBody(body: unknown): { client: unknown; input: unknown; projectDir: unknown; panelProcess: unknown } {
  if (typeof body !== 'object' || body === null) throw new HttpError(400, 'bad-request', 'Ожидается { client, input }');
  const value = body as Record<string, unknown>;
  return { client: value['client'], input: value['input'], projectDir: value['projectDir'], panelProcess: value['panelProcess'] };
}

/** Sends the reply and confirms the delivery only when the answer left the server. */
function send(res: import('node:http').ServerResponse, reply: HookReply): void {
  const text = JSON.stringify({ answer: reply.answer });
  let finished = false;
  res.once('finish', () => {
    finished = true;
    reply.ack();
  });
  res.once('close', () => {
    if (!finished) reply.nack();
  });
  if (res.destroyed || res.writableEnded) {
    reply.nack();
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(text);
}

const LOOPBACK_ONLY = 'Хуки принимаются только с этого компьютера';

export function registerChannelRoutes(options: ChannelRoutesOptions): void {
  const { router, channel } = options;
  // The hook that cannot be held only tells the turn ended; the answer does not wait for the work.
  router.post('/api/hooks/turn-end', async ({ body, req }) => {
    if (classifyAddress(req.socket.remoteAddress) !== 'loopback') throw new HttpError(403, 'loopback-only', LOOPBACK_ONLY);
    const value = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    const { client, sessionId, cwd, event } = value;
    const known = typeof client === 'string' && typeof sessionId === 'string' && sessionId !== '' && TURN_END_EVENTS.includes(event as TurnEndEvent);
    const panelProcess = value['panelProcess'] === true;
    const taken = known && (await channel.turnEnd({ client, sessionId, cwd: typeof cwd === 'string' && cwd !== '' ? cwd : null, event: event as TurnEndEvent, panelProcess }));
    if (!taken) throw new HttpError(400, 'bad-hook-input', 'Неизвестный client, событие или нет sessionId во входе хука');
    return { ok: true };
  });
  for (const event of ['stop', 'prompt'] as const) {
    router.post(`/api/hooks/${event}`, async ({ body, req, res }) => {
      if (classifyAddress(req.socket.remoteAddress) !== 'loopback') throw new HttpError(403, 'loopback-only', LOOPBACK_ONLY);
      const raw = hookBody(body);
      const input = parseHookInput(raw.client, raw.input, raw.projectDir, options.dialects, raw.panelProcess);
      if (!input) throw new HttpError(400, 'bad-hook-input', 'Неизвестный client или нет session_id во входе хука');
      const aborted = new AbortController();
      res.once('close', () => aborted.abort());
      const reply = event === 'stop' ? await channel.stop(input, aborted.signal) : await channel.prompt(input);
      send(res, reply);
      return undefined;
    });
  }
  if (options.sessionStart) {
    const sessionStart = options.sessionStart;
    // M44: answers at once (the hook has 1.5 s in all); the answer is in the client's dialect.
    router.post('/api/hooks/session-start', async ({ body, req }) => {
      if (classifyAddress(req.socket.remoteAddress) !== 'loopback') throw new HttpError(403, 'loopback-only', LOOPBACK_ONLY);
      const raw = hookBody(body);
      const input = parseHookInput(raw.client, raw.input, raw.projectDir, options.dialects, raw.panelProcess);
      if (!input) throw new HttpError(400, 'bad-hook-input', 'Неизвестный client или нет session_id во входе хука');
      return { answer: sessionStartAnswer(input.dialect, await sessionStart(input)) };
    });
  }
  if (options.question) {
    const question = options.question;
    router.post('/api/hooks/question', async ({ body, req, res }) => {
      if (classifyAddress(req.socket.remoteAddress) !== 'loopback') throw new HttpError(403, 'loopback-only', LOOPBACK_ONLY);
      const request = questionHookRequest(body, options.dialects);
      if (!request) throw new HttpError(400, 'bad-hook-input', 'Неизвестный client, нет session_id или waiterId во входе хука');
      const aborted = new AbortController();
      res.once('close', () => aborted.abort());
      return question(request, aborted.signal);
    });
  }
  const messages = options.messages ?? channel;
  router.post('/api/projects/:id/sessions/:sid/message', async ({ params, body }) => {
    const text = typeof body === 'object' && body !== null ? (body as Record<string, unknown>)['text'] : undefined;
    const projectId = params['id']!;
    const key = params['sid']!;
    if (channel.excluded(key, projectId)) {
      throw new HttpError(409, 'session-archived', 'Сессия в архиве или убрана из списка: Workflow Kit с ней больше не работает', {
        hint: 'Верните сессию из архива, чтобы снова писать ей из панели.',
      });
    }
    const activity = messages.get(key);
    const owned = activity?.projectId === projectId ? false : ((await options.owns?.(projectId, key).catch(() => false)) ?? false);
    const clean = checkSessionMessage(messages, projectId, key, text, owned);
    try {
      await options.onUserMessage?.(projectId, key, clean);
    } catch {
      // The message is still given to the agent.
    }
    channel.resumeDelivery(key); // Only a validated, explicit user message releases the barrier.
    // The direct path gives the text to the agent as a user's message; any refusal queues it.
    const direct = await sendDirect(options.direct, projectId, key, clean);
    if (direct === true) {
      channel.noteUserWords(key, clean);
      return { sent: true };
    }
    // M45: pasted, but Claude began no turn with it: not queued (it may still be in the terminal).
    if (direct === 'unconfirmed') return { sent: false, undelivered: { reason: UNDELIVERED_REASON } };
    // M46: the terminal is not free: a waiting session would never take a queue; the user retries.
    if (typeof direct === 'object') return { sent: false, undelivered: { reason: direct.refused.trim() || UNDELIVERED_REASON } };
    const message = messages.enqueue(key, clean, USER_MESSAGE_SOURCE, projectId);
    return { queued: message.id };
  });
  if (options.interrupt) router.post('/api/projects/:id/sessions/:sid/interrupt', ({ params, body }) => options.interrupt!(params['id']!, params['sid']!, body));
  options.state.add('channel', async () => ({ ...channel.section(), ...(options.interruptions ? { interruptions: await options.interruptions() } : {}) }));
}
