// Nothing is typed into a terminal whose AskUserQuestion dialog is open (spec M33 section 2.2, T001
// P6): text pasted then becomes the answer. sendDirect leaves the text to the queue of the channel,
// wakeSession types no wake. Details: questions.md.
import type { Project } from '#provider-registry';
import { hasOpenQuestion } from './chat.ts';
import type { ClaudeRuntime } from './runtime.ts';
import { findSession } from './sessions.ts';

/**
 * A question of the session waits for an answer in its transcript. A transcript that cannot be
 * read counts as an open question: Kit must not answer for the user by accident.
 */
export async function questionOpen(rt: ClaudeRuntime, project: Project, sid: string): Promise<boolean> {
  try {
    return await hasOpenQuestion(rt.chat, (await findSession(rt, project, sid)).hook?.hook.transcriptPath ?? null);
  } catch (error) {
    rt.context.log(`claude: question state of ${sid} unknown: ${error instanceof Error ? error.message : String(error)}`);
    return true;
  }
}
