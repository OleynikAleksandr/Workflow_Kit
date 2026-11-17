// M39 T006 with the real Kit bundle: a full run goes from the user's direct instruction through
// the proposal to the automatic choice (`--expected-digest` of `scope:proposal --digest`) and the
// start with the grant, with the real channel and autopilot; a changed specification cancels the
// admission (the reconciler and Kit both refuse the old digest).
// HOME and the global git config point into the temporary folder.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createAgentChannel, parseHookInput } from '#agent-channel';
import type { AgentChannel, HookReply } from '#agent-channel';
import { ensureKitBundle } from '#kit-bundle';
import { createKitRunner, createWorkflowState } from '#kit-runner';
import type { KitRunner, WorkflowState } from '#kit-runner';
import { runCommand } from '#process-supervisor';
import { PREPARE_TEXTS, WorkflowActionError, createAutopilot, createHostTickets, createPreparation, createRunJournal, createRunKit, createRuns, createSettingsStore } from '../src/index.ts';
import type { Autopilot, Preparation, ReviewFact, RunKitStatus, Runs } from '../src/index.ts';

let tmp = '';
let runner: KitRunner;
let env: Record<string, string | undefined> = {};
const roots: Record<string, string> = {};
let workflow: WorkflowState;
let channel: AgentChannel;
let autopilot: Autopilot;
let runs: Runs;
let preparation: Preparation;
const reviews = new Map<string, ReviewFact>();
const reviewOn = new Set<string>();

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

async function project(id: string): Promise<string> {
  const root = path.join(tmp, id);
  roots[id] = root;
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await mkdir(path.join(root, '.github', 'workflows'), { recursive: true });
  git(root, 'init', '-q');
  await writeFile(path.join(root, 'README.md'), '# Demo\n');
  await writeFile(path.join(root, '.gitignore'), '# wfk:begin\n.workflow-kit/local/\n# wfk:end\n');
  await writeFile(path.join(root, 'docs', 'spec.md'), '# Spec\n');
  await writeFile(path.join(root, '.github', 'workflows', 'ci.yml'), CI);
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'init');
  assert.ok((await runner.install(root)).ok);
  await mkdir(path.join(root, '.harness', 'inputs'), { recursive: true });
  return root;
}

async function propose(id: string): Promise<void> {
  const root = roots[id]!;
  await writeFile(path.join(root, '.harness', 'inputs', 'scope.json'), JSON.stringify(SCOPE));
  const proposed = await runner.run(root, ['scope:propose', '--input', '.harness/inputs/scope.json', '--recommended', 'sequential', '--reason', 'One note and one release']);
  assert.ok(proposed.ok, JSON.stringify(proposed));
}

const said = (id: string, sessionId: string, text: string) =>
  channel.prompt(parseHookInput('claude', { session_id: sessionId, cwd: roots[id], hook_event_name: 'UserPromptSubmit', prompt: text })!).then((reply) => reply.ack());
const stopOf = (id: string, sessionId: string) =>
  channel.stop(parseHookInput('claude', { session_id: sessionId, cwd: roots[id], hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: 'Plan proposed' })!);

async function settle(promise: Promise<HookReply>): Promise<string | null> {
  const reply = await promise;
  reply.ack();
  return (reply.answer as { reason?: string } | null)?.reason ?? null;
}

async function status(id: string): Promise<RunKitStatus> {
  const outcome = await runner.run<RunKitStatus>(roots[id]!, ['autopilot:status']);
  assert.ok(outcome.ok);
  return outcome.result;
}

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-prepare-real-'));
  const home = path.join(tmp, 'home');
  await mkdir(home);
  const gitconfig = path.join(home, '.gitconfig');
  await writeFile(gitconfig, '[user]\n\tname = Kit Tester\n\temail = kit.tester@wfk-tests.org\n[init]\n\tdefaultBranch = main\n');
  env = { PATH: process.env['PATH'], HOME: home, GIT_CONFIG_GLOBAL: gitconfig, GIT_CONFIG_NOSYSTEM: '1', LANG: 'C.UTF-8' };
  if (process.env['SystemRoot']) env['SystemRoot'] = process.env['SystemRoot'];
  const bundle = await ensureKitBundle({ appDir: path.join(tmp, 'app') });
  runner = createKitRunner({ runCommand, appBundle: async () => bundle.file, env });
  await project('off');
  await project('changed');
  const listProjects = async () => Object.entries(roots).map(([id, root]) => ({ id, path: root }));
  const projectPath = async (id: string) => roots[id];
  const resolveProject = async (folder: string) => {
    const found = Object.entries(roots).find(([, root]) => folder.startsWith(root));
    return found ? { id: found[0] } : undefined;
  };
  workflow = createWorkflowState({ runner, listProjects, watch: () => null, syncMs: 0 });
  await workflow.start();
  channel = createAgentChannel({ resolveProject, holdMs: 30_000 });
  await mkdir(path.join(tmp, 'config'));
  const settings = createSettingsStore({ configDir: path.join(tmp, 'config') });
  await settings.write({ expectedRevision: 0, mode: 'full', review: false });
  const tickets = createHostTickets();
  const journal = createRunJournal();
  const runKit = createRunKit({ runner, tickets });
  runs = createRuns({ settings, journal, kit: runKit, tickets, userSource: (key) => channel.userSource(key), projectPath, listProjects });
  autopilot = createAutopilot({
    runner, workflow, channel, projectPath,
    authority: { beforeStart: async (id, key) => (await runs.beginExecution(id, key))?.runId ?? null, beforeResume: async () => null },
  });
  channel.setDecider((context) => autopilot.decide(context));
  preparation = createPreparation({
    journal, kit: runKit, projectPath,
    review: (id) => reviews.get(id) ?? null,
    reviewOn: (id) => reviewOn.has(id),
    actions: () => autopilot,
  });
  channel.onStop((event) => void (event.projectId && preparation.reconcile(event.projectId)));
});

after(async () => {
  channel.close();
  workflow.stop();
  await rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

test('full without review: instruction → proposal → automatic choice with the Kit digest → start with the grant', async () => {
  await said('off', 's-1', 'Да, составляй спецификацию и план');
  const prepared = await runs.authorizePreparation('off', 'claude:s-1', 'Release note').then((prepared) => prepared!);
  assert.ok(prepared.runId);
  await propose('off');
  const digest = await runner.proposalDigest(roots['off']!);
  assert.ok(digest.ok && digest.result);
  // The turn that proposed the plan ends: no card waits, the plan is chosen and started.
  const answer = await settle(stopOf('off', 's-1'));
  assert.match(answer ?? '', /Execution mode: sequential/u, 'the start message reaches the agent');
  assert.doesNotMatch(answer ?? '', /execution mode chosen/u, 'no «press the start button» message');
  await preparation.reconcile('off');
  const run = await runs.section().then((section) => section.projects['off']);
  assert.deepEqual([run?.runId, run?.phase, run?.scopeId], [prepared.runId, 'executing', 'auto']);
  const kit = await status('off');
  assert.equal(kit.authorization?.runId, prepared.runId);
  assert.equal(kit.proposal?.digest, digest.result.proposalDigest, 'the grant names the chosen version');
  const journal = await createRunJournal().active(roots['off']!);
  assert.deepEqual(journal?.receipts.map((r) => r.type), ['review', 'choose', 'authorize', 'start']);
  assert.equal(journal?.receipts[0]?.detail, 'skipped-by-setting', 'no review is not a successful review');
  assert.match(journal!.receipts[1]!.detail, new RegExp(`Автоматический выбор по поручению ${prepared.runId}: sequential`, 'u'));
  assert.equal(journal?.proposal?.digest, digest.result.proposalDigest);
  assert.equal(git(roots['off']!, 'status', '--porcelain'), '');
});

test('a specification changed after the agreement cancels the admission; Kit refuses the old digest too', async () => {
  reviewOn.add('changed');
  await said('changed', 's-2', 'Да, составляй спецификацию и план');
  const prepared = await runs.authorizePreparation('changed', 'claude:s-2', 'Release note').then((prepared) => prepared!);
  assert.ok(prepared.runId);
  await propose('changed');
  const before = await runner.proposalDigest(roots['changed']!);
  assert.ok(before.ok && before.result);
  // The review has not finished: the run waits for it.
  assert.equal((await preparation.reconcile('changed'))?.phase, 'reviewing');
  reviews.set('changed', { status: 'agreed', scopeId: 'auto', reason: null, reviewedProposal: { scopeId: 'auto', generation: before.result.generation, digest: before.result.proposalDigest } });
  // The author edits the specification after the agreement, without a new generation.
  await writeFile(path.join(roots['changed']!, 'docs', 'spec.md'), '# Spec\n\nChanged after the review.\n');
  const after = await runner.proposalDigest(roots['changed']!);
  assert.ok(after.ok && after.result);
  assert.equal(after.result.generation, before.result.generation);
  assert.notEqual(after.result.proposalDigest, before.result.proposalDigest);
  const blocked = await preparation.reconcile('changed');
  assert.deepEqual([blocked?.phase, blocked?.reason], ['blocked', PREPARE_TEXTS.changed]);
  // The race between reading the agreement and the choice: Kit itself refuses the old digest.
  await assert.rejects(
    autopilot.choose('changed', { session: 'claude:s-2', generation: before.result.generation, option: 'sequential', expectedDigest: before.result.proposalDigest, automatic: { runId: prepared.runId!, note: 'race' } }),
    (error: unknown) => error instanceof WorkflowActionError && error.code === 'PROPOSAL_CHANGED',
  );
  assert.equal((await status('changed')).authorization, null, 'nothing was started');
});
