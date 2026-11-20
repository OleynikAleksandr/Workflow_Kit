// M48 T002 against the real Kit bundle: a started plan with the `automation` block is taken over by
// the session card — the run is registered by the press (`session-card`) and the Kit grant names
// that source; a started plan without the block stays manual and gets no grant; the card of
// another session leaves the plan alone. HOME and the global git config point into the temporary
// folder.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { ensureKitBundle } from '#kit-bundle';
import { createKitRunner, type KitRunner } from '#kit-runner';
import { runCommand } from '#process-supervisor';
import { SWITCH_TEXTS, createHostTickets, createProposalGate, createRunJournal, createRunKit, createRuns, createSessionSettings, createSessionSwitch, createSettingsStore } from '../src/index.ts';
import type { RunKitStatus, SessionSettingsStore, SessionSwitch } from '../src/index.ts';

let tmp = '';
let runner: KitRunner;
let env: Record<string, string | undefined> = {};
const roots: Record<string, string> = {};
let sessions: SessionSettingsStore;
let switcher: SessionSwitch;

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

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-m48-switch-real-'));
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
  // Settings «off»: every session begins without the autopilot and is switched on its card.
  const settings = createSettingsStore({ configDir: path.join(tmp, 'config') });
  const tickets = createHostTickets();
  const journal = createRunJournal();
  const kit = createRunKit({ runner, tickets });
  const projectPath = async (id: string) => roots[id];
  sessions = createSessionSettings({ settings, journal, projectPath });
  const runs = createRuns({
    settings, sessions, journal, kit, tickets,
    userSource: () => null,
    projectPath,
    listProjects: async () => Object.entries(roots).map(([id, root]) => ({ id, path: root })),
  });
  sessions.onChange((change) => runs.sessionChanged(change));
  switcher = createSessionSwitch({
    journal, kit, runs, sessions, projectPath,
    gate: createProposalGate({ journal, kit, projectPath }),
    question: () => null,
    decideReview: async (_id, _key, on) => on,
    send: () => assert.fail('no message to the agent of a started plan'),
    wake: () => undefined,
    reconcile: async () => undefined,
  });
  sessions.onChange((change) => switcher.changed(change));
});

after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

async function toggle(id: string, key: string, mode: 'off' | 'after-start' | 'full'): Promise<string | null> {
  const record = await sessions.ensure(id, key);
  await sessions.write(id, key, { expectedRevision: record.revision, mode });
  return switcher.effect(id, key);
}

test('a started plan with the automation block: the card of its owner takes it over with a grant of the session-card source', async () => {
  assert.equal(await switcher.stage('auto', 'codex:s-9'), 'other-plan', 'the plan was chosen by s-1');
  assert.equal(await toggle('auto', 'codex:s-9', 'full'), SWITCH_TEXTS.otherPlan);
  assert.equal((await status('auto')).authorization, null);
  assert.equal(await switcher.stage('auto', 'claude:s-1'), 'executing');
  assert.equal(await toggle('auto', 'claude:s-1', 'full'), SWITCH_TEXTS.adopted);
  const kit = await status('auto');
  assert.ok(kit.authorization, 'Kit holds the grant');
  const grant = kit.authorization as unknown as { runId: string; source: string; mode: string; revoked: unknown };
  assert.deepEqual([grant.source, grant.mode, grant.revoked], ['session-card', 'full', null]);
  assert.match(git(roots['auto']!, 'log', '-1', '--format=%s'), new RegExp(`authorize autopilot run ${grant.runId}`, 'u'));
  assert.equal(git(roots['auto']!, 'status', '--porcelain'), '');
  assert.equal(await switcher.stage('auto', 'claude:s-1'), 'run');
  // Off pauses it (the grant is revoked, resumable); on again resumes the same run with a new revision.
  assert.equal(await toggle('auto', 'claude:s-1', 'off'), SWITCH_TEXTS.paused);
  assert.equal(((await status('auto')).authorization as unknown as { revoked: { reason: string } | null }).revoked?.reason, 'settings-off');
  assert.equal(await toggle('auto', 'claude:s-1', 'full'), SWITCH_TEXTS.resumed);
  const resumed = (await status('auto')).authorization as unknown as { runId: string; revoked: unknown; revision: number };
  assert.deepEqual([resumed.runId, resumed.revoked], [grant.runId, null]);
  assert.ok(resumed.revision > 1);
});

test('a started plan without the automation block stays manual: no run, no grant, the card says so', async () => {
  assert.equal(await toggle('legacy', 'claude:s-1', 'full'), SWITCH_TEXTS.noAutomation);
  assert.equal((await status('legacy')).authorization, null);
});
