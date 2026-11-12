// Integration with the real Kit bundle (2.2.3) on temporary git repositories. HOME and the global
// git config point into the temporary folder, so the user's files are never read or written.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { KIT_VERSION, ensureKitBundle } from '#kit-bundle';
import { runCommand } from '#process-supervisor';
import type { CommandRunner } from '#process-supervisor';
import type { KitStatus } from '#plan-view';
import { createKitRunner, createWorkflowState } from '../src/index.ts';
import type { KitRunner, ProjectWorkflow, WatchFactory, WorkflowState } from '../src/index.ts';

let tmp = '';
let env: Record<string, string | undefined> = {};
let commands = 0;
let runner: KitRunner;
let base = '';

const counting: CommandRunner = async (command, args, options) => {
  commands += 1;
  return runCommand(command, args, options);
};

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, env: env as NodeJS.ProcessEnv, encoding: 'utf8' });
}

async function ok<T>(promise: Promise<{ ok: boolean }>): Promise<T> {
  const outcome = (await promise) as { ok: boolean; result?: T; code?: string; message?: string };
  assert.ok(outcome.ok, `${outcome.code}: ${outcome.message}`);
  return outcome.result as T;
}

const PLAN = {
  id: 'demo',
  objective: 'Склад — анализ остатков',
  acceptance: ['Отчёт есть'],
  approval: 'User: implement the demo plan now',
  spec: 'docs/spec.md',
  tasks: [
    { id: 'T001', title: 'Загрузчик', commitMessage: 'feat: loader', acceptance: ['a'], files: ['src/a.ts'] },
    { id: 'T002', title: 'Закупки', commitMessage: 'feat: buy', acceptance: ['b'], files: ['src/b.ts'], parallelSafe: true, dependencies: ['T001'] },
    { id: 'T003', title: 'Инвентаризация', commitMessage: 'feat: inv', acceptance: ['c'], files: ['src/c.ts'], parallelSafe: true, dependencies: ['T001'] },
  ],
};

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-kit-runner-'));
  const home = path.join(tmp, 'home');
  await mkdir(home);
  const gitconfig = path.join(home, '.gitconfig');
  await writeFile(gitconfig, '[user]\n\tname = Kit Tester\n\temail = kit.tester@wfk-tests.org\n[init]\n\tdefaultBranch = main\n');
  env = { PATH: process.env['PATH'], HOME: home, GIT_CONFIG_GLOBAL: gitconfig, GIT_CONFIG_NOSYSTEM: '1', LANG: 'C.UTF-8' };
  const bundle = await ensureKitBundle({ appDir: path.join(tmp, 'app') });
  runner = createKitRunner({ runCommand: counting, appBundle: async () => bundle.file, env });

  base = path.join(tmp, 'base');
  await mkdir(path.join(base, 'docs'), { recursive: true });
  git(base, 'init', '-q');
  await writeFile(path.join(base, 'README.md'), '# Demo\n');
  git(base, 'add', 'README.md');
  git(base, 'commit', '-q', '-m', 'init');
  const inspect = await ok<{ action: string; git: { repository: boolean } }>(runner.inspect(base));
  assert.equal(inspect.git.repository, true);
  const install = await ok<{ version: string }>(runner.install(base));
  assert.equal(install.version, KIT_VERSION);
  assert.ok(runner.installed(base));
  // Kit 2.2.3 delivers the recovery packet whole: six Claude hooks, one per part, and one Codex
  // hook with a raised output limit (spec M21 section 3.1).
  const claude = JSON.parse(await readFile(path.join(base, '.claude', 'settings.json'), 'utf8'));
  const claudeCommands = claude.hooks.SessionStart.map((g: { hooks: Array<{ command: string }> }) => g.hooks[0]!.command);
  assert.deepEqual(claudeCommands.filter((c: string) => c.includes('scripts/workflow')), [1, 2, 3, 4, 5, 6].map((k) => `"$CLAUDE_PROJECT_DIR/scripts/workflow" hook session-start --client claude --part ${k}/6`));
  const codex = JSON.parse(await readFile(path.join(base, '.codex', 'hooks.json'), 'utf8'));
  assert.deepEqual(codex.hooks.SessionStart[0].hooks[0], { additionalContextLimit: 65_536, command: 'scripts/workflow hook session-start --client codex', type: 'command' });
  await writeFile(path.join(base, 'docs', 'spec.md'), '# Spec\n');
  await ok(runner.run(base, ['docs:commit', '--files', 'docs/spec.md']));
  await writeFile(path.join(tmp, 'plan.json'), JSON.stringify(PLAN));
});

after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

async function copyOfBase(name: string): Promise<string> {
  const root = path.join(tmp, name);
  await cp(base, root, { recursive: true });
  return root;
}

async function propose(root: string): Promise<void> {
  await ok(runner.run(root, ['scope:propose', '--input', path.join(tmp, 'plan.json'), '--recommended', 'orchestrated', '--reason', 'части независимы']));
}

/** A watch factory whose listeners the test fires by hand. */
function manualWatch(): { factory: WatchFactory; fire: (filename: string) => void } {
  const listeners = new Set<(filename: string | null) => void>();
  return {
    factory: (folder, _options, listener) => {
      if (!folder.endsWith('.harness')) return { close: () => undefined };
      listeners.add(listener);
      return { close: () => listeners.delete(listener) };
    },
    fire: (filename) => {
      for (const listener of [...listeners]) listener(filename);
    },
  };
}

async function until(state: WorkflowState, id: string, check: (view: ProjectWorkflow) => boolean): Promise<ProjectWorkflow> {
  const deadline = Date.now() + 20_000;
  for (;;) {
    const view = state.section().projects[id];
    if (view && !view.refreshing && check(view)) return view;
    if (Date.now() > deadline) assert.fail(`workflow state did not settle: ${JSON.stringify(view)}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

test('installed project without a scope: status, no plan, no choice', async () => {
  const status = await ok<KitStatus>(runner.status(base));
  assert.equal(status.installed, true);
  assert.equal(status.scope, null);
  assert.equal(await ok(runner.proposal(base)), null);
  const unknown = await runner.run(base, ['no-such-command']);
  assert.deepEqual([unknown.ok, (unknown as { code: string }).code], [false, 'UNKNOWN_COMMAND']);
});

test('sequential: proposal becomes a choice card, the choice becomes a plan without labels', async () => {
  const root = await copyOfBase('seq');
  const watch = manualWatch();
  const state = createWorkflowState({ runner, listProjects: async () => [{ id: 'seq', path: root }], watch: watch.factory, debounceMs: 20, syncMs: 0 });
  await state.start();
  let view = state.get('seq')!;
  assert.equal(view.installed, true);
  assert.equal(view.choice, null);

  await propose(root);
  watch.fire('workflow/local/scope-proposal.json');
  view = await until(state, 'seq', (v) => v.choice !== null);
  assert.equal(view.choice!.generation, 1);
  assert.equal(view.choice!.objective, 'Склад — анализ остатков');
  assert.equal(view.choice!.options[0]!.option, 'orchestrated');
  assert.equal(view.plan, null);

  await ok(runner.run(root, ['scope:choose', '--generation', '1', '--option', 'sequential', '--session', 's-1', '--note', 'Выбор пользователя в панели']));
  watch.fire('plans/todo-plan.md');
  view = await until(state, 'seq', (v) => v.plan !== null);
  assert.equal(view.choice, null);
  assert.equal(view.plan!.mode, 'sequential');
  assert.equal(view.plan!.phase, 'ready');
  assert.equal(view.plan!.ownerSession, 's-1');
  assert.deepEqual(view.plan!.tasks.map((t) => t.id), ['QUALITY', 'T001', 'T002', 'T003', 'DOCS-R1']);
  assert.ok(view.plan!.tasks.every((t) => t.label === null));
  assert.equal(view.plan!.progressLabel, 'в main 0 из 5');

  const before = commands;
  for (let i = 0; i < 5; i += 1) state.section();
  assert.equal(commands, before, 'reading the section runs no Kit command');
  state.stop();
});

test('orchestrated with real file watching: parallel labels follow the plan', async () => {
  const root = await copyOfBase('orch');
  const state = createWorkflowState({ runner, listProjects: async () => [{ id: 'orch', path: root }], debounceMs: 50, syncMs: 0 });
  await state.start();
  await propose(root);
  await until(state, 'orch', (v) => v.choice !== null);
  await ok(runner.run(root, ['scope:choose', '--generation', '1', '--option', 'orchestrated', '--session', 's-2', '--note', 'Выбор пользователя в панели']));
  const view = await until(state, 'orch', (v) => v.plan !== null);
  assert.equal(view.plan!.mode, 'orchestrated');
  assert.equal(view.execution!.strategy, 'orchestrated');
  assert.deepEqual(
    view.plan!.tasks.map((t) => [t.id, t.labelText]),
    [
      ['QUALITY', 'Последовательно'],
      ['T001', 'Последовательно'],
      ['T002', 'Параллельно'],
      ['T003', 'Параллельно'],
      ['DOCS-R1', 'Последовательно'],
    ],
  );
  assert.equal(state.status('orch')!.execution!.ownerSession, 's-2');
  state.stop();
});

test('a project without Kit is listed as not installed without running Kit', async () => {
  const root = path.join(tmp, 'plain');
  await mkdir(root);
  const before = commands;
  const state = createWorkflowState({ runner, listProjects: async () => [{ id: 'plain', path: root }], watch: manualWatch().factory, syncMs: 0 });
  await state.start();
  assert.equal(state.get('plain')!.installed, false);
  assert.equal(commands, before);
  state.stop();
});

test('release closes the watchers of a project so Windows can delete its folder; the next sync lists it again', async () => {
  const root = path.join(tmp, 'released');
  await mkdir(root);
  const open = new Set<string>();
  const watch: WatchFactory = (folder) => {
    open.add(folder);
    return { close: () => open.delete(folder) };
  };
  const state = createWorkflowState({ runner, listProjects: async () => [{ id: 'gone', path: root }], watch, syncMs: 0 });
  await state.start();
  assert.deepEqual([...open].sort(), [root, path.join(root, '.harness')].sort());
  state.release('gone');
  assert.deepEqual([...open], []);
  assert.equal(state.get('gone'), undefined);
  state.release('unknown');
  await state.sync();
  assert.equal(open.size, 2);
  state.stop();
  assert.equal(open.size, 0);
});
