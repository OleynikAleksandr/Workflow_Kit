import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createKeyedMutex } from '#data-store';
import { createRouter, createStateRegistry } from '#http-server';
import { PublishError, createPublisher, registerPublicationRoutes, runGit } from '../src/index.ts';

// M39 T008: the publication of an autopiloting run (expected SHA and target) and stageCi.
// A commit hook sets these for the outer repository; inherited, they would point the test's git at it.
for (const name of [
  'GIT_DIR',
  'GIT_INDEX_FILE',
  'GIT_WORK_TREE',
  'GIT_PREFIX',
  'GIT_COMMON_DIR',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_NAMESPACE',
  'GIT_CEILING_DIRECTORIES',
]) {
  delete process.env[name];
}

const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const sh = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, env: ENV, stdio: 'pipe' }).toString().trim();

/** A work repo with a local bare upstream and one published commit. */
async function repos() {
  const root = await mkdtemp(path.join(tmpdir(), 'wfk-publish-'));
  const bare = path.join(root, 'remote.git');
  const work = path.join(root, 'work');
  sh(root, 'init', '--bare', '-b', 'main', bare);
  sh(root, 'init', '-b', 'main', work);
  await writeFile(path.join(work, 'a.txt'), 'a\n');
  sh(work, 'add', '.');
  sh(work, 'commit', '-m', 'a');
  sh(work, 'remote', 'add', 'origin', bare);
  sh(work, 'push', '-u', 'origin', 'main');
  const commit = async (name: string) => {
    await writeFile(path.join(work, name), `${name}\n`);
    sh(work, 'add', '.');
    sh(work, 'commit', '-m', name);
  };
  return { root, bare, work, commit, cleanup: () => rm(root, { recursive: true, force: true }) };
}

const git = (cwd: string, args: string[]) => runGit(cwd, args).then((r) => r);
const gitEnv: typeof runGit = (cwd, args) =>
  new Promise((resolve) => {
    try {
      resolve({ code: 0, stdout: execFileSync('git', args, { cwd, env: ENV, stdio: 'pipe' }).toString(), stderr: '' });
    } catch (error) {
      const e = error as { status?: number; stdout?: Buffer; stderr?: Buffer };
      resolve({ code: e.status ?? 1, stdout: String(e.stdout ?? ''), stderr: String(e.stderr ?? '') });
    }
  });


const code = (expected: string) => (e: unknown) => e instanceof PublishError && e.code === expected;

test('publish of an expected SHA: target and HEAD checked, a remote that has it is a verified success', async () => {
  const r = await repos();
  const publisher = createPublisher({ git: gitEnv });
  await r.commit('b.txt');
  const sha = sh(r.work, 'rev-parse', 'HEAD');
  const target = { sha, branch: 'main', upstream: 'origin/main' };
  await assert.rejects(publisher.publish(r.work, false, { ...target, upstream: 'backup/main' }), code('publication-target-changed'));
  await assert.rejects(publisher.publish(r.work, false, { ...target, sha: 'f'.repeat(40) }), code('head-changed'));
  await assert.rejects(publisher.publish(r.work, true, target), code('scope-open'));
  const done = await publisher.publish(r.work, false, target);
  assert.deepEqual([done.already, done.sha, sh(r.bare, 'rev-parse', 'main')], [false, sha, sha]);
  // A crash after the push: the next attempt fetches, finds the SHA and pushes nothing.
  const again = await publisher.publish(r.work, false, target);
  assert.deepEqual([again.already, again.commits], [true, 0]);
  await writeFile(path.join(r.work, 'stray.txt'), 'x');
  await assert.rejects(publisher.publish(r.work, false, target), code('worktree-dirty'));
  await r.cleanup();
});

test('a push the remote never got stays a failure; refused credentials are told apart', async () => {
  const r = await repos();
  await r.commit('b.txt');
  const sha = sh(r.work, 'rev-parse', 'HEAD');
  const refusing: typeof runGit = (cwd, args) => (args[0] === 'push' ? Promise.resolve({ code: 128, stdout: '', stderr: 'fatal: Authentication failed for https://example.invalid/' }) : gitEnv(cwd, args));
  await assert.rejects(createPublisher({ git: refusing }).publish(r.work, false, { sha, branch: 'main', upstream: 'origin/main' }), code('push-auth'));
  const timeout: typeof runGit = (cwd, args) => (args[0] === 'push' ? Promise.resolve({ code: 1, stdout: '', stderr: 'error: RPC failed; curl 56' }) : gitEnv(cwd, args));
  await assert.rejects(createPublisher({ git: timeout }).publish(r.work, false, { sha, branch: 'main', upstream: 'origin/main' }), code('push-failed'));
  // A push that reached the remote although git reported an error is a success after the fetch.
  const lost: typeof runGit = async (cwd, args) => (args[0] === 'push' ? (await gitEnv(cwd, args), { code: 1, stdout: '', stderr: 'timeout' }) : gitEnv(cwd, args));
  const done = await createPublisher({ git: lost }).publish(r.work, false, { sha, branch: 'main', upstream: 'origin/main' });
  assert.equal(sh(r.bare, 'rev-parse', 'main'), done.sha);
  await r.cleanup();
});

test('stageCi sends exactly the SHA to the CI branch without force and reads it back', async () => {
  const r = await repos();
  const publisher = createPublisher({ git: gitEnv });
  await r.commit('b.txt');
  const first = sh(r.work, 'rev-parse', 'HEAD');
  assert.deepEqual(await publisher.stageCi(r.work, { sha: first, remote: 'origin', branch: 'ci/auto' }), { sha: first, already: false });
  assert.equal(sh(r.bare, 'rev-parse', 'ci/auto'), first);
  assert.deepEqual(await publisher.stageCi(r.work, { sha: first, remote: 'origin', branch: 'ci/auto' }), { sha: first, already: true });
  await r.commit('c.txt');
  const second = sh(r.work, 'rev-parse', 'HEAD');
  await publisher.stageCi(r.work, { sha: second, remote: 'origin', branch: 'ci/auto' });
  assert.equal(sh(r.bare, 'rev-parse', 'ci/auto'), second);
  // Another history on the CI branch is never overwritten.
  sh(r.work, 'checkout', '-q', '-b', 'side', 'HEAD~2');
  await r.commit('side.txt');
  const side = sh(r.work, 'rev-parse', 'HEAD');
  await assert.rejects(publisher.stageCi(r.work, { sha: side, remote: 'origin', branch: 'ci/auto' }), code('remote-ahead'));
  assert.equal(sh(r.bare, 'rev-parse', 'ci/auto'), second);
  await assert.rejects(publisher.stageCi(r.work, { sha: 'abc', remote: 'origin', branch: 'ci/auto' }), code('head-changed'));
  await r.cleanup();
});

test('the button and a run share one publisher under the project lock: one result, no second push', async () => {
  const r = await repos();
  await r.commit('b.txt');
  const sha = sh(r.work, 'rev-parse', 'HEAD');
  const router = createRouter();
  const mutex = createKeyedMutex();
  const pushes: string[] = [];
  const counting: typeof runGit = (cwd, args) => (args[0] === 'push' && pushes.push(args.join(' ')), gitEnv(cwd, args));
  const publisher = createPublisher({ git: counting });
  const project = { id: 'p1', name: 'P', path: r.work, source: 'created', createdAt: '' } as never;
  const pub = registerPublicationRoutes({ router, state: createStateRegistry(), projects: { get: async () => project, list: async () => [project] } as never, scopeOpen: () => false, git: gitEnv, publisher, mutex, intervalMs: 0 });
  const route = router.match('POST', '/api/projects/p1/publish') as unknown as { handler(input: unknown): Promise<unknown>; params: unknown };
  let release!: () => void;
  const run = mutex.run('project:p1', async () => {
    await new Promise<void>((done) => (release = done));
    return publisher.publish(r.work, false, { sha, branch: 'main', upstream: 'origin/main' });
  });
  const button = route.handler({ params: route.params, body: {} }).catch((error: unknown) => error);
  await new Promise((done) => setTimeout(done, 50));
  assert.deepEqual(pushes, [], 'the button waits for the run that holds the lock');
  release();
  assert.equal((await run).already, false);
  assert.equal(((await button) as { code?: string }).code, 'nothing-to-publish', 'the button sees the published result');
  assert.equal(pushes.length, 1);
  pub.stop();
  await r.cleanup();
});
