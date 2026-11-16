// M39 T003 with the real vendored Kit bundle on a temporary git project: a red CI of the started
// delivery T012 → task:defer-delivery → plan:extend round=new with fixes and a new delivery D002 →
// task:update makes T012 wait for D002. Then the update of an installation marked as the older
// Kit 2.3.1 keeps the active scope. HOME and the global git config live in the temporary folder.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { ensureKitBundle, KIT_VERSION } from '../src/index.ts';

let tmp = '';
let bundle = '';
let env: NodeJS.ProcessEnv = {};

interface Envelope {
  ok: boolean;
  code?: string;
  result?: Record<string, unknown>;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, env, encoding: 'utf8' });
}

/** A Kit command: the app bundle for install, the project's own bundle for the rest. */
function kit(root: string, args: string[], file = path.join(root, '.harness', 'workflow', 'runtime', 'workflow.mjs')): Envelope {
  try {
    return JSON.parse(execFileSync(process.execPath, [file, ...args], { cwd: root, env, encoding: 'utf8' })) as Envelope;
  } catch (error) {
    return JSON.parse(String((error as { stdout?: string }).stdout)) as Envelope;
  }
}

function ok(root: string, args: string[]): Record<string, unknown> {
  const outcome = kit(root, args);
  assert.ok(outcome.ok, `${args[0]}: ${JSON.stringify(outcome)}`);
  return outcome.result ?? {};
}

async function put(root: string, name: string, text: string): Promise<string> {
  const file = path.join(root, ...name.split('/'));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
  return name;
}

interface PlanTask {
  id: string;
  status: string;
  iteration: number;
  dependencies: string[];
  deferrals?: Array<{ iteration: number; reason: string }>;
}

/** The plan state: the JSON block of the plan document in the working tree. */
async function plan(root: string): Promise<{ revision: number; tasks: PlanTask[]; scope: { execution?: { ownerSession: string | null } } }> {
  const text = await readFile(path.join(root, '.harness', 'plans', 'todo-plan.md'), 'utf8');
  return JSON.parse(text.split('```json')[1]!.split('```')[0]!);
}

function taskCommits(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of git(root, 'log', '--format=%H %(trailers:key=Workflow-Task,valueonly,separator=)').trim().split('\n')) {
    const [sha, task] = line.split(' ');
    if (sha && task && task !== '-' && !out[task]) out[task] = sha;
  }
  return out;
}

const delivery = (id: string, fields: Record<string, unknown> = {}) => ({
  id,
  title: `Delivery ${id}`,
  kind: 'delivery',
  commitMessage: `chore: ${id.toLowerCase()}`,
  acceptance: [`${id} done`],
  files: [`docs/${id.toLowerCase()}.md`],
  ...fields,
});

async function project(name: string): Promise<string> {
  const root = path.join(tmp, name);
  await mkdir(root, { recursive: true });
  git(root, 'init', '-q');
  await put(root, 'README.md', '# Demo\n');
  await put(root, 'docs/spec.md', '# Spec\n');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'init');
  const installed = kit(root, ['install', root, '--host', 'harness'], bundle);
  assert.ok(installed.ok, JSON.stringify(installed));
  await put(root, '.harness/inputs/scope.json', JSON.stringify({
    id: 'ship',
    objective: 'Deliver one note',
    acceptance: ['The note is delivered'],
    approval: 'User approved the delivery scope',
    spec: 'docs/spec.md',
    tasks: [
      { id: 'T001', title: 'Note', commitMessage: 'docs: note', acceptance: ['note'], files: ['docs/note.md'] },
      delivery('T011'),
      delivery('T012', { dependencies: ['T011'], files: ['docs/ci.md'] }),
    ],
  }));
  // A Harness project: the agent proposes, the user chooses the mode in the panel.
  ok(root, ['scope:propose', '--input', '.harness/inputs/scope.json', '--recommended', 'sequential', '--reason', 'One note and two deliveries']);
  const digest = ok(root, ['scope:proposal', '--digest'])['proposalDigest'] as string;
  ok(root, ['scope:choose', '--generation', '1', '--option', 'sequential', '--session', 'session-1', '--note', 'User chose sequential', '--expected-digest', digest]);
  await put(root, '.harness/inputs/digest.json', JSON.stringify({ result: 'Done.', decisions: [], contracts: [], references: [] }));
  ok(root, ['task:start', 'T001']);
  await put(root, 'docs/note.md', '# Note\n');
  ok(root, ['commit', '--task', 'T001']);
  ok(root, ['task:start', 'DOCS-R1']);
  await put(root, 'README.md', '# Demo, documented\n');
  ok(root, ['commit', '--task', 'DOCS-R1', '--digest', '.harness/inputs/digest.json']);
  ok(root, ['task:start', 'T011', '--confirmed', 'User: build and install']);
  await put(root, 'docs/t011.md', '# Installed\n');
  ok(root, ['commit', '--task', 'T011']);
  ok(root, ['task:start', 'T012', '--confirmed', 'User: check CI on the exact SHA']);
  return root;
}

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-defer-'));
  const home = path.join(tmp, 'home');
  await mkdir(home);
  const gitconfig = path.join(home, '.gitconfig');
  await writeFile(gitconfig, '[user]\n\tname = Kit Tester\n\temail = kit.tester@wfk-tests.org\n[init]\n\tdefaultBranch = main\n');
  env = { PATH: process.env['PATH'], HOME: home, GIT_CONFIG_GLOBAL: gitconfig, GIT_CONFIG_NOSYSTEM: '1', LANG: 'C.UTF-8' };
  if (process.env['SystemRoot']) env['SystemRoot'] = process.env['SystemRoot'];
  bundle = (await ensureKitBundle({ appDir: path.join(tmp, 'app') })).file;
});

after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

test('red CI of a started delivery: defer, fixes round with D002, T012 after D002', async () => {
  const root = await project('red-ci');
  const done = taskCommits(root);
  const revision = (): number => (ok(root, ['status']) as { revision: number }).revision;
  const rev = revision();
  // Safe refusals first: a DONE task, a stale revision, an evidence file written too early.
  assert.equal(kit(root, ['task:defer-delivery', 'T011', '--reason', 'CI failed: abc https://ci/1', '--expected-revision', String(rev)]).code, 'DELIVERY_DEFER_NOT_ALLOWED');
  assert.equal(kit(root, ['task:defer-delivery', 'T012', '--reason', 'CI failed: abc https://ci/1', '--expected-revision', String(rev - 1)]).code, 'REVISION_MISMATCH');
  await put(root, 'docs/ci.md', '# early\n');
  assert.equal(kit(root, ['task:defer-delivery', 'T012', '--reason', 'CI failed: abc https://ci/1', '--expected-revision', String(rev)]).code, 'DIRTY_TREE');
  await rm(path.join(root, 'docs', 'ci.md'));
  assert.equal(revision(), rev);

  const deferred = ok(root, ['task:defer-delivery', 'T012', '--reason', 'CI failed: abc https://ci/1', '--expected-revision', String(rev)]);
  assert.equal(deferred['nextIteration'], 2);
  await put(root, '.harness/inputs/fixes.json', JSON.stringify({
    round: 'new',
    kind: 'fixes',
    tasks: [
      { id: 'F001', title: 'Fix the note', commitMessage: 'fix: note', acceptance: ['fixed'], files: ['docs/note.md'], fixes: 'T001', why: 'CI failed on the note' },
      delivery('D002', { files: ['docs/t011.md'], title: 'Deliver the next patch' }),
    ],
  }));
  const extended = kit(root, ['plan:extend', '--input', '.harness/inputs/fixes.json', '--expected-revision', String(revision())]);
  assert.ok(extended.ok, JSON.stringify(extended));
  const t012 = (await plan(root)).tasks.find((task) => task.id === 'T012')!;
  await put(root, '.harness/inputs/t012.json', JSON.stringify({ dependencies: [...t012.dependencies, 'D002'] }));
  ok(root, ['task:update', 'T012', '--input', '.harness/inputs/t012.json', '--expected-revision', String(revision())]);
  const tasks = (await plan(root)).tasks;
  assert.deepEqual(tasks.map((task) => `${task.id}:${task.status}`), ['T001:DONE', 'DOCS-R1:DONE', 'T011:DONE', 'F001:TODO', 'DOCS-R2:TODO', 'D002:TODO', 'T012:TODO']);
  assert.deepEqual(tasks.find((task) => task.id === 'T012')!.deferrals!.map((entry) => entry.iteration), [1]);
  // T012 does not start before D002.
  ok(root, ['task:start', 'F001']);
  await put(root, 'docs/note.md', '# Note, fixed\n');
  ok(root, ['commit', '--task', 'F001']);
  ok(root, ['task:start', 'DOCS-R2']);
  await put(root, 'README.md', '# Demo, fixed\n');
  ok(root, ['commit', '--task', 'DOCS-R2', '--digest', '.harness/inputs/digest.json']);
  const early = kit(root, ['task:start', 'T012', '--confirmed', 'User: check CI on the exact SHA']);
  assert.equal(early.ok, false);
  assert.notEqual(early.code, 'TASK_ORDER');
  ok(root, ['task:start', 'D002', '--confirmed', 'User: deliver the next patch']);
  await put(root, 'docs/t011.md', '# Installed, next patch\n');
  ok(root, ['commit', '--task', 'D002']);
  ok(root, ['task:start', 'T012', '--confirmed', 'User: check CI on the exact SHA']);
  await put(root, 'docs/ci.md', '# green\n');
  ok(root, ['commit', '--task', 'T012']);
  const final = taskCommits(root);
  for (const id of ['T001', 'DOCS-R1', 'T011']) assert.equal(final[id], done[id], `${id} keeps its commit`);
  assert.deepEqual((ok(root, ['validate']) as { errors: unknown[] }).errors, []);
});

test('an installation marked as Kit 2.3.1 with an active scope updates and gets the command', async () => {
  const root = await project('old-kit');
  const manifest = path.join(root, '.harness', 'workflow', 'manifest.json');
  const current = JSON.parse(await readFile(manifest, 'utf8')) as Record<string, unknown>;
  await writeFile(manifest, `${JSON.stringify({ ...current, version: '2.3.1' }, null, 2)}\n`);
  const inspected = kit(root, ['inspect', root], bundle);
  assert.deepEqual([inspected.result?.['state'], inspected.result?.['version']], ['KIT_OUTDATED', '2.3.1']);
  const beforePlan = await plan(root);
  const beforeCommits = taskCommits(root);
  const updated = kit(root, ['install', root, '--host', 'harness', '--update'], bundle);
  assert.ok(updated.ok, JSON.stringify(updated));
  assert.equal(updated.result?.['version'], KIT_VERSION);
  // Tasks, owner and history stay; the update is its own commit.
  const afterPlan = await plan(root);
  assert.deepEqual(afterPlan.tasks, beforePlan.tasks);
  assert.equal(afterPlan.scope.execution?.ownerSession, 'session-1');
  assert.deepEqual(taskCommits(root), beforeCommits);
  assert.equal(kit(root, ['inspect', root], bundle).result?.['state'], 'KIT_OK');
  // The new command works on the started delivery.
  const rev = (ok(root, ['status']) as { revision: number }).revision;
  const deferred = ok(root, ['task:defer-delivery', 'T012', '--reason', 'CI failed: def https://ci/2', '--expected-revision', String(rev)]);
  assert.equal(deferred['taskId'], 'T012');
});
