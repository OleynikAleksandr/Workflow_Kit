// M45 T002: the direct path asks the channel to confirm a paste by its prompt hook only for a
// session whose hooks the channel has seen (a session it does not know never sends one), and logs
// a paste no hook took.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SessionActivity } from '#agent-channel';
import type { Project } from '#project-registry';
import { createStubProvider } from '#provider-registry';
import type { Provider } from '#provider-registry';
import { DIRECT_CONFIRM_MS, createDirectMessage } from '../src/direct-message.ts';

const PROJECT = { id: 'p1', path: '/home/u/Projects/demo' } as Project;

function world(known: boolean, answer: boolean | 'unconfirmed') {
  const asked: number[] = [];
  const lines: string[] = [];
  const provider: Provider = { ...createStubProvider({ id: 'alpha', title: 'Alpha', task: 'T000' }), sendDirect: async () => true };
  const direct = createDirectMessage({
    activity: () => (known ? ({ key: 'alpha:s1', client: 'alpha', sessionId: 's1', projectId: 'p1', state: 'waiting', external: false } as SessionActivity) : undefined),
    provider: (id) => (id === 'alpha' ? provider : undefined),
    project: async () => PROJECT,
    log: (line) => lines.push(line),
    channel: { directTurn: async (_key, _project, _text, send, confirmMs) => { asked.push(confirmMs ?? 0); await send(); return answer; } },
  });
  return { direct, asked, lines };
}

test('a known session confirms the paste for DIRECT_CONFIRM_MS, an unknown one does not wait', async () => {
  const known = world(true, true);
  assert.equal(await known.direct('p1', 'alpha:s1', 'hi'), true);
  assert.deepEqual(known.asked, [DIRECT_CONFIRM_MS]);
  const unknown = world(false, true);
  assert.equal(await unknown.direct('p1', 'alpha:s1', 'hi'), true);
  assert.deepEqual(unknown.asked, [0]);
});

test('an unconfirmed paste is passed on and logged', async () => {
  const w = world(true, 'unconfirmed');
  assert.equal(await w.direct('p1', 'alpha:s1', 'hi'), 'unconfirmed');
  assert.ok(w.lines.some((line) => line.includes('no prompt hook took it within 8000 ms')), w.lines.join('\n'));
});
