import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { WorkflowState } from '#kit-runner';
import { pauseInterruptedOwner } from '../src/interrupt.ts';

test('interruption pauses only an active plan of this owner, and never cancels assignments', async () => {
  let pauses = 0;
  let scope = true;
  let owner: string | null = 'owner';
  let paused = false;
  const workflow = {
    refresh: async () => ({ scope: scope ? { id: 's' } : null, plan: { ownerSession: owner } }),
    get: () => undefined,
    status: () => ({ scope: scope ? { id: 's' } : null, execution: { ownerSession: owner }, paused }),
  } as unknown as WorkflowState;
  const run = (key: string) => pauseInterruptedOwner({ workflow, projectId: 'p', key, pause: async () => { pauses += 1; } });
  await run('codex:other');
  assert.equal(pauses, 0);
  await run('codex:owner');
  assert.equal(pauses, 1);
  paused = true;
  await run('codex:owner');
  assert.equal(pauses, 1);
  paused = false; scope = false;
  await run('codex:owner');
  assert.equal(pauses, 1);
  scope = true; owner = null;
  await run('codex:owner');
  assert.equal(pauses, 1);
});

test('a mandatory Kit pause failure is propagated to the caller', async () => {
  const workflow = { refresh: async () => ({ scope: { id: 's' }, plan: { ownerSession: 'owner' } }), status: () => ({ paused: false }) } as unknown as WorkflowState;
  await assert.rejects(pauseInterruptedOwner({ workflow, projectId: 'p', key: 'claude:owner', pause: async () => { throw new Error('Kit pause failed'); } }), /Kit pause failed/);
});
