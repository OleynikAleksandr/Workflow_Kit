// M48 T006, end to end on a real service (createApp on loopback, the real Kit bundle in throwaway
// git projects, the CLI hooks; the agent is a script that runs Kit commands as separate processes):
// 1. the plan question is open and the user switches the session card to «Полный»: the question
//    closes, a run is recorded by the press and the agent gets the full instruction;
// 2. A001: under that run the agent proposes a plan without `automation`: it goes back to the
//    agent, no manual mode choice is left to the user; the plan with the block is chosen and
//    started by the run;
// 3. «Подтвердить выпуск» while the agent's Kit command holds the Kit lock: 202, a second press
//    joins, the delivery starts once when Kit is free;
// 4. B001: a run of a plan without publication that an older version blocked at `no-upstream`
//    ends `completed` (the result stays local) when the new service starts.
// HOME and the global git config point into the temporary folder.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { COMPLETE_TEXTS, SWITCH_TEXTS, automationReturnText, createRunJournal } from '#autopilot';
import { createKitRunner } from '#kit-runner';
import { runCommand } from '#process-supervisor';
import { createStubProvider } from '#provider-registry';
import { createApp, main } from '../src/index.ts';
import type { App } from '../src/index.ts';

let tmp = '';
let app: App;
let base = '';
let env: Record<string, string> = {};
/** The service log of the test (autopiloting lines go into a timeout trace). */
const serviceLog: string[] = [];
const roots: Record<string, string> = {};
const ids: Record<string, string> = {};
const saved = { HOME: process.env['HOME'], GIT_CONFIG_GLOBAL: process.env['GIT_CONFIG_GLOBAL'], GIT_CONFIG_NOSYSTEM: process.env['GIT_CONFIG_NOSYSTEM'] };
const H = () => ({ Origin: base, 'Content-Type': 'application/json' });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The scope of a plan with one note and one delivery; `automation` only when asked. */
function scope(id: string, automation: boolean, publication: { branch: string; upstream: string } | null = { branch: 'main', upstream: 'origin/main' }): Record<string, unknown> {
  return {
    id,
    objective: 'Explain the feature',
    acceptance: ['The note explains the feature'],
    approval: 'User approved the scope',
    spec: 'docs/spec.md',
    ...(automation ? { automation: {
      acceptance: [{ criterion: 0, kind: 'automatic', checks: [], evidence: ['docs/evidence/result.md'] }],
      ci: { remote: 'origin', branch: `ci/${id}`, requiredChecks: ['Linux x64'], exactSha: true, task: 'D1' },
      delivery: [{ taskId: 'D1', effects: ['write the release note'] }],
      publication,
    } } : {}),
    tasks: [
      { id: 'N', title: 'Note', commitMessage: 'docs: note', acceptance: ['a'], files: ['docs/note.md', 'docs/evidence/result.md'] },
      { id: 'D1', title: 'Release', commitMessage: 'chore: release', acceptance: ['b'], files: ['docs/release.md'], kind: 'delivery', dependencies: ['N'] },
    ],
  };
}

const CI_YAML = 'name: CI\non:\n  push:\njobs:\n  test:\n    name: ${{ matrix.name }}\n    runs-on: ${{ matrix.os }}\n    strategy:\n      matrix:\n        include:\n          - name: Linux x64\n            os: ubuntu-latest\n    steps:\n      - run: echo ok\n';

const git = (id: string, ...args: string[]): string => execFileSync('git', args, { cwd: roots[id], env, encoding: 'utf8' }).trim();
async function put(id: string, name: string, text: string): Promise<void> {
  await mkdir(path.dirname(path.join(roots[id]!, name)), { recursive: true });
  await writeFile(path.join(roots[id]!, name), text);
}
/** A Kit command as the agent runs it: a separate process. */
async function kit<T = Record<string, unknown>>(id: string, ...args: string[]): Promise<T> {
  const outcome = await app.kit.run<T>(roots[id]!, args);
  assert.ok(outcome.ok, `${args.join(' ')}: ${JSON.stringify(outcome)}`);
  return outcome.result;
}
/**
 * The agent's Kit with a slow `git commit` (4 s): a preload blocks the Kit process before it runs
 * git `commit`, after Kit took its lock — the real lock of the real Kit, as while a long commit or
 * check of the agent runs (M47). Node loads the preload on every OS through NODE_OPTIONS.
 */
async function slowAgentKit(id: string, ...args: string[]) {
  const preload = path.join(tmp, 'slow-git-commit.cjs');
  const marker = `${preload}.held`;
  await writeFile(preload, [
    "const cp = require('node:child_process');",
    "const fs = require('node:fs');",
    `const marker = ${JSON.stringify(marker)};`,
    "const { syncBuiltinESMExports } = require('node:module');",
    // `git commit` by name, by a full path (git.exe on Windows) or through `cmd /c`.
    "const slow = (cmd, args) => { const words = [String(cmd), ...(Array.isArray(args) ? args.map(String) : [])]; return words.some((w) => /(^|[\\\\/])git(\\.exe)?$/iu.test(w)) && words.includes('commit'); };",
    "for (const name of ['spawn', 'spawnSync', 'execFile', 'execFileSync']) {",
    "  const original = cp[name];",
    "  cp[name] = function (cmd, args, ...rest) {",
    // The marker tells the test that Kit holds its lock now (it is inside the commit).
    "    if (slow(cmd, args)) { fs.writeFileSync(marker, 'held'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 4000); }",
    "    return original.call(this, cmd, args, ...rest);",
    "  };",
    "}",
    'syncBuiltinESMExports();',
  ].join('\n'));
  // NODE_OPTIONS reads a backslash in quotes as an escape: the path goes with «/» (Windows takes it too).
  const runner = createKitRunner({ runCommand, appBundle: async () => { throw new Error('the project bundle is used'); }, env: { ...env, NODE_OPTIONS: `--require "${preload.replaceAll('\\', '/')}"` } });
  return { done: runner.run(roots[id]!, args), held: () => until('Kit holds its lock', async () => (await readFile(marker, 'utf8').catch(() => '')) === 'held') };
}

async function propose(id: string, body: Record<string, unknown>): Promise<void> {
  await put(id, '.harness/inputs/scope.json', JSON.stringify(body));
  await kit(id, 'scope:propose', '--input', '.harness/inputs/scope.json', '--recommended', 'sequential', '--reason', 'One note and one release');
}

/** A git project with Kit (`decisions: host`), opened in the service. */
async function project(id: string): Promise<void> {
  const root = path.join(tmp, 'Projects', id);
  roots[id] = root;
  await mkdir(root, { recursive: true });
  git(id, 'init', '-q');
  await put(id, 'README.md', '# Demo\n');
  await put(id, '.gitignore', '# wfk:begin\n.workflow-kit/local/\n# wfk:end\n');
  await put(id, 'docs/spec.md', '# Spec\n');
  await put(id, '.github/workflows/ci.yml', CI_YAML);
  git(id, 'add', '.');
  git(id, 'commit', '-q', '-m', 'init');
  const installed = await app.kit.install(root, { decisions: 'host' });
  assert.ok(installed.ok, JSON.stringify(installed));
  await app.projects.open(root);
  ids[id] = (await app.projects.list()).find((p) => p.path === root || path.basename(p.path) === id)!.id;
}

async function boot(): Promise<void> {
  app = await createApp({
    env: { ...env, WFK_DATA_DIR: path.join(tmp, 'data'), WFK_PORT: '0' },
    homedir: tmp,
    getInterfaces: () => ({}),
    providers: ['claude', 'codex'].map((id) => () => createStubProvider({ id, title: id, task: 'T000' })),
    log: (line) => void serviceLog.push(line),
  });
  base = `http://127.0.0.1:${(await app.start()).port}`;
  env['WFK_PORT'] = new URL(base).port;
}

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-m48-e2e-'));
  const home = path.join(tmp, 'home');
  await mkdir(home);
  const gitconfig = path.join(home, '.gitconfig');
  await writeFile(gitconfig, '[user]\n\tname = Kit Tester\n\temail = kit.tester@wfk-tests.org\n[init]\n\tdefaultBranch = main\n');
  env = { PATH: process.env['PATH'] ?? '', HOME: home, GIT_CONFIG_GLOBAL: gitconfig, GIT_CONFIG_NOSYSTEM: '1', LANG: 'C.UTF-8', WFK_DATA_DIR: path.join(tmp, 'data') };
  if (process.env['SystemRoot']) env['SystemRoot'] = process.env['SystemRoot'];
  // The publisher and the git helpers of the service run in this process.
  Object.assign(process.env, { HOME: home, GIT_CONFIG_GLOBAL: gitconfig, GIT_CONFIG_NOSYSTEM: '1' });
  await boot();
});

after(async () => {
  await app.stop();
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  await rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

interface Plan { scope: { id: string; status: string; decisions: Array<{ kind?: string }> } | null; tasks: Array<{ id: string; status: string }> }
async function planOf(id: string): Promise<Plan> {
  const text = await readFile(path.join(roots[id]!, '.harness', 'plans', 'todo-plan.md'), 'utf8');
  return JSON.parse(text.split('```json\n')[1]!.split('\n```')[0]!) as Plan;
}

/** A hook of the Claude session as the CLI sends it; the Stop answer the agent would get (or none within `ms`). */
async function hook(event: string, input: Record<string, unknown>, ms = 30_000): Promise<string> {
  const out: string[] = [];
  const run = main(['hook', event, '--client', 'claude'], {
    stdout: (text: string) => void out.push(text), stderr: () => undefined,
    app: { env: { ...env, WFK_PANEL_SESSION: '1' }, homedir: tmp },
    readStdin: async () => JSON.stringify(input), hookClients: ['claude'],
  });
  await Promise.race([run, sleep(ms)]);
  return out.join('');
}

async function state(): Promise<Record<string, any>> {
  return (await (await fetch(`${base}/api/state`, { headers: H() })).json()) as Record<string, any>;
}
async function post(url: string, body: unknown): Promise<{ status: number; body: Record<string, any> }> {
  const reply = await fetch(`${base}${url}`, { method: 'POST', headers: H(), body: JSON.stringify(body) });
  return { status: reply.status, body: (await reply.json()) as Record<string, any> };
}
/**
 * Waits for a condition of the service. Windows runners run Kit several times slower (M48 CI: 51 s
 * against 11 s): the deadline only bounds a hang, a passing run ends at the condition. On a timeout
 * the error carries what `trace` saw last (the run brief).
 */
async function until<T>(what: string, read: () => Promise<T | null | undefined | false>, ms = 90_000, trace?: () => Promise<unknown>): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const value = await read();
    if (value) return value;
    if (Date.now() > end) throw new Error(`timed out: ${what}${trace ? `; last seen: ${JSON.stringify(await trace().catch((error: unknown) => String(error)))}` : ''}`);
    await sleep(150);
  }
}

test('1, 2. The plan question is open, the session card switches to «Полный»; A001: a plan without automation goes back to the agent, the next one starts by the run', async () => {
  await project('a001');
  const id = ids['a001']!;
  const root = roots['a001']!;
  const KEY = 'claude:s-1';
  const turn = { session_id: 's-1', cwd: root };
  await hook('session-start', { ...turn, hook_event_name: 'SessionStart', source: 'startup' });
  await hook('prompt', { ...turn, hook_event_name: 'UserPromptSubmit', prompt: 'Сделай заметку о функции' });
  // Settings «Выключено»: the session began without the autopilot, the agent gets the plan question.
  const asked = await post('/api/sessions/plan', { summary: 'Заметка о функции', cwd: root, client: 'claude', sessionId: 's-1' });
  assert.equal(asked.status, 200, JSON.stringify(asked.body));
  assert.ok(asked.body['question'], 'the plan question card');
  assert.ok((await state())['review']['projects'][id]['questions'][KEY], 'the question is shown');
  const card = `/api/projects/${id}/sessions/${KEY}/autopiloting`;
  const own = (await (await fetch(`${base}${card}`, { headers: H() })).json()) as { settings: { revision: number; mode: string } };
  assert.equal(own.settings.mode, 'off');
  const switched = await post(card, { expectedRevision: own.settings.revision, mode: 'full' });
  assert.equal(switched.status, 200, JSON.stringify(switched.body));
  assert.equal(switched.body['effect'], SWITCH_TEXTS.question);
  const after = await state();
  assert.equal(after['review']['projects'][id]?.['questions']?.[KEY], undefined, 'the question is closed');
  const run = after['autopiloting']['projects'][id];
  assert.deepEqual([run['mode'], run['phase'], run['source'], run['owner']], ['full', 'preparing', 'session-card', KEY]);
  const told = await hook('stop', { ...turn, hook_event_name: 'Stop', stop_hook_active: false });
  assert.match(told, new RegExp(`Full autopilot: run ${run['runId']} is registered by`, 'u'));
  assert.match(told, /automation/u);

  // A001: the agent proposes a plan without the block; it goes back to the agent, no manual choice.
  await propose('a001', scope('a001', false));
  const returned = await hook('stop', { ...turn, hook_event_name: 'Stop', stop_hook_active: false });
  assert.ok(returned.includes(automationReturnText(run['runId'])), returned);
  const back = (await state())['autopiloting']['projects'][id];
  assert.deepEqual([back['mode'], back['phase'], back['returned']], ['full', 'preparing', true], 'the panel shows the line instead of the mode choice');
  // The plan with the block: the run chooses the mode and starts the plan itself.
  await propose('a001', scope('a001', true));
  const started = await hook('stop', { ...turn, hook_event_name: 'Stop', stop_hook_active: false });
  const going = await until('the run starts the plan', async () => {
    const now = (await state())['autopiloting']['projects'][id];
    return ['executing', 'delivering'].includes(now['phase']) ? now : null;
  }, undefined, async () => ({ run: (await state())['autopiloting']['projects'][id], log: serviceLog.filter((line) => /autopilot|decision|choose/u.test(line)).slice(-12) }));
  assert.deepEqual([going['returned'], (await planOf('a001')).scope?.status], [false, 'ACTIVE']);
  assert.equal((await state())['workflow']['projects'][id]?.['choice'] ?? null, null, 'no mode choice is left');
  void started;
});

test('3. «Подтвердить выпуск» while the agent holds the Kit lock: 202, a second press joins, the delivery starts once', async () => {
  await project('locked');
  const id = ids['locked']!;
  await propose('locked', scope('locked', false));
  await app.workflow.refresh(id);
  const choose = await post(`/api/projects/${id}/workflow/choose`, { session: 'claude:s-4', generation: 1, option: 'sequential' });
  assert.equal(choose.status, 200, JSON.stringify(choose.body));
  await kit('locked', 'task:start', 'N');
  await put('locked', 'docs/note.md', '# Note\n');
  await put('locked', 'docs/evidence/result.md', '# Result\n');
  await kit('locked', 'commit', '--task', 'N');
  await kit('locked', 'task:start', 'DOCS-R1');
  await put('locked', '.harness/inputs/digest.json', JSON.stringify({ result: 'Done.', decisions: [], contracts: [], references: [] }));
  await put('locked', 'README.md', '# Demo, documented\n');
  await kit('locked', 'commit', '--task', 'DOCS-R1', '--digest', '.harness/inputs/digest.json');
  // The agent commits a document (Kit holds its lock 4 s); the user presses «Подтвердить выпуск» meanwhile.
  await put('locked', 'docs/x.md', '# Between the tasks\n');
  const agent = await slowAgentKit('locked', 'docs:commit', '--files', 'docs/x.md');
  await agent.held();
  const first = await post(`/api/projects/${id}/workflow/confirm-delivery`, { session: 'claude:s-4' });
  const second = await post(`/api/projects/${id}/workflow/confirm-delivery`, { session: 'claude:s-4' });
  assert.equal(first.status, 202, JSON.stringify(first.body));
  assert.deepEqual([first.body['pending'], first.body['wait']['state'], first.body['wait']['text']], [true, 'waiting', 'Ждёт: агент выполняет команду Kit. Нажатие применится, как только Kit освободится.']);
  assert.equal(second.status, 202);
  assert.equal(second.body['wait']['id'], first.body['wait']['id'], 'the second press joins the wait');
  const shown = (await state())['kitWaits']['projects'][id] as Array<Record<string, unknown>>;
  assert.equal(shown[0]?.['state'], 'waiting');
  const committed = await agent.done;
  assert.ok(committed.ok, JSON.stringify(committed));
  const done = await until('the wait is done', async () => ((await state())['kitWaits']['projects'][id] as Array<Record<string, any>>).find((w) => w['state'] !== 'waiting'));
  assert.equal(done['state'], 'done', JSON.stringify(done));
  assert.ok(done['attempts'] >= 2, 'retried after the lock');
  const plan = await planOf('locked');
  assert.equal(plan.tasks.find((t) => t.id === 'D1')?.status, 'IN_PROGRESS', 'the service started the delivery');
  assert.equal(plan.scope?.decisions.filter((d) => d.kind === 'confirm-delivery').length, 1, 'applied once');
});

test('4. B001: a run of a plan without publication blocked at no-upstream by an older version ends «completed» on the start of the new service', async () => {
  await project('b001');
  const root = roots['b001']!;
  const head = git('b001', 'rev-parse', 'HEAD');
  const journal = createRunJournal();
  const run = await journal.create(root, {
    projectId: ids['b001']!, owner: { key: 'codex:b-1', client: 'codex', sessionId: 'b-1' }, mode: 'full', review: false,
    request: { source: 'user-command', quote: 'Да, делай', at: '2026-11-20T09:00:00.000Z', turnId: null, goal: 'g' }, proposal: null, scopeId: 'b001',
    authority: { grantRevision: 1, deliveryTaskIds: [], accept: true, close: true, publication: null, acceptancePolicy: 'automatic', baseHead: null, revocation: null },
    phase: 'blocked', pausedFrom: 'publishing', reason: 'no-upstream', nextAction: COMPLETE_TEXTS.noUpstream,
  });
  await journal.update(root, run.runId, (r) => ({ ...r, completion: { ci: null, publication: null, finalSha: head } }));
  // The update of the service: the new version starts and recovers its runs.
  await app.stop();
  await boot();
  const done = await until('the run completes', async () => {
    const now = (await state())['autopiloting']['projects'][ids['b001']!];
    return now?.['phase'] === 'completed' ? now : null;
  }, undefined, async () => (await state())['autopiloting']['projects'][ids['b001']!]);
  assert.deepEqual([done['reason'], done['nextAction'], done['local'], done['publication']?.['published'] ?? null], [null, null, true, null]);
  const record = (await journal.read(root, run.runId))!;
  assert.equal(record.receipts.at(-1)?.actionId, `local:${head}`);
  assert.equal(git('b001', 'remote'), '', 'nothing to push to and nothing pushed');
});
