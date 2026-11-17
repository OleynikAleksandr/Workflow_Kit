// M40 T005 with the real Kit bundle: a project with `decisions: host` records the user's
// decisions only by host operations of the service. Checked on one manual pass — the choice, the
// delivery confirmation, the acceptance and the closing — that a refusal of a command an
// «agent process» ran reaches the panel state as a card, that a button applies the request it
// showed, that `wfk decision` takes the user's delivered message of the current turn, and that
// the choice of a run has the source `grant`. A project in the `agent` mode keeps the old forms.
// HOME and the global git config point into the temporary folder.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { USER_MESSAGE_SOURCE, createAgentChannel, parseHookInput } from '#agent-channel';
import type { AgentChannel, StopDecision } from '#agent-channel';
import { ensureKitBundle } from '#kit-bundle';
import { createKitRunner, createWorkflowState } from '#kit-runner';
import type { KitRunner, WorkflowState } from '#kit-runner';
import { runCommand } from '#process-supervisor';
import { DECISION_TEXTS, WorkflowActionError, createAutopilot, createDecisionCommands, createDecisionJournal, createDecisions, createHostTickets, deliveryStartedMessage } from '../src/index.ts';
import type { Autopilot, DecisionCommands, Decisions } from '../src/index.ts';

let tmp = '';
let runner: KitRunner;
let env: Record<string, string | undefined> = {};
const roots: Record<string, string> = {};
let workflow: WorkflowState;
let channel: AgentChannel;
let autopilot: Autopilot;
let decisions: Decisions;
let commands: DecisionCommands;
let next: StopDecision = { kind: 'release' };
const KEY = 'claude:s-1';

const SCOPE = {
  id: 'manual',
  objective: 'Explain the feature',
  acceptance: ['The note explains the feature'],
  approval: 'User approved the scope',
  spec: 'docs/spec.md',
  tasks: [
    { id: 'N', title: 'Note', commitMessage: 'docs: note', acceptance: ['a'], files: ['docs/note.md'] },
    { id: 'D1', title: 'Release', commitMessage: 'chore: release', acceptance: ['b'], files: ['docs/release.md'], kind: 'delivery', dependencies: ['N'] },
  ],
};

interface PlanDecision { decisionId?: string; kind?: string; text: string; source?: { kind: string; messageId?: string | null; runId?: string | null; session?: string | null } }
interface Plan { scope: { decisions: PlanDecision[]; delivery: string; acceptanceNote: PlanDecision | null } | null; lastClosed: { scopeId: string; decision?: PlanDecision } | null; tasks: { id: string; status: string }[] }

const git = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, env: env as NodeJS.ProcessEnv, encoding: 'utf8' }).trim();
const put = async (id: string, name: string, text: string) => {
  await mkdir(path.dirname(path.join(roots[id]!, name)), { recursive: true });
  await writeFile(path.join(roots[id]!, name), text);
};
async function kit<T = Record<string, unknown>>(id: string, ...args: string[]): Promise<T> {
  const outcome = await runner.run<T>(roots[id]!, args);
  assert.ok(outcome.ok, `${args[0]}: ${JSON.stringify(outcome)}`);
  return outcome.result;
}
/** A command an agent runs in its own terminal: the service sees only what Kit wrote. */
async function refusedKit(id: string, ...args: string[]): Promise<{ code: string; decision: { id: string; inputDigest: string; kind: string } | null }> {
  const outcome = await runner.run(roots[id]!, args);
  assert.equal(outcome.ok, false, `${args[0]} must be refused`);
  if (outcome.ok) throw new Error('unreachable');
  return { code: outcome.code, decision: (outcome.details as { decision?: { id: string; inputDigest: string; kind: string } } | null)?.decision ?? null };
}
async function plan(id: string): Promise<Plan> {
  const text = await readFile(path.join(roots[id]!, '.harness', 'plans', 'todo-plan.md'), 'utf8');
  return JSON.parse(text.split('```json\n')[1]!.split('\n```')[0]!) as Plan;
}
const applied = async (id: string): Promise<PlanDecision[]> => ((await plan(id)).scope?.decisions ?? []).filter((item) => item.decisionId);
const refused = (code: string) => (error: unknown) => error instanceof WorkflowActionError && error.code === code;

async function project(id: string, mode?: 'host'): Promise<void> {
  const root = path.join(tmp, id);
  roots[id] = root;
  await mkdir(root, { recursive: true });
  git(root, 'init', '-q');
  await put(id, 'README.md', '# Demo\n');
  await put(id, '.gitignore', '# wfk:begin\n.workflow-kit/local/\n# wfk:end\n');
  await put(id, 'docs/spec.md', '# Spec\n');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'init');
  assert.ok((await runner.install(root, mode ? { decisions: mode } : {})).ok);
  await put(id, '.harness/inputs/scope.json', JSON.stringify({ ...SCOPE, id }));
  await kit(id, 'scope:propose', '--input', '.harness/inputs/scope.json', '--recommended', 'sequential', '--reason', 'One note and one release');
}

const prompt = (id: string, text: string) =>
  channel.prompt(parseHookInput('claude', { session_id: 's-1', cwd: roots[id], hook_event_name: 'UserPromptSubmit', prompt: text })!).then((reply) => reply.ack());
async function stop(id: string, decision: StopDecision = { kind: 'release' }): Promise<string | null> {
  next = decision;
  const reply = await channel.stop(parseHookInput('claude', { session_id: 's-1', cwd: roots[id], hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: 'done' })!);
  reply.ack();
  return (reply.answer as { reason?: string } | null)?.reason ?? null;
}

/** The scripted agent finishes the work task and the documents task of the round. */
async function work(id: string): Promise<void> {
  await kit(id, 'task:start', 'N');
  await put(id, 'docs/note.md', '# Note\n');
  await kit(id, 'commit', '--task', 'N');
  await kit(id, 'task:start', 'DOCS-R1');
  await put(id, '.harness/inputs/digest.json', JSON.stringify({ result: 'Done.', decisions: [], contracts: [], references: [] }));
  await put(id, 'README.md', '# Demo, documented\n');
  await kit(id, 'commit', '--task', 'DOCS-R1', '--digest', '.harness/inputs/digest.json');
}

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-decisions-real-'));
  const home = path.join(tmp, 'home');
  await mkdir(home);
  const gitconfig = path.join(home, '.gitconfig');
  await writeFile(gitconfig, '[user]\n\tname = Kit Tester\n\temail = kit.tester@wfk-tests.org\n[init]\n\tdefaultBranch = main\n');
  env = { PATH: process.env['PATH'], HOME: home, GIT_CONFIG_GLOBAL: gitconfig, GIT_CONFIG_NOSYSTEM: '1', LANG: 'C.UTF-8' };
  if (process.env['SystemRoot']) env['SystemRoot'] = process.env['SystemRoot'];
  const bundle = await ensureKitBundle({ appDir: path.join(tmp, 'app') });
  runner = createKitRunner({ runCommand, appBundle: async () => bundle.file, env });
  await project('manual', 'host');
  await project('granted', 'host');
  await project('legacy');
  const listProjects = async () => Object.entries(roots).map(([id, root]) => ({ id, path: root }));
  const projectPath = async (id: string) => roots[id];
  const resolveProject = async (folder: string) => {
    const found = Object.entries(roots).find(([, root]) => folder === root);
    return found ? { id: found[0] } : undefined;
  };
  workflow = createWorkflowState({ runner, listProjects, watch: () => null, syncMs: 0 });
  await workflow.start();
  channel = createAgentChannel({ resolveProject, holdMs: 30_000 });
  channel.setDecider(async () => next);
  decisions = createDecisions({ runner, tickets: createHostTickets(), journal: createDecisionJournal(), userSource: (key) => channel.userSource(key) });
  autopilot = createAutopilot({ runner, workflow, channel, projectPath, decisions });
  commands = createDecisionCommands({ autopilot, decisions, workflow, projectPath, tell: (id, key, text) => void channel.enqueue(key, text, 'panel', id) });
});

after(async () => {
  channel.close();
  workflow.stop();
  await rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

test('a refusal in the agent\'s terminal becomes a card; the button applies the request it showed', async () => {
  assert.equal(workflow.get('manual')?.decisionsMode, 'host');
  assert.deepEqual(workflow.get('manual')?.decisions, []);
  // The agent tries the Kit 2.3 form with its own «user's words»: nothing is chosen.
  const asked = await refusedKit('manual', 'scope:choose', '--generation', '1', '--option', 'sequential', '--session', 's-1', '--note', 'The user chose sequential');
  assert.deepEqual([asked.code, asked.decision?.kind], ['USER_DECISION_REQUIRED', 'choose']);
  // The service reads the request from the Kit status: the card needs no message of the agent.
  const view = await workflow.refresh('manual');
  assert.deepEqual(view?.decisions.map((item) => [item.id, item.kind, item.state]), [[asked.decision!.id, 'choose', 'pending']]);
  assert.equal(view?.scope, null);
  // A card shown before the data changed: the old digest is refused, nothing is chosen.
  await assert.rejects(
    autopilot.choose('manual', { session: KEY, generation: 1, option: 'sequential', by: { expected: { id: asked.decision!.id, inputDigest: 'a'.repeat(64) } } }),
    refused('DECISION_STALE'),
  );
  assert.equal((await plan('manual')).scope, null);
  const chosen = await autopilot.choose('manual', { session: KEY, generation: 1, option: 'sequential', by: { expected: asked.decision!, requestId: 'press-1' } });
  assert.equal(chosen.owner, KEY);
  const [record] = await applied('manual');
  assert.deepEqual([record?.decisionId, record?.kind, record?.source?.kind, record?.source?.session], [asked.decision!.id, 'choose', 'button', 's-1']);
  // The second press of the same card: no second record.
  const again = await autopilot.choose('manual', { session: KEY, generation: 1, option: 'sequential', by: { expected: asked.decision!, requestId: 'press-2' } });
  assert.equal(again.owner, KEY);
  assert.equal((await applied('manual')).length, 1);
  assert.deepEqual((await workflow.refresh('manual'))?.decisions, [], 'an applied request is no card');
});

test('the delivery confirmation starts the task by the service, then tells the agent', async () => {
  await work('manual');
  // The agent may not confirm for the user: its form registers the request and starts nothing.
  const asked = await refusedKit('manual', 'task:start', 'D1', '--confirmed', 'The user confirmed');
  assert.deepEqual([asked.code, asked.decision?.kind], ['USER_DECISION_REQUIRED', 'confirm-delivery']);
  assert.equal((await plan('manual')).tasks.find((task) => task.id === 'D1')?.status, 'TODO');
  assert.deepEqual((await workflow.refresh('manual'))?.decisions.map((item) => item.kind), ['confirm-delivery']);
  const done = await autopilot.confirmDelivery('manual', '', KEY, { expected: asked.decision! });
  assert.deepEqual([done.taskId, done.started, done.text], ['D1', true, deliveryStartedMessage('D1')]);
  assert.equal((await plan('manual')).tasks.find((task) => task.id === 'D1')?.status, 'IN_PROGRESS', 'the task runs before the agent hears of it');
  // One message of the choice (the second press of the card sent none) and the delivery message.
  assert.deepEqual(channel.queued(KEY).map((message) => /execution mode chosen/u.test(message.text) || message.text), [true, deliveryStartedMessage('D1')]);
  // A second press starts nothing and tells the agent nothing new.
  assert.equal((await autopilot.confirmDelivery('manual', '', KEY, { expected: asked.decision! })).started, true);
  assert.equal(channel.queued(KEY).length, 2);
  assert.doesNotMatch(done.text!, /--confirmed/u);
  const record = (await applied('manual')).at(-1);
  assert.deepEqual([record?.kind, record?.source?.kind, record?.decisionId], ['confirm-delivery', 'button', asked.decision!.id]);
  await put('manual', 'docs/release.md', '# Release\n');
  await kit('manual', 'commit', '--task', 'D1');
  assert.equal((await plan('manual')).scope?.delivery, 'READY_FOR_ACCEPTANCE');
});

test('wfk decision: the note is the user\'s message of the current turn; an automatic turn, a queue and a used message give no decision', async () => {
  const say = (kind: 'accept' | 'close') => commands.run('manual', { kind, session: KEY, by: { message: KEY } });
  // The service messages wait in the queue; the turn they begin is a service turn.
  await stop('manual');
  assert.equal(channel.interruption(KEY)?.origin, 'delivery');
  assert.deepEqual(channel.queued(KEY), []);
  await assert.rejects(say('accept'), refused('decision-source-missing'));
  // The user writes in the chat: this turn may record one decision, with the user's own words.
  await stop('manual');
  await prompt('manual', 'Принимаю результат, всё хорошо');
  const accepted = await say('accept');
  assert.equal(accepted.already, false);
  assert.match(accepted.text, /accepted/u);
  const note = (await applied('manual')).at(-1);
  assert.deepEqual([note?.kind, note?.source?.kind, note?.source?.session, note?.decisionId], ['accept', 'message', 's-1', accepted.decisionId]);
  assert.match(note!.text, /Принимаю результат, всё хорошо/u);
  assert.ok(note?.source?.messageId, 'the decision names the message');
  assert.equal((await plan('manual')).scope?.acceptanceNote?.text, 'Принимаю результат, всё хорошо', 'the acceptance note is the user\'s message');
  assert.deepEqual(channel.queued(KEY), [], 'the calling session reads the answer of its command, not a queued message');
  // The same message does not close the plan too.
  await assert.rejects(say('close'), refused('decision-source-used'));
  // The autopilot continues the session (Stop with a block): the user's message is not the source any more.
  assert.match((await stop('manual', { kind: 'continue', text: 'Workflow Kit: autopilot. Continue.' })) ?? '', /Continue/u);
  await assert.rejects(say('close'), refused('decision-source-missing'));
  // A panel message written while the agent works waits in the queue: not delivered, no source.
  const queued = channel.enqueue(KEY, 'Закрывай план, спасибо', USER_MESSAGE_SOURCE, 'manual');
  await assert.rejects(say('close'), refused('decision-source-missing'));
  assert.ok((await plan('manual')).scope, 'nothing was closed');
  // Delivered at the end of the turn, it begins the turn that may close the plan.
  assert.match((await stop('manual')) ?? '', /Закрывай план/u);
  const closed = await say('close');
  assert.equal(closed.already, false);
  const last = (await plan('manual')).lastClosed;
  assert.deepEqual([last?.scopeId, last?.decision?.source?.kind, last?.decision?.source?.messageId], ['manual', 'message', queued.id]);
  assert.match(last!.decision!.text, /Закрывай план, спасибо/u);
  assert.equal(git(roots['manual']!, 'status', '--porcelain'), '');
});

test('the choice of an autopilot run has the source grant and uses no user message', async () => {
  const note = 'Автоматический выбор по поручению run-TEST: sequential';
  const digest = await runner.proposalDigest(roots['granted']!);
  assert.ok(digest.ok && digest.result);
  // The version the run agreed on changed: Kit refuses the old digest before any request.
  let code = '';
  await assert.rejects(
    autopilot.choose('granted', { session: KEY, generation: 1, option: 'sequential', expectedDigest: 'f'.repeat(64), automatic: { runId: 'run-TEST', note } }),
    (error: unknown) => ((code = (error as { code?: string }).code ?? ''), error instanceof WorkflowActionError),
  );
  assert.equal(code, 'PROPOSAL_CHANGED');
  assert.equal((await plan('granted')).scope, null);
  await autopilot.choose('granted', { session: KEY, generation: 1, option: 'sequential', expectedDigest: digest.result.proposalDigest, automatic: { runId: 'run-TEST', note } });
  const [record] = await applied('granted');
  assert.deepEqual([record?.kind, record?.source?.kind, record?.source?.runId, record?.source?.messageId ?? null], ['choose', 'grant', 'run-TEST', null]);
  assert.match(record!.text, /run-TEST/u);
  // The step repeats (a restart between the choice and its receipt): no second decision.
  const repeated = await decisions.apply(roots['granted']!, 'granted', {
    kind: 'choose', origin: { kind: 'grant', runId: 'run-TEST' }, note,
    choice: { generation: 1, option: 'sequential', session: 's-1', expectedDigest: digest.result.proposalDigest },
  });
  assert.equal(repeated?.already, true);
  assert.equal((await applied('granted')).length, 1);
  // A run that is paused, stopped or revoked decides nothing.
  const halted = createDecisions({ runner, tickets: createHostTickets(), journal: createDecisionJournal(), userSource: () => null, runLive: async () => false });
  await assert.rejects(halted.apply(roots['granted']!, 'granted', { kind: 'confirm-delivery', taskId: 'D1', origin: { kind: 'grant', runId: 'run-TEST' } }), refused('run-not-live'));
  assert.deepEqual((await workflow.refresh('granted'))?.decisions, [], 'no request, no card');
});

test('a project in the agent mode keeps the Kit 2.3 forms; wfk decision is refused there', async () => {
  assert.equal(workflow.get('legacy')?.decisionsMode, 'agent');
  await autopilot.choose('legacy', { session: KEY, generation: 1, option: 'sequential', by: { requestId: 'press-1' } });
  assert.deepEqual(await applied('legacy'), [], 'no host decision');
  assert.ok((await plan('legacy')).scope, 'the old form chose the mode');
  await work('legacy');
  const told = await autopilot.confirmDelivery('legacy', 'Да, выпускай', KEY);
  assert.equal(told.started, undefined);
  assert.match(channel.queued(KEY).at(-1)!.text, /task:start D1 --confirmed "Да, выпускай"/u);
  await prompt('legacy', 'Принимаю');
  await assert.rejects(commands.run('legacy', { kind: 'accept', session: KEY, by: { message: KEY } }), refused('decisions-agent-mode'));
  assert.equal(DECISION_TEXTS.sourceMissing.length > 0, true);
});
