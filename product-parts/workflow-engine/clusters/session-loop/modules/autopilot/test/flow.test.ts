// The autopilot with the real Kit bundle on a temporary git repository and a channel fed
// with hook inputs as Claude and Codex send them: choice, start, tasks, pause, acceptance.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createAgentChannel, parseHookInput } from '#agent-channel';
import type { AgentChannel, HookReply, StopContext, StopDecision } from '#agent-channel';
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
/** A fake cross review (M4): what it answers and with which canStart it was asked. */
const fakeReview = {
  next: null as StopDecision | null,
  asked: [] as Array<[string, boolean]>,
  decide: async (context: StopContext, canStart = false) => {
    fakeReview.asked.push([context.key, canStart]);
    return fakeReview.next;
  },
  isReviewer: (key: string) => key === 'codex:reviewer',
  blocked: null as string | null,
  choiceBlocked: async (_projectId: string, _working: readonly string[]) => fakeReview.blocked,
};

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
  autopilot = createAutopilot({ runner, workflow, channel, projectPath: async (id) => (id === 'p' ? root : undefined), review: fakeReview });
  channel.setDecider((context) => autopilot.decide(context));
});

after(async () => {
  channel.close();
  workflow.stop();
  // A Kit command started by a channel timer may still run in `demo`: Windows refuses to remove
  // a busy folder (EBUSY), so the removal retries with a growing delay (up to about 11 s).
  await rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
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
  assert.deepEqual(fakeReview.asked.at(-1), [KEY, true], 'the review may start for the proposing session');
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
  stop = channel.stop(stopInput());
  await holding('ready-for-acceptance');
  assert.equal(autopilot.get(KEY)?.last?.reason, 'ready-for-acceptance');
  assert.equal(autopilot.get(KEY)?.last?.action, 'hold', 'the Stop waits for «Принять» or «Нужны исправления»');
  assert.equal((await workflow.refresh('p'))?.plan?.phase, 'acceptance');
  assert.deepEqual(workflow.get('p')?.plan?.dirty, []);

  // M37 2.3: a file outside commits shows on the plan; tidy asks the held owner to clean up.
  await assert.rejects(autopilot.tidy('p', KEY), (error: { code?: string; message?: string }) => error.code === 'clean' && error.message === 'Файлов вне коммитов нет: можно принимать результат');
  await writeFile(path.join(root, 'stray.json'), '{}\n');
  assert.deepEqual(await autopilot.tidy('p', KEY), { owner: KEY, paths: ['stray.json'] });
  assert.deepEqual(workflow.get('p')?.plan?.dirty, ['stray.json']);
  const tidy = (await settle(stop)) ?? '';
  assert.match(tidy, /^Workflow Kit: the user asks you to tidy the working tree: closing the plan needs it clean\. Closing needs a clean working tree, and these paths are not committed: `stray\.json`\./);
  assert.match(tidy, /whether the working tree is clean now, and end your turn\.$/);

  // M37 2.2: «Принять план» tells the held owner; the message names the paths outside commits.
  stop = channel.stop(stopInput());
  await holding('ready-for-acceptance');
  await autopilot.accept('p', 'Проверил, принимаю', KEY);
  const accepted = (await settle(stop)) ?? '';
  assert.match(accepted, /^Workflow Kit: the user accepted the result of scope `demo` in the panel; Kit recorded it\. Do not run `accept` or `close`/);
  assert.match(accepted, /these paths are not committed: `stray\.json`\./);
  assert.equal((await workflow.refresh('p'))?.plan?.phase, 'accepted');
  assert.equal(autopilot.get(KEY)?.last?.label, 'План принят');
  // The agent answers and ends the turn: nothing continues it, the label stays.
  assert.equal(await settle(channel.stop(stopInput())), null);
  assert.equal(autopilot.get(KEY)?.last?.label, 'План принят');

  // «Закрыть план» on a dirty tree: a Russian refusal with the path; nothing is told.
  await assert.rejects(autopilot.close('p', undefined, KEY), (error: { code?: string; message?: string; status?: number }) =>
    error.code === 'dirty-tree' && error.status === 409 && error.message === 'в папке проекта есть файлы вне коммитов: `stray.json`. Пока они есть, план не закроется: нажмите «Попросить агента убрать» на карточке плана или уберите их сами.');
  assert.equal(channel.queued(KEY).length, 0);
  await rm(path.join(root, 'stray.json'));
  await assert.rejects(autopilot.tidy('p', KEY), (error: { code?: string; message?: string }) => error.code === 'clean' && error.message === 'Файлов вне коммитов нет: план можно закрыть');

  await autopilot.close('p', undefined, KEY);
  assert.equal((await workflow.refresh('p'))?.plan, null);
  assert.equal(autopilot.get(KEY)?.last?.label, 'План закрыт');
  // The idle owner gets the message with its next turn (a session the service wakes gets it at once).
  assert.match(channel.queued(KEY).map((message) => message.text).join('\n'), /^Workflow Kit: the user closed the plan \(scope `demo`\) in the panel; Kit recorded it and no scope is active now\./);
  await settle(channel.prompt(stopInput()));
  assert.equal(channel.queued(KEY).length, 0);
  assert.equal(await settle(channel.stop(stopInput())), null);
  assert.equal(autopilot.get(KEY)?.last?.label, 'План закрыт');
  await assert.rejects(autopilot.tidy('p', KEY), (error: { code?: string }) => error.code === 'no-scope');
});

test('a cross review holds the proposing session first; a reviewer session is decided by the review only', async () => {
  const plan = { id: 'demo2', objective: 'Демо 2', acceptance: ['Есть второй файл'], approval: 'User: implement now', spec: 'docs/spec.md', tasks: [{ id: 'T001', title: 'Файл 2', commitMessage: 'feat: add file 2', acceptance: ['b'], files: ['src/b.txt'] }] };
  await writeFile(path.join(tmp, 'plan2.json'), JSON.stringify(plan));
  await kit('scope:propose', '--input', path.join(tmp, 'plan2.json'), '--recommended', 'sequential', '--reason', 'Одна задача');
  fakeReview.next = { kind: 'hold', reason: 'waiting-for-review' };
  const stop = channel.stop(stopInput());
  await holding('waiting-for-review');
  assert.equal(autopilot.get(KEY)?.last?.label, 'Ревью плана: ждёт ответа ревьюера');
  fakeReview.next = null;
  assert.equal(await settle(channel.stop(stopInput('reviewer', 'codex'))), null, 'a reviewer without a review decision is let go');
  assert.deepEqual(fakeReview.asked.at(-1), ['codex:reviewer', false]);
  channel.wake(KEY);
  await holding('waiting-for-mode-choice');
  fakeReview.blocked = 'Сначала ревью плана';
  await assert.rejects(autopilot.choose('p', { session: KEY, generation: 1, option: 'sequential' }), (error: { code?: string; status?: number }) => error.code === 'review-pending' && error.status === 409);
  fakeReview.blocked = null;
  await autopilot.choose('p', { session: KEY, generation: 1, option: 'sequential' });
  assert.match((await settle(stop)) ?? '', /execution mode chosen: sequential/);
});
