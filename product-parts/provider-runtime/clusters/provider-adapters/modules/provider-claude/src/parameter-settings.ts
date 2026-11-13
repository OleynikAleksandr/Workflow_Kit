import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { defaultHookHost, forwardSlashes, hookCommand } from '#kit-structure';
import type { Project } from '#provider-registry';
import type { ClaudeRuntime } from './runtime.ts';

/** The same stable launcher as hooks; native Windows shells both accept bare node + quoted path. */
export function statuslineCommand(rt: Pick<ClaudeRuntime, 'context'>): string {
  const { platform, env, homedir } = rt.context;
  if (platform !== 'win32') return hookCommand('claude').replace('hook session-start', 'statusline');
  const host = defaultHookHost(env, homedir, platform);
  return `node "${forwardSlashes(host.launcher)}" statusline --client claude`;
}
export async function sessionSettings(rt: Pick<ClaudeRuntime, 'context' | 'logsDir'>, project: Project, ref: string, binding?: { file: string; hostId: string }): Promise<string> {
  const line: Record<string, unknown> = { type: 'command', command: binding && rt.context.nativeStatuslineCommand ? rt.context.nativeStatuslineCommand(binding) : statuslineCommand(rt) };
  for (const file of [path.join(project.path, '.claude', 'settings.local.json'), path.join(project.path, '.claude', 'settings.json'), path.join(rt.context.homedir, '.claude', 'settings.json')]) {
    try {
      const settings = JSON.parse(await readFile(file, 'utf8')) as { statusLine?: { type?: string; command?: string; padding?: unknown; refreshInterval?: unknown } };
      const previous = settings.statusLine;
      if (previous?.type !== 'command' || !previous.command || /wfk(?:\.cmd|\.mjs)?["']?\s+statusline\b/i.test(previous.command)) continue;
      for (const key of ['padding', 'refreshInterval'] as const) if (previous[key] !== undefined) line[key] = previous[key];
      break;
    } catch { /* Next settings layer. */ }
  }
  await mkdir(rt.logsDir, { recursive: true, mode: 0o700 });
  if (!/^[A-Za-z0-9_-]+$/.test(ref)) throw new Error('Invalid settings ref');
  const file = path.join(rt.logsDir, `${ref}.settings.json`);
  await writeFile(file, JSON.stringify({ statusLine: line }), { mode: 0o600, flag: 'wx' });
  return file;
}
