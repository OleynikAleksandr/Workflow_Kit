// The world of the detached turn end tests: a channel whose delivery is a fake provider
// (sessionIdle, lastAnswer, sendMessage); timers are real but short.
import assert from 'node:assert/strict';
import { createAgentChannel, parseHookInput, sessionKey } from '../src/index.ts';
import type { AgentChannel, HookInput, StopContext, StopDecision, StopEvent } from '../src/index.ts';

export const CWD = '/home/u/Projects/demo';
export const SID = 'session_k1';
export const KEY = sessionKey('kimi', SID);

export const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
export async function until(check: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 500 && !check(); i += 1) await pause(2);
  assert.ok(check(), what);
}
export function gate<T>(): { promise: Promise<T>; open: (value: T) => void } {
  let open!: (value: T) => void;
  const promise = new Promise<T>((resolve) => (open = resolve));
  return { promise, open };
}

/** A Kimi UserPromptSubmit: the prompt comes as an array of parts. */
export const prompt = (text: string, sessionId = SID): HookInput =>
  parseHookInput('kimi', { session_id: sessionId, cwd: CWD, hook_event_name: 'UserPromptSubmit', prompt: [{ type: 'text', text }] }, undefined, () => 'kimi')!;

export interface World {
  ch: AgentChannel;
  /** The session lock: false while a turn runs. */
  idle: boolean | Error;
  answer: string | null | Error | Promise<string | null>;
  accept: boolean | Error | Promise<boolean>;
  archived: boolean;
  sent: Array<{ id: string; text: string }>;
  events: StopEvent[];
  asked: StopContext[];
  order: string[];
  answersRead: number;
  end(event?: 'Stop' | 'StopFailure' | 'Interrupt'): Promise<boolean>;
}

export function world(decide: (context: StopContext, calls: number) => StopDecision = () => ({ kind: 'release' }), over: { watchMs?: number; confirmMs?: number; holdMs?: number } = {}): World {
  const w: World = {
    idle: false,
    answer: 'ответ агента',
    accept: true,
    archived: false,
    sent: [],
    events: [],
    asked: [],
    order: [],
    answersRead: 0,
    end: (event = 'Stop') => w.ch.turnEnd({ client: 'kimi', sessionId: SID, cwd: CWD, event }),
    ch: createAgentChannel({
      resolveProject: async (folder) => (folder.startsWith(CWD) ? { id: 'p1' } : undefined),
      holdMs: over.holdMs ?? 5000,
      decide: (context) => {
        w.asked.push(context);
        return decide(context, w.asked.length);
      },
      detached: {
        supports: (client) => client === 'kimi',
        idle: async () => {
          if (w.idle instanceof Error) throw w.idle;
          return w.idle;
        },
        lastAnswer: async () => {
          w.answersRead += 1;
          w.order.push('answer');
          if (w.answer instanceof Error) throw w.answer;
          return w.answer;
        },
        send: async (_session, text, delivery) => {
          w.sent.push({ id: delivery.id, text });
          w.order.push('send');
          if (w.accept instanceof Error) throw w.accept;
          return w.accept;
        },
        archived: () => w.archived,
        names: () => ({ label: 'Kimi', title: 'Kimi Code', lockSwitch: 'KIMI_CODE_SESSION_LOCK' }),
        pollMs: 4,
        watchMs: over.watchMs ?? 2000,
        retryMs: 4,
        confirmMs: over.confirmMs ?? 2000,
        maintainMs: 0,
      },
    }),
  };
  w.ch.onStop((event) => w.events.push(event));
  return w;
}

