// M39 T010, orchestrated with the real Kit bundle, channel and autopilot: a full run whose plan
// recommends orchestration is chosen orchestrated when the provider runs executors (sequential
// with the reason otherwise); the start message is the orchestrator's; Kit lists both independent
// tasks as ready, and a turn that ends while executors work is a wait (waiting-for-executors),
// not a turn without progress. Executors, their
// worktrees and the integration are not run here (they are covered by Kit's own tests).
// HOME and the global git config point into the temporary folder.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createAgentChannel, parseHookInput } from '#agent-channel';
import type { AgentChannel } from '#agent-channel';
import { ensureKitBundle } from '#kit-bundle';
import { createKitRunner, createWorkflowState } from '#kit-runner';
import type { KitRunner, WorkflowState } from '#kit-runner';
import { runCommand } from '#process-supervisor';
import { createAutopilot, createHostTickets, createPreparation, createRunJournal, createRunKit, createRunTurns, createRuns, createSettingsStore } from '../src/index.ts';
import type { Autopilot, Preparation, RunKitStatus, Runs } from '../src/index.ts';

let tmp = '';
let runner: KitRunner;
let env: Record<string, string | undefined> = {};
const roots: Record<string, string> = {};
let workflow: WorkflowState;
let channel: AgentChannel;
let autopilot: Autopilot;
let runs: Runs;
let preparation: Preparation;
const capable = new Set<string>(['claude']);

const SCOPE = {
  id: 'orch',
  objective: 'Two independent notes',
  acceptance: ['Both notes exist'],
  approval: 'User approved the automated scope',
  spec: 'docs/spec.md',
  automation: {
    acceptance: [{ criterion: 0, kind: 'automatic', checks: [], evidence: ['docs/a.md', 'docs/b.md'] }],
    ci: null,
    delivery: [],
    publication: { branch: 'main', upstream: 'origin/main' },
  },
  tasks: [
    { id: 'A', title: 'Note A', commitMessage: 'docs: a', acceptance: ['a'], files: ['docs/a.md'], parallelSafe: true },
    { id: 'B', title: 'Note B', commitMessage: 'docs: b', acceptance: ['b'], files: ['docs/b.md'], parallelSafe: true },
  ],
};

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, env: env as NodeJS.ProcessEnv, encoding: 'utf8' });
}

async function project(id: string): Promise<void> {
  const root = path.join(tmp, id);
  roots[id] = root;
  await mkdir(path.join(root, 'docs'), { recursive: true });
  git(root, 'init', '-q');
  await writeFile(path.join(root, 'README.md'), '# Demo\n');
  await writeFile(path.join(root, '.gitignore'), '# wfk:begin\n.workflow-kit/local/\n# wfk:end\n');
  await writeFile(path.join(root, 'docs', 'spec.md'), '# Spec\n');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'init');
  assert.ok((await runner.install(root)).ok);
  await mkdir(path.join(root, '.harness', 'inputs'), { recursive: true });
}

const said = (id: string, client: string, text: string) =>
  channel.prompt(parseHookInput(client as 'claude', { session_id: 's-1', cwd: roots[id], hook_event_name: 'UserPromptSubmit', prompt: text })!).then((reply) => reply.ack());
async function stop(id: string, client = 'claude'): Promise<string | null> {
  const reply = await channel.stop(parseHookInput(client as 'claude', { session_id: 's-1', cwd: roots[id], hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: 'done' })!);
  reply.ack();
  return (reply.answer as { reason?: string } | null)?.reason ?? null;
}

async function propose(id: string): Promise<void> {
  await writeFile(path.join(roots[id]!, '.harness', 'inputs', 'scope.json'), JSON.stringify(SCOPE));
  const proposed = await runner.run(roots[id]!, ['scope:propose', '--input', '.harness/inputs/scope.json', '--recommended', 'orchestrated', '--reason', 'Two independent notes']);
  assert.ok(proposed.ok, JSON.stringify(proposed));
}

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-orch-real-'));
  const home = path.join(tmp, 'home');
  await mkdir(home);
  const gitconfig = path.join(home, '.gitconfig');
  await writeFile(gitconfig, '[user]\n\tname = Kit Tester\n\temail = kit.tester@wfk-tests.org\n[init]\n\tdefaultBranch = main\n');
  env = { PATH: process.env['PATH'], HOME: home, GIT_CONFIG_GLOBAL: gitconfig, GIT_CONFIG_NOSYSTEM: '1', LANG: 'C.UTF-8' };
  if (process.env['SystemRoot']) env['SystemRoot'] = process.env['SystemRoot'];
  const bundle = await ensureKitBundle({ appDir: path.join(tmp, 'app') });
  runner = createKitRunner({ runCommand, appBundle: async () => bundle.file, env });
  await project('orch');
  await project('fallback');
  const listProjects = async () => Object.entries(roots).map(([id, root]) => ({ id, path: root }));
  const projectPath = async (id: string) => roots[id];
  const resolveProject = async (folder: string) => {
    const found = Object.entries(roots).find(([, root]) => folder === root);
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
  const orchestration = async (client: string) => (capable.has(client) ? { available: true } : { available: false, reason: 'no executors' });
  runs = createRuns({ settings, journal, kit: runKit, tickets, userSource: (key) => channel.userSource(key), projectPath, listProjects });
  autopilot = createAutopilot({
    runner, workflow, channel, projectPath, orchestration, runs: createRunTurns({ journal, projectPath }),
    authority: { beforeStart: async (id, key) => (await runs.beginExecution(id, key))?.runId ?? null, beforeResume: async (id, key) => (await runs.resume(id, key))?.runId ?? null },
  });
  channel.setDecider((context) => autopilot.decide(context));
  preparation = createPreparation({ journal, kit: runKit, projectPath, review: () => null, reviewOn: () => false, actions: () => autopilot, orchestration });
  channel.onStop((event) => void (event.projectId && preparation.reconcile(event.projectId)));
});

after(async () => {
  channel.close();
  workflow.stop();
  await rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

test('orchestrated: the recommended mode is chosen, the orchestrator hands out the ready tasks, executors at work are a wait', async () => {
  await said('orch', 'claude', 'Да, составляй спецификацию и план');
  const prepared = await runs.authorizePreparation('orch', 'claude:s-1', 'Two notes').then((prepared) => prepared!);
  await propose('orch');
  const start = await stop('orch');
  assert.match(start ?? '', /orchestrat/iu, 'the orchestrator start message');
  const status = await runner.run<RunKitStatus & { orchestration: { readyTasks: string[] } | null; authorization: { runId: string } }>(roots['orch']!, ['autopilot:status']);
  assert.ok(status.ok);
  assert.equal(status.result.authorization.runId, prepared.runId);
  assert.deepEqual(status.result.orchestration?.readyTasks, ['A', 'B'], 'both independent tasks are ready for executors');
  const journal = await createRunJournal().active(roots['orch']!);
  assert.match(journal!.receipts.find((r) => r.type === 'choose')!.detail, /orchestrated/u);
  // The orchestrator hands out both ready tasks as the start message says, then ends its turn:
  // with executors at work the turn is a wait — no continuation, no turn without progress.
  for (const task of ['A', 'B']) {
    const created = await runner.run<{ assignment: { id: string; taskId: string } }>(roots['orch']!, ['assignment:create', '--task', task]);
    assert.ok(created.ok, JSON.stringify(created));
  }
  assert.equal(await stop('orch'), null);
  const pilot = autopilot.get('claude:s-1');
  assert.equal(pilot?.last?.reason, 'waiting-for-executors', JSON.stringify(pilot?.last));
  const run = await createRunJournal().active(roots['orch']!);
  assert.deepEqual([run?.phase, run?.noProgress ?? 0], ['executing', 0]);
});

test('orchestrated recommended, the provider runs no executors: sequential with the reason', async () => {
  capable.delete('codex');
  await said('fallback', 'codex', 'Да, составляй спецификацию и план');
  const prepared = await runs.authorizePreparation('fallback', 'codex:s-1', 'Two notes').then((prepared) => prepared!);
  assert.ok(prepared.runId);
  await propose('fallback');
  const start = await stop('fallback', 'codex');
  assert.match(start ?? '', /Execution mode: sequential/u);
  const journal = await createRunJournal().active(roots['fallback']!);
  assert.match(journal!.receipts.find((r) => r.type === 'choose')!.detail, /sequential fallback/u);
});
