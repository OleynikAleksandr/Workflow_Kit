// M39 T008, validation 1.4 with the real Kit bundle, a temporary project and a bare upstream:
// an authorized run is accepted with evidence and closed by the service through host tickets,
// the final SHA goes to the frozen CI branch, its CI (scripted) turns green and exactly that SHA
// is published and verified on the remote. A foreign file blocks the close and stays; a push
// the remote already has is not repeated; the history names the run, not a user's check.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createPublisher, runGit } from '#git-publish';
import { ensureKitBundle } from '#kit-bundle';
import { createKitRunner, type KitRunner } from '#kit-runner';
import { runCommand } from '#process-supervisor';
import { createHostTickets, createRunCompletion, createRunJournal, createRunKit, createRunWaits, createRuns, createSettingsStore } from '../src/index.ts';
import type { CiReadVerdict, RunCompleter, RunJournal, RunRecord, RunWaits, Runs } from '../src/index.ts';

let tmp = '';
let root = '';
let bare = '';
let runner: KitRunner;
let env: Record<string, string | undefined> = {};
let runs: Runs;
let waits: RunWaits;
let completion: RunCompleter;
let journal: RunJournal;
const read: string[] = [];
let verdict = (sha: string): CiReadVerdict => ({ state: 'success', sha, jobs: [{ name: 'Linux x64' }] });
const KEY = 'claude:s-1';

const CI = 'name: CI\non:\n  push:\njobs:\n  test:\n    name: ${{ matrix.name }}\n    runs-on: ${{ matrix.os }}\n    strategy:\n      matrix:\n        include:\n          - name: Linux x64\n            os: ubuntu-latest\n    steps:\n      - run: npm test\n';

const SCOPE = {
  id: 'auto',
  objective: 'Explain the feature',
  acceptance: ['The note explains the feature'],
  approval: 'User approved the automated scope',
  spec: 'docs/spec.md',
  automation: {
    acceptance: [{ criterion: 0, kind: 'automatic', checks: [], evidence: ['docs/evidence/result.md'] }],
    ci: { remote: 'origin', branch: 'ci/auto', requiredChecks: ['Linux x64'], exactSha: true },
    delivery: [{ taskId: 'D1', effects: ['write the release note'] }],
    publication: { branch: 'main', upstream: 'origin/main' },
  },
  tasks: [
    { id: 'N', title: 'Note', commitMessage: 'docs: note', acceptance: ['a'], files: ['docs/note.md', 'docs/evidence/result.md'] },
    { id: 'D1', title: 'Release', commitMessage: 'chore: release', acceptance: ['b'], files: ['docs/release.md'], kind: 'delivery', dependencies: ['N'] },
  ],
};

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: root, env: env as NodeJS.ProcessEnv, encoding: 'utf8' });
}

const remote = (ref: string): string => execFileSync('git', ['rev-parse', ref], { cwd: bare, env: env as NodeJS.ProcessEnv, encoding: 'utf8' }).trim();

async function kit<T = Record<string, unknown>>(...args: string[]): Promise<T> {
  const outcome = await runner.run<T>(root, args);
  assert.ok(outcome.ok, `${args[0]}: ${JSON.stringify(outcome)}`);
  return outcome.result;
}

const put = async (name: string, text: string) => {
  await mkdir(path.dirname(path.join(root, name)), { recursive: true });
  await writeFile(path.join(root, name), text);
};

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-complete-real-'));
  const home = path.join(tmp, 'home');
  await mkdir(home);
  const gitconfig = path.join(home, '.gitconfig');
  await writeFile(gitconfig, '[user]\n\tname = Kit Tester\n\temail = kit.tester@wfk-tests.org\n[init]\n\tdefaultBranch = main\n');
  env = { PATH: process.env['PATH'], HOME: home, GIT_CONFIG_GLOBAL: gitconfig, GIT_CONFIG_NOSYSTEM: '1', LANG: 'C.UTF-8' };
  if (process.env['SystemRoot']) env['SystemRoot'] = process.env['SystemRoot'];
  const bundle = await ensureKitBundle({ appDir: path.join(tmp, 'app') });
  runner = createKitRunner({ runCommand, appBundle: async () => bundle.file, env });
  root = path.join(tmp, 'project');
  bare = path.join(tmp, 'remote.git');
  await mkdir(root, { recursive: true });
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare], { env: env as NodeJS.ProcessEnv });
  git('init', '-q');
  await put('README.md', '# Demo\n');
  await put('.gitignore', '# wfk:begin\n.workflow-kit/local/\n# wfk:end\n');
  await put('docs/spec.md', '# Spec\n');
  await put('.github/workflows/ci.yml', CI);
  git('add', '.');
  git('commit', '-q', '-m', 'init');
  git('remote', 'add', 'origin', bare);
  git('push', '-q', '-u', 'origin', 'main');
  assert.ok((await runner.install(root)).ok);
  await put('.harness/inputs/scope.json', JSON.stringify(SCOPE));
  await kit('scope:propose', '--input', '.harness/inputs/scope.json', '--recommended', 'sequential', '--reason', 'One note and one release');
  const digest = (await kit<{ proposalDigest: string }>('scope:proposal', '--digest')).proposalDigest;
  await kit('scope:choose', '--generation', '1', '--option', 'sequential', '--session', 's-1', '--note', 'User chose sequential', '--expected-digest', digest);
  await mkdir(path.join(tmp, 'config'));
  const settings = createSettingsStore({ configDir: path.join(tmp, 'config') });
  await settings.write({ expectedRevision: 0, mode: 'after-start', review: false });
  const tickets = createHostTickets();
  journal = createRunJournal();
  const runKit = createRunKit({ runner, tickets });
  const projectPath = async () => root;
  const listProjects = async () => [{ id: 'p', path: root }];
  const gitEnv: typeof runGit = (cwd, args) => runGit(cwd, args);
  runs = createRuns({ settings, journal, kit: runKit, tickets, words: () => [], projectPath, listProjects });
  waits = createRunWaits({ journal, kit: runKit, ci: { read: async (_root, sha) => (read.push(sha), verdict(sha)) }, projectPath, listProjects, send: () => assert.fail('the service CI sends no message') });
  completion = createRunCompletion({ journal, kit: runKit, publisher: createPublisher({ git: gitEnv }), git: gitEnv, projectPath, listProjects });
});

after(async () => {
  await rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

const active = async (): Promise<RunRecord> => (await journal.list(root)).at(-1)!;

test('validation 1.4: accept, close and publish of exactly the verified SHA, by the service', async () => {
  const run = (await runs.beginExecution('p', KEY))!;
  assert.equal((await completion.advance('p'))?.phase, 'executing', 'nothing to finish while tasks are open');
  await kit('task:start', 'N');
  await put('docs/note.md', '# Note\n');
  await put('docs/evidence/result.md', '# Result\nThe note explains the feature.\n');
  await kit('commit', '--task', 'N');
  await put('.harness/inputs/digest.json', JSON.stringify({ result: 'Done.', decisions: [], contracts: [], references: [] }));
  await kit('task:start', 'DOCS-R1');
  await put('README.md', '# Demo, documented\n');
  await kit('commit', '--task', 'DOCS-R1', '--digest', '.harness/inputs/digest.json');
  await kit('task:start', 'D1', '--autopilot-run', run.runId);
  await put('docs/release.md', '# Release\n');
  await kit('commit', '--task', 'D1');

  // Before the acceptance the service sends the candidate HEAD to the frozen CI branch and waits.
  const candidate = git('rev-parse', 'HEAD').trim();
  const staged = await completion.advance('p');
  assert.deepEqual([staged?.phase, staged?.pausedFrom, staged?.wait?.sha, staged?.wait?.stage], ['waiting', 'accepting', candidate, 'service']);
  assert.equal(remote('ci/auto'), candidate);
  await waits.pollAll();
  assert.equal((await active()).phase, 'accepting');

  // A foreign file: the acceptance goes through, the close is refused and the file stays.
  await put('notes-of-the-user.txt', 'mine\n');
  const blocked = await completion.advance('p');
  assert.deepEqual([blocked?.phase, blocked?.pausedFrom], ['blocked', 'closing']);
  assert.match(blocked?.reason ?? '', /^DIRTY_TREE/u);
  await access(path.join(root, 'notes-of-the-user.txt'));
  assert.match(git('log', '-1', '--format=%s').trim(), new RegExp(`^chore: accept scope auto \\(autopilot run ${run.runId}\\)$`, 'u'));
  await rm(path.join(root, 'notes-of-the-user.txt'));
  assert.equal((await runs.resume('p', KEY))?.runId, run.runId);

  // Close, then the final SHA of the close goes to the CI branch; main is not pushed before it is green.
  const waiting = await completion.advance('p');
  const final = git('rev-parse', 'HEAD').trim();
  assert.match(git('log', '-1', '--format=%s').trim(), new RegExp(`^chore: close scope auto \\(autopilot run ${run.runId}\\)$`, 'u'));
  assert.deepEqual([waiting?.phase, waiting?.pausedFrom, waiting?.wait?.sha, waiting?.completion?.finalSha], ['waiting', 'publishing', final, final]);
  assert.equal(remote('ci/auto'), final);
  assert.notEqual(remote('main'), final);
  assert.equal((await kit<{ scope: string }>('autopilot:status')).scope, 'NONE', 'publishing outlives the closed scope');

  // A push that reached the remote before a crash: the run verifies the SHA and pushes nothing.
  await waits.pollAll();
  git('push', '-q', 'origin', 'HEAD:main');
  const done = await completion.advance('p');
  assert.equal(done?.phase, 'completed');
  assert.equal(remote('main'), final);
  assert.match(done?.receipts.at(-1)?.detail ?? '', /already had/u);
  assert.deepEqual(read, [candidate, final], 'CI read exactly the candidate and the final SHA');
  assert.deepEqual(done?.receipts.map((r) => r.type), ['authorize', 'ci-stage', 'ci', 'accept', 'close', 'ci-stage', 'ci', 'publish']);
  const history = git('log', '--format=%B');
  assert.doesNotMatch(history, /пользователь проверил|user checked|user verified/iu);
  assert.equal(git('status', '--porcelain'), '');
  assert.equal(await journal.active(root), null, 'a completed run acts no more');
});
