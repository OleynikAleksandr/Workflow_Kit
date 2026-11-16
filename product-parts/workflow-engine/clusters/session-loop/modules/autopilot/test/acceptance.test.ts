// The end of a plan in the panel (spec M37 2.2, 2.3) with fakes of Kit, the workflow state and
// the channel: who is told, the refusals of tidy and close, the labels. The real Kit — flow.test.ts.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AgentChannel, SessionActivity } from '#agent-channel';
import type { KitOutcome, KitRunner, WorkflowState } from '#kit-runner';
import { CLEAN_TEXTS, STOP_LABELS, WorkflowActionError, acceptedMessage, closedMessage, createPlanEnd, dirtyTreeText, tidyMessage, tidyNote } from '../src/index.ts';
import type { AutopilotProjectStatus, AutopilotReason, SessionAutopilot } from '../src/index.ts';

const KEY = 'claude:s1';

interface World {
  phase: 'running' | 'acceptance' | 'accepted' | null;
  dirty: string[];
  ownerSession: string | null;
  sessions: string[];
  excluded: string[];
  close: KitOutcome<unknown> | null;
}

function setup(over: Partial<World> = {}) {
  const world: World = { phase: 'acceptance', dirty: [], ownerSession: 's1', sessions: [KEY], excluded: [], close: null, ...over };
  const commands: string[][] = [];
  const queued: Array<{ key: string; text: string; source: string }> = [];
  const woken: string[] = [];
  const logs: string[] = [];
  const holds = new Map<string, string>();
  const entries = new Map<string, SessionAutopilot>();
  const entry = (key: string, projectId: string | null = null): SessionAutopilot => {
    let found = entries.get(key);
    if (!found) {
      found = { key, projectId, enabled: true, continues: 0, maxContinues: 40, orchestrationKey: null, before: null, origin: null, last: null, start: null };
      entries.set(key, found);
    }
    if (projectId) found.projectId = projectId;
    return found;
  };
  const view = () =>
    world.phase === null
      ? { scope: null, execution: null, plan: null }
      : { scope: { id: 'demo' }, execution: { ownerSession: world.ownerSession }, plan: { phase: world.phase, dirty: world.dirty } };
  const workflow = {
    status: () => (world.phase === null ? { scope: null, execution: null } : { scope: { id: 'demo' }, execution: { ownerSession: world.ownerSession } }),
    refresh: async () => view(),
    get: () => view(),
  } as unknown as WorkflowState;
  const runner = {
    run: async (_root: string, args: string[]) => {
      commands.push(args);
      if (args[0] === 'close' && world.close) return world.close;
      if (args[0] === 'accept') world.phase = 'accepted';
      if (args[0] === 'close') world.phase = null;
      return { ok: true, command: args[0], result: {} };
    },
  } as unknown as KitRunner;
  const channel = {
    list: () => world.sessions.map((key) => ({ key, sessionId: key.slice(key.indexOf(':') + 1), projectId: 'p', state: holds.has(key) ? 'holding' : 'waiting', holdReason: holds.get(key) ?? null }) as unknown as SessionActivity),
    excluded: (key: string) => world.excluded.includes(key),
    enqueue: (key: string, text: string, source = 'panel') => {
      queued.push({ key, text, source });
      return { id: 'm', text, source, createdAt: '' };
    },
    wake: (key: string) => void woken.push(key),
  } as unknown as AgentChannel;
  const owners = new Map<string, string>();
  const forgotten: string[] = [];
  const end = createPlanEnd({
    runner,
    workflow,
    channel,
    root: async () => '/project',
    owners,
    entries: () => entries.values(),
    entry,
    note: (target, action, reason, detail) => {
      target.last = { action, reason, label: reason ? (STOP_LABELS[reason] ?? reason) : null, detail, at: 'now' };
    },
    forget: (projectId) => void forgotten.push(projectId),
    fail: (code, message, nextAction = null) => {
      throw new WorkflowActionError(code, message, 409, nextAction);
    },
    log: (line) => void logs.push(line),
  });
  return { world, end, commands, queued, woken, logs, holds, entry, owners, forgotten };
}

const refusal = (code: string, message?: string) => (error: unknown) =>
  error instanceof WorkflowActionError && error.code === code && error.status === 409 && (message === undefined || error.message === message);

test('accept tells the owner: with the paths outside commits on a dirty tree, without them on a clean one', async () => {
  const dirty = setup({ dirty: ['a.json', 'b.md'] });
  dirty.entry(KEY, 'p');
  dirty.holds.set('codex:other', 'ready-for-acceptance');
  dirty.world.sessions.push('codex:other');
  await dirty.end.accept('p', 'Принимаю', undefined);
  assert.deepEqual(dirty.commands, [['accept', '--note', 'Принимаю']]);
  assert.deepEqual(dirty.queued, [{ key: KEY, text: acceptedMessage('demo', ['a.json', 'b.md']), source: 'panel' }]);
  assert.match(dirty.queued[0]!.text, /these paths are not committed: `a\.json`, `b\.md`\./);
  assert.deepEqual(dirty.woken, ['codex:other'], 'another holder of ready-for-acceptance is woken');
  assert.equal(dirty.entry(KEY).enabled, false, 'the autopilot does not continue the answer');
  assert.equal(dirty.entry(KEY).last?.label, 'План принят', 'the label promises no closing');
  assert.deepEqual(dirty.forgotten, ['p']);

  const clean = setup();
  await clean.end.accept('p', undefined, undefined);
  assert.deepEqual(clean.commands, [['accept', '--note', 'Пользователь принял план в панели Workflow Kit']]);
  assert.equal(clean.queued[0]!.text, acceptedMessage('demo', []));
  assert.doesNotMatch(clean.queued[0]!.text, /not committed/);
  assert.equal(clean.entry(KEY).last?.label, 'План принят');
});

test('the owner: remembered, then Kit, then the session of the request', async () => {
  const remembered = setup();
  remembered.owners.set('p', 'codex:chosen');
  await remembered.end.accept('p');
  assert.equal(remembered.queued[0]!.key, 'codex:chosen');

  const unknown = setup({ sessions: [] });
  await unknown.end.accept('p', undefined, 'kimi:asked');
  assert.equal(unknown.queued[0]!.key, 'kimi:asked', 'Kit names a session the channel has not seen');
});

test('accept and close run the Kit command when nobody can be told', async () => {
  const cases: Array<[Partial<World>, string]> = [[{ sessions: [], ownerSession: null }, 'no owner'], [{ excluded: [KEY] }, 'owner left the Kit process']];
  for (const [world, reason] of cases) {
    const accepted = setup(world);
    await accepted.end.accept('p');
    assert.deepEqual(accepted.commands.map((args) => args[0]), ['accept']);
    assert.deepEqual(accepted.queued, [], 'nothing is queued');
    assert.deepEqual(accepted.logs, [`autopilot: accept of p: no session to notify (${reason})`]);

    const closed = setup({ ...world, phase: 'accepted' });
    await closed.end.close('p');
    assert.deepEqual(closed.commands.map((args) => args[0]), ['close']);
    assert.deepEqual(closed.queued, []);
    assert.deepEqual(closed.logs, [`autopilot: close of p: no session to notify (${reason})`]);
  }
});

test('close tells the owner found before the Kit command and labels the plan closed', async () => {
  const s = setup({ phase: 'accepted' });
  s.owners.set('p', KEY);
  s.entry(KEY, 'p');
  await s.end.close('p', undefined, undefined);
  assert.deepEqual(s.commands, [['close', '--scope', 'demo', '--note', 'Пользователь закрыл план в панели Workflow Kit']]);
  assert.deepEqual(s.queued, [{ key: KEY, text: closedMessage('demo'), source: 'panel' }]);
  assert.equal(s.entry(KEY).last?.label, 'План закрыт');
  assert.equal(s.entry(KEY).enabled, false);
  assert.equal(s.owners.has('p'), false);
  await assert.rejects(s.end.close('p'), refusal('no-scope', 'Нет активного плана'));
});

test('close: DIRTY_TREE becomes a Russian refusal with up to five paths; other refusals pass', async () => {
  const paths = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const s = setup({ phase: 'accepted', close: { ok: false, code: 'DIRTY_TREE', message: 'Close the scope on a clean working tree.', nextAction: null, details: { paths } } });
  await assert.rejects(s.end.close('p'), refusal('dirty-tree', dirtyTreeText(paths)));
  assert.deepEqual(s.queued, []);
  assert.equal(dirtyTreeText(['a']), 'в папке проекта есть файлы вне коммитов: `a`. Пока они есть, план не закроется: нажмите «Попросить агента убрать» на карточке плана или уберите их сами.');
  assert.match(dirtyTreeText(paths.slice(0, 5)), /: `a`, `b`, `c`, `d`, `e`\. Пока/);
  assert.match(dirtyTreeText(paths), /: `a`, `b`, `c`, `d`, `e` \(и ещё 2\)\. Пока/);

  const other = setup({ phase: 'accepted', close: { ok: false, code: 'NOT_ACCEPTED', message: 'Not accepted.', nextAction: 'Accept first.', details: {} } });
  await assert.rejects(other.end.close('p'), (error: unknown) => error instanceof WorkflowActionError && error.code === 'NOT_ACCEPTED' && error.message === 'Not accepted.' && error.nextAction === 'Accept first.');
});

test('tidy: the six outcomes in order', async () => {
  await assert.rejects(setup({ phase: null }).end.tidy('p'), refusal('no-scope', 'Нет активного плана'));
  await assert.rejects(setup({ phase: 'running', dirty: ['a'] }).end.tidy('p'), refusal('not-finished', 'Убирать файлы можно, когда план выполнен'));
  // clean: the text follows the phase and promises closing only for an accepted plan.
  await assert.rejects(setup({ phase: 'acceptance' }).end.tidy('p'), refusal('clean', 'Файлов вне коммитов нет: можно принимать результат'));
  await assert.rejects(setup({ phase: 'accepted' }).end.tidy('p'), refusal('clean', 'Файлов вне коммитов нет: план можно закрыть'));
  assert.deepEqual(Object.keys(CLEAN_TEXTS), ['acceptance', 'accepted']);
  // no owner, an owner out of the Kit process: a refusal, nothing queued.
  const lost = setup({ dirty: ['a'], sessions: [], ownerSession: null });
  await assert.rejects(lost.end.tidy('p'), refusal('no-owner', 'Не найдена сессия-владелец плана: уберите файлы сами'));
  const out = setup({ dirty: ['a'], excluded: [KEY] });
  await assert.rejects(out.end.tidy('p'), refusal('owner-unavailable', 'Сессия-владелец плана не получает сообщений Workflow Kit: уберите файлы сами'));
  assert.deepEqual([...lost.queued, ...out.queued], []);
  // dirty in both phases: the owner gets the message; a session that cannot be woken keeps it queued.
  for (const phase of ['acceptance', 'accepted'] as const) {
    const s = setup({ phase, dirty: ['a.json'] });
    assert.deepEqual(await s.end.tidy('p', 'codex:asked'), { owner: KEY, paths: ['a.json'] });
    assert.deepEqual(s.queued, [{ key: KEY, text: tidyMessage(['a.json']), source: 'panel' }]);
    assert.equal(s.entry(KEY).enabled, true, 'tidy does not touch the autopilot');
    assert.deepEqual(s.commands, [], 'tidy runs no Kit command');
  }
});

test('texts: ten paths in a message, the rest as a count; no promise of closing in tidy', () => {
  const many = Array.from({ length: 12 }, (_, index) => `f${index}`);
  assert.match(tidyNote(many), /`f9` \(and 2 more\)\. Tidy them now/);
  assert.doesNotMatch(tidyNote(many), /`f10`/);
  assert.match(tidyNote(['a']), /^ Closing needs a clean working tree, and these paths are not committed: `a`\. Tidy them now: delete temporary files you created/);
  assert.doesNotMatch(tidyMessage(['a']), /Закрыть план/);
  assert.match(acceptedMessage('demo', []), /whether the plan can be closed now, then end your turn\.$/);
  assert.match(closedMessage('demo'), /Do not run Kit commands for it\./);
});

test('labels: acceptance and closing in the chat correct a stale «Ждёт приёмки»', () => {
  const s = setup();
  const status = (delivery: AutopilotProjectStatus['delivery'], scope: AutopilotProjectStatus['scope'] = 'ACTIVE') => ({ delivery, scope }) as AutopilotProjectStatus;
  const reason = (previous: AutopilotReason | null, next: AutopilotReason, st: AutopilotProjectStatus) => s.end.endReason(previous, next, st);
  assert.equal(reason(null, 'ready-for-acceptance', status('READY_FOR_ACCEPTANCE')), 'ready-for-acceptance');
  assert.equal(reason(null, 'ready-for-acceptance', status('ACCEPTED')), 'accepted');
  assert.equal(reason('accepted', 'no-scope', status(null, 'NONE')), 'closed');
  assert.equal(reason('ready-for-acceptance', 'no-scope', status(null, 'NONE')), 'closed');
  assert.equal(reason('closed', 'no-scope', status(null, 'NONE')), 'closed');
  assert.equal(reason(null, 'no-scope', status(null, 'NONE')), 'no-scope', 'a session that never ended a plan');
  assert.equal(reason('accepted', 'paused', status('IN_PROGRESS')), 'paused');

  const entry = s.entry(KEY, 'p');
  const label = (previous: AutopilotReason | null, st: AutopilotProjectStatus) => {
    entry.last = previous ? { action: 'hold', reason: previous, label: STOP_LABELS[previous] ?? previous, detail: '', at: '' } : null;
    s.end.settle(entry, st);
    return entry.last?.label ?? null;
  };
  assert.equal(label('ready-for-acceptance', status('READY_FOR_ACCEPTANCE')), 'Ждёт приёмки');
  assert.equal(label('ready-for-acceptance', status('ACCEPTED')), 'План принят');
  assert.equal(label('ready-for-acceptance', status(null, 'NONE')), 'План закрыт');
  assert.equal(label('accepted', status('ACCEPTED')), 'План принят');
  assert.equal(label('accepted', status(null, 'NONE')), 'План закрыт');
  assert.equal(label('paused', status(null, 'NONE')), 'Пауза', 'other labels stay');
  assert.equal(label(null, status(null, 'NONE')), null);
});
