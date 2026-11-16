// GitHub Actions results for an autopiloting run (spec M39 runtime 5): `GitHubCi.read` checks,
// independently of the agent, that every required job of the frozen CI policy finished with
// success for exactly the given SHA. It runs the configured `gh` (never installs it) through
// execFile with arguments and a time limit, without a shell; tokens never reach the output. A
// missing or unauthenticated `gh` is a capability blocker, not a result.
import { execFile } from 'node:child_process';
import type { GitResult, GitRunner } from './git.ts';
import { runGit } from './git.ts';

/** `automation.ci` of the reviewed plan, as the run's grant froze it. */
export interface CiPolicy {
  remote: string;
  branch: string;
  requiredChecks: string[];
  exactSha: boolean;
}

export interface CiJob {
  name: string;
  status: string;
  conclusion: string | null;
}

export type CiVerdict =
  | { state: 'success'; sha: string; jobs: CiJob[] }
  | { state: 'pending'; sha: string; missing: string[]; running: string[] }
  | { state: 'failed'; sha: string; failed: CiJob[] }
  /** transient: a network or GitHub failure worth a later retry; otherwise a capability blocker. */
  | { state: 'unavailable'; reason: string; transient?: boolean };

export type GhRunner = (cwd: string, args: string[]) => Promise<GitResult>;

/** Default runner: execFile('gh') without prompts, 30 s limit and no console window on Windows. */
export const runGh: GhRunner = (cwd, args) =>
  new Promise((resolve) => {
    execFile('gh', args, { cwd, timeout: 30_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true, env: { ...process.env, GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1' } }, (error, stdout, stderr) => {
      const raw = (error as { code?: unknown } | null)?.code;
      const code = error ? (typeof raw === 'number' ? raw : raw === 'ENOENT' ? 127 : 1) : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) || (error ? error.message : '') });
    });
  });

/** owner/repo of a GitHub remote URL (https, ssh or scp form), else null. */
export function githubRepo(url: string): string | null {
  const match = /github\.com[/:]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/u.exec(url.trim());
  return match ? `${match[1]}/${match[2]}` : null;
}

const SHA = /^[0-9a-f]{40}$/u;

export interface GitHubCi {
  read(root: string, sha: string, policy: CiPolicy): Promise<CiVerdict>;
}

export function createGitHubCi(options: { gh?: GhRunner; git?: GitRunner } = {}): GitHubCi {
  const gh = options.gh ?? runGh;
  const git = options.git ?? runGit;
  return {
    async read(root, sha, policy) {
      if (!SHA.test(sha)) return { state: 'unavailable', reason: `не полный SHA коммита: ${sha}` };
      if (policy.requiredChecks.length === 0) return { state: 'unavailable', reason: 'политика CI не называет обязательных проверок' };
      const remote = await git(root, ['remote', 'get-url', policy.remote]);
      const repo = remote.code === 0 ? githubRepo(remote.stdout) : null;
      if (!repo) return { state: 'unavailable', reason: `remote ${policy.remote} не указывает на GitHub` };
      const reply = await gh(root, ['api', '--method', 'GET', `repos/${repo}/commits/${sha}/check-runs`, '-f', 'per_page=100']);
      if (reply.code === 127) return { state: 'unavailable', reason: 'не найден GitHub CLI (gh): установите и войдите командой gh auth login' };
      if (reply.code !== 0) {
        const auth = /auth login|authentication|HTTP 401|HTTP 403/iu.test(reply.stderr);
        return auth ? { state: 'unavailable', reason: 'gh не авторизован: выполните gh auth login' } : { state: 'unavailable', reason: `gh api завершился с кодом ${reply.code}`, transient: true };
      }
      let runs: Array<{ id?: number; name?: string; status?: string; conclusion?: string | null; head_sha?: string }> = [];
      try {
        runs = (JSON.parse(reply.stdout) as { check_runs?: typeof runs }).check_runs ?? [];
      } catch {
        return { state: 'unavailable', reason: 'ответ GitHub не JSON', transient: true };
      }
      const jobs: CiJob[] = [];
      const missing: string[] = [];
      for (const name of policy.requiredChecks) {
        // The latest run of each required job for exactly this SHA; another SHA never counts.
        const latest = runs.filter((run) => run.name === name && (!policy.exactSha || run.head_sha === sha)).sort((a, b) => (b.id ?? 0) - (a.id ?? 0))[0];
        if (!latest) missing.push(name);
        else jobs.push({ name, status: latest.status ?? 'unknown', conclusion: latest.conclusion ?? null });
      }
      const failed = jobs.filter((job) => job.status === 'completed' && job.conclusion !== 'success');
      if (failed.length > 0) return { state: 'failed', sha, failed };
      const running = jobs.filter((job) => job.status !== 'completed').map((job) => job.name);
      if (missing.length > 0 || running.length > 0) return { state: 'pending', sha, missing, running };
      return { state: 'success', sha, jobs };
    },
  };
}
