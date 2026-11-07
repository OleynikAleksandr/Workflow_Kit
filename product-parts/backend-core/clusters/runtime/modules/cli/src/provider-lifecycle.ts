// What happens to provider sessions when projects and sessions change state (spec M3-fixes
// sections 11 and 12): a removed project takes its records with it; the start of the service
// brings back interrupted sessions; an archive stops sessions and a restore brings them back.
import type { ProjectRegistry } from '#project-registry';
import type { ProviderRegistry } from '#provider-registry';

export interface ProviderLifecycle {
  /** Archive or restore of one session ('<provider>:<id>') from the panel (session titles). */
  sessionArchived(projectId: string, key: string, archived: boolean): Promise<void>;
}

export function wireProviderLifecycle(options: { projects: ProjectRegistry; providers: ProviderRegistry; log?: (line: string) => void }): ProviderLifecycle {
  const { projects, providers } = options;
  const log = (line: string): void => options.log?.(line);
  const report = (what: string, errors: Record<string, string>): void => {
    for (const [where, message] of Object.entries(errors)) log(`providers: ${where} could not ${what}: ${message}`);
  };

  projects.addRemoveGuard((project) => providers.removeBlockers(project));
  // A removed project takes its records with it; leftovers of earlier versions or a failed hook are
  // dropped at the start (archived projects are still in the list and keep theirs).
  const forgetRemoved = async (remaining: readonly { id: string }[]): Promise<void> => {
    const { dropped, errors } = await providers.forgetProjects(new Set(remaining.map((p) => p.id)));
    if (dropped > 0) log(`providers: forgot ${dropped} record(s) of removed projects`);
    report('forget removed projects', errors);
  };
  projects.addRemovedHook((_project, remaining) => forgetRemoved(remaining));

  // An archive waits for the stops (a removal right after it is not blocked by them); a restore
  // brings the sessions back in the background.
  const change = async (project: Parameters<ProviderRegistry['setArchived']>[0], key: string | null, archived: boolean): Promise<void> => {
    const { changed, errors } = await providers.setArchived(project, key, archived);
    if (changed.length > 0) log(`providers: ${archived ? 'stopped archived' : 'resumed restored'} sessions ${changed.join(', ')}`);
    report(archived ? 'stop archived sessions' : 'resume restored sessions', errors);
  };
  projects.addArchivedHook((project, archived) => (archived ? change(project, null, true) : void change(project, null, false).catch(() => undefined)));

  // At the start: drop leftovers of removed projects, then bring back the sessions a reboot or a
  // crash interrupted (Claude: the same Remote Control channel), except in archived projects.
  void projects
    .list()
    .then(async (list) => {
      await forgetRemoved(list).catch(() => undefined);
      const { resumed, errors } = await providers.resumeInterrupted(list.filter((p) => !p.archivedAt));
      if (resumed.length > 0) log(`providers: resumed interrupted sessions ${resumed.join(', ')}`);
      report('resume', errors);
    })
    .catch(() => undefined);

  return {
    async sessionArchived(projectId, key, archived) {
      const project = await projects.get(projectId);
      if (!project) return;
      if (archived) await change(project, key, true);
      else void change(project, key, false).catch(() => undefined);
    },
  };
}
