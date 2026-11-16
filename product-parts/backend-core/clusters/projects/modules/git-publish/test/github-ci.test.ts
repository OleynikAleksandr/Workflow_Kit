// M39 T007: GitHubCi reads the required jobs of exactly one SHA through the configured gh; a
// missing or unauthenticated gh is a capability blocker; a GitHub failure is transient.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGitHubCi, githubRepo } from '../src/index.ts';
import type { CiPolicy, GitResult } from '../src/index.ts';

const SHA = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const policy: CiPolicy = { remote: 'origin', branch: 'ci/auto', requiredChecks: ['Linux x64', 'Windows x64'], exactSha: true };
const ok = (stdout: string): GitResult => ({ code: 0, stdout, stderr: '' });
const run = (id: number, name: string, status: string, conclusion: string | null, sha = SHA) => ({ id, name, status, conclusion, head_sha: sha });

function ci(runs: unknown[] | GitResult, remote = 'git@github.com:acme/demo.git') {
  const calls: string[][] = [];
  const reader = createGitHubCi({
    git: async () => ok(`${remote}\n`),
    gh: async (_cwd, args) => (calls.push(args), Array.isArray(runs) ? ok(JSON.stringify({ check_runs: runs })) : runs),
  });
  return { reader, calls };
}

test('the repository of a GitHub remote in every form', () => {
  assert.equal(githubRepo('https://github.com/acme/demo.git'), 'acme/demo');
  assert.equal(githubRepo('git@github.com:acme/demo.git\n'), 'acme/demo');
  assert.equal(githubRepo('ssh://git@github.com/acme/demo'), 'acme/demo');
  assert.equal(githubRepo('https://gitlab.com/acme/demo.git'), null);
});

test('success only when every required job of this SHA succeeded; the latest run of a job counts', async () => {
  const { reader, calls } = ci([run(1, 'Linux x64', 'completed', 'failure'), run(2, 'Linux x64', 'completed', 'success'), run(3, 'Windows x64', 'completed', 'success')]);
  const verdict = await reader.read('/p', SHA, policy);
  assert.equal(verdict.state, 'success');
  assert.deepEqual(calls[0], ['api', '--method', 'GET', `repos/acme/demo/commits/${SHA}/check-runs`, '-f', 'per_page=100']);
});

test('a missing or running job is pending; a run of another SHA never counts', async () => {
  const pending = await ci([run(1, 'Linux x64', 'in_progress', null), run(2, 'Windows x64', 'completed', 'success', OTHER)]).reader.read('/p', SHA, policy);
  assert.deepEqual(pending, { state: 'pending', sha: SHA, missing: ['Windows x64'], running: ['Linux x64'] });
});

test('failure, cancellation or a timeout of a required job fail the CI', async () => {
  for (const conclusion of ['failure', 'cancelled', 'timed_out']) {
    const verdict = await ci([run(1, 'Linux x64', 'completed', conclusion), run(2, 'Windows x64', 'completed', 'success')]).reader.read('/p', SHA, policy);
    assert.deepEqual(verdict, { state: 'failed', sha: SHA, failed: [{ name: 'Linux x64', status: 'completed', conclusion }] }, conclusion);
  }
});

test('no gh, no login or no GitHub remote block; a GitHub failure is transient; a bad SHA is refused', async () => {
  assert.deepEqual(await ci({ code: 127, stdout: '', stderr: 'spawn gh ENOENT' }).reader.read('/p', SHA, policy), { state: 'unavailable', reason: 'не найден GitHub CLI (gh): установите и войдите командой gh auth login' });
  const auth = await ci({ code: 4, stdout: '', stderr: 'To get started with GitHub CLI, please run:  gh auth login' }).reader.read('/p', SHA, policy);
  assert.deepEqual([auth.state, 'transient' in auth], ['unavailable', false]);
  const outage = await ci({ code: 1, stdout: '', stderr: 'HTTP 502' }).reader.read('/p', SHA, policy);
  assert.deepEqual([outage.state, (outage as { transient?: boolean }).transient], ['unavailable', true]);
  assert.equal((await ci([], 'https://gitlab.com/acme/demo.git').reader.read('/p', SHA, policy)).state, 'unavailable');
  assert.equal((await ci([]).reader.read('/p', 'abc', policy)).state, 'unavailable');
});
