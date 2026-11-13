import { access } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { runCommand, taskkill } from '#process-supervisor';
import type { CommandRunner } from '#process-supervisor';

/** Claude uses sh on POSIX, Git Bash on Windows, then PowerShell (never cmd). */
export async function statuslineShell(platform: NodeJS.Platform, env: Readonly<Record<string, string | undefined>>, exists = async (file: string) => access(file).then(() => true, () => false)): Promise<{ command: string; args: string[] }> {
  if (platform !== 'win32') return { command: '/bin/sh', args: ['-c'] };
  const explicit = env['CLAUDE_CODE_GIT_BASH_PATH'];
  const candidates = [explicit, ...(env['PATH'] ?? env['Path'] ?? '').split(';').filter(Boolean).flatMap(p => [path.win32.join(p, 'bash.exe'), path.win32.join(p, 'bash')])];
  for (const candidate of candidates) if (candidate && await exists(candidate)) return { command: candidate, args: ['-c'] };
  return { command: 'powershell', args: ['-NoProfile', '-Command'] };
}
export interface StatuslineCommandOptions {
  platform: NodeJS.Platform; env: NodeJS.ProcessEnv; cwd: string;
  timeoutMs?: number; shell?: { command: string; args: string[] }; run?: CommandRunner;
}
/** Buffers stdout until success; timeout kills the whole owned group/tree and returns nothing. */
export async function runStatuslineCommand(command: string, input: Buffer, options: StatuslineCommandOptions): Promise<Buffer> {
  const shell = options.shell ?? await statuslineShell(options.platform, options.env);
  return new Promise(resolve => {
    const child = spawn(shell.command, [...shell.args, command], {
      cwd: options.cwd, env: options.env, detached: options.platform !== 'win32', windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'],
    });
    const chunks: Buffer[] = []; let timedOut = false; let finished = false;
    const finish = (output: Buffer) => { if (finished) return; finished = true; clearTimeout(timer); resolve(output); };
    const timer = setTimeout(() => {
      timedOut = true;
      if (options.platform === 'win32' && child.pid) {
        void taskkill(options.run ?? runCommand, child.pid, true).catch(() => undefined).finally(() => finish(Buffer.alloc(0)));
      } else {
        if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
        finish(Buffer.alloc(0));
      }
    }, options.timeoutMs ?? 5000);
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.stdin.on('error', () => undefined);
    child.on('error', () => finish(Buffer.alloc(0)));
    child.on('close', () => finish(timedOut ? Buffer.alloc(0) : Buffer.concat(chunks)));
    child.stdin.end(input);
  });
}
