// M39 T005: autopiloting runs against the real Kit bundle: the manual start records the grant
// through a host ticket the bundle verifies, a repeat adds nothing, the session card's off (M48;
// Settings off before) revokes it (resumable) and «Продолжить» writes a new revision; Settings
// pause nothing; a legacy plan gets no authority.
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
import { POLICY_TEXTS, createHostTickets, createRunJournal, createRunKit, createRuns, createSessionSettings, createSettingsStore } from '../src/index.ts';
import type { RunKitStatus, Runs, SessionSettingsStore, SettingsStore } from '../src/index.ts';

let tmp = '';
let runner: KitRunner;
let env: Record<string, string | undefined> = {};
const roots: Record<string, string> = {};
let settings: SettingsStore;
let sessions: SessionSettingsStore;
let runs: Runs;

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

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, env: env as NodeJS.ProcessEnv, encoding: 'utf8' });
}

async function project(id: string, scope: Record<string, unknown>): Promise<void> {
  const root = path.join(tmp, id);
  roots[id] = root;
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await mkdir(path.join(root, '.github', 'workflows'), { recursive: true });
  git(root, 'init', '-q');
  await writeFile(path.join(root, 'README.md'), '# Demo\n');
  // The managed structure of the app ignores its local data, the run journal included.
  await writeFile(path.join(root, '.gitignore'), '# wfk:begin\n.workflow-kit/local/\n# wfk:end\n');
  await writeFile(path.join(root, 'docs', 'spec.md'), '# Spec\n');
  await writeFile(path.join(root, '.github', 'workflows', 'ci.yml'), CI);
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'init');
  const installed = await runner.install(root);
  assert.ok(installed.ok, JSON.stringify(installed));
  await mkdir(path.join(root, '.harness', 'inputs'), { recursive: true });
  await writeFile(path.join(root, '.harness', 'inputs', 'scope.json'), JSON.stringify(scope));
  const proposed = await runner.run(root, ['scope:propose', '--input', '.harness/inputs/scope.json', '--recommended', 'sequential', '--reason', 'One note and one release']);
  assert.ok(proposed.ok, JSON.stringify(proposed));
  const reviewed = await runner.run<{ proposalDigest: string }>(root, ['scope:proposal', '--digest']);
  assert.ok(reviewed.ok);
  const chosen = await runner.run(root, ['scope:choose', '--generation', '1', '--option', 'sequential', '--session', 's-1', '--note', 'User chose sequential', '--expected-digest', reviewed.result.proposalDigest]);
  assert.ok(chosen.ok, JSON.stringify(chosen));
}

async function status(id: string): Promise<RunKitStatus> {
  const outcome = await runner.run<RunKitStatus>(roots[id]!, ['autopilot:status']);
  assert.ok(outcome.ok, JSON.stringify(outcome));
  return outcome.result;
}

const head = (id: string): string => git(roots[id]!, 'rev-parse', 'HEAD').trim();

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-runs-real-'));
  const home = path.join(tmp, 'home');
  await mkdir(home);
  const gitconfig = path.join(home, '.gitconfig');
  await writeFile(gitconfig, '[user]\n\tname = Kit Tester\n\temail = kit.tester@wfk-tests.org\n[init]\n\tdefaultBranch = main\n');
  env = { PATH: process.env['PATH'], HOME: home, GIT_CONFIG_GLOBAL: gitconfig, GIT_CONFIG_NOSYSTEM: '1', LANG: 'C.UTF-8' };
  if (process.env['SystemRoot']) env['SystemRoot'] = process.env['SystemRoot'];
  const bundle = await ensureKitBundle({ appDir: path.join(tmp, 'app') });
  runner = createKitRunner({ runCommand, appBundle: async () => bundle.file, env });
  await project('auto', SCOPE);
  const { automation: _automation, ...legacy } = SCOPE;
  await project('legacy', { ...legacy, id: 'legacy' });
  await mkdir(path.join(tmp, 'config'));
  settings = createSettingsStore({ configDir: path.join(tmp, 'config') });
  const tickets = createHostTickets();
  const journal = createRunJournal();
  sessions = createSessionSettings({ settings, journal, projectPath: async (id) => roots[id] });
  runs = createRuns({
    settings,
    sessions,
    journal,
    kit: createRunKit({ runner, tickets }),
    tickets,
    userSource: () => null,
    projectPath: async (id) => roots[id],
    listProjects: async () => Object.entries(roots).map(([id, root]) => ({ id, path: root })),
  });
  sessions.onChange((change) => runs.sessionChanged(change));
  await settings.write({ expectedRevision: 0, mode: 'after-start', review: false });
});

after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

test('a legacy plan: the policy is told ahead and the start gets no M39 authority', async () => {
  const policy = await runs.policy('legacy');
  assert.deepEqual([policy.policy, policy.text], ['legacy', POLICY_TEXTS.legacy]);
  const before = head('legacy');
  assert.equal(await runs.beginExecution('legacy', 'claude:s-1'), null);
  assert.equal(head('legacy'), before);
  assert.equal((await status('legacy')).authorization, null);
});

test('after-start: the manual start records the grant the bundle verifies; a repeat adds nothing', async () => {
  assert.equal((await runs.policy('auto')).policy, 'automatic');
  const run = await runs.beginExecution('auto', 'claude:s-1');
  assert.ok(run);
  assert.equal(run.phase, 'executing');
  assert.equal(run.request.source, 'panel-start');
  assert.equal(run.tickets.length, 1);
  assert.deepEqual(run.authority?.deliveryTaskIds, ['D1']);
  assert.equal(run.authority?.acceptancePolicy, 'automatic');
  const kit = await status('auto');
  assert.equal(kit.authorization?.runId, run.runId);
  assert.equal(kit.authorization?.revoked, null);
  assert.match(git(roots['auto']!, 'log', '-1', '--format=%s'), new RegExp(`authorize autopilot run ${run.runId}`, 'u'));
  const at = head('auto');
  const again = await runs.beginExecution('auto', 'claude:s-1');
  assert.equal(again?.runId, run.runId);
  assert.equal(head('auto'), at);
  assert.equal(git(roots['auto']!, 'status', '--porcelain'), '');
});

test('M48: Settings off pauses nothing; the session card off revokes the grant (resumable); on again does not resume; «Продолжить» writes a new revision', async () => {
  const current = (await settings.read()).settings;
  await settings.write({ expectedRevision: current.revision, mode: 'off', review: false });
  assert.equal((await runs.section()).projects['auto']?.phase, 'executing', 'Settings are the defaults of new sessions only');
  assert.equal((await status('auto')).authorization?.revoked, null);
  const own = await sessions.ensure('auto', 'claude:s-1');
  assert.deepEqual([own.mode, own.source], ['after-start', 'defaults'], 'the session kept the Settings of its start');
  // Another session's card does not touch the run of claude:s-1.
  const other = await sessions.ensure('auto', 'codex:s-9');
  assert.equal(other.mode, 'off', 'a new session takes the Settings of its start');
  await sessions.write('auto', 'codex:s-9', { expectedRevision: other.revision, mode: 'full' });
  await sessions.write('auto', 'codex:s-9', { expectedRevision: other.revision + 1, mode: 'off' });
  assert.equal((await runs.section()).projects['auto']?.phase, 'executing');
  await sessions.write('auto', 'claude:s-1', { expectedRevision: own.revision, mode: 'off' });
  const paused = (await runs.section()).projects['auto'];
  assert.deepEqual([paused?.phase, paused?.reason], ['paused', 'settings-off']);
  const revoked = (await status('auto')).authorization?.revoked as { reason?: string } | null;
  assert.equal(revoked?.reason, 'settings-off');
  await sessions.write('auto', 'claude:s-1', { expectedRevision: own.revision + 1, mode: 'after-start' });
  assert.equal((await runs.section()).projects['auto']?.phase, 'paused');
  await assert.rejects(runs.beginExecution('auto', 'claude:s-1'), { code: 'run-paused' });
  const resumed = await runs.resume('auto', 'claude:s-1');
  assert.equal(resumed?.phase, 'executing');
  assert.equal(resumed?.authority?.revocation, null);
  assert.ok((resumed?.authority?.grantRevision ?? 0) > 1);
  assert.equal(resumed?.tickets.length, 3);
  const kit = await status('auto');
  assert.equal(kit.authorization?.runId, resumed?.runId);
  assert.equal(kit.authorization?.revoked, null);
  assert.equal(git(roots['auto']!, 'status', '--porcelain'), '');
});
