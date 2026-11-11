// Runs git in a project folder without prompts (no terminal: credential prompts fail instead of hanging).
import { execFile } from 'node:child_process';

export interface GitResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type GitRunner = (cwd: string, args: string[]) => Promise<GitResult>;

/** Options of the git child: no prompts, 60 s limit and no console window on Windows (M14). */
export function gitExecOptions(cwd: string, env: NodeJS.ProcessEnv = process.env): { cwd: string; timeout: number; maxBuffer: number; windowsHide: true; env: NodeJS.ProcessEnv } {
  return { cwd, timeout: 60_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true, env: { ...env, GIT_TERMINAL_PROMPT: '0' } };
}

/** Default runner: execFile('git') with gitExecOptions. */
export const runGit: GitRunner = (cwd, args) =>
  new Promise((resolve) => {
    execFile('git', args, gitExecOptions(cwd), (error, stdout, stderr) => {
      const raw = (error as { code?: unknown } | null)?.code;
      const code = error ? (typeof raw === 'number' ? raw : 1) : 0;
      const err = String(stderr);
      resolve({ code, stdout: String(stdout), stderr: err || (error ? error.message : '') });
    });
  });
