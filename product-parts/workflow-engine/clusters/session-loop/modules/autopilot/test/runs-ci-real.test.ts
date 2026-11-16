// M39 T007 with the real Kit bundle: a started after-start run gets its delivery confirmed in
// advance (`task:start --autopilot-run`), reports the wait for CI with the digest of the frozen
// policy, a red CI defers the started delivery through the public Kit command, and the stop
// revokes the grant for good. CI itself is scripted; Kit is real.
// HOME and the global git config point into the temporary folder.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { ensureKitBundle } from '#kit-bundle';
import { createKitRunner, type KitRunner } from '#kit-runner';
import { runCommand } from '#process-supervisor';
import { createHostTickets, createRunControl, createRunJournal, createRunKit, createRunWaits, createRuns, createSettingsStore, decideAutopilot, hostInputDigest } from '../src/index.ts';
import type { AutopilotProjectStatus, CiReadVerdict, RunControl, RunJournal, RunWaits, Runs } from '../src/index.ts';

let tmp = '';
let root = '';
let runner: KitRunner;
let env: Record<string, string | undefined> = {};
let runs: Runs;
let waits: RunWaits;
let control: RunControl;
let journal: RunJournal;
let verdict: CiReadVerdict = { state: 'pending', sha: '', missing: [], running: [] };
const sent: string[] = [];
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
    { id: 'N', title: 'Note', commitMessage: 'docs: note', acceptance: ['a'], files: ['docs/note.md'] },
    { id: 'D1', title: 'Release', commitMessage: 'chore: release', acceptance: ['b'], files: ['docs/release.md'], kind: 'delivery', dependencies: ['N'] },
  ],
};

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: root, env: env as NodeJS.ProcessEnv, encoding: 'utf8' });
}

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
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-runs-ci-real-'));
  const home = path.join(tmp, 'home');
  await mkdir(home);
  const gitconfig = path.join(home, '.gitconfig');
  await writeFile(gitconfig, '[user]\n\tname = Kit Tester\n\temail = kit.tester@wfk-tests.org\n[init]\n\tdefaultBranch = main\n');
  env = { PATH: process.env['PATH'], HOME: home, GIT_CONFIG_GLOBAL: gitconfig, GIT_CONFIG_NOSYSTEM: '1', LANG: 'C.UTF-8' };
  if (process.env['SystemRoot']) env['SystemRoot'] = process.env['SystemRoot'];
  const bundle = await ensureKitBundle({ appDir: path.join(tmp, 'app') });
  runner = createKitRunner({ runCommand, appBundle: async () => bundle.file, env });
  root = path.join(tmp, 'project');
  await mkdir(root, { recursive: true });
  git('init', '-q');
  await put('README.md', '# Demo\n');
  await put('.gitignore', '# wfk:begin\n.workflow-kit/local/\n# wfk:end\n');
  await put('docs/spec.md', '# Spec\n');
  await put('.github/workflows/ci.yml', CI);
  git('add', '.');
  git('commit', '-q', '-m', 'init');
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
  const send = (_p: string, _k: string, text: string) => void sent.push(text);
  runs = createRuns({ settings, journal, kit: runKit, tickets, words: () => [], projectPath, listProjects });
  waits = createRunWaits({ journal, kit: runKit, ci: { read: async () => verdict }, projectPath, listProjects, send });
  control = createRunControl({ journal, kit: runKit, projectPath, listProjects, send, actions: () => ({ pause: async () => undefined, resume: async (_p, s) => ({ owner: s! }), halt: () => undefined }), activity: () => undefined });
});

after(async () => {
  await rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

test('delivery confirmed in advance, the wait for CI of the frozen policy, a red CI defers the started delivery', async () => {
  const run = await runs.beginExecution('p', KEY);
  assert.ok(run);
  await kit('task:start', 'N');
  await put('docs/note.md', '# Note\n');
  await kit('commit', '--task', 'N');
  await put('.harness/inputs/digest.json', JSON.stringify({ result: 'Done.', decisions: [], contracts: [], references: [] }));
  await kit('task:start', 'DOCS-R1');
  await put('README.md', '# Demo, documented\n');
  await kit('commit', '--task', 'DOCS-R1', '--digest', '.harness/inputs/digest.json');
  // The shared decision with the real status: the run's grant confirms D1, no card.
  const status = await kit<AutopilotProjectStatus & { authorization: { ci: unknown } }>('autopilot:status');
  const decision = decideAutopilot({ enabled: true, continues: 41, maxContinues: Number.POSITIVE_INFINITY, orchestrationKey: null }, status, { before: { head: null, revision: -1 }, outcome: 'completed', userMessage: false });
  assert.equal(decision.action, 'continue');
  assert.match((decision as { text: string }).text, new RegExp(`task:start D1 --autopilot-run ${run.runId}`, 'u'));
  await kit('task:start', 'D1', '--autopilot-run', run.runId);
  await put('docs/release.md', '# Release\n');
  const sha = git('rev-parse', 'HEAD').trim();
  const input = { runId: run.runId, actionId: `ci:${sha}`, stage: 'pushed', targetSha: sha, ciPolicyDigest: hostInputDigest(status.authorization.ci), waitReason: 'CI of ci/auto' };
  const weaker = hostInputDigest({ ...(status.authorization.ci as object), requiredChecks: [] });
  await assert.rejects(waits.progress('p', KEY, { ...input, ciPolicyDigest: weaker }), { code: 'ci-policy-mismatch' });
  assert.equal((await waits.progress('p', KEY, input)).recorded, true);
  verdict = { state: 'failed', sha, failed: [{ name: 'Linux x64', conclusion: 'failure' }] };
  // The deferral needs a clean tree: the delivery's own result stays outside git (Kit rule).
  await rm(path.join(root, 'docs', 'release.md'));
  await waits.pollAll();
  const after = await journal.read(root, run.runId);
  assert.deepEqual([after?.phase, after?.wait, after?.receipts.at(-1)?.type], ['executing', null, 'ci-failed']);
  assert.match(sent.at(-1) ?? '', /deferred delivery task D1/u);
  const next = (await kit<{ nextTask: { id: string; status: string } }>('autopilot:status')).nextTask;
  assert.deepEqual([next.id, next.status], ['D1', 'TODO']);
  assert.match(git('log', '-1', '--format=%s'), /defer delivery D1 \(attempt 1\)/u);
});

test('stop revokes the grant for good through the host ticket', async () => {
  const run = (await journal.active(root))!;
  const stopped = await control.stop('p', { runId: run.runId, expectedRevision: run.revision });
  assert.equal(stopped.phase, 'stopped');
  const status = await kit<{ authorization: { revoked: { reason: string } | null } }>('autopilot:status');
  assert.equal(status.authorization.revoked?.reason, 'user-stop');
  assert.equal(git('status', '--porcelain'), '');
});
