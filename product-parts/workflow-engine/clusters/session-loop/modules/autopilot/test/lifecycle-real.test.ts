// M39 T010: the whole chain with the real Kit bundle, the real agent channel, the shared decider,
// the run journal, the waits, the control and the completion, on a temporary project with a bare
// upstream. A scripted agent does only what the messages of the service tell it. Checked:
// - the source → the grant → each real transition → the remote SHA;
// - one message per turn: Stop, a restart and «Продолжить» give no second one (F001);
// - a restart of the service in the middle sends one continuation and repeats nothing;
// - a question of the owner waits without an attempt; CI after the close; late callbacks after a
//   stop change nothing.
// CI results are scripted (no GitHub); the provider is the channel's hook protocol, not a live agent.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createAgentChannel, parseHookInput } from '#agent-channel';
import type { AgentChannel } from '#agent-channel';
import { createKeyedMutex } from '#data-store';
import { createPublisher, runGit } from '#git-publish';
import { ensureKitBundle } from '#kit-bundle';
import { createKitRunner, createWorkflowState } from '#kit-runner';
import type { KitRunner, WorkflowState } from '#kit-runner';
import { runCommand } from '#process-supervisor';
import { createAutopilot, createHostTickets, createRunCompletion, createRunControl, createRunJournal, createRunKit, createRunTurns, createRunWaits, createRuns, createSettingsStore } from '../src/index.ts';
import type { CiReadVerdict, RunRecord } from '../src/index.ts';

let tmp = '';
let bare = '';
let runner: KitRunner;
let env: Record<string, string | undefined> = {};
const roots: Record<string, string> = {};
const KEY = 'claude:s-1';
const ciReads: string[] = [];
const verdicts = new Map<string, CiReadVerdict['state']>();

const CI = 'name: CI\non:\n  push:\njobs:\n  test:\n    name: ${{ matrix.name }}\n    runs-on: ${{ matrix.os }}\n    strategy:\n      matrix:\n        include:\n          - name: Linux x64\n            os: ubuntu-latest\n    steps:\n      - run: npm test\n';

const SCOPE = {
  id: 'auto',
  objective: 'Explain the feature',
  acceptance: ['The note explains the feature'],
  approval: 'User approved the automated scope',
  spec: 'docs/spec.md',
  automation: {
    acceptance: [{ criterion: 0, kind: 'automatic', checks: [], evidence: ['docs/evidence/result.md'] }],
    ci: { remote: 'origin', branch: 'ci/auto', requiredChecks: ['Linux x64'], exactSha: true, task: 'D1' },
    delivery: [{ taskId: 'D1', effects: ['write the release note'] }],
    publication: { branch: 'main', upstream: 'origin/main' },
  },
  tasks: [
    { id: 'N', title: 'Note', commitMessage: 'docs: note', acceptance: ['a'], files: ['docs/note.md', 'docs/evidence/result.md'] },
    { id: 'D1', title: 'Release', commitMessage: 'chore: release', acceptance: ['b'], files: ['docs/release.md'], kind: 'delivery', dependencies: ['N'] },
  ],
};

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, env: env as NodeJS.ProcessEnv, encoding: 'utf8' }).trim();
}

async function kit<T = Record<string, unknown>>(id: string, ...args: string[]): Promise<T> {
  const outcome = await runner.run<T>(roots[id]!, args);
  assert.ok(outcome.ok, `${args[0]}: ${JSON.stringify(outcome)}`);
  return outcome.result;
}

const put = async (id: string, name: string, text: string) => {
  await mkdir(path.dirname(path.join(roots[id]!, name)), { recursive: true });
  await writeFile(path.join(roots[id]!, name), text);
};

async function project(id: string): Promise<void> {
  const root = path.join(tmp, id);
  roots[id] = root;
  await mkdir(root, { recursive: true });
  git(root, 'init', '-q');
  await put(id, 'README.md', '# Demo\n');
  await put(id, '.gitignore', '# wfk:begin\n.workflow-kit/local/\n# wfk:end\n');
  await put(id, 'docs/spec.md', '# Spec\n');
  await put(id, '.github/workflows/ci.yml', CI);
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'init');
  const remote = path.join(tmp, `${id}.git`);
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote], { env: env as NodeJS.ProcessEnv });
  git(root, 'remote', 'add', 'origin', remote);
  git(root, 'push', '-q', '-u', 'origin', 'main');
  assert.ok((await runner.install(root)).ok);
  await put(id, '.harness/inputs/scope.json', JSON.stringify({ ...SCOPE, tasks: SCOPE.tasks.map((t) => (t.id === 'N' ? { ...t, files: ['docs/note.md', 'docs/evidence/result.md'] } : t)) }));
  await kit(id, 'scope:propose', '--input', '.harness/inputs/scope.json', '--recommended', 'sequential', '--reason', 'One note and one release');
  const digest = (await kit<{ proposalDigest: string }>(id, 'scope:proposal', '--digest')).proposalDigest;
  await kit(id, 'scope:choose', '--generation', '1', '--option', 'sequential', '--session', 's-1', '--note', 'User chose sequential', '--expected-digest', digest);
  if (id === 'life') bare = remote;
}

/** One service: what `wfk serve` wires (cli autopiloting and session wiring), over the same files. */
async function boot() {
  const listProjects = async () => Object.entries(roots).map(([id, root]) => ({ id, path: root }));
  const projectPath = async (id: string) => roots[id];
  const resolveProject = async (folder: string) => {
    const found = Object.entries(roots).find(([, root]) => folder === root);
    return found ? { id: found[0] } : undefined;
  };
  const mutex = createKeyedMutex();
  const workflow: WorkflowState = createWorkflowState({ runner, listProjects, watch: () => null, syncMs: 0 });
  await workflow.start();
  const channel: AgentChannel = createAgentChannel({ resolveProject, holdMs: 30_000 });
  const settings = createSettingsStore({ configDir: path.join(tmp, 'config') });
  const tickets = createHostTickets();
  const journal = createRunJournal();
  const runKit = createRunKit({ runner, tickets });
  const send = (projectId: string, key: string, text: string) => void channel.enqueue(key, text, 'panel', projectId);
  const runs = createRuns({ settings, journal, kit: runKit, tickets, words: (key) => channel.userWords(key), projectPath, listProjects, mutex });
  await runs.load();
  const turns = createRunTurns({ journal, projectPath });
  let actions: ReturnType<typeof createAutopilot> | null = null;
  const control = createRunControl({ journal, kit: runKit, projectPath, listProjects, send, mutex, actions: () => actions, activity: (key) => channel.get(key) });
  const waits = createRunWaits({ journal, kit: runKit, ci: { read: async (_root, sha) => (ciReads.push(sha), verdicts.get(sha) === 'failed' ? { state: 'failed', sha, failed: [{ name: 'Linux x64', conclusion: 'failure' }] } : { state: 'success', sha, jobs: [{ name: 'Linux x64' }] }) }, projectPath, listProjects, send, mutex });
  const completion = createRunCompletion({ journal, kit: runKit, publisher: createPublisher({ git: runGit }), git: runGit, projectPath, listProjects, mutex });
  const autopilot = createAutopilot({
    runner, workflow, channel, projectPath, runs: turns,
    authority: {
      beforeStart: async (id, key) => (await runs.beginExecution(id, key))?.runId ?? null,
      beforeResume: async (id, key) => (await runs.resume(id, key))?.runId ?? null,
      onPause: (id, reason) => control.onPause(id, reason),
    },
  });
  actions = autopilot;
  channel.setDecider((context) => autopilot.decide(context));
  channel.onStop((event) => void (event.projectId && completion.advance(event.projectId)));
  return { workflow, channel, journal, runs, control, waits, completion, autopilot, mutex };
}
type Service = Awaited<ReturnType<typeof boot>>;

/** The owner's turn ends (Stop): the instruction the service answers with, or null. */
async function stop(svc: Service, id: string): Promise<string | null> {
  const reply = await svc.channel.stop(parseHookInput('claude', { session_id: 's-1', cwd: roots[id], hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: 'done' })!);
  reply.ack();
  return (reply.answer as { reason?: string } | null)?.reason ?? null;
}

/** The scripted agent: it does what the instruction says, within the plan, and ends the turn. */
async function agent(svc: Service, id: string, text: string, said: string[]): Promise<void> {
  said.push(text);
  const status = await kit<{ nextTask: { id: string; kind: string; status: string } | null; revision: number }>(id, 'autopilot:status');
  const task = status.nextTask;
  if (/CI is green/u.test(text)) {
    await put(id, 'docs/release.md', '# Release\n');
    await kit(id, 'commit', '--task', 'D1');
    return;
  }
  if (!task) return;
  if (task.status === 'TODO') {
    // The start message names the first task generically, every continuation names it exactly.
    // After a restart the service says «recover and follow its next line», which names the task.
    assert.match(text, new RegExp(`task:start (${task.id}|<ID>)|scripts/workflow recover`, 'u'), `the service names ${task.id}`);
    const granted = /--autopilot-run (run-[A-Za-z0-9_-]+)/u.exec(text);
    await kit(id, 'task:start', task.id, ...(granted ? ['--autopilot-run', granted[1]!] : []));
  }
  if (task.id === 'N') {
    await put(id, 'docs/note.md', '# Note\n');
    await put(id, 'docs/evidence/result.md', '# Result\nThe note explains the feature.\n');
    await kit(id, 'commit', '--task', 'N');
  } else if (task.id === 'DOCS-R1') {
    await put(id, '.harness/inputs/digest.json', JSON.stringify({ result: 'Done.', decisions: [], contracts: [], references: [] }));
    await put(id, 'README.md', '# Demo, documented\n');
    await kit(id, 'commit', '--task', 'DOCS-R1', '--digest', '.harness/inputs/digest.json');
  } else if (task.id === 'D1') {
    // The delivery: push the candidate to the CI branch of the grant and report the wait.
    const digest = /"ciPolicyDigest": "([0-9a-f]+)"/u.exec(text)?.[1];
    assert.ok(digest, 'the continuation of a delivery tells how to report the wait for CI');
    const sha = git(roots[id]!, 'rev-parse', 'HEAD');
    git(roots[id]!, 'push', '-q', 'origin', `${sha}:refs/heads/ci/auto`);
    const runId = /--autopilot-run (run-[A-Za-z0-9_-]+)/u.exec(text)?.[1] ?? (await svc.journal.active(roots[id]!))!.runId;
    await svc.waits.progress(id, KEY, { runId, actionId: `ci:${sha}`, stage: 'pushed', targetSha: sha, ciPolicyDigest: digest, waitReason: 'CI of ci/auto' });
  }
}

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-lifecycle-real-'));
  const home = path.join(tmp, 'home');
  await mkdir(home);
  const gitconfig = path.join(home, '.gitconfig');
  await writeFile(gitconfig, '[user]\n\tname = Kit Tester\n\temail = kit.tester@wfk-tests.org\n[init]\n\tdefaultBranch = main\n');
  env = { PATH: process.env['PATH'], HOME: home, GIT_CONFIG_GLOBAL: gitconfig, GIT_CONFIG_NOSYSTEM: '1', LANG: 'C.UTF-8' };
  if (process.env['SystemRoot']) env['SystemRoot'] = process.env['SystemRoot'];
  // runGit of the publisher runs in this process: it must use the temporary git identity too.
  process.env['HOME'] = home;
  process.env['GIT_CONFIG_GLOBAL'] = gitconfig;
  process.env['GIT_CONFIG_NOSYSTEM'] = '1';
  const bundle = await ensureKitBundle({ appDir: path.join(tmp, 'app') });
  runner = createKitRunner({ runCommand, appBundle: async () => bundle.file, env });
  await mkdir(path.join(tmp, 'config'));
  await createSettingsStore({ configDir: path.join(tmp, 'config') }).write({ expectedRevision: 0, mode: 'after-start', review: false });
  await project('life');
  await project('late');
});

after(async () => {
  await rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

test('after-start, sequential: one press → tasks → delivery with CI → acceptance → close → CI of the final SHA → verified remote SHA; a restart repeats nothing', async () => {
  let svc = await boot();
  const said: string[] = [];
  await svc.workflow.refresh('life');
  const started = await svc.autopilot.start('life', KEY);
  assert.ok(started.runId, 'the press records the grant before the first message');
  const runId = started.runId!;
  assert.equal((await kit<{ authorization: { runId: string } }>('life', 'autopilot:status')).authorization.runId, runId);
  // A second press and «Продолжить» while the start is on its way add nothing.
  const again = await svc.autopilot.start('life', KEY);
  assert.deepEqual([again.already, again.runId], [true, runId], 'a second press names the same run (F001)');
  assert.equal((await svc.journal.list(roots['life']!)).length, 1, 'a second press makes no second run');
  let restarted = false;
  let asked = false;
  for (let step = 0; step < 40; step += 1) {
    const text = await stop(svc, 'life');
    if (text) {
      await agent(svc, 'life', text, said);
      if (!asked && said.length === 2) {
        // The agent asks the user a question in the middle of a task: the run waits, no attempt is spent.
        asked = true;
        await svc.waits.questionStarted('life', KEY);
        assert.equal((await svc.journal.active(roots['life']!))?.wait?.reason, 'question');
        await svc.waits.questionEnded('life', KEY, 'answered');
      }
      if (!restarted && said.length === 1) {
        // The service restarts after the first task: one continuation of the same state, no new run.
        restarted = true;
        svc.channel.close();
        svc.workflow.stop();
        svc = await boot();
        await svc.control.recoverAll();
        await svc.control.recoverAll();
        assert.equal(svc.channel.queued(KEY).length, 1, 'one continuation after the restart');
        // F001: «Продолжить» joins the same run and adds no second message.
        assert.equal((await svc.autopilot.resume('life', KEY)).runId, runId, '«Продолжить» joins the same run');
        assert.equal(svc.channel.queued(KEY).length, 1, 'and sends no second message');
      }
      continue;
    }
    const run = await svc.journal.active(roots['life']!);
    if (!run) break;
    await svc.waits.pollAll();
    await svc.completion.advance('life');
  }
  const runs = await svc.journal.list(roots['life']!);
  assert.equal(runs.length, 1, 'one run for the whole plan');
  const run: RunRecord = runs[0]!;
  const final = git(roots['life']!, 'rev-parse', 'HEAD');
  assert.equal(run.phase, 'completed');
  assert.equal(git(bare, 'rev-parse', 'main'), final, 'main got exactly the verified SHA');
  assert.equal(run.completion?.finalSha, final);
  assert.ok(ciReads.includes(final), 'CI of the final SHA was read before main');
  assert.deepEqual(run.receipts.map((r) => r.type).filter((t) => t !== 'ci-stage'), ['authorize', 'ci', 'accept', 'close', 'ci', 'publish']);
  // Every instruction came from the service; each task got started exactly once.
  const history = git(roots['life']!, 'log', '--format=%s');
  for (const subject of ['docs: note', 'chore: release', `chore: accept scope auto (autopilot run ${runId})`, `chore: close scope auto (autopilot run ${runId})`]) {
    assert.equal(history.split('\n').filter((line) => line === subject).length, 1, subject);
  }
  // Four instructions, all from the service: the start, the recovery after the restart, the
  // delivery confirmed in advance, the green CI. No message after the close: the service finished.
  assert.equal(said.length, 4, said.join('\n'));
  assert.match(said[0]!, /the user started the plan/u);
  assert.match(said[1]!, new RegExp(`autopilot run ${runId} goes on after a restart`, 'u'));
  assert.match(said[2]!, new RegExp(`task:start D1 --autopilot-run ${runId}`, 'u'));
  assert.match(said[3]!, /CI is green/u);
  assert.doesNotMatch(git(roots['life']!, 'log', '--format=%B'), /пользователь проверил|user verified/iu);
  assert.equal(git(roots['life']!, 'status', '--porcelain'), '');
  // A later Stop of the finished run does nothing.
  assert.equal(await stop(svc, 'life'), null);
  svc.channel.close();
  svc.workflow.stop();
});

test('stop during a wait for CI: the grant is revoked for good, late CI and question callbacks change nothing', async () => {
  const svc = await boot();
  await svc.workflow.refresh('late');
  const { runId } = await svc.autopilot.start('late', KEY);
  const said: string[] = [];
  for (let step = 0; step < 10; step += 1) {
    const text = await stop(svc, 'late');
    if (!text) break;
    await agent(svc, 'late', text, said);
    if ((await svc.journal.active(roots['late']!))?.wait) break;
  }
  const waiting = (await svc.journal.active(roots['late']!))!;
  assert.deepEqual([waiting.runId, waiting.phase, waiting.wait?.reason], [runId, 'waiting', 'ci']);
  const stopped = await svc.control.stop('late', { runId: waiting.runId, expectedRevision: waiting.revision });
  assert.equal(stopped.phase, 'stopped');
  // The CI turns green and a question ends after the stop: nothing continues.
  const queued = svc.channel.queued(KEY).length;
  await svc.waits.pollAll();
  await svc.waits.questionEnded('late', KEY, 'answered');
  await svc.completion.advance('late');
  assert.equal(svc.channel.queued(KEY).length, queued, 'no message after the stop');
  assert.equal((await svc.journal.read(roots['late']!, waiting.runId))?.phase, 'stopped');
  assert.equal(await stop(svc, 'late'), null, 'the Stop of the owner is not continued');
  const status = await kit<{ authorization: { revoked: { reason: string; resumable: boolean } | null } }>('late', 'autopilot:status');
  assert.deepEqual([status.authorization.revoked?.reason, status.authorization.revoked?.resumable], ['user-stop', false]);
  // The plan stays for manual work: the delivery is still IN_PROGRESS, nothing was reset.
  assert.equal((await kit<{ nextTask: { id: string; status: string } }>('late', 'autopilot:status')).nextTask.status, 'IN_PROGRESS');
  await assert.rejects(svc.runs.resume('late', KEY).then((r) => (r ? Promise.reject(new Error('resumed')) : Promise.reject(Object.assign(new Error('null'), { code: 'final' })))), { code: 'final' });
  svc.channel.close();
  svc.workflow.stop();
});
