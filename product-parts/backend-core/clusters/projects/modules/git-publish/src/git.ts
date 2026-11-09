// Runs git in a project folder without prompts (no terminal: credential prompts fail instead of hanging).
import { execFile } from 'node:child_process';

export interface GitResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type GitRunner = (cwd: string, args: string[]) => Promise<GitResult>;

/** Default runner: execFile('git'), 60 s limit, GIT_TERMINAL_PROMPT=0. */
export const runGit: GitRunner = (cwd, args) =>
  new Promise((resolve) => {
    execFile(
      'git',
      args,
      { cwd, timeout: 60_000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } },
      (error, stdout, stderr) => {
        const raw = (error as { code?: unknown } | null)?.code;
        const code = error ? (typeof raw === 'number' ? raw : 1) : 0;
        const err = String(stderr);
        resolve({ code, stdout: String(stdout), stderr: err || (error ? error.message : '') });
      },
    );
  });
