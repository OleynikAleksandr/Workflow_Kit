import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createClaudeProvider } from '../src/index.ts';
import type { Provider, Project } from '#provider-registry';
import { createHarness, skip } from './harness.ts';
import { STATE_SUFFIX } from '../src/pty/interrupt-control.ts';

const target = { turnRef: 'kit-ref', nativeTurnId: null };
async function until(check: () => Promise<boolean>, message: string) {
  for (let i = 0; i < 100; i++) { if (await check()) return; await new Promise((r) => setTimeout(r, 50)); }
  assert.fail(message);
}
async function ready(provider: Provider, project: Project, sid: string) {
  await until(async () => { await provider.listSessions(project); return provider.interruptAvailability!(project, sid).available; }, 'fresh managed terminal state');
}

for (const platform of ['darwin', 'linux'] as const) test(`expect ${platform}: fresh confirmation, no Stop hook, process remains alive and next prompt works`, { skip }, async () => {
  const h = await createHarness(() => ({}));
  try {
    const project = await h.project('Interrupt');
    await writeFile(h.configFile, JSON.stringify({ projects: { [project.path]: { hasTrustDialogAccepted: true } } }));
    const provider = createClaudeProvider({ ...h.context, platform, env: { ...h.context.env, FAKE_CLAUDE_MODE: 'interrupt-old-marker' } }, { pollMs: 50, interruptWaitMs: 4500 });
    const session = await provider.createSession(project, { title: 'Test' });
    await ready(provider, project, session.localId);
    assert.equal((await provider.interruptTurn!(project, session.localId, target)).status, 'interrupted');
    assert.equal((await provider.listSessions(project))[0]!.state, 'running');
    assert.equal(await provider.sendDirect!(project, session.localId, 'after stop'), true);
    assert.match(await readFile(h.fakeLog + '.input', 'utf8'), /\x1b[\s\S]*after stop/);
  } finally { await h.cleanup(); }
});

test('expect refuses a dialog appearing after cached availability, sends no Escape, and reports dialog on next poll', { skip }, async () => {
  const h = await createHarness(() => ({}));
  try {
    const project = await h.project('Dialog');
    await writeFile(h.configFile, JSON.stringify({ projects: { [project.path]: { hasTrustDialogAccepted: true } } }));
    const provider = h.withEnv({ FAKE_CLAUDE_MODE: 'interrupt-working' }, { interruptWaitMs: 4500 });
    const session = await provider.createSession(project, { title: 'Test' });
    await ready(provider, project, session.localId);
    const call = (await h.fakeCalls()).find((c) => c.argv.includes('--debug-file'))!;
    const debug = call.argv[call.argv.indexOf('--debug-file') + 1]!;
    await writeFile(debug + '.fixture-mode', 'dialog');
    await until(async () => JSON.parse(await readFile(debug + STATE_SUFFIX, 'utf8')).state === 'dialog', 'dialog drawn in host');
    const result = await provider.interruptTurn!(project, session.localId, target);
    assert.equal(result.status, 'unavailable');
    assert.equal((await readFile(h.fakeLog + '.input', 'utf8').catch(() => '')).includes('\x1b'), false);
    await provider.listSessions(project);
    assert.match(provider.interruptAvailability!(project, session.localId).reason!, /диалоге/);
  } finally { await h.cleanup(); }
});

test('expect missing fresh marker times out; old marker and an accepted Esc are insufficient', { skip }, async () => {
  const h = await createHarness(() => ({}));
  try {
    const project = await h.project('Timeout');
    await writeFile(h.configFile, JSON.stringify({ projects: { [project.path]: { hasTrustDialogAccepted: true } } }));
    const provider = h.withEnv({ FAKE_CLAUDE_MODE: 'interrupt-no-confirm' }, { interruptWaitMs: 2500 });
    const session = await provider.createSession(project, { title: 'Test' });
    await ready(provider, project, session.localId);
    await assert.rejects(provider.interruptTurn!(project, session.localId, target), { code: 'interrupt-timeout', status: 504 });
    assert.equal((await provider.listSessions(project))[0]!.state, 'running');
  } finally { await h.cleanup(); }
});

test('expect confirms an already completed observed epoch without Escape or process restart', { skip }, async () => {
  const h = await createHarness(() => ({}));
  try {
    const project = await h.project('AlreadyIdle');
    await writeFile(h.configFile, JSON.stringify({ projects: { [project.path]: { hasTrustDialogAccepted: true } } }));
    const provider = h.withEnv({ FAKE_CLAUDE_MODE: 'interrupt-working' }, { interruptWaitMs: 4500 });
    const session = await provider.createSession(project, { title: 'Test' });
    await ready(provider, project, session.localId);
    const call = (await h.fakeCalls()).find((c) => c.argv.includes('--debug-file'))!;
    const debug = call.argv[call.argv.indexOf('--debug-file') + 1]!;
    await writeFile(debug + '.fixture-mode', 'idle');
    await until(async () => JSON.parse(await readFile(debug + STATE_SUFFIX, 'utf8')).state === 'idle', 'completed epoch');
    await provider.listSessions(project);
    assert.equal((await provider.interruptTurn!(project, session.localId, target)).status, 'already-idle');
    assert.equal((await readFile(h.fakeLog + '.input', 'utf8').catch(() => '')).includes('\x1b'), false);
    assert.equal((await provider.listSessions(project))[0]!.state, 'running');
  } finally { await h.cleanup(); }
});
