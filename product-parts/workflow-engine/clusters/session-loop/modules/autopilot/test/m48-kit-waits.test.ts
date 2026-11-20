// M48 T004: a press Kit refuses with LOCKED waits (202) and is applied once when Kit is free; a
// second press of the same decision joins the wait; another answer of Kit ends the wait with its
// reason; 15 minutes end it with a reason; the plan, decision and run buttons go through it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRouter, createStateRegistry } from '#http-server';
import { KIT_WAIT_TEXTS, WorkflowActionError, createKitWaits, kitLocked, pressSignature, registerAutopilotRoutes, registerDecisionRoutes, registerRunControlRoutes } from '../src/index.ts';
import type { Autopilot, DecisionCommands, RunControl } from '../src/index.ts';

class KitError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
const LOCKED = () => new KitError('LOCKED', 'Another workflow operation is running.');

function clock() {
  let at = Date.parse('2026-11-20T10:00:00.000Z');
  const timers: Array<() => void> = [];
  return {
    now: () => new Date(at),
    schedule: (run: () => void) => void timers.push(run),
    /** Moves the clock and fires the due retries (each schedules its next). */
    async tick(ms: number) {
      at += ms;
      const due = timers.splice(0);
      for (const run of due) run();
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}

test('kitLocked: the code or the text of the Kit lock; the signature ignores the press id', () => {
  assert.equal(kitLocked(LOCKED()), true);
  assert.equal(kitLocked(new Error('Another workflow operation is running.')), true);
  assert.equal(kitLocked(new KitError('DIRTY_TREE', 'x')), false);
  assert.equal(pressSignature('accept', { requestId: 'r1', session: 's', decision: { id: 'd' } }), pressSignature('accept', { decision: { id: 'd' }, session: 's', requestId: 'r2' }));
  assert.notEqual(pressSignature('accept', { session: 's' }), pressSignature('close', { session: 's' }));
});

test('LOCKED: the press waits, a second press joins, the action is applied once when Kit is free', async () => {
  const c = clock();
  const waits = createKitWaits({ now: c.now, schedule: c.schedule });
  let calls = 0;
  let busy = 2;
  const act = async () => {
    calls += 1;
    if (busy > 0) {
      busy -= 1;
      throw LOCKED();
    }
    return { confirmed: true };
  };
  const first = (await waits.run('p1', 'confirm-delivery', 'sig', act)) as { status: number; body: { pending: boolean; wait: { state: string; text: string } } };
  assert.deepEqual([first.status, first.body.pending, first.body.wait.state, first.body.wait.text], [202, true, 'waiting', KIT_WAIT_TEXTS.waiting]);
  const again = (await waits.run('p1', 'confirm-delivery', 'sig', act)) as { status: number };
  assert.equal(again.status, 202);
  assert.equal(calls, 1, 'the second press joined the wait');
  await c.tick(2_000);
  assert.equal(waits.section().projects['p1']?.[0]?.state, 'waiting', 'still locked');
  await c.tick(2_000);
  const done = waits.section().projects['p1']![0]!;
  assert.deepEqual([done.state, done.attempts, calls], ['done', 3, 3]);
  // A free Kit: the press goes through at once.
  assert.deepEqual(await waits.run('p1', 'confirm-delivery', 'sig', act), { confirmed: true });
});

test('another answer of Kit ends the wait with its reason; 15 minutes end it as expired', async () => {
  const c = clock();
  const waits = createKitWaits({ now: c.now, schedule: c.schedule });
  let answer: Error = LOCKED();
  await waits.run('p1', 'accept', 'a', async () => {
    throw answer;
  });
  answer = new KitError('DECISION_STALE', 'Решение уже изменилось');
  await c.tick(2_000);
  assert.deepEqual([waits.section().projects['p1']![0]!.state, waits.section().projects['p1']![0]!.error], ['failed', 'Решение уже изменилось']);
  const slow = createKitWaits({ now: c.now, schedule: c.schedule, limitMs: 6_000 });
  await slow.run('p2', 'close', 'c', async () => {
    throw LOCKED();
  });
  for (let i = 0; i < 4; i += 1) await c.tick(2_000);
  const expired = slow.section().projects['p2']![0]!;
  assert.deepEqual([expired.state, expired.error], ['failed', KIT_WAIT_TEXTS.expired]);
  // A failed wait does not hold the next press: it runs again.
  assert.deepEqual(await slow.run('p2', 'close', 'c', async () => 'closed'), 'closed');
  // Any other error of the first try is the usual refusal.
  await assert.rejects(waits.run('p1', 'start', 's', async () => {
    throw new KitError('NO_PLAN', 'x');
  }), { code: 'NO_PLAN' });
});

test('the decision card and the run buttons wait out LOCKED through the routes', async () => {
  const c = clock();
  const waits = createKitWaits({ now: c.now, schedule: c.schedule });
  const router = createRouter();
  let locked = true;
  const applied: string[] = [];
  const commands = {
    run: async (_id: string, command: { kind: string }) => {
      if (locked) throw LOCKED();
      applied.push(command.kind);
      return { kind: command.kind, decisionId: 'd1', already: false, text: '' };
    },
  } as unknown as DecisionCommands;
  registerDecisionRoutes({ router, commands, locate: async () => ({ projectId: 'p1', key: 'claude:s' }), waits });
  const control = { pause: async () => (locked ? Promise.reject(LOCKED()) : (applied.push('pause'), { phase: 'paused' })) } as unknown as RunControl;
  registerRunControlRoutes({ router, control, waits });
  const call = (url: string, body: unknown): Promise<unknown> => {
    const route = router.match('POST', url) as unknown as { handler(input: unknown): Promise<unknown>; params: Record<string, string> };
    return route.handler({ params: route.params, body, query: new URLSearchParams() });
  };
  const pressed = (await call('/api/projects/p1/workflow/decision', { kind: 'confirm-delivery', task: 'T7', decision: { id: 'd1' }, requestId: 'r1' })) as { status: number };
  assert.equal(pressed.status, 202);
  assert.equal(((await call('/api/projects/p1/workflow/decision', { kind: 'confirm-delivery', task: 'T7', decision: { id: 'd1' }, requestId: 'r2' })) as { status: number }).status, 202);
  assert.equal(((await call('/api/projects/p1/autopiloting/pause', { runId: 'run-1', expectedRevision: 3 })) as { status: number }).status, 202);
  locked = false;
  await c.tick(2_000);
  assert.deepEqual(applied.sort(), ['confirm-delivery', 'pause'], 'each press applied once');
  assert.deepEqual(waits.section().projects['p1']!.map((wait) => [wait.action, wait.state]).sort(), [['decision:confirm-delivery', 'done'], ['run:pause', 'done']]);
});

test('«Подтвердить выпуск» of the plan card: the Kit refusal LOCKED (as WorkflowActionError) waits and is applied once', async () => {
  const c = clock();
  const waits = createKitWaits({ now: c.now, schedule: c.schedule });
  const router = createRouter();
  let locked = true;
  let confirmed = 0;
  const autopilot = {
    confirmDelivery: async () => {
      if (locked) throw new WorkflowActionError('LOCKED', 'Another workflow operation is running.', 409);
      confirmed += 1;
      return { text: 'ok' };
    },
    section: () => ({}),
  } as unknown as Autopilot;
  registerAutopilotRoutes({ router, state: createStateRegistry(), autopilot, waits });
  const route = router.match('POST', '/api/projects/p1/workflow/confirm-delivery') as unknown as { handler(input: unknown): Promise<{ status?: number }>; params: Record<string, string> };
  const answer = await route.handler({ params: route.params, body: { session: 'claude:s', decision: { id: 'd' } }, query: new URLSearchParams() });
  assert.equal(answer.status, 202);
  locked = false;
  await c.tick(2_000);
  assert.equal(confirmed, 1);
});
