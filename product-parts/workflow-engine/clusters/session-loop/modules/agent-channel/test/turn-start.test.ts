import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAgentChannel, parseHookInput, sessionKey } from '../src/index.ts';
import type { StopContext } from '../src/index.ts';
import { KEY, prompt, until, world } from './detached-world.ts';

// Spec M31 3.2: the decider learns when the ended turn began (the proposal author).
const CWD = '/home/u/Projects/demo';
const SID = 'cd718965-ec3f-44fe-93e8-33d1c6848a88';
const hook = (event: 'Stop' | 'UserPromptSubmit') =>
  parseHookInput('claude', { session_id: SID, cwd: CWD, hook_event_name: event, prompt: 'задача', stop_hook_active: false, last_assistant_message: 'ok' }, undefined, () => 'claude')!;

test('a held Stop hook gives the decider the start of the ended turn', async () => {
  let clock = Date.parse('2026-11-14T10:00:00.000Z');
  const asked: StopContext[] = [];
  const ch = createAgentChannel({
    resolveProject: async (folder) => (folder.startsWith(CWD) ? { id: 'p1' } : undefined),
    now: () => new Date(clock),
    decide: (context) => {
      asked.push(context);
      return { kind: 'release' };
    },
  });
  // A Stop without a known turn start: unknown.
  await ch.stop(hook('Stop'));
  assert.equal(asked[0]!.turnStartedAt, null);
  await ch.prompt(hook('UserPromptSubmit'));
  assert.equal(ch.get(sessionKey('claude', SID))!.turnStartedAt, '2026-11-14T10:00:00.000Z');
  clock += 60_000;
  await ch.stop(hook('Stop'));
  assert.equal(asked[1]!.turnStartedAt, '2026-11-14T10:00:00.000Z');
  assert.equal(ch.get(sessionKey('claude', SID))!.turnStartedAt, null, 'the activity forgets it as before');
  ch.close();
});

test('a detached turn end gives the decider the start of the ended turn', async () => {
  const w = world();
  await w.ch.prompt(prompt('задача'));
  const started = w.ch.get(KEY)!.turnStartedAt;
  assert.ok(started, 'the prompt started the turn');
  await w.end();
  w.idle = true;
  await until(() => w.asked.length === 1, 'the decider is asked');
  assert.equal(w.asked[0]!.turnStartedAt, started);
  w.ch.close();
});
