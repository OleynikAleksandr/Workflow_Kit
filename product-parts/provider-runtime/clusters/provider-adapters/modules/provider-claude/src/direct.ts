// A message from the panel straight into a Claude session the panel runs (spec M18 section 2.2,
// M19 section 2.1): <debug>.text gets the cleaned text; session.exp (macOS, Linux) or pty/host.ts
// (Windows) pastes it into the terminal as a bracketed paste and presses Enter. <debug>.message is
// only a wake. A script of an older version does not know <debug>.text: the file stays untaken,
// is deleted after directWaitMs and the message goes to the queue. The scripts look for the file
// once a second and there is one file per session, so the sends of a session go one after another.
import { access, rename, rm, writeFile } from 'node:fs/promises';
import type { Project } from '#provider-registry';
import { poll } from './pty.ts';
import { TEXT_FILE_SUFFIX } from './pty/screen.ts';
import type { ClaudeRuntime } from './runtime.ts';
import { runningPanelRecord } from './sessions.ts';
import { withNativeHost, withNativeSession } from './native-arbiter.ts';
import { cancelNativeParameters } from './native-parameters.ts';

/** How often sendDirect looks whether a control file was taken, ms. */
export const DIRECT_POLL_MS = 200;

/**
 * The text as it may go into the terminal: CRLF and CR become LF, control characters other than
 * LF and TAB (ESC among them, so the text cannot end the paste) are dropped.
 */
export function cleanDirectText(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '');
}

/** The control file of a message text next to a debug file: <debug>.text. */
export function directTextFile(debugFile: string): string {
  return `${debugFile}${TEXT_FILE_SUFFIX}`;
}

const exists = (file: string): Promise<boolean> =>
  access(file).then(
    () => true,
    () => false,
  );

/**
 * Pastes text into the session as the user's message. False when the panel does not run the
 * session, the text is empty after cleaning, the previous file was not taken in time, or the
 * script did not take this one in time (the file is then deleted). Never throws.
 */
export function sendDirect(rt: ClaudeRuntime, project: Project, sid: string, text: string): Promise<boolean> {
  return withNativeSession(rt, project.id, sid, () => deliver(rt, project, sid, text));
}

async function deliver(rt: ClaudeRuntime, project: Project, sid: string, text: string): Promise<boolean> {
  const clean = cleanDirectText(text);
  if (clean.trim() === '') return false;
  try {
    const record = await runningPanelRecord(rt, project, sid);
    if (!record) return false;
    // The user's message outranks a parameter transaction (M28 3.3): it is cancelled, its cleanup takes
    // up to 2 s, and the message waits for the host that long beyond the usual admission.
    if (record.controlHostId) await cancelNativeParameters(rt, record.debugFile, record.controlHostId).catch(() => undefined);
    const admission = new AbortController();
    const timer = setTimeout(() => admission.abort(new Error('Native control admission timeout')), rt.options.directWaitMs + (record.controlHostId ? 3000 : 0));
    try { return await withNativeHost(rt, record.debugFile, async () => {
      clearTimeout(timer);
      const file = directTextFile(record.debugFile);
      const wait = { timeoutMs: rt.options.directWaitMs, pollMs: DIRECT_POLL_MS };
      const taken = async (): Promise<true | undefined> => ((await exists(file)) ? undefined : true);
      if (!(await poll(taken, wait))) {
        rt.context.log(`claude: message to ${sid} not sent: the previous control file was not taken`);
        return false;
      }
      // Written aside and renamed: the script never reads half a message.
      const partial = `${file}.partial`;
      await writeFile(partial, clean, 'utf8');
      await rename(partial, file);
      if (await poll(taken, wait)) return true;
      await rm(file, { force: true });
      rt.context.log(`claude: message to ${sid} not taken by the session script in time`);
      return false;
    }, admission.signal); } finally { clearTimeout(timer); }
  } catch (error) {
    rt.context.log(`claude: message to ${sid} not sent: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}
