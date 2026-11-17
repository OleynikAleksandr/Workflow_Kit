// The decision source of a turn (spec M40, contract section 3) and the delivery of the queue in a
// hook answer. A decision the user takes in the chat is accepted only from the user's delivered
// message that began the current public generation: a typed prompt, a panel message given
// directly, or a delivery made of the user's panel messages alone. A continuation of the
// autopilot, a reminder, a review and every other service message begin a generation without one.
import { randomUUID } from 'node:crypto';
import type { Slot } from './slots.ts';
import { userSourceOf } from './turn-state.ts';
import { USER_MESSAGE_SOURCE } from './types.ts';
import type { HookReply, QueuedMessage, TurnUserSource } from './types.ts';

/** Takes the whole queue into one hook answer; a nack puts the messages back. */
export function deliverQueue(slot: Slot, render: (text: string) => Record<string, unknown>, changed: (key: string) => void): HookReply & { messages: QueuedMessage[] } {
  const taken = slot.queue.splice(0, slot.queue.length);
  slot.sources = taken.map((message) => message.source);
  slot.activity.pending = 0;
  let settled = false;
  const text = taken.map((message) => message.text).join('\n\n');
  return {
    messages: taken,
    answer: render(text),
    ack: () => {
      if (settled) return;
      settled = true;
      changed(slot.activity.key);
    },
    nack: () => {
      if (settled) return;
      settled = true;
      slot.queue.unshift(...taken);
      slot.activity.pending = slot.queue.length;
      changed(slot.activity.key);
    },
  };
}

/** The prompt the user typed is the delivered message of the generation it began. */
export function promptUserSource(slot: Slot, text: string, at: string): void {
  slot.turn.userSource = { id: randomUUID(), text, at, via: 'prompt' };
}

/**
 * The queue a prompt hook delivers in its answer, once the answer is accepted: a woken session
 * reads the user's panel messages alone — they are the decision source of that generation; a
 * prompt the user typed also carries the user's panel messages that waited, and their words join
 * the words of the prompt (service messages delivered with it are not the user's words).
 */
export function deliveredInPrompt(slot: Slot, reply: HookReply & { messages: QueuedMessage[] }): HookReply {
  const turnRef = slot.turn.turnRef;
  const delivered = slot.turn.origin === 'delivery' ? userSourceOf(reply.messages) : null;
  const waited = slot.turn.origin === 'user' ? reply.messages.filter((message) => message.source === USER_MESSAGE_SOURCE).map((message) => message.text) : [];
  if (!delivered && waited.length === 0) return reply;
  return {
    ...reply,
    ack() {
      reply.ack();
      if (slot.turn.turnRef !== turnRef) return;
      if (delivered) slot.turn.userSource = delivered;
      else if (slot.turn.userSource) slot.turn.userSource = { ...slot.turn.userSource, text: [slot.turn.userSource.text, ...waited].join('\n\n') };
    },
  };
}

/** The user's delivered message of the current generation, or null. */
export function turnUserSource(slot: Slot | undefined): TurnUserSource | null {
  const turn = slot?.turn;
  if (!turn?.turnRef || !turn.userSource || (turn.origin !== 'user' && turn.origin !== 'delivery')) return null;
  return { ...turn.userSource, turnRef: turn.turnRef };
}
