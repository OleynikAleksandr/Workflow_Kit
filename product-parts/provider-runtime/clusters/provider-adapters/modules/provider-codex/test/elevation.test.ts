// Windows with UAC off (spec M14 section 2.2) on the fake machine: codex refuses to start the
// daemon from an elevated process; the provider names the cause instead of «Запустить демон».
import assert from 'node:assert/strict';
import { after, before } from 'node:test';
import { createCodexProvider } from '../src/index.ts';
import { POSIX_MACHINE_SKIP, fakeMachine, machineTest as test } from './helpers.ts';
import type { FakeMachine } from './helpers.ts';

let machine: FakeMachine;
const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;

before(async () => {
  if (POSIX_MACHINE_SKIP) return;
  machine = await fakeMachine();
});

after(async () => {
  await machine?.close();
});

test('an elevated daemon start is refused: daemon-elevated, the status and capabilities say why', async () => {
  const stopped = { isAlive: () => false };
  const refusal = 'Error: start the Windows daemon from a non-elevated terminal; shared clients must not inherit administrator privileges';
  const elevated = createCodexProvider(machine.context({ env: { PATH: `${machine.bin}:/usr/bin:/bin`, FAKE_RC_OUTPUT: refusal } }), stopped);
  await elevated.refresh!();
  await assert.rejects(elevated.runAction('daemon-start', null), code('daemon-elevated'));
  const refused = await elevated.status();
  assert.deepEqual([refused.state, refused.label], ['error', 'демон не запускается']);
  assert.match(refused.note ?? '', /UAC.*EnableLUA -Value 1/);
  assert.match((await elevated.capabilities())['createSession']?.reason ?? '', /контроль учётных записей/);
});
