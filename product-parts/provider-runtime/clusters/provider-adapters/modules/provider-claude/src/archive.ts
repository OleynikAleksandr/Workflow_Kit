// Archive in Workflow Kit (spec M3-fixes section 12): an archived project or session has no live
// process, so it never blocks a removal and nothing brings it back (start of the service, waking,
// a resume request); a restore brings it back at once under the same Remote Control channel.
import type { Project } from '#provider-registry';
import type { SessionRecord } from './records.ts';
import type { ClaudeRuntime } from './runtime.ts';
import { findSession, resumeSession, stopSession } from './sessions.ts';

/** The id the panel shows for a record: the local id, from the hook journal when the record has none yet. */
async function idOf(rt: ClaudeRuntime, project: Project, record: SessionRecord): Promise<string> {
  if (record.localId) return record.localId;
  return (await findSession(rt, project, record.remoteId)).hook?.hook.sessionId ?? record.remoteId;
}

function setMark(rt: ClaudeRuntime, record: SessionRecord, archived: SessionRecord['archived']): Promise<void> {
  return rt.store.update((records) => {
    const stored = records.sessions.find((r) => r.remoteId === record.remoteId && r.projectPath === record.projectPath);
    if (stored) stored.archived = archived;
  });
}

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Archive of the project (sid null: its running or interrupted sessions, marked 'project') or of
 * one session (marked 'session' even when stopped). The mark is written before the stop, so a
 * concurrent wake cannot bring the session back. Resolves to the ids whose process was stopped.
 */
export async function archiveSessions(rt: ClaudeRuntime, project: Project, sid: string | null): Promise<string[]> {
  let targets: SessionRecord[];
  if (sid === null) {
    const records = (await rt.store.read()).sessions;
    targets = records.filter((r) => r.projectPath === project.path && r.processId !== null && !r.archived);
  } else {
    const { record } = await findSession(rt, project, sid);
    targets = record ? [record] : [];
  }
  const kind = sid === null ? 'project' : 'session';
  const stopped: string[] = [];
  for (const record of targets) {
    await setMark(rt, record, kind);
    if (record.processId === null) continue;
    const id = await idOf(rt, project, record);
    try {
      await stopSession(rt, project, record.remoteId);
      stopped.push(id);
    } catch (error) {
      rt.context.log(`claude: archived session ${id} was not stopped: ${message(error)}`);
    }
  }
  return stopped;
}

/**
 * Restore of the project (sid null: the sessions archived with it; the ones archived alone stay)
 * or of one session. A session restored while its project is still archived passes to the
 * project's mark and comes back with the project. Resolves to the ids resumed.
 */
export async function restoreSessions(rt: ClaudeRuntime, project: Project, sid: string | null): Promise<string[]> {
  let targets: SessionRecord[];
  if (sid === null) {
    targets = (await rt.store.read()).sessions.filter((r) => r.projectPath === project.path && r.archived === 'project');
  } else {
    const { record } = await findSession(rt, project, sid);
    targets = record?.archived ? [record] : [];
    if (targets.length > 0 && project.archivedAt) {
      await setMark(rt, targets[0]!, 'project');
      return [];
    }
  }
  const resumed: string[] = [];
  for (const record of targets) {
    await setMark(rt, record, null);
    const id = await idOf(rt, project, record);
    try {
      await resumeSession(rt, project, record.remoteId);
      resumed.push(id);
    } catch (error) {
      rt.context.log(`claude: restored session ${id} was not resumed: ${message(error)}`);
    }
  }
  return resumed;
}
