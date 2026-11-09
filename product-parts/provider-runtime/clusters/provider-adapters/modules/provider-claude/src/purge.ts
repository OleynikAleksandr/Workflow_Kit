// Deletion of a project from disk (spec M3-autostart section 9): Claude Code's own
// `claude purge <folder> -y` deletes the project's data on this Mac — transcripts, memory, typed
// prompts and its entry in ~/.claude.json. Sessions stored by Anthropic (claude.ai) stay.
import { ProviderError } from '#provider-registry';
import type { Project } from '#provider-registry';
import type { ClaudeRuntime } from './runtime.ts';

/** What deleteSessions reports for a purged project (Claude has no per-session deletion here). */
export const PURGED = 'local-data';

export async function purgeProject(rt: ClaudeRuntime, project: Project): Promise<string[]> {
  const { claude } = await rt.programs();
  if (!claude) throw new ProviderError('not-installed', 'claude не найден: данные проекта Claude Code не удалены');
  const result = await rt.context.runCommand(claude, ['purge', project.path, '-y'], { cwd: rt.context.homedir, env: rt.childEnv(), timeoutMs: 60_000 });
  if (result.startError || result.code !== 0) {
    const reason = result.startError ?? (`${result.stderr}\n${result.stdout}`.trim().slice(0, 300) || `код ${result.code}`);
    throw new ProviderError('purge-failed', `claude purge не удался: ${reason}`);
  }
  rt.context.log(`claude: purged the Claude Code data of ${project.name} (${project.path})`);
  return [PURGED];
}
