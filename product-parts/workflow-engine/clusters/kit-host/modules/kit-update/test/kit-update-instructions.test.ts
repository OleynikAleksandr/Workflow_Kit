// M39 T004: the instructions a project gets from the real Kit bundle and the real kit-structure
// agree (one publication rule, the autopilot boundary), the Kit reports its M39 capability, and an
// installation with the older instruction snapshot of Kit 2.3.2 is offered the update and gets the
// new snapshot. HOME and the global git config point into the temporary folder.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { KIT_VERSION, ensureKitBundle } from '#kit-bundle';
import { createKitRunner } from '#kit-runner';
import { installStructure } from '#kit-structure';
import { autopilotSupport } from '#plan-view';
import { runCommand } from '#process-supervisor';
import { kitAction } from '../src/index.ts';

let tmp = '';
after(async () => {
  if (tmp) await rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

const between = (text: string, begin: string, end: string): string => {
  const from = text.indexOf(begin);
  const to = text.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `${begin} … ${end}`);
  return text.slice(from, to);
};
const flat = (text: string): string => text.replace(/\s+/gu, ' ');
const OLD_RULE = '- Build, packaging, publishing and push happen only in delivery tasks.';

test('Kit and wfk instructions agree; an older snapshot is updated; the capability is complete', async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-kit-instructions-'));
  const home = path.join(tmp, 'home');
  await mkdir(home);
  const gitconfig = path.join(home, '.gitconfig');
  await writeFile(gitconfig, '[user]\n\tname = Kit Tester\n\temail = kit.tester@wfk-tests.org\n[init]\n\tdefaultBranch = main\n');
  const env: Record<string, string | undefined> = { PATH: process.env['PATH'], HOME: home, GIT_CONFIG_GLOBAL: gitconfig, GIT_CONFIG_NOSYSTEM: '1', LANG: 'C.UTF-8' };
  if (process.env['SystemRoot']) env['SystemRoot'] = process.env['SystemRoot'];
  const git = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, env: env as NodeJS.ProcessEnv, encoding: 'utf8' });
  const bundle = await ensureKitBundle({ appDir: path.join(tmp, 'app') });
  const kit = createKitRunner({ runCommand, appBundle: async () => bundle.file, env });
  const root = path.join(tmp, 'project');
  await mkdir(root);
  git(root, 'init', '-q');
  await installStructure(root);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'chore: add Workflow Kit structure');
  const installed = await kit.install(root);
  assert.ok(installed.ok, JSON.stringify(installed));

  const agentsFile = path.join(root, 'AGENTS.md');
  const agents = await readFile(agentsFile, 'utf8');
  const kitRules = flat(between(agents, '<!-- workflow-kit:begin -->', '<!-- workflow-kit:end -->'));
  const wfkRules = flat(between(agents, '<!-- wfk:begin -->', '<!-- wfk:end -->'));
  // One publication rule in both: main is pushed only after accept and close, never in a task.
  assert.equal(agents.includes(OLD_RULE), false);
  assert.match(kitRules, /Publishing \(`git push` of the main branch to its upstream\) is no task: it comes only after the scope is accepted and closed, on the user's direct request or by the live autopilot run of this scope\./u);
  assert.match(wfkRules, /`git push` of the main branch is not a plan task, not even a delivery task\. It comes only after the scope is accepted and closed/u);
  assert.match(kitRules, /a push of a CI branch a delivery task names, happen only in delivery tasks/u);
  assert.match(wfkRules, /A delivery task pushes only a CI branch its plan names\./u);
  // The vendored-bundle exception and the deferral of a failed delivery.
  assert.match(kitRules, /Rebuilding a tracked file a commit check requires from the sources \(for example a vendored bundle\) belongs to the work task/u);
  assert.match(kitRules, /task:defer-delivery <ID> --reason/u);
  // The autopilot boundary: the agent never grants, accepts or closes by itself.
  for (const rules of [kitRules, wfkRules]) {
    assert.match(rules, /`accept --autopilot-run` or `close --autopilot-run`/u);
    assert.match(rules, /do not ask (the user )?whether to continue/u);
  }
  assert.match(kitRules, /no push, acceptance, close or publication/u);

  // The project Kit reports its M39 features; the panel accepts them.
  const status = await kit.run<{ capability: unknown }>(root, ['autopilot:status']);
  assert.ok(status.ok, JSON.stringify(status));
  assert.deepEqual(autopilotSupport(status.result), { ready: true });

  // An installation of Kit 2.3.2 with its older snapshot of the rules: the update brings the new one.
  const manifestFile = path.join(root, '.harness', 'workflow', 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8')) as Record<string, unknown>;
  await writeFile(manifestFile, `${JSON.stringify({ ...manifest, version: '2.3.2' }, null, 2)}\n`);
  const publishing = agents.slice(agents.indexOf('- Release build, packaging'), agents.indexOf('- If the external check'));
  await writeFile(agentsFile, agents.replace(publishing, `${OLD_RULE}\n`));
  git(root, '-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-am', 'test: an installation of Kit 2.3.2');
  const inspect = await kit.inspect(root);
  assert.ok(inspect.ok);
  assert.deepEqual([inspect.result.state, inspect.result.version], ['KIT_OUTDATED', '2.3.2']);
  assert.equal(kitAction(inspect.result, KIT_VERSION), 'update');
  assert.equal(kitAction({ state: 'KIT_OK', version: '2.3.2' }, '2.3.3'), 'update');
  assert.equal(kitAction({ state: 'KIT_OK', version: KIT_VERSION }, KIT_VERSION), 'none');
  const updated = await kit.install(root, { update: true });
  assert.ok(updated.ok, JSON.stringify(updated));
  assert.equal(updated.result.version, KIT_VERSION);
  const after = await readFile(agentsFile, 'utf8');
  assert.equal(after.includes(OLD_RULE), false);
  assert.equal(after, agents);
  assert.equal(git(root, 'status', '--porcelain').trim(), '');
  const inspected = await kit.inspect(root);
  assert.equal(inspected.ok && inspected.result.state, 'KIT_OK');
});
