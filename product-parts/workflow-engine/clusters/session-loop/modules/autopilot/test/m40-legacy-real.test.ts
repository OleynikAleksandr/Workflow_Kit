// M40 T009, end-to-end scenario 9 (validation section 2): a project on the kept Kit 2.3.3 bundle
// with the new service. The manual forms of the agent (`task:start --confirmed`, `accept --note`)
// pass, the panel buttons take the old routes (`scope:choose --note`, `close --note`) and
// `wfk decision` is refused as the agent mode. The M39 lifecycle on the new core in the `agent`
// mode is `lifecycle-real.test.ts`, which runs unchanged in the same suite.
import assert from 'node:assert/strict';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { WorkflowActionError, decisionBy } from '../src/index.ts';
import { AUTO_SCOPE, KEY, bootService, openWorld } from './m40-world.ts';
import type { Service, World } from './m40-world.ts';

const FIXTURE = path.join(import.meta.dirname, '..', '..', '..', '..', 'kit-host', 'modules', 'kit-bundle', 'test', 'fixtures', 'workflow-kit-2.3.3.mjs.gz');
const FIXTURE_SHA = 'f7ca59a807a5702130a286e8c9bb3c98c300cfa3aa682081bc6c65091bfb1418';
const { automation: _automation, ...MANUAL } = AUTO_SCOPE;

let world: World;
let svc: Service;

before(async () => {
  world = await openWorld('wfk-m40-legacy-', { bundle: { file: FIXTURE, sha256: FIXTURE_SHA } });
  await world.project('legacy');
  svc = await bootService(world, 'off', 2_000);
});

after(async () => {
  svc.close();
  await world.close();
});

test('scenario 9: Kit 2.3.3 with the new service — the manual forms pass, the buttons take the old routes', async () => {
  const inspected = await world.runner.inspect(world.roots['legacy']!);
  assert.equal(inspected.ok && inspected.result.version, '2.3.3', 'the project runs the kept bundle');
  const status = await world.kit<{ decisions?: unknown }>('legacy', 'status');
  assert.equal(status.decisions, undefined, 'Kit 2.3.3 has no decision requests');
  await world.propose('legacy', { ...MANUAL, id: 'legacy' });
  const view = await svc.workflow.refresh('legacy');
  assert.equal(view?.decisionsMode, 'agent');
  // The mode button: the old form with the note of the press.
  await svc.autopilot.choose('legacy', { session: KEY, generation: 1, option: 'sequential', by: decisionBy({ requestId: 'press-1' }) });
  assert.equal((await world.plan('legacy')).scope?.id, 'legacy');
  // `wfk decision` is for host projects only.
  await svc.prompt('legacy', 'Принимаю');
  await assert.rejects(svc.commands.run('legacy', { kind: 'accept', session: KEY, by: { message: KEY } }), (error: unknown) => error instanceof WorkflowActionError && error.code === 'decisions-agent-mode');
  await world.kit('legacy', 'task:start', 'N');
  await world.put('legacy', 'docs/note.md', '# Note\n');
  await world.put('legacy', 'docs/evidence/result.md', '# Result\n');
  await world.kit('legacy', 'commit', '--task', 'N');
  await world.kit('legacy', 'task:start', 'DOCS-R1');
  await world.put('legacy', '.harness/inputs/digest.json', JSON.stringify({ result: 'Done.', decisions: [], contracts: [], references: [] }));
  await world.put('legacy', 'README.md', '# Demo, documented\n');
  await world.kit('legacy', 'commit', '--task', 'DOCS-R1', '--digest', '.harness/inputs/digest.json');
  // The agent's manual forms of Kit 2.3: the delivery confirmation and the acceptance words.
  await world.kit('legacy', 'task:start', 'D1', '--confirmed', 'Пользователь: да, выпускай');
  assert.equal((await world.plan('legacy')).tasks.find((t) => t.id === 'D1')?.confirmation, 'Пользователь: да, выпускай');
  await world.put('legacy', 'docs/release.md', '# Release\n');
  await world.kit('legacy', 'commit', '--task', 'D1');
  await world.kit('legacy', 'accept', '--note', 'Пользователь: принимаю результат');
  assert.equal((await world.plan('legacy')).scope?.acceptanceNote?.text, 'Пользователь: принимаю результат');
  // The close button: the old form with the words of the press.
  await svc.autopilot.close('legacy', 'Закрой план, всё готово', KEY, decisionBy({ requestId: 'press-2' }));
  const closed = await world.plan('legacy');
  assert.deepEqual([closed.scope, closed.lastClosed?.scopeId], [null, 'legacy']);
  assert.deepEqual(world.history('legacy'), [], 'no typed decision in a Kit 2.3.3 plan');
  const pushed = world.tryGit('legacy', 'push', 'origin', 'main');
  assert.ok(pushed.ok, pushed.output);
});
