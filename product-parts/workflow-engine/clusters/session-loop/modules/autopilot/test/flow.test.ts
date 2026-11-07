// The autopilot with the real Kit 2.2.2 bundle on a temporary git repository and a channel fed
// with hook inputs as Claude and Codex send them: choice, start, tasks, pause, acceptance.
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
import { WorkflowActionError, createAutopilot } from '../src/index.ts';
import type { Autopilot } from '../src/index.ts';

let tmp = '';
let root = '';
let env: Record<string, string | undefined> = {};
let runner: KitRunner;
let workflow: WorkflowState;
let channel: AgentChannel;
let autopilot: Autopilot;
const KEY = 'claude:s-claude';

function git(...args: string[]): void {
  execFileSync('git', args, { cwd: root, env: env as NodeJS.ProcessEnv });
}

async function kit(...args: string[]): Promise<void> {
  const outcome = await runner.run(root, args);
  assert.ok(outcome.ok, JSON.stringify(outcome));
}

const stopInput = (sessionId = 's-claude', client: 'claude' | 'codex' = 'claude') =>
  parseHookInput(client, { session_id: sessionId, cwd: root, hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: 'ok' })!;

async function settle(promise: Promise<HookReply>): Promise<string | null> {
  const reply = await promise;
  reply.ack();
  const answer = reply.answer as { reason?: string } | null;
  return answer?.reason ?? null;
}

async function holding(reason: string): Promise<void> {
  for (let i = 0; i < 300; i += 1) {
    if (channel.get(KEY)?.holdReason === reason) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`not holding ${reason}: ${JSON.stringify(channel.get(KEY))}`);
}

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-autopilot-'));
  const home = path.join(tmp, 'home');
  await mkdir(home);
  const gitconfig = path.join(home, '.gitconfig');
  await writeFile(gitconfig, '[user]\n\tname = Kit Tester\n\temail = kit.tester@wfk-tests.org\n[init]\n\tdefaultBranch = main\n');
  env = { PATH: process.env['PATH'], HOME: home, GIT_CONFIG_GLOBAL: gitconfig, GIT_CONFIG_NOSYSTEM: '1' };
  const bundle = await ensureKitBundle({ appDir: path.join(tmp, 'app') });
  runner = createKitRunner({ runCommand, appBundle: async () => bundle.file, env });
  root = path.join(tmp, 'demo');
  await mkdir(path.join(root, 'docs'), { recursive: true });
  git('init', '-q');
  await writeFile(path.join(root, 'README.md'), '# Demo\n');
  git('add', 'README.md');
  git('commit', '-q', '-m', 'init');
  assert.ok((await runner.install(root)).ok);
  await writeFile(path.join(root, 'docs', 'spec.md'), '# Spec\n');
  await kit('docs:commit', '--files', 'docs/spec.md');

  workflow = createWorkflowState({ runner, listProjects: async () => [{ id: 'p', path: root }], watch: () => null, syncMs: 0 });
  await workflow.start();
  channel = createAgentChannel({ resolveProject: async (folder) => (folder.startsWith(root) ? { id: 'p' } : undefined), holdMs: 20_000 });
  autopilot = createAutopilot({ runner, workflow, channel, projectPath: async (id) => (id === 'p' ? root : undefined) });
  channel.setDecider((context) => autopilot.decide(context));
});

after(async () => {
  channel.close();
  workflow.stop();
  await rm(tmp, { recursive: true, force: true });
});

test('sequential: proposal → choice → start → tasks → ready for acceptance → accept → close', async () => {
  const plan = {
    id: 'demo',
    objective: 'Демо',
    acceptance: ['Есть файл'],
    approval: 'User: implement now',
    spec: 'docs/spec.md',
    tasks: [{ id: 'T001', title: 'Файл', commitMessage: 'feat: add file', acceptance: ['a'], files: ['src/a.txt'] }],
  };
  await writeFile(path.join(tmp, 'plan.json'), JSON.stringify(plan));
  await kit('scope:propose', '--input', path.join(tmp, 'plan.json'), '--recommended', 'sequential', '--reason', 'Одна небольшая задача, параллелить нечего');

  // The turn that proposed the plan ends: the Stop waits for the choice.
  let stop = channel.stop(stopInput());
  await holding('waiting-for-mode-choice');
  await autopilot.choose('p', { session: KEY, generation: 1, option: 'sequential' });
  assert.match((await settle(stop)) ?? '', /execution mode chosen: sequential/);

  // The agent ends the turn: the plan is ready and waits for the start button.
  stop = channel.stop(stopInput());
  await holding('waiting-for-plan-start');
  assert.equal(workflow.get('p')?.plan?.phase, 'ready');
  await autopilot.start('p');
  assert.match((await settle(stop)) ?? '', /Execution mode: sequential/);

  // QUALITY by the agent, then the autopilot sends T001.
  await kit('task:start', 'QUALITY');
  await writeFile(
    path.join(tmp, 'q.json'),
    JSON.stringify({ stacks: ['node'], checks: [{ id: 'noop', role: 'custom', stage: 'commit', required: true, command: { executable: 'true', args: [] } }] }),
  );
  await kit('quality:apply', '--input', path.join(tmp, 'q.json'));
  assert.match((await settle(channel.stop(stopInput()))) ?? '', /autopilot\. Continue the workflow: run `scripts\/workflow task:start T001`/);

  // A Stop without progress stops the autopilot.
  assert.equal(await settle(channel.stop(stopInput())), null);
  assert.equal(autopilot.get(KEY)?.last?.reason, 'no-progress');

  // Pause: the next task does not start; resume sends the agent on.
  await autopilot.resume('p');
  await settle(channel.prompt(stopInput()));
  await kit('task:start', 'T001');
  await mkdir(path.join(root, 'src'));
  await writeFile(path.join(root, 'src', 'a.txt'), 'a\n');
  await kit('commit', '--task', 'T001');
  await autopilot.pause('p');
  assert.equal(await settle(channel.stop(stopInput())), null);
  assert.equal(autopilot.get(KEY)?.last?.reason, 'paused');
  await autopilot.resume('p');
  assert.match((await settle(channel.stop(stopInput()))) ?? '', /resumed the plan/);

  await kit('task:start', 'DOCS-R1');
  await writeFile(path.join(tmp, 'dg.json'), JSON.stringify({ result: 'Файл добавлен', decisions: [], contracts: [], references: ['docs/spec.md'] }));
  await kit('commit', '--task', 'DOCS-R1', '--digest', path.join(tmp, 'dg.json'));
  assert.equal(await settle(channel.stop(stopInput())), null);
  assert.equal(autopilot.get(KEY)?.last?.reason, 'ready-for-acceptance');
  assert.equal(autopilot.get(KEY)?.last?.action, 'hold', 'the Stop waits for «Принять» or «Нужны исправления»');
  assert.equal((await workflow.refresh('p'))?.plan?.phase, 'acceptance');

  await autopilot.accept('p', 'Проверил, принимаю');
  assert.equal((await workflow.refresh('p'))?.plan?.phase, 'accepted');
  await autopilot.close('p');
  assert.equal((await workflow.refresh('p'))?.plan, null);
});
