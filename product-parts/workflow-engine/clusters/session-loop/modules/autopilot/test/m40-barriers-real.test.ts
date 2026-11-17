// M40 T009, end-to-end scenarios 5 and 7 (validation section 2) with the real Kit bundle and the
// service wired as `wfk serve` wires it, on `decisions: host` projects, Settings off.
// 5. The approval of installs: `quality:apply` with installs gives a card with the exact commands;
//    an edit of the input file without a call changes nothing; a new call with another input
//    replaces the request (the old button is DECISION_STALE); the button applies the stored input.
// 7. Git barriers: `git push origin HEAD:main` while the scope is open → PUBLISH_SCOPE_OPEN; a push
//    of the CI branch during another delivery → CI_PUSH_NOT_ALLOWED; `git commit --no-verify` →
//    EXTERNAL_COMMITS, the `adopt-commits` card adopts them (a newer commit makes it stale).
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { WorkflowActionError, decisionBy } from '../src/index.ts';
import { AUTO_SCOPE, KEY, bootService, openWorld } from './m40-world.ts';
import type { Service, World } from './m40-world.ts';

let world: World;
let svc: Service | null = null;
const refused = (code: string) => (error: unknown) => error instanceof WorkflowActionError && error.code === code;
const { automation: _automation, ...MANUAL } = AUTO_SCOPE;

before(async () => {
  world = await openWorld('wfk-m40-barriers-');
  for (const id of ['install', 'git']) await world.project(id, 'host');
});

after(async () => {
  svc?.close();
  await world.close();
});

async function service(): Promise<Service> {
  svc?.close();
  svc = await bootService(world, 'off', 2_000);
  return svc;
}

/** A Kit install entry that leaves a marker file in the project. */
const marker = (name: string) => ({ executable: 'node', args: ['-e', `require("node:fs").writeFileSync(${JSON.stringify(name)}, "x")`] });
const profile = (name: string) => ({
  stacks: ['node'],
  checks: [{ id: 'lint', role: 'lint', stage: 'commit', required: true, command: { executable: 'node', args: ['-e', 'process.exit(0)'] } }],
  install: [marker(name)],
});
const card = async (s: Service, id: string, kind: string) => (await s.workflow.refresh(id))?.decisions.find((d) => d.kind === kind) ?? null;
const press = (s: Service, id: string, kind: 'approve-install' | 'adopt-commits', shown: { id: string; inputDigest: string }, requestId: string) =>
  s.commands.run(id, { kind, session: KEY, by: decisionBy({ decision: shown, requestId }) });

test('scenario 5: the approval of installs applies what the card showed; a new call replaces the request', async () => {
  const s = await service();
  await world.propose('install', { ...MANUAL, id: 'install' });
  await s.workflow.refresh('install');
  await s.autopilot.choose('install', { session: KEY, generation: 1, option: 'sequential', by: decisionBy({ requestId: 'choose-install' }) });
  await world.put('install', '.harness/inputs/quality.json', JSON.stringify({ ...profile('tool-a.txt'), approval: 'The agent says the user approved the tools' }));
  const asked = await world.refusedKit('install', 'quality:apply', '--input', '.harness/inputs/quality.json');
  assert.deepEqual([asked.code, asked.decision?.kind], ['USER_DECISION_REQUIRED', 'approve-install'], 'the agent\'s approval text is no decision');
  const first = (await card(s, 'install', 'approve-install'))!;
  assert.deepEqual((first.params as { install: unknown[] }).install, [marker('tool-a.txt')], 'the card shows the exact commands');
  // The agent edits the input file without a call: the card and its request stay.
  await world.put('install', '.harness/inputs/quality.json', JSON.stringify(profile('tool-evil.txt')));
  assert.deepEqual((await card(s, 'install', 'approve-install'))?.id, first.id);
  // A new call with another input replaces the request: the old button is stale, a new card.
  await world.put('install', '.harness/inputs/quality.json', JSON.stringify(profile('tool-b.txt')));
  await world.refusedKit('install', 'quality:apply', '--input', '.harness/inputs/quality.json');
  const second = (await card(s, 'install', 'approve-install'))!;
  assert.notEqual(second.id, first.id);
  assert.deepEqual((second.params as { install: unknown[] }).install, [marker('tool-b.txt')]);
  await assert.rejects(press(s, 'install', 'approve-install', first, 'old-card'), refused('DECISION_STALE'));
  // The file changes once more; the button of the new card applies the input it showed.
  await world.put('install', '.harness/inputs/quality.json', JSON.stringify(profile('tool-evil.txt')));
  const done = await press(s, 'install', 'approve-install', (await card(s, 'install', 'approve-install'))!, 'new-card');
  assert.equal(done.already, false);
  const root = world.roots['install']!;
  assert.equal(existsSync(path.join(root, 'tool-b.txt')), true, 'the shown command ran');
  assert.equal(existsSync(path.join(root, 'tool-evil.txt')), false);
  assert.equal(existsSync(path.join(root, 'tool-a.txt')), false);
  const status = await world.kit<{ quality: { status: string } | string }>('install', 'status');
  assert.match(JSON.stringify(status.quality), /CONFIGURED/u);
  assert.deepEqual(world.history('install').map((d) => [d.kind, d.source?.kind]), [['choose', 'button'], ['approve-install', 'button']]);
  assert.equal(await card(s, 'install', 'approve-install'), null, 'no card after the decision');
});

test('scenario 7: Git barriers — main while the scope is open, the CI branch during another delivery, commits past Kit', async () => {
  const s = await service();
  // Two deliveries: D0 (an install, say) first, then D1 that sends CI.
  const scope = {
    ...AUTO_SCOPE,
    id: 'git',
    automation: { ...AUTO_SCOPE.automation, delivery: [{ taskId: 'D0', effects: ['install the app'] }, { taskId: 'D1', effects: ['write the release note'] }] },
    tasks: [
      AUTO_SCOPE.tasks[0]!,
      { id: 'D0', title: 'Install', commitMessage: 'chore: install', acceptance: ['i'], files: ['docs/install.md'], kind: 'delivery', dependencies: ['N'] },
      { ...AUTO_SCOPE.tasks[1]!, dependencies: ['D0'] },
    ],
  };
  await world.propose('git', scope);
  await s.workflow.refresh('git');
  await s.autopilot.choose('git', { session: KEY, generation: 1, option: 'sequential', by: decisionBy({ requestId: 'choose-git' }) });
  const main = world.tryGit('git', 'push', 'origin', 'HEAD:main');
  assert.equal(main.ok, false);
  assert.match(main.output, /PUBLISH_SCOPE_OPEN/u);
  // Another local branch into main is the same push.
  world.git('git', 'branch', 'side');
  assert.match(world.tryGit('git', 'push', 'origin', 'side:refs/heads/main').output, /PUBLISH_SCOPE_OPEN/u);
  await world.kit('git', 'task:start', 'N');
  await world.put('git', 'docs/note.md', '# Note\n');
  await world.put('git', 'docs/evidence/result.md', '# Result\n');
  await world.kit('git', 'commit', '--task', 'N');
  await world.kit('git', 'task:start', 'DOCS-R1');
  await world.put('git', '.harness/inputs/digest.json', JSON.stringify({ result: 'Done.', decisions: [], contracts: [], references: [] }));
  await world.put('git', 'README.md', '# Demo, documented\n');
  await world.kit('git', 'commit', '--task', 'DOCS-R1', '--digest', '.harness/inputs/digest.json');
  const started = await s.autopilot.confirmDelivery('git', '', KEY, decisionBy({ requestId: 'delivery-D0' }));
  assert.equal(started.taskId, 'D0');
  const ci = world.tryGit('git', 'push', 'origin', 'HEAD:refs/heads/ci/auto');
  assert.equal(ci.ok, false, 'D0 is not the CI task');
  assert.match(ci.output, /CI_PUSH_NOT_ALLOWED/u);
  // A commit past Kit: every task command is refused until the user adopts it.
  await world.put('git', 'docs/extra.md', '# Extra\n');
  world.git('git', 'add', 'docs/extra.md');
  world.git('git', 'commit', '-q', '--no-verify', '-m', 'external');
  const first = world.git('git', 'rev-parse', 'HEAD');
  await world.put('git', 'docs/install.md', '# Install\n');
  const blocked = await world.refusedKit('git', 'commit', '--task', 'D0');
  assert.equal(blocked.code, 'EXTERNAL_COMMITS');
  const shown = (await card(s, 'git', 'adopt-commits'))!;
  assert.deepEqual((shown.params as { commits: string[] }).commits, [first]);
  // Another commit past Kit after the card was shown: the old button is stale.
  await world.put('git', 'docs/extra2.md', '# Extra 2\n');
  world.git('git', 'add', 'docs/extra2.md');
  world.git('git', 'commit', '-q', '--no-verify', '-m', 'external 2');
  await assert.rejects(press(s, 'git', 'adopt-commits', shown, 'old-card'), refused('DECISION_STALE'));
  await world.refusedKit('git', 'commit', '--task', 'D0');
  const fresh = (await card(s, 'git', 'adopt-commits'))!;
  assert.deepEqual((fresh.params as { commits: string[] }).commits, [first, world.git('git', 'rev-parse', 'HEAD')]);
  await press(s, 'git', 'adopt-commits', fresh, 'new-card');
  await world.kit('git', 'commit', '--task', 'D0');
  assert.equal((await world.plan('git')).tasks.find((t) => t.id === 'D0')?.status, 'DONE');
  assert.deepEqual(world.history('git').map((d) => [d.kind, d.source?.kind]), [['choose', 'button'], ['confirm-delivery', 'button'], ['adopt-commits', 'button']]);
  assert.equal(world.git(world.remotes['git']!, 'branch', '--list', 'ci/auto'), '', 'no CI branch was pushed');
});
