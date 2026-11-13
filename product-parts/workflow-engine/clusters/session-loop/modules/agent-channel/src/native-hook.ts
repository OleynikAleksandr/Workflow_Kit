import type { HookReply } from './types.ts';
/** Does not touch a slot, queue, delivery acknowledgement, turn barrier or autopilot. */
export function nativeControlHookReply(event: 'prompt' | 'stop'): HookReply {
  return { answer: event === 'prompt' ? { decision: 'block', reason: 'Сейчас изменяются параметры Claude. Отправьте сообщение после завершения.' } : null,
    ack() {}, nack() {} };
}
