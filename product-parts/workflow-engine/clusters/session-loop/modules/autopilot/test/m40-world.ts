// The world of the M40 end-to-end tests (T009): the real Kit bundle (or the kept Kit 2.3.3
// fixture), throwaway git projects with a local bare `origin`, and one service wired from the same
// factories as `wfk serve` (cli `wireAutopiloting` and `wireSessions`): the agent channel, the
// workflow state, the decisions, the runs with the preparation, the turns, the control, the
// user's words, the waits and the completion. CI verdicts are scripted (no GitHub); the agent is
// a script that runs Kit commands as separate processes. HOME and the global git config point
// into the temporary folder.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAgentChannel, parseHookInput } from '#agent-channel';
import type { AgentChannel, StopDecision } from '#agent-channel';
import { createKeyedMutex } from '#data-store';
import { createPublisher, runGit } from '#git-publish';
import { ensureKitBundle } from '#kit-bundle';
import { createKitRunner, createWorkflowState } from '#kit-runner';
import type { KitRunner, WorkflowState } from '#kit-runner';
import { runCommand } from '#process-supervisor';
import {
  createAutopilot, createDecisionCommands, createDecisionJournal, createDecisions, createHostTickets, createPreparation, createProposalGate, createRunCompletion,
  createRunControl, createRunJournal, createRunKit, createRunTurns, createRunWaits, createRunWords, createRuns, createSettingsStore, runMayDecide,
} from '../src/index.ts';
import type { AutopilotingMode, CiReadVerdict } from '../src/index.ts';

export const KEY = 'claude:s-1';

export const CI_YAML = 'name: CI\non:\n  push:\njobs:\n  test:\n    name: ${{ matrix.name }}\n    runs-on: ${{ matrix.os }}\n    strategy:\n      matrix:\n        include:\n          - name: Linux x64\n            os: ubuntu-latest\n    steps:\n      - run: npm test\n';

/** The scope of the automated pass: one note, one delivery that sends CI. */
export const AUTO_SCOPE = {
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

export interface PlanDecision { decisionId?: string; kind?: string; text: string; source?: { kind: string; messageId?: string | null; runId?: string | null; session?: string | null } }
export interface Plan {
  revision: number;
  scope: { id: string; status: string; delivery: string; decisions: PlanDecision[]; acceptanceNote: { text: string } | null; adoptedCommits?: string[]; blockedReason: string | null } | null;
  lastClosed: { scopeId: string; decision?: PlanDecision; autopilotRun?: string } | null;
  tasks: { id: string; status: string; confirmation: string | null }[];
}

export async function openWorld(prefix: string, options: { bundle?: { file: string; sha256: string } } = {}) {
  const tmp = await mkdtemp(path.join(os.tmpdir(), prefix));
  const home = path.join(tmp, 'home');
  await mkdir(home);
  const gitconfig = path.join(home, '.gitconfig');
  await writeFile(gitconfig, '[user]\n\tname = Kit Tester\n\temail = kit.tester@wfk-tests.org\n[init]\n\tdefaultBranch = main\n');
  const env: Record<string, string | undefined> = { PATH: process.env['PATH'], HOME: home, GIT_CONFIG_GLOBAL: gitconfig, GIT_CONFIG_NOSYSTEM: '1', LANG: 'C.UTF-8' };
  if (process.env['SystemRoot']) env['SystemRoot'] = process.env['SystemRoot'];
  // runGit of the publisher runs in this process: it must use the temporary git identity too.
  process.env['HOME'] = home;
  process.env['GIT_CONFIG_GLOBAL'] = gitconfig;
  process.env['GIT_CONFIG_NOSYSTEM'] = '1';
  const bundle = await ensureKitBundle({ appDir: path.join(tmp, 'app'), ...(options.bundle ? { vendorFile: options.bundle.file, sha256: options.bundle.sha256 } : {}) });
  const runner: KitRunner = createKitRunner({ runCommand, appBundle: async () => bundle.file, env });
  const roots: Record<string, string> = {};
  const remotes: Record<string, string> = {};

  const git = (id: string, ...args: string[]): string => execFileSync('git', args, { cwd: roots[id] ?? id, env: env as NodeJS.ProcessEnv, encoding: 'utf8' }).trim();
  /** git that may fail: the exit status and the whole output (a refused hook prints its code). */
  const tryGit = (id: string, ...args: string[]): { ok: boolean; output: string } => {
    try {
      return { ok: true, output: execFileSync('git', args, { cwd: roots[id], env: env as NodeJS.ProcessEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
    } catch (error) {
      const failed = error as { stdout?: string; stderr?: string };
      return { ok: false, output: `${failed.stdout ?? ''}${failed.stderr ?? ''}` };
    }
  };
  const put = async (id: string, name: string, text: string): Promise<void> => {
    await mkdir(path.dirname(path.join(roots[id]!, name)), { recursive: true });
    await writeFile(path.join(roots[id]!, name), text);
  };
  /** A Kit command as the agent runs it: a separate process; the service sees only what Kit wrote. */
  async function kit<T = Record<string, unknown>>(id: string, ...args: string[]): Promise<T> {
    const outcome = await runner.run<T>(roots[id]!, args);
    assert.ok(outcome.ok, `${args.join(' ')}: ${JSON.stringify(outcome)}`);
    return outcome.result;
  }
  async function refusedKit(id: string, ...args: string[]): Promise<{ code: string; details: Record<string, unknown>; decision: { id: string; inputDigest: string; kind: string } | null }> {
    const outcome = await runner.run(roots[id]!, args);
    assert.equal(outcome.ok, false, `${args[0]} must be refused`);
    if (outcome.ok) throw new Error('unreachable');
    const details = (outcome.details ?? {}) as Record<string, unknown>;
    return { code: outcome.code, details, decision: (details['decision'] as { id: string; inputDigest: string; kind: string } | undefined) ?? null };
  }
  async function plan(id: string): Promise<Plan> {
    const text = await readFile(path.join(roots[id]!, '.harness', 'plans', 'todo-plan.md'), 'utf8');
    return JSON.parse(text.split('```json\n')[1]!.split('\n```')[0]!) as Plan;
  }
  /**
   * Every typed decision Kit recorded in the history of the plan file (scope decisions, closings):
   * the ones applied from a request carry `decisionId`; those of a run's grant without a request
   * (the delivery start, the acceptance, the close) carry the source alone.
   */
  function history(id: string): PlanDecision[] {
    const seen = new Map<string, PlanDecision>();
    for (const sha of git(id, 'log', '--reverse', '--format=%H', '--', '.harness/plans/todo-plan.md').split('\n').filter(Boolean)) {
      const text = git(id, 'show', `${sha}:.harness/plans/todo-plan.md`);
      const old = JSON.parse(text.split('```json\n')[1]!.split('\n```')[0]!) as Plan;
      for (const item of [...(old.scope?.decisions ?? []), ...(old.lastClosed?.decision ? [old.lastClosed.decision] : [])]) {
        const key = item.decisionId ?? (item.source ? `${item.kind}@${(item as { at?: string }).at}` : null);
        if (key && !seen.has(key)) seen.set(key, item);
      }
    }
    return [...seen.values()];
  }

  /** A git project with a local bare origin, CI, the spec and Kit (optionally `decisions: host`). */
  async function project(id: string, mode?: 'host'): Promise<string> {
    const root = path.join(tmp, id);
    roots[id] = root;
    await mkdir(root, { recursive: true });
    git(id, 'init', '-q');
    await put(id, 'README.md', '# Demo\n');
    await put(id, '.gitignore', '# wfk:begin\n.workflow-kit/local/\n# wfk:end\n');
    await put(id, 'docs/spec.md', '# Spec\n');
    await put(id, '.github/workflows/ci.yml', CI_YAML);
    git(id, 'add', '.');
    git(id, 'commit', '-q', '-m', 'init');
    const remote = path.join(tmp, `${id}.git`);
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote], { env: env as NodeJS.ProcessEnv });
    remotes[id] = remote;
    git(id, 'remote', 'add', 'origin', remote);
    git(id, 'push', '-q', '-u', 'origin', 'main');
    const installed = await runner.install(root, mode ? { decisions: mode } : {});
    assert.ok(installed.ok, JSON.stringify(installed));
    return root;
  }
  async function propose(id: string, scope: Record<string, unknown> = AUTO_SCOPE): Promise<void> {
    await put(id, '.harness/inputs/scope.json', JSON.stringify(scope));
    await kit(id, 'scope:propose', '--input', '.harness/inputs/scope.json', '--recommended', 'sequential', '--reason', 'One note and one release');
  }

  return {
    tmp, env, runner, roots, remotes, git, tryGit, put, kit, refusedKit, plan, history, project, propose,
    close: () => rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }),
  };
}
export type World = Awaited<ReturnType<typeof openWorld>>;

/** One service over the world's projects, wired as `wfk serve` wires it (see the header). */
export async function bootService(world: World, settingsMode: AutopilotingMode = 'full', holdMs = 20_000) {
  const listProjects = async () => Object.entries(world.roots).map(([id, root]) => ({ id, path: root }));
  const projectPath = async (id: string) => world.roots[id];
  const resolveProject = async (folder: string) => {
    const found = Object.entries(world.roots).find(([, root]) => folder === root);
    return found ? { id: found[0] } : undefined;
  };
  const mutex = createKeyedMutex();
  const workflow: WorkflowState = createWorkflowState({ runner: world.runner, listProjects, watch: () => null, syncMs: 0 });
  await workflow.start();
  const channel: AgentChannel = createAgentChannel({ resolveProject, holdMs });
  const configDir = path.join(world.tmp, 'config');
  await mkdir(configDir, { recursive: true });
  const settings = createSettingsStore({ configDir });
  const current = await settings.read();
  await settings.write({ expectedRevision: current.settings.revision, mode: settingsMode, review: false });
  const tickets = createHostTickets();
  const journal = createRunJournal();
  const runKit = createRunKit({ runner: world.runner, tickets });
  const decisions = createDecisions({
    runner: world.runner, tickets, journal: createDecisionJournal(), userSource: (key) => channel.userSource(key), runLive: runMayDecide(journal),
    sourceTaken: async (root, messageId) => (await journal.list(root)).some((run) => run.request.source === 'user-command' && run.request.turnId === messageId),
  });
  const send = (projectId: string, key: string, text: string) => void channel.enqueue(key, text, 'panel', projectId);
  let autopilot: ReturnType<typeof createAutopilot> | null = null;
  const preparation = createPreparation({ journal, kit: runKit, projectPath, review: () => null, reviewOn: () => false, actions: () => autopilot, mutex });
  const runs = createRuns({ settings, journal, kit: runKit, tickets, userSource: (key) => channel.userSource(key), projectPath, listProjects, mutex });
  await runs.load();
  const gate = createProposalGate({ journal, kit: runKit, projectPath });
  const turns = { ...createRunTurns({ journal, projectPath }), proposal: gate.check };
  const control = createRunControl({ journal, kit: runKit, projectPath, listProjects, send, mutex, actions: () => autopilot, activity: (key) => channel.get(key) });
  const words = createRunWords({ control, tell: send });
  const verdicts = new Map<string, CiReadVerdict['state']>();
  const ciReads: string[] = [];
  const waits = createRunWaits({
    journal, kit: runKit, projectPath, listProjects, send, mutex,
    ci: { read: async (_root, sha) => (ciReads.push(sha), verdicts.get(sha) === 'failed' ? { state: 'failed', sha, failed: [{ name: 'Linux x64', conclusion: 'failure' }] } : { state: 'success', sha, jobs: [{ name: 'Linux x64' }] }) },
  });
  const completion = createRunCompletion({ journal, kit: runKit, publisher: createPublisher({ git: runGit }), git: runGit, projectPath, listProjects, mutex });
  autopilot = createAutopilot({
    runner: world.runner, workflow, channel, projectPath, runs: turns, decisions,
    authority: {
      beforeStart: async (id, key) => (await runs.beginExecution(id, key))?.runId ?? null,
      beforeResume: async (id, key) => (await runs.resume(id, key))?.runId ?? null,
      onPause: (id, reason) => control.onPause(id, reason),
    },
  });
  const commands = createDecisionCommands({ autopilot, decisions, workflow, projectPath, tell: send });
  let next: StopDecision | null = null;
  const pilot = autopilot;
  channel.setDecider(async (context) => {
    if (next) {
      const forced = next;
      next = null;
      return forced;
    }
    return pilot.decide(context);
  });
  // The work after a turn end runs git in the project; the scripted agent acts only after it, so
  // its commit never meets the index lock of a concurrent status (a real agent is slower).
  let settling: Promise<unknown> = Promise.resolve();
  channel.onStop((event) => {
    if (event.projectId) settling = preparation.reconcile(event.projectId).then(() => completion.advance(event.projectId!)).catch(() => undefined);
  });

  /** The user types in the provider's app: the UserPromptSubmit hook, read by the service first. */
  async function prompt(id: string, text: string): Promise<void> {
    await words.received(id, KEY, text);
    (await channel.prompt(parseHookInput('claude', { session_id: 's-1', cwd: world.roots[id], hook_event_name: 'UserPromptSubmit', prompt: text })!)).ack();
    pilot.onPrompt(KEY, false);
  }
  /** The owner's turn ends: what the service answers with (a continuation, a delivery), or null. */
  async function stop(id: string, forced: StopDecision | null = null): Promise<string | null> {
    next = forced;
    const reply = await channel.stop(parseHookInput('claude', { session_id: 's-1', cwd: world.roots[id], hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: 'done' })!);
    reply.ack();
    await settling;
    const text = (reply.answer as { reason?: string } | null)?.reason ?? null;
    return text;
  }
  return {
    workflow, channel, settings, journal, runs, decisions, commands, preparation, control, words, waits, completion, autopilot: pilot, verdicts, ciReads, prompt, stop,
    close: () => {
      channel.close();
      workflow.stop();
    },
  };
}
export type Service = Awaited<ReturnType<typeof bootService>>;

/**
 * The scripted agent: it does what the service's text says, within the plan, and ends its turn.
 * A delivery pushes the candidate to the CI branch and reports the wait (`wfk session progress`).
 */
export async function scriptedAgent(world: World, svc: Service, id: string, text: string): Promise<void> {
  const status = await world.kit<{ nextTask: { id: string; kind: string; status: string } | null }>(id, 'autopilot:status');
  const task = status.nextTask;
  if (/CI is green/u.test(text)) {
    await world.put(id, 'docs/release.md', '# Release\n');
    await world.kit(id, 'commit', '--task', 'D1');
    return;
  }
  if (!task) return;
  if (task.status === 'TODO') {
    assert.doesNotMatch(text, /--confirmed|accept --note|close --note/u, 'host texts give the agent no decision forms');
    // The agent starts every task without flags: the live grant covers its delivery (M40 2.1).
    // Found by T009: the continuation of a granted delivery still names `--autopilot-run`
    // (decide-orchestration.ts and Kit autopilot-decision.ts) — a fixes round, not this test.
    await world.kit(id, 'task:start', task.id);
  }
  if (task.id === 'N') {
    await world.put(id, 'docs/note.md', '# Note\n');
    await world.put(id, 'docs/evidence/result.md', '# Result\nThe note explains the feature.\n');
    await world.kit(id, 'commit', '--task', 'N');
  } else if (task.id === 'DOCS-R1') {
    await world.put(id, '.harness/inputs/digest.json', JSON.stringify({ result: 'Done.', decisions: [], contracts: [], references: [] }));
    await world.put(id, 'README.md', '# Demo, documented\n');
    await world.kit(id, 'commit', '--task', 'DOCS-R1', '--digest', '.harness/inputs/digest.json');
  } else if (task.id === 'D1') {
    const digest = /"ciPolicyDigest": "([0-9a-f]+)"/u.exec(text)?.[1];
    assert.ok(digest, 'the continuation of a delivery tells how to report the wait for CI');
    const sha = world.git(id, 'rev-parse', 'HEAD');
    world.git(id, 'push', '-q', 'origin', `${sha}:refs/heads/ci/auto`);
    const runId = (await svc.journal.active(world.roots[id]!))!.runId;
    await svc.waits.progress(id, KEY, { runId, actionId: `ci:${sha}`, stage: 'pushed', targetSha: sha, ciPolicyDigest: digest, waitReason: 'CI of ci/auto' });
  }
}
