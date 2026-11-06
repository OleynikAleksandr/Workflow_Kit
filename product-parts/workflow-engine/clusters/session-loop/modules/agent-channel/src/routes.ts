// HTTP side of the channel: POST /api/hooks/stop and /api/hooks/prompt (loopback only) and the
// "channel" section of /api/state.
import { HttpError, classifyAddress } from '#http-server';
import type { Router, StateRegistry } from '#http-server';
import type { AgentChannel, HookReply } from './channel.ts';
import { parseHookInput } from './hook-input.ts';

export interface ChannelRoutesOptions {
  router: Router;
  state: StateRegistry;
  channel: AgentChannel;
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

export function registerChannelRoutes(options: ChannelRoutesOptions): void {
  const { router, channel } = options;
  for (const event of ['stop', 'prompt'] as const) {
    router.post(`/api/hooks/${event}`, async ({ body, req, res }) => {
      if (classifyAddress(req.socket.remoteAddress) !== 'loopback') {
        throw new HttpError(403, 'loopback-only', 'Хуки принимаются только с этого компьютера');
      }
      const raw = hookBody(body);
      const input = parseHookInput(raw.client, raw.input, raw.projectDir);
      if (!input) throw new HttpError(400, 'bad-hook-input', 'Нет client или session_id во входе хука');
      const aborted = new AbortController();
      res.once('close', () => aborted.abort());
      const reply = event === 'stop' ? await channel.stop(input, aborted.signal) : await channel.prompt(input);
      send(res, reply);
      return undefined;
    });
  }
  options.state.add('channel', () => channel.section());
}
