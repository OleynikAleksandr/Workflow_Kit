// M46 T002: a provider that refuses the paste (its terminal is not free) is passed on with the
// reason and logged; the channel reservation answers false for it, so no turn is recorded.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SessionActivity } from '#agent-channel';
import type { Project } from '#project-registry';
import { createStubProvider } from '#provider-registry';
import type { Provider } from '#provider-registry';
import { createDirectMessage } from '../src/direct-message.ts';

const PROJECT = { id: 'p1', path: '/home/u/Projects/demo' } as Project;
const REASON = 'Терминал Claude занят или не распознан';

test('a refused paste comes back as { refused } with its reason and a log line; the reservation saw false', async () => {
  const lines: string[] = []; const sent: boolean[] = [];
  const provider: Provider = { ...createStubProvider({ id: 'alpha', title: 'Alpha', task: 'T000' }), sendDirect: async () => ({ refused: REASON }) };
  const direct = createDirectMessage({
    activity: () => ({ key: 'alpha:s1', client: 'alpha', sessionId: 's1', projectId: 'p1', state: 'waiting', external: false } as SessionActivity),
    provider: (id) => (id === 'alpha' ? provider : undefined),
    project: async () => PROJECT,
    log: (line) => lines.push(line),
    channel: { directTurn: async (_key, _project, _text, send) => { const ok = await send(); sent.push(ok); return ok; } },
  });
  assert.deepEqual(await direct('p1', 'alpha:s1', 'Сделай утилиту'), { refused: REASON });
  assert.deepEqual(sent, [false], 'the channel records no turn');
  assert.ok(lines.some((line) => line === `channel: message to alpha:s1 refused, not queued: ${REASON}`), lines.join('\n'));
});

test('without a channel the refusal is passed on as well', async () => {
  const provider: Provider = { ...createStubProvider({ id: 'alpha', title: 'Alpha', task: 'T000' }), sendDirect: async () => ({ refused: REASON }) };
  const direct = createDirectMessage({ activity: () => undefined, provider: () => provider, project: async () => PROJECT });
  assert.deepEqual(await direct('p1', 'alpha:s1', 'x'), { refused: REASON });
});
