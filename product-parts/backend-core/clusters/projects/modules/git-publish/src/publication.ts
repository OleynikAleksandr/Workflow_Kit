// Publication of a project to its git upstream (spec publication-order, section 3.1): only with no
// open scope, a clean tree and an upstream; push without --force, then the SHA is checked.
import type { GitRunner } from './git.ts';

export type PublicationStatus = 'none' | 'up-to-date' | 'ready' | 'blocked';
export type PublishRefusal = 'scope-open' | 'worktree-dirty' | 'no-upstream' | 'nothing-to-publish' | 'remote-ahead' | 'publication-target-changed' | 'head-changed';
/** Why a push did not happen: credentials, or another failure (network, hook, timeout). */
export type PushFailure = 'push-failed' | 'push-auth';

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
  'publication-target-changed': 'Ветка или удалённый репозиторий изменились после разрешения запуска',
  'head-changed': 'Текущий коммит не тот, что проверен и закрыт запуском',
});

export class PublishError extends Error {
  readonly code: PublishRefusal | PushFailure;
  readonly output: string | null;

  constructor(code: PublishRefusal | PushFailure, message: string, output: string | null = null) {
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

/** What an autopiloting run publishes (spec M39 completion): exactly this SHA to this target. */
export interface ExpectedPublication {
  sha: string;
  branch: string;
  /** The upstream as `git rev-parse --abbrev-ref @{u}` names it, e.g. `origin/main`. */
  upstream: string;
}

export interface Published {
  from: string;
  to: string;
  sha: string;
  commits: number;
  /** The expected SHA was already on the remote branch (verified after a fetch, no push). */
  already: boolean;
}

const AUTH = /authentication failed|permission denied|could not read username|access denied|403|terminal prompts disabled|invalid credentials/iu;

/** A failed push as an error: credentials apart from other failures. */
function pushError(output: string): PublishError {
  return AUTH.test(output)
    ? new PublishError('push-auth', 'Удалённый репозиторий отклонил учётные данные', output)
    : new PublishError('push-failed', 'git push не выполнен', output);
}

/**
 * Fetches the upstream, checks again and pushes without --force; resolves with the published
 * range once the fetched remote branch equals the local HEAD. With `expected` (an autopiloting
 * run) the branch, the upstream and HEAD must be the ones the run verified; a remote that already
 * has the SHA is a verified success without a push, and a push without a clear answer is checked
 * by a fetch: the SHA on the remote is a success, otherwise the push error stands.
 */
export async function publish(git: GitRunner, folder: string, scopeOpen: boolean, expected?: ExpectedPublication): Promise<Published> {
  const before = await readPublication(git, folder, scopeOpen);
  if (!before.upstream) throw new PublishError('no-upstream', REFUSALS['no-upstream']);
  if (expected && (before.branch !== expected.branch || before.upstream !== expected.upstream)) {
    throw new PublishError('publication-target-changed', REFUSALS['publication-target-changed'], `${before.branch} → ${before.upstream}`);
  }
  const head = (await git(folder, ['rev-parse', 'HEAD'])).stdout.trim();
  if (expected && head !== expected.sha) throw new PublishError('head-changed', REFUSALS['head-changed'], `${head} ≠ ${expected.sha}`);
  const [remote, ...rest] = before.upstream.split('/');
  const remoteBranch = rest.join('/');
  const remoteTip = async (): Promise<string> => (await git(folder, ['rev-parse', '@{u}'])).stdout.trim();
  const fetched = await git(folder, ['fetch', remote!, remoteBranch]);
  if (fetched.code !== 0) throw pushError(`${fetched.stderr}${fetched.stdout}`.trim() || 'git fetch не выполнен');
  const from = await remoteTip();
  if (expected && from === expected.sha) {
    const state = await readPublication(git, folder, scopeOpen);
    if (state.dirty) throw new PublishError('worktree-dirty', REFUSALS['worktree-dirty']);
    return { from, to: from, sha: from, commits: 0, already: true };
  }
  const state = await readPublication(git, folder, scopeOpen);
  const code = refusal(state);
  if (code) throw new PublishError(code, REFUSALS[code]);
  const pushed = await git(folder, ['push', remote!, `HEAD:${remoteBranch}`]);
  await git(folder, ['fetch', remote!, remoteBranch]);
  const to = await remoteTip();
  if (pushed.code !== 0 && to !== head) throw pushError(`${pushed.stderr}${pushed.stdout}`.trim());
  if (to !== head) throw new PublishError('push-failed', 'После push удалённая ветка не совпадает с локальной', `${to} ≠ ${head}`);
  return { from, to, sha: head, commits: state.ahead, already: false };
}

/**
 * `stageCi` (spec M39 completion): sends exactly `sha` to the CI branch of the frozen policy
 * without --force and reads the remote ref back (`ls-remote`). The SHA already there is a
 * success without a push; another tip that is no ancestor of `sha` is refused by git.
 */
export async function stageCi(git: GitRunner, folder: string, target: { sha: string; remote: string; branch: string }): Promise<{ sha: string; already: boolean }> {
  if (!/^[0-9a-f]{40}$/u.test(target.sha)) throw new PublishError('head-changed', 'Нужен полный SHA', target.sha);
  const ref = `refs/heads/${target.branch}`;
  const tip = async (): Promise<string | null> => {
    const listed = await git(folder, ['ls-remote', target.remote, ref]);
    if (listed.code !== 0) throw pushError(`${listed.stderr}${listed.stdout}`.trim() || 'git ls-remote не выполнен');
    return listed.stdout.trim().split(/\s+/u)[0] || null;
  };
  if ((await tip()) === target.sha) return { sha: target.sha, already: true };
  const pushed = await git(folder, ['push', target.remote, `${target.sha}:${ref}`]);
  const after = await tip();
  if (after === target.sha) return { sha: target.sha, already: false };
  const output = `${pushed.stderr}${pushed.stdout}`.trim();
  if (/non-fast-forward|\[rejected\]|fetch first/iu.test(output)) throw new PublishError('remote-ahead', 'CI-ветка ушла вперёд другим коммитом', output);
  throw pushError(output || `${after ?? 'нет ветки'} ≠ ${target.sha}`);
}

/** One publication service for the panel button and the autopiloting runs (the caller holds the project lock). */
export function createPublisher(options: { git: GitRunner }) {
  return {
    publish: (folder: string, scopeOpen: boolean, expected?: ExpectedPublication) => publish(options.git, folder, scopeOpen, expected),
    stageCi: (folder: string, target: { sha: string; remote: string; branch: string }) => stageCi(options.git, folder, target),
  };
}

export type Publisher = ReturnType<typeof createPublisher>;
