// Spec M31 3.3: the choice and the start of an unstarted plan from any session of the project.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AgentChannel, SessionActivity, StopContext } from '#agent-channel';
import type { KitRunner, WorkflowState } from '#kit-runner';
import { KIT_OUTDATED_TEXT, OWNER_NOTE, WorkflowActionError, createAutopilot } from '../src/index.ts';

const OLD = 'claude:old-1';
const NEW = 'codex:new-1';

function world(over: { owner?: string | null; scopeOwner?: { ok: boolean; code?: string; message?: string } } = {}) {
  const kit = { owner: over.owner === undefined ? 'old-1' : over.owner, calls: [] as string[][] };
  const plan = () => ({ plan: { phase: 'ready', ownerSession: kit.owner }, execution: { strategy: 'sequential', ownerSession: kit.owner } });
  const runner = {
    installed: () => true,
    run: async (_root: string, args: string[]) => {
      kit.calls.push(args);
      if (args[0] === 'autopilot:status') return { ok: true, result: { head: 'h', revision: 1, proposalPending: false } };
      if (args[0] === 'scope:owner') {
        const answer = over.scopeOwner ?? { ok: true };
        if (!answer.ok) return { ok: false, code: answer.code, message: answer.message ?? 'refused', nextAction: null };
        kit.owner = args[2]!;
        return { ok: true, result: { changed: true } };
      }
      return { ok: true, result: {} };
    },
  } as unknown as KitRunner;
  const workflow = {
    get: () => plan(),
    refresh: async () => plan(),
    status: () => ({ execution: { strategy: 'sequential', ownerSession: kit.owner } }),
  } as unknown as WorkflowState;
  const activity: Array<Partial<SessionActivity>> = [
    { key: OLD, sessionId: 'old-1', projectId: 'p', state: 'holding', holdReason: 'waiting-for-plan-start' },
    { key: NEW, sessionId: 'new-1', projectId: 'p', state: 'waiting', holdReason: null },
    { key: 'claude:other', sessionId: 'other', projectId: 'q', state: 'holding', holdReason: 'waiting-for-plan-start' },
  ];
  const sent: Array<{ key: string; text: string }> = [];
  const woken: string[] = [];
  const channel = {
    list: () => activity as SessionActivity[],
    enqueue: (key: string, text: string) => ({ id: `m${sent.push({ key, text })}` }),
    wake: (key: string) => void woken.push(key),
    waiting: () => true,
    get: () => ({ note: null }) as SessionActivity,
    flush: async () => undefined,
  } as unknown as AgentChannel;
  const autopilot = createAutopilot({ runner, workflow, channel, projectPath: async () => '/p' });
  return { kit, activity, sent, woken, autopilot };
}

const ctx = (key: string): StopContext => ({ key, client: key.split(':')[0]!, sessionId: key.split(':')[1]!, projectId: 'p', stopHookActive: false, lastAssistantMessage: null, woken: true });

test('a start from another session moves the owner, wakes the old one and starts the new one', async () => {
  const w = world();
  assert.deepEqual(await w.autopilot.start('p', NEW), { owner: NEW });
  assert.deepEqual(w.kit.calls.find((args) => args[0] === 'scope:owner'), ['scope:owner', '--session', 'new-1', '--note', OWNER_NOTE]);
  assert.equal(w.kit.owner, 'new-1');
  assert.deepEqual(w.woken, [OLD], 'only the old holder of this project');
  assert.deepEqual(w.sent.map((m) => m.key), [NEW]);
  assert.equal(w.autopilot.get(OLD)?.enabled ?? false, false);
  // The old session is released: it no longer owns the ready plan.
  assert.deepEqual(await w.autopilot.decide(ctx(OLD)), { kind: 'release' });
  // Later actions without a session go to the new owner.
  assert.deepEqual(await w.autopilot.resume('p'), { owner: NEW });
});

test('a start in the owner session runs no scope:owner', async () => {
  const w = world();
  assert.deepEqual(await w.autopilot.start('p', OLD), { owner: OLD });
  assert.equal(w.kit.calls.some((args) => args[0] === 'scope:owner'), false);
  assert.deepEqual(w.woken, []);
});

test('a Kit without scope:owner refuses a start from another session with kit-outdated', async () => {
  const w = world({ scopeOwner: { ok: false, code: 'UNKNOWN_COMMAND', message: 'Unknown command: scope:owner' } });
  await assert.rejects(w.autopilot.start('p', NEW), (error: unknown) => {
    assert.ok(error instanceof WorkflowActionError);
    assert.deepEqual([error.code, error.status, error.message], ['kit-outdated', 409, KIT_OUTDATED_TEXT]);
    assert.match(error.nextAction ?? '', /Обновить Kit/);
    return true;
  });
  assert.deepEqual(w.sent, []);
  // A plan without an owner starts as before on an old Kit.
  const free = world({ owner: null, scopeOwner: { ok: false, code: 'UNKNOWN_COMMAND' } });
  assert.deepEqual(await free.autopilot.start('p', NEW), { owner: NEW });
  assert.deepEqual(free.sent.map((m) => m.key), [NEW]);
});

test('a Kit refusal of the owner move is the action error', async () => {
  const w = world({ scopeOwner: { ok: false, code: 'OWNER_BUSY', message: 'The plan has started work' } });
  await assert.rejects(w.autopilot.start('p', NEW), { code: 'OWNER_BUSY', status: 409 });
  assert.deepEqual(w.sent, []);
});

test('a choice in another session wakes the session that held its Stop for it', async () => {
  const w = world();
  w.activity[0]!.holdReason = 'waiting-for-mode-choice';
  assert.deepEqual(await w.autopilot.choose('p', { session: NEW, generation: 1, option: 'sequential' }), { option: 'sequential', owner: NEW });
  assert.deepEqual(w.kit.calls.find((args) => args[0] === 'scope:choose')?.slice(5, 7), ['--session', 'new-1']);
  assert.deepEqual(w.woken, [OLD]);
  assert.deepEqual(w.sent.map((m) => m.key), [NEW], 'the choice message goes only to the choosing session');
});
