import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createRouter, createStateRegistry, HttpError } from '#http-server';
import { PublishError, gitExecOptions, publish, readPublication, registerPublicationRoutes, runGit } from '../src/index.ts';

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

test('the state is none without an upstream, up-to-date, ready, or blocked with a reason', async () => {
  const r = await repos();
  assert.equal((await readPublication(git, r.work, false)).status, 'up-to-date');
  await r.commit('b.txt');
  await r.commit('c.txt');
  const ready = await readPublication(git, r.work, false);
  assert.deepEqual([ready.status, ready.ahead, ready.upstream], ['ready', 2, 'origin/main']);
  const open = await readPublication(git, r.work, true);
  assert.deepEqual([open.status, open.code], ['blocked', 'scope-open']);
  await writeFile(path.join(r.work, 'dirty.txt'), 'x');
  assert.equal((await readPublication(git, r.work, false)).code, 'worktree-dirty');
  sh(r.work, 'branch', '--unset-upstream');
  assert.equal((await readPublication(git, r.work, false)).status, 'none');
  await r.cleanup();
});

test('publish pushes without force only with the scope closed, then the upstream equals HEAD', async () => {
  const r = await repos();
  await r.commit('b.txt');
  await assert.rejects(publish(gitEnv, r.work, true), (e: unknown) => e instanceof PublishError && e.code === 'scope-open');
  const done = await publish(gitEnv, r.work, false);
  assert.equal(done.commits, 1);
  assert.equal(done.sha, sh(r.bare, 'rev-parse', 'main'));
  await assert.rejects(publish(gitEnv, r.work, false), (e: unknown) => e instanceof PublishError && e.code === 'nothing-to-publish');
  await r.cleanup();
});

test('a remote ahead of the local branch is refused, nothing is overwritten', async () => {
  const r = await repos();
  const other = path.join(r.root, 'other');
  sh(r.root, 'clone', r.bare, other);
  await writeFile(path.join(other, 'x.txt'), 'x\n');
  sh(other, 'add', '.');
  sh(other, 'commit', '-m', 'x');
  sh(other, 'push');
  const remoteHead = sh(r.bare, 'rev-parse', 'main');
  await r.commit('b.txt');
  await assert.rejects(publish(gitEnv, r.work, false), (e: unknown) => e instanceof PublishError && e.code === 'remote-ahead');
  assert.equal(sh(r.bare, 'rev-parse', 'main'), remoteHead);
  await r.cleanup();
});

test('the route publishes, refuses with 409 and the section shows the cached state', async () => {
  const r = await repos();
  await r.commit('b.txt');
  const router = createRouter();
  const state = createStateRegistry();
  let open = true;
  const project = { id: 'p1', name: 'P', path: r.work, source: 'created', createdAt: '' } as never;
  const pub = registerPublicationRoutes({
    router,
    state,
    projects: { get: async (id: string) => (id === 'p1' ? project : undefined), list: async () => [project] } as never,
    scopeOpen: () => open,
    git: gitEnv,
    intervalMs: 0,
  });
  await pub.refresh();
  assert.equal(pub.section().projects['p1']!.status, 'blocked');
  const route = router.match('POST', '/api/projects/p1/publish');
  assert.ok(route);
  const call = () => (route as any).handler({ params: (route as any).params, body: {} });
  await assert.rejects(call(), (e: unknown) => e instanceof HttpError && e.status === 409 && (e as any).code === 'scope-open');
  open = false;
  const result = await call();
  assert.equal(result.published, true);
  assert.equal(pub.section().projects['p1']!.status, 'up-to-date');
  pub.stop();
  await r.cleanup();
});

test('git runs without a console window on Windows and without prompts (M14)', () => {
  const options = gitExecOptions('/p', { PATH: '/bin' });
  assert.equal(options.windowsHide, true);
  assert.equal(options.env['GIT_TERMINAL_PROMPT'], '0');
  assert.equal(options.env['PATH'], '/bin');
  assert.equal(options.cwd, '/p');
});
