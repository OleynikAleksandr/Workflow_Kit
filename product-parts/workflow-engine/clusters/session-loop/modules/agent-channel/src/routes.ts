// HTTP side of the channel: POST /api/hooks/stop, /api/hooks/prompt and /api/hooks/turn-end (loopback only),
// POST /api/projects/:id/sessions/:sid/message (a message from the panel) and the "channel"
// section of /api/state.
import { HttpError, classifyAddress } from '#http-server';
import type { Router, StateRegistry } from '#http-server';
import { TURN_END_EVENTS } from './types.ts';
import type { AgentChannel, HookReply, QueuedMessage, TurnEndEvent } from './types.ts';
import { parseHookInput } from './hook-input.ts';
import type { HookDialects } from './hook-input.ts';

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
}

/** Longest panel message, in characters. */
export const MESSAGE_MAX_CHARS = 4000;

/**
 * Queues a message from the panel for a session of the project. The session must be known to the
 * channel (it ran a hook) and belong to the project, or be owned by the project as the provider
 * lists it (owned); the text is non-empty and not too long.
 */
export function queueSessionMessage(
  channel: Pick<AgentChannel, 'enqueue' | 'get'>,
  projectId: string,
  key: string,
  text: unknown,
  owned = false,
): QueuedMessage {
  const clean = typeof text === 'string' ? text.trim() : '';
  if (!clean) throw new HttpError(400, 'empty-message', 'Напишите сообщение агенту');
  if (clean.length > MESSAGE_MAX_CHARS) throw new HttpError(400, 'message-too-long', `Сообщение длиннее ${MESSAGE_MAX_CHARS} символов`);
  const activity = channel.get(key);
  const known = activity ? activity.projectId === projectId || (owned && activity.projectId === null) : owned;
  if (!known) {
    throw new HttpError(404, 'unknown-session', 'Сессия не найдена', { hint: 'Агент этой сессии ещё не отвечал панели: дождитесь его первого ответа.' });
  }
  return channel.enqueue(key, clean, 'panel', projectId);
}

function hookBody(body: unknown): { client: unknown; input: unknown; projectDir: unknown } {
  if (typeof body !== 'object' || body === null) throw new HttpError(400, 'bad-request', 'Ожидается { client, input }');
  const value = body as Record<string, unknown>;
  return { client: value['client'], input: value['input'], projectDir: value['projectDir'] };
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
    const taken = known && (await channel.turnEnd({ client, sessionId, cwd: typeof cwd === 'string' && cwd !== '' ? cwd : null, event: event as TurnEndEvent }));
    if (!taken) throw new HttpError(400, 'bad-hook-input', 'Неизвестный client, событие или нет sessionId во входе хука');
    return { ok: true };
  });
  for (const event of ['stop', 'prompt'] as const) {
    router.post(`/api/hooks/${event}`, async ({ body, req, res }) => {
      if (classifyAddress(req.socket.remoteAddress) !== 'loopback') throw new HttpError(403, 'loopback-only', LOOPBACK_ONLY);
      const raw = hookBody(body);
      const input = parseHookInput(raw.client, raw.input, raw.projectDir, options.dialects);
      if (!input) throw new HttpError(400, 'bad-hook-input', 'Неизвестный client или нет session_id во входе хука');
      const aborted = new AbortController();
      res.once('close', () => aborted.abort());
      const reply = event === 'stop' ? await channel.stop(input, aborted.signal) : await channel.prompt(input);
      send(res, reply);
      return undefined;
    });
  }
  const messages = options.messages ?? channel;
  router.post('/api/projects/:id/sessions/:sid/message', async ({ params, body }) => {
    const text = typeof body === 'object' && body !== null ? (body as Record<string, unknown>)['text'] : undefined;
    const projectId = params['id']!;
    const key = params['sid']!;
    const activity = messages.get(key);
    const owned = activity?.projectId === projectId ? false : ((await options.owns?.(projectId, key).catch(() => false)) ?? false);
    const message = queueSessionMessage(messages, projectId, key, text, owned);
    return { queued: message.id };
  });
  options.state.add('channel', () => channel.section());
}
