// Publication of a project to its git upstream (spec publication-order, section 3.1): only with no
// open scope, a clean tree and an upstream; push without --force, then the SHA is checked.
import type { GitRunner } from './git.ts';

export type PublicationStatus = 'none' | 'up-to-date' | 'ready' | 'blocked';
export type PublishRefusal = 'scope-open' | 'worktree-dirty' | 'no-upstream' | 'nothing-to-publish' | 'remote-ahead';

export interface PublicationState {
  status: PublicationStatus;
  branch: string | null;
  upstream: string | null;
  /** Local commits the upstream does not have. */
  ahead: number;
  /** Upstream commits the local branch does not have (as of the last fetch). */
  behind: number;
  dirty: boolean;
  scopeOpen: boolean;
  /** Why publishing is blocked, for the user; null otherwise. */
  reason: string | null;
  code: PublishRefusal | null;
  checkedAt: string;
}

export const REFUSALS: Readonly<Record<PublishRefusal, string>> = Object.freeze({
  'scope-open': 'Scope открыт — опубликовать можно после приёмки и закрытия',
  'worktree-dirty': 'Есть незакоммиченные изменения',
  'no-upstream': 'У ветки нет удалённого репозитория',
  'nothing-to-publish': 'Новых коммитов нет — всё опубликовано',
  'remote-ahead': 'На GitHub есть коммиты, которых нет локально: сначала объедините истории',
});

export class PublishError extends Error {
  readonly code: PublishRefusal | 'push-failed';
  readonly output: string | null;

  constructor(code: PublishRefusal | 'push-failed', message: string, output: string | null = null) {
    super(message);
    this.name = 'PublishError';
    this.code = code;
    this.output = output;
  }
}

/** Reads the publication state from local git data only (no fetch). */
export async function readPublication(git: GitRunner, folder: string, scopeOpen: boolean, now: Date = new Date()): Promise<PublicationState> {
  const base = { branch: null, upstream: null, ahead: 0, behind: 0, dirty: false, scopeOpen, reason: null, code: null, checkedAt: now.toISOString() };
  const branch = await git(folder, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch.code !== 0) return { ...base, status: 'none' };
  const upstream = await git(folder, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  if (upstream.code !== 0) return { ...base, branch: branch.stdout.trim(), status: 'none' };
  const counts = await git(folder, ['rev-list', '--left-right', '--count', '@{u}...HEAD']);
  const [behind, ahead] = counts.stdout.trim().split(/\s+/).map((n) => Number(n) || 0);
  const status = await git(folder, ['status', '--porcelain']);
  const state: PublicationState = {
    ...base,
    status: 'ready',
    branch: branch.stdout.trim(),
    upstream: upstream.stdout.trim(),
    ahead: ahead ?? 0,
    behind: behind ?? 0,
    dirty: status.stdout.trim() !== '',
  };
  const code = refusal(state);
  if (code === 'nothing-to-publish') return { ...state, status: 'up-to-date' };
  if (code) return { ...state, status: 'blocked', code, reason: REFUSALS[code] };
  return state;
}

/** The first reason the state cannot be published, or null. */
export function refusal(state: Pick<PublicationState, 'upstream' | 'scopeOpen' | 'dirty' | 'behind' | 'ahead'>): PublishRefusal | null {
  if (!state.upstream) return 'no-upstream';
  if (state.behind > 0) return 'remote-ahead';
  if (state.ahead === 0) return 'nothing-to-publish';
  if (state.scopeOpen) return 'scope-open';
  if (state.dirty) return 'worktree-dirty';
  return null;
}

/** Fetches the upstream, checks again and pushes without --force; resolves with the published range. */
export async function publish(git: GitRunner, folder: string, scopeOpen: boolean): Promise<{ from: string; to: string; sha: string; commits: number }> {
  const before = await readPublication(git, folder, scopeOpen);
  if (!before.upstream) throw new PublishError('no-upstream', REFUSALS['no-upstream']);
  const [remote, ...rest] = before.upstream.split('/');
  const remoteBranch = rest.join('/');
  const fetched = await git(folder, ['fetch', remote!, remoteBranch]);
  if (fetched.code !== 0) throw new PublishError('push-failed', 'Не удалось получить состояние удалённого репозитория', fetched.stderr.trim());
  const state = await readPublication(git, folder, scopeOpen);
  const code = refusal(state);
  if (code) throw new PublishError(code, REFUSALS[code]);
  const from = (await git(folder, ['rev-parse', '@{u}'])).stdout.trim();
  const pushed = await git(folder, ['push', remote!, `HEAD:${remoteBranch}`]);
  if (pushed.code !== 0) throw new PublishError('push-failed', 'git push не выполнен', `${pushed.stderr}${pushed.stdout}`.trim());
  await git(folder, ['fetch', remote!, remoteBranch]);
  const sha = (await git(folder, ['rev-parse', 'HEAD'])).stdout.trim();
  const to = (await git(folder, ['rev-parse', '@{u}'])).stdout.trim();
  if (to !== sha) throw new PublishError('push-failed', 'После push удалённая ветка не совпадает с локальной', `${to} ≠ ${sha}`);
  return { from, to, sha, commits: state.ahead };
}
