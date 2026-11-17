// M40 T009, end-to-end scenarios 2, 3, 4 and 6 (validation section 2) with the real Kit bundle and
// the service wired as `wfk serve` wires it, on `decisions: host` projects.
// 2. A manual pass by the panel buttons: the mode, the delivery (the service starts it), the
//    acceptance and the close are host operations with the source `button`; the publication
//    after the close passes the `pre-push` hook.
// 3. `accept --note` of a separate agent process is refused and becomes a card without a word of
//    the agent; `wfk decision accept` takes the user's message of the turn, without one it fails.
// 4. The plan question in the full mode: a `Workflow Kit:` text and Settings off give the card.
// 6. Stale decisions: a proposal changed after the card, a message of an old turn, a queued one,
//    one after an automatic continuation; a double press gives one record.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { USER_MESSAGE_SOURCE } from '#agent-channel';
import { WorkflowActionError, decisionBy, deliveryStartedMessage } from '../src/index.ts';
import { AUTO_SCOPE, KEY, bootService, openWorld } from './m40-world.ts';
import type { Service, World } from './m40-world.ts';

let world: World;
let svc: Service | null = null;
const refused = (code: string) => (error: unknown) => error instanceof WorkflowActionError && error.code === code;
/** A manual plan: the scope of the automated pass without the automation block. */
const { automation: _automation, ...MANUAL } = AUTO_SCOPE;

before(async () => {
  world = await openWorld('wfk-m40-host-');
  for (const id of ['manual', 'chat', 'question', 'stale']) await world.project(id, 'host');
});

after(async () => {
  svc?.close();
  await world.close();
});

/** Each scenario has its own service: the owner session «claude:s-1» belongs to one project. */
async function service(mode: 'off' | 'full' = 'off'): Promise<Service> {
  svc?.close();
  svc = await bootService(world, mode, 2_000);
  return svc;
}

/** The scripted agent finishes the note and the documents task of the round. */
async function work(id: string): Promise<void> {
  await world.kit(id, 'task:start', 'N');
  await world.put(id, 'docs/note.md', '# Note\n');
  await world.put(id, 'docs/evidence/result.md', '# Result\n');
  await world.kit(id, 'commit', '--task', 'N');
  await world.kit(id, 'task:start', 'DOCS-R1');
  await world.put(id, '.harness/inputs/digest.json', JSON.stringify({ result: 'Done.', decisions: [], contracts: [], references: [] }));
  await world.put(id, 'README.md', '# Demo, documented\n');
  await world.kit(id, 'commit', '--task', 'DOCS-R1', '--digest', '.harness/inputs/digest.json');
}

/** The mode by the button, the work, the delivery by the button, the release: ready for acceptance. */
async function toReady(s: Service, id: string): Promise<void> {
  await world.propose(id, { ...MANUAL, id });
  await s.workflow.refresh(id);
  await s.autopilot.choose(id, { session: KEY, generation: 1, option: 'sequential', by: decisionBy({ requestId: `choose-${id}` }) });
  await work(id);
  const started = await s.autopilot.confirmDelivery(id, '', KEY, decisionBy({ requestId: `delivery-${id}` }));
  assert.deepEqual([started.taskId, started.started], ['D1', true]);
  assert.equal((await world.plan(id)).tasks.find((t) => t.id === 'D1')?.status, 'IN_PROGRESS', 'the service started the delivery');
  await world.put(id, 'docs/release.md', '# Release\n');
  await world.kit(id, 'commit', '--task', 'D1');
  assert.equal((await world.plan(id)).scope?.delivery, 'READY_FOR_ACCEPTANCE');
}

test('scenario 2: a manual host pass by the buttons — every decision a host operation with the source button; the publication passes pre-push', async () => {
  const s = await service('off');
  await toReady(s, 'manual');
  assert.ok(s.channel.queued(KEY).some((m) => m.text.includes(deliveryStartedMessage('D1'))), 'the agent heard of the delivery after it started');
  const accepted = await s.autopilot.accept('manual', undefined, KEY, decisionBy({ requestId: 'accept-manual' }));
  assert.equal(accepted.decision?.already, false);
  // A double press of the same card: no second record. Without the request id of a card (none was
  // pending when the panel drew it) Kit refuses the second press as NOT_READY — still one record.
  await assert.rejects(s.autopilot.accept('manual', undefined, KEY, decisionBy({ requestId: 'accept-manual' })), refused('NOT_READY'));
  assert.equal(world.history('manual').filter((d) => d.kind === 'accept').length, 1);
  await s.autopilot.close('manual', undefined, KEY, decisionBy({ requestId: 'close-manual' }));
  const decisions = world.history('manual');
  assert.deepEqual(decisions.map((d) => d.kind), ['choose', 'confirm-delivery', 'accept', 'close']);
  for (const decision of decisions) assert.deepEqual([decision.source?.kind, decision.source?.session, Boolean(decision.decisionId)], ['button', 's-1', true], JSON.stringify(decision));
  assert.equal((await world.plan('manual')).scope, null, 'closed');
  // «Опубликовать на GitHub» after the close: the pre-push hook lets main go.
  const pushed = world.tryGit('manual', 'push', 'origin', 'main');
  assert.ok(pushed.ok, pushed.output);
  assert.equal(world.git(world.remotes['manual']!, 'rev-parse', 'main'), world.git('manual', 'rev-parse', 'HEAD'));
});

test('scenario 3: accept of a separate agent process becomes a card; wfk decision takes the user\'s message, without one it fails', async () => {
  const s = await service('off');
  await toReady(s, 'chat');
  // The agent runs the Kit 2.3 form in its terminal with words of its own: nothing is accepted.
  const asked = await world.refusedKit('chat', 'accept', '--note', 'The user accepts the result');
  assert.deepEqual([asked.code, asked.decision?.kind], ['USER_DECISION_REQUIRED', 'accept']);
  assert.equal((await world.plan('chat')).scope?.delivery, 'READY_FOR_ACCEPTANCE');
  // The panel state has the card: the agent reported nothing.
  const view = await s.workflow.refresh('chat');
  assert.deepEqual(view?.decisions.map((d) => [d.id, d.kind]), [[asked.decision!.id, 'accept']]);
  // `wfk decision accept` without a message of the user in this turn: refused, nothing recorded.
  await assert.rejects(s.commands.run('chat', { kind: 'accept', session: KEY, by: { message: KEY } }), refused('decision-source-missing'));
  await s.prompt('chat', 'Принимаю результат, всё сделано верно');
  const done = await s.commands.run('chat', { kind: 'accept', session: KEY, by: { message: KEY } });
  assert.equal(done.already, false);
  const record = world.history('chat').at(-1)!;
  assert.deepEqual([record.kind, record.source?.kind, record.decisionId], ['accept', 'message', asked.decision!.id], 'the request of the card was applied');
  assert.match(record.text, /Принимаю результат, всё сделано верно/u);
  assert.doesNotMatch(record.text, /The user accepts the result/u, 'not the agent\'s words');
  assert.deepEqual((await s.workflow.refresh('chat'))?.decisions, [], 'no card after the decision');
});

test('scenario 4: the plan question in the full mode — a Workflow Kit text and Settings off give the card, the user\'s message prepares', async () => {
  const s = await service('full');
  // A message of the service begins the turn: no user source, the question card.
  await s.prompt('question', 'Привет');
  await s.stop('question');
  s.channel.enqueue(KEY, 'Workflow Kit: the reviewer answered. Sketch the plan.', 'review', 'question');
  await s.stop('question');
  assert.equal(s.channel.interruption(KEY)?.origin, 'delivery');
  assert.equal(await s.runs.authorizePreparation('question', KEY, 'Plan'), null);
  // A typed text that is a service message is no instruction of the user either.
  await s.stop('question');
  await s.prompt('question', 'Workflow Kit: autopilot. Continue the workflow.');
  assert.equal(await s.runs.authorizePreparation('question', KEY, 'Plan'), null);
  // Settings off: the user's own message gets the card too.
  const settings = await s.settings.read();
  await s.settings.write({ expectedRevision: settings.settings.revision, mode: 'off', review: false });
  await s.stop('question');
  await s.prompt('question', 'Сделай заметку о фиче');
  assert.equal(await s.runs.authorizePreparation('question', KEY, 'Plan'), null);
  assert.deepEqual(await s.journal.list(world.roots['question']!), [], 'no run');
  // Full again: the same message of this turn registers the run.
  await s.settings.write({ expectedRevision: settings.settings.revision + 1, mode: 'full', review: false });
  const prepared = await s.runs.authorizePreparation('question', KEY, 'Plan');
  assert.deepEqual([prepared?.policy, (await s.journal.list(world.roots['question']!)).length], ['full', 1]);
});

test('scenario 6: stale decisions — a changed proposal, an old turn, a queued message, an automatic continuation', async () => {
  const s = await service('off');
  await world.propose('stale', { ...MANUAL, id: 'stale' });
  const asked = await world.refusedKit('stale', 'scope:choose', '--generation', '1', '--option', 'sequential', '--session', 's-1', '--note', 'The user chose');
  assert.equal(asked.decision?.kind, 'choose');
  // The specification changes after the card was shown: the old button chooses nothing.
  await world.put('stale', 'docs/spec.md', '# Spec\n\nChanged after the card.\n');
  await assert.rejects(s.autopilot.choose('stale', { session: KEY, generation: 1, option: 'sequential', by: decisionBy({ decision: asked.decision, requestId: 'old-card' }) }), refused('DECISION_STALE'));
  assert.equal((await world.plan('stale')).scope, null);
  const choose = () => s.commands.run('stale', { kind: 'choose', option: 'sequential', session: KEY, by: { message: KEY } });
  // The user's message, then the autopilot continues the session: the message is no source any more.
  await s.prompt('stale', 'Выбираю последовательное выполнение');
  await s.stop('stale', { kind: 'continue', text: 'Workflow Kit: autopilot. Continue.' });
  await assert.rejects(choose(), refused('decision-source-missing'));
  // A panel message written while the agent works waits in the queue: no source until delivered.
  s.channel.enqueue(KEY, 'Выбираю последовательное выполнение', USER_MESSAGE_SOURCE, 'stale');
  await assert.rejects(choose(), refused('decision-source-missing'));
  assert.equal((await world.plan('stale')).scope, null, 'nothing was chosen');
  // Delivered at the end of the turn, it begins the turn that chooses.
  assert.match((await s.stop('stale')) ?? '', /Выбираю последовательное/u);
  assert.equal((await choose()).kind, 'choose');
  assert.equal((await world.plan('stale')).scope?.id, 'stale');
  // One record; the chosen plan has no proposal left to choose for.
  await assert.rejects(choose(), refused('no-proposal'));
  assert.deepEqual(world.history('stale').map((d) => [d.kind, d.source?.kind]), [['choose', 'message']]);
});
