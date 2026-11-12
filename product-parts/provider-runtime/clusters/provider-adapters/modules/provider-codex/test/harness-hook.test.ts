// The Harness SessionStart hook (the recovery packet, spec M21 3.2) is approved by Kit together with
// the Kit hooks; a foreign hook and an edited Harness command are not.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { after, before } from 'node:test';
import { installStructure } from '#kit-structure';
import type { Project, Provider } from '#provider-registry';
import { HARNESS_CODEX_HOOK_COMMAND, KIT_HOOK_COMMAND, createCodexProvider } from '../src/index.ts';
import { POSIX_MACHINE_SKIP, fakeMachine, machineTest as test } from './helpers.ts';
import type { FakeMachine } from './helpers.ts';

let machine: FakeMachine;
let provider: Provider;
let project: Project;
const FOREIGN = 'echo foreign-hook';
const EDITED = `${HARNESS_CODEX_HOOK_COMMAND} --verbose`;
const hashOf = (command: string): string => 'sha256:' + createHash('sha256').update(command).digest('hex');

before(async () => {
  if (POSIX_MACHINE_SKIP) return;
  machine = await fakeMachine();
  await machine.daemon();
  project = await machine.project('Harness');
  // What a Kit install leaves: foreign and Harness hooks first, then the Kit structure appends its own.
  await mkdir(path.join(project.path, '.codex'), { recursive: true });
  const groups = [FOREIGN, HARNESS_CODEX_HOOK_COMMAND, EDITED].map((command) => ({ hooks: [{ type: 'command', command }] }));
  await writeFile(path.join(project.path, '.codex', 'hooks.json'), JSON.stringify({ hooks: { SessionStart: groups } }, null, 2));
  await installStructure(project.path);
  provider = createCodexProvider(machine.context());
  await provider.refresh!();
  const preview = await provider.previewTrust(project);
  await provider.grantTrust(project, preview.token);
});

after(async () => {
  await machine?.close();
});

test('the Harness hook is a Kit hook in the trust preview and in the hook state', async () => {
  const preview = await provider.previewTrust(project);
  const kinds = preview.autorun.filter((a) => a.detail.startsWith('SessionStart:')).map((a) => [a.kind, a.detail]);
  assert.deepEqual(kinds.slice(0, 3), [
    ['hook', `SessionStart: ${FOREIGN}`],
    ['kit-hook', `SessionStart: ${HARNESS_CODEX_HOOK_COMMAND}`],
    ['hook', `SessionStart: ${EDITED}`],
  ]);
  const state = await provider.hooks(project);
  assert.equal(state.kitHook?.command, KIT_HOOK_COMMAND);
  assert.equal(state.kitHook?.status, 'pending');
  assert.deepEqual(state.hooks.map((h) => h.command), [FOREIGN, EDITED], 'only foreign and edited hooks are listed as foreign');
});

test('approveHooks writes the Harness hook approval with the Kit hooks and leaves foreign hooks pending', async () => {
  const approved = await provider.approveHooks!(project, { command: KIT_HOOK_COMMAND, hash: hashOf(KIT_HOOK_COMMAND) });
  assert.equal(approved.kitHook?.status, 'approved');
  assert.equal(approved.complete, true);
  assert.deepEqual(approved.hooks.map((h) => [h.command, h.status]), [[FOREIGN, 'pending'], [EDITED, 'pending']]);
  const config = await readFile(path.join(machine.codexHome, 'config.toml'), 'utf8');
  const file = `${project.path}/.codex/hooks.json`;
  assert.ok(config.includes(`[hooks.state."${file}:session_start:1:0"]\ntrusted_hash = "${hashOf(HARNESS_CODEX_HOOK_COMMAND)}"`), 'the Harness hook is approved');
  assert.ok(config.includes(`[hooks.state."${file}:session_start:3:0"]\ntrusted_hash = "${hashOf(KIT_HOOK_COMMAND)}"`), 'the Kit hook is approved');
  assert.ok(!config.includes(':session_start:0:0') && !config.includes(':session_start:2:0'), 'no approval for foreign or edited hooks');
});
