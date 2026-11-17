// «Стоп» and «пауза» of the user are read by the service (spec M40 2.4), not by the agent. A
// message of the user to the owner session of a live run is checked when the service receives
// it: a panel message — at once, even while the agent is busy and the message waits in the
// queue; a text typed in the provider's app — in the UserPromptSubmit hook. The stop acts at
// once (`RunControl.byWord`): no automatic step of the run starts any more. Other wordings stay
// with the agent (`wfk session run pause|stop`).
import type { RunControl } from './run-control.ts';
import { PREFIX } from './texts.ts';

export type RunWord = 'pause' | 'stop';

const WORDS: Readonly<Record<string, RunWord>> = {
  стоп: 'stop', stop: 'stop', останови: 'stop', остановись: 'stop', остановить: 'stop',
  пауза: 'pause', pause: 'pause', приостанови: 'pause',
};

/**
 * The word of a message: NFC, lower case without a locale, the first word without the
 * punctuation around it. «Stop.» and «пауза, посмотрю» are words; «а когда стоп?» is not.
 */
export function runWord(text: string): RunWord | null {
  const first = text.normalize('NFC').toLowerCase().trim().split(/\s+/u)[0] ?? '';
  const word = first.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  return Object.hasOwn(WORDS, word) ? WORDS[word]! : null;
}

/** What the agent reads next to the user's message. */
export const WORD_TEXTS: Readonly<Record<RunWord, (runId: string) => string>> = {
  stop: (runId) => `${PREFIX} autopilot run ${runId} is stopped by the user's word in this chat: Workflow Kit did it itself, run no command for it. Answer the user and end the turn; start no task and nothing of the plan.`,
  pause: (runId) => `${PREFIX} autopilot run ${runId} is paused by the user's word in this chat: Workflow Kit did it itself, run no command for it. Answer the user and end the turn; the user continues the run with «Продолжить» in the panel.`,
};

export interface RunWordsDeps {
  control: Pick<RunControl, 'byWord'>;
  /** Queues the context for the session without waking it: it goes with the user's message. */
  tell(projectId: string, key: string, text: string): void;
  log?: (line: string) => void;
}

export function createRunWords(deps: RunWordsDeps) {
  const log = deps.log ?? (() => undefined);
  return {
    /**
     * A message of the user as the service received it. Null — another first word, no live run
     * of the project, the session is not its owner, or the run is paused already. `settled`
     * resolves when Kit has the pause or the revocation.
     */
    async received(projectId: string, key: string, text: string): Promise<{ action: RunWord; runId: string; settled: Promise<void> } | null> {
      const action = runWord(text);
      if (!action) return null;
      const done = await deps.control.byWord(projectId, key, action);
      if (!done) return null;
      log(`autopiloting: ${done.run.runId} ${action === 'stop' ? 'stopped' : 'paused'} by the user's word`);
      deps.tell(projectId, key, WORD_TEXTS[action](done.run.runId));
      return { action, runId: done.run.runId, settled: done.settled };
    },
  };
}

export type RunWords = ReturnType<typeof createRunWords>;
