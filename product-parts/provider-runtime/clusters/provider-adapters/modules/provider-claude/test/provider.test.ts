// The Claude provider end to end on a fake `claude` (test/fixtures/fake-claude.mjs) under the real
// expect scripts, in a temporary HOME and WFK_DATA_DIR (test/harness.ts). The real claude,
// ~/.claude.json and the real Remote Control are never touched. Needs `expect`; skipped without it.
// Trust, external imports and dialogs are covered in trust.test.ts.
import assert from 'node:assert/strict';
import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { after, before, test } from 'node:test';
import type { ProcessSupervisor } from '#process-supervisor';
import { providerSessionsFile } from '#provider-registry';
import type { Project, Provider, ProviderContext, ProviderError } from '#provider-registry';
import { ENVIRONMENT_START, ENVIRONMENT_STOP } from '../src/index.ts';
import type { ClaudeProviderOptions } from '../src/index.ts';
import { code, createHarness, fixtures, hasExpect, skip } from './harness.ts';
import type { FakeCall, Harness } from './harness.ts';

let h: Harness;
let project: Project;
let supervisor: ProcessSupervisor;
let context: ProviderContext;
let provider: Provider;

function withEnv(extra: Record<string, string>, options: ClaudeProviderOptions = {}): Provider {
  return h.withEnv(extra, options);
}

const fakeCalls = (): Promise<FakeCall[]> => h.fakeCalls();

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

before(async () => {
  if (!hasExpect) return;
  h = await createHarness(() => ({ numStartups: 3, projects: { '/elsewhere': { hasTrustDialogAccepted: true } } }));
  ({ supervisor, context, provider } = h);
  project = await h.project('Alpha');
});

after(async () => {
  if (hasExpect) await h.cleanup();
});

test('status reads files only; refresh reads the version; capabilities are available', { skip }, async () => {
  const before = await provider.status();
  assert.equal(before.installed, true);
  assert.equal(before.version, null);
  assert.equal(before.checkedAt, null);
  const refreshed = await provider.refresh!();
  assert.equal(refreshed.version, '2.1.318');
  assert.equal(refreshed.state, 'ready');
  assert.equal(refreshed.details?.['account'], 'нет входа');
  const caps = await provider.capabilities();
  assert.deepEqual(Object.entries(caps).filter(([, c]) => !c.available), []);
  const hooks = await provider.hooks(project);
  assert.equal(hooks.complete, true);
  assert.equal(hooks.kitHook?.kit, true);
});

test('without trust: sessions and the environment are refused with a hint', { skip }, async () => {
  assert.deepEqual(await provider.trust(project), { trusted: false });
  await assert.rejects(provider.createSession(project, { title: 'x' }), code('not-trusted'));
  const actions = await provider.actions(project);
  assert.equal(actions.find((a) => a.id === ENVIRONMENT_START)?.enabled, false);
  assert.match(actions.find((a) => a.id === ENVIRONMENT_START)?.reason ?? '', /не доверена/);
  assert.deepEqual(await provider.actions(null), []);
});

test('trust: the grant writes the key itself (no claude, no dialog) after the preview token', { skip }, async () => {
  const preview = await provider.previewTrust(project);
  assert.equal(preview.trusted, false);
  assert.deepEqual(preview.choices, [], 'no external imports: nothing to choose');
  assert.equal(preview.writes[0]?.key, `projects["${project.path}"].hasTrustDialogAccepted`);
  assert.ok(preview.autorun.some((p) => p.kind === 'hook' && /хук Kit/.test(p.detail)));
  const calls = (await fakeCalls()).length;
  const granted = await provider.grantTrust(project, preview.token, {});
  assert.equal(granted.trusted, true);
  assert.equal((await fakeCalls()).length, calls, 'grantTrust starts no claude');
  assert.equal((await h.readConfig()).projects[project.path]?.['hasTrustDialogAccepted'], true);
  assert.deepEqual(await provider.listSessions(project), []);
});

let localId = '';
let remoteId = '';

test('createSession: SESSION_URL, the claude pid is tracked, the record survives a restart', { skip }, async () => {
  const session = await provider.createSession(project, { title: 'Alpha · 2026-11-05 10:00' });
  assert.equal(session.state, 'running');
  assert.equal(session.origin, 'panel');
  assert.match(session.remoteId ?? '', /^session_FAKE[0-9a-f]+$/);
  remoteId = session.remoteId!;
  assert.equal(session.links.desktop, `claude://claude.ai/code/${remoteId}`);
  assert.equal(session.links.mobile, `https://claude.ai/code/${remoteId}`);
  const started = (await fakeCalls()).find((c) => c.argv.includes('--remote-control'))!;
  assert.deepEqual(started.vars, {});
  assert.equal(started.argv[started.argv.indexOf('--remote-control') + 1], 'Alpha · 2026-11-05 10:00');
  const records = JSON.parse(await readFile(providerSessionsFile(context.dirs, 'claude'), 'utf8'));
  assert.equal(records.sessions[0].remoteId, remoteId);
  const proc = await supervisor.get(records.sessions[0].processId);
  assert.deepEqual(proc?.owner, { provider: 'claude', project: project.id, kind: 'session', ref: proc?.owner.ref });
  assert.deepEqual(proc?.children.map((c) => c.pid), [started.pid]);
  // The hook journal names the local id; the transcript's bridge-session merges both entries.
  const listed = await provider.listSessions(project);
  assert.equal(listed.length, 1);
  assert.equal(listed[0]!.remoteId, remoteId);
  assert.equal(listed[0]!.title, 'Alpha · 2026-11-05 10:00');
  assert.equal(listed[0]!.model, 'fake-model');
  localId = listed[0]!.localId;
  assert.match(localId, /^[0-9a-f-]{36}$/);
  const restarted = withEnv({});
  assert.equal((await restarted.listSessions(project))[0]?.state, 'running');
});

test('hook sessions: remoteId from bridge-session in transcript_path, otherwise a note; stop refuses foreign ones', { skip }, async () => {
  const journal = path.join(project.path, '.workflow-kit', 'local', 'sessions.jsonl');
  const line = (id: string, transcript: string | null): string =>
    `${JSON.stringify({ time: '2026-01-01T00:00:00.000Z', client: 'claude', session_id: id, transcript_path: transcript, cwd: project.path, source: 'startup', model: null, permission_mode: null, service: null })}\n`;
  await appendFile(journal, line('desktop-1', path.join(fixtures, 'transcript-bridge.jsonl')));
  await appendFile(journal, line('desktop-2', path.join(fixtures, 'transcript-plain.jsonl')));
  const listed = await provider.listSessions(project);
  const one = listed.find((s) => s.localId === 'desktop-1')!;
  assert.equal(one.origin, 'hook');
  assert.equal(one.remoteId, 'session_01AbCdEf234');
  assert.equal(one.links.desktop, 'claude://claude.ai/code/session_01AbCdEf234');
  const two = listed.find((s) => s.localId === 'desktop-2')!;
  assert.deepEqual(two.links, {});
  assert.equal(two.note, 'без Remote Control — ссылки нет');
  await assert.rejects(provider.stopSession!(project, 'desktop-1'), code('not-own-session'));
});

test('stopSession ends only its own processes; resumeSession brings back the same session id', { skip }, async () => {
  const pid = (await fakeCalls()).find((c) => c.argv.includes('--remote-control'))!.pid;
  await provider.stopSession!(project, localId);
  assert.equal(alive(pid), false);
  assert.equal((await provider.listSessions(project)).find((s) => s.localId === localId)?.state, 'stopped');
  const resumed = await provider.resumeSession!(project, localId);
  assert.equal(resumed.remoteId, remoteId);
  assert.equal(resumed.state, 'running');
  assert.equal(resumed.note, undefined);
  const call = (await fakeCalls()).filter((c) => c.argv.includes('--resume')).at(-1)!;
  assert.equal(call.argv[call.argv.indexOf('--resume') + 1], localId);
  assert.equal((await provider.resumeSession!(project, remoteId)).state, 'running');
  await provider.stopSession!(project, remoteId);
  assert.equal(alive(call.pid), false);
  assert.equal((await supervisor.list({ provider: 'claude', kind: 'session' })).length, 0);
});

test('the debug file is the fallback source of the session id; a failing claude is reported', { skip }, async () => {
  const debugOnly = withEnv({ FAKE_CLAUDE_MODE: 'debug-only' }, { sessionTimeoutMs: 1500 });
  const session = await debugOnly.createSession(project, { title: 'debug' });
  assert.match(session.remoteId ?? '', /^session_FAKE/);
  await debugOnly.stopSession!(project, session.remoteId!);
  const failing = withEnv({ FAKE_CLAUDE_MODE: 'exit' });
  await assert.rejects(failing.createSession(project, { title: 'fail' }), (error: unknown) => {
    const e = error as ProviderError;
    return e.code === 'session-exited' && /fake failure/.test(e.message) && typeof e.hint === 'string';
  });
  assert.equal((await supervisor.list({ provider: 'claude', kind: 'session' })).length, 0);
});

test('createSession with a first message types it into the session after the link', { skip }, async () => {
  const session = await provider.createSession(project, { title: 'First', firstMessage: 'Проект создан.\nПрочитай AGENTS.md' });
  const started = (await fakeCalls()).filter((c) => c.argv.includes('--remote-control')).at(-1)!;
  assert.deepEqual(started.vars, {}, 'the message is not in claude\'s environment');
  let input = '';
  for (let i = 0; i < 100 && !input.includes('\r'); i += 1) {
    input = await readFile(`${h.fakeLog}.input`, 'utf8').catch(() => '');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(input, 'Проект создан. Прочитай AGENTS.md\r');
  await provider.stopSession!(project, session.remoteId!);
});

test('renameSession types /rename into a panel session; a session the panel does not run is left to the hook', { skip }, async () => {
  const session = await provider.createSession(project, { title: 'Rename me' });
  const before = await readFile(`${h.fakeLog}.input`, 'utf8').catch(() => '');
  assert.deepEqual(await provider.renameSession!(project, session.remoteId!, 'Склад:  ревизия'), { synced: true });
  const input = (await readFile(`${h.fakeLog}.input`, 'utf8')).slice(before.length);
  assert.equal(input, '/rename Склад: ревизия\r');
  const records = JSON.parse(await readFile(providerSessionsFile(context.dirs, 'claude'), 'utf8'));
  assert.equal(records.sessions.find((r: { remoteId: string }) => r.remoteId === session.remoteId).title, 'Склад: ревизия');
  const beforeWake = await readFile(`${h.fakeLog}.input`, 'utf8');
  assert.equal(await provider.wakeSession!(project, session.remoteId!), true);
  let typed = '';
  for (let i = 0; i < 60 && !typed.includes('\r'); i += 1) {
    typed = (await readFile(`${h.fakeLog}.input`, 'utf8')).slice(beforeWake.length);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(typed, 'Workflow Kit: новое сообщение из панели.\r');
  await provider.stopSession!(project, session.remoteId!);
  assert.equal(await provider.wakeSession!(project, session.remoteId!), false, 'a stopped session cannot be woken');
  const stopped = await provider.renameSession!(project, session.remoteId!, 'Другое');
  assert.equal(stopped.synced, false);
  assert.match(stopped.note ?? '', /следующим сообщением/);
});

test('an interrupted session comes back at resumeInterrupted and on wake; one stopped on purpose does not; resumes are not doubled', { skip }, async () => {
  const session = await provider.createSession(project, { title: 'Interrupted' });
  const claudePid = async (): Promise<number> =>
    (await fakeCalls()).filter((c) => c.argv.includes('--remote-control') && c.argv.includes('Interrupted')).at(-1)!.pid;
  const waitDead = async (pid: number): Promise<void> => {
    for (let i = 0; i < 50 && alive(pid); i += 1) await new Promise((resolve) => setTimeout(resolve, 100));
  };
  const sid = (await provider.listSessions(project)).find((s) => s.remoteId === session.remoteId)!.localId;
  // A reboot: the process ends without stopSession.
  let pid = await claudePid();
  process.kill(pid, 'SIGKILL');
  await waitDead(pid);
  assert.equal((await provider.listSessions(project)).find((s) => s.localId === sid)?.state, 'stopped');
  const [first, second] = await Promise.all([provider.resumeSession!(project, sid), provider.resumeSession!(project, sid)]);
  assert.equal(first, second, 'a second resume waits for the first one');
  assert.equal((await fakeCalls()).filter((c) => c.argv.includes('--resume') && c.argv.includes('Interrupted')).length, 1);
  pid = await claudePid();
  process.kill(pid, 'SIGKILL');
  await waitDead(pid);
  assert.deepEqual(await provider.resumeInterrupted!(project), [sid]);
  assert.deepEqual(await provider.resumeInterrupted!(project), [], 'a running session is left alone');
  pid = await claudePid();
  process.kill(pid, 'SIGKILL');
  await waitDead(pid);
  assert.equal(await provider.wakeSession!(project, sid), true, 'wake brings an interrupted session back');
  assert.equal((await provider.listSessions(project)).find((s) => s.localId === sid)?.state, 'running');
  await provider.stopSession!(project, sid);
  assert.deepEqual(await provider.resumeInterrupted!(project), [], 'a session stopped on purpose stays stopped');
  assert.equal(await provider.wakeSession!(project, sid), false);
});

test('archive stops sessions and keeps them down; a restore brings them back at once', { skip }, async () => {
  const one = await provider.createSession(project, { title: 'ArchivedOne' });
  const two = await provider.createSession(project, { title: 'ArchivedTwo' });
  const local = async (remoteId: string): Promise<string> => (await provider.listSessions(project)).find((s) => s.remoteId === remoteId)!.localId;
  const state = async (sid: string): Promise<string | undefined> => (await provider.listSessions(project)).find((s) => s.localId === sid)?.state;
  const [a, b] = [await local(one.remoteId!), await local(two.remoteId!)];
  // One session alone, then the whole project.
  assert.deepEqual(await provider.archiveSessions!(project, a), [a]);
  assert.equal(await state(a), 'stopped');
  await assert.rejects(provider.resumeSession!(project, a), (error: ProviderError) => error.code === 'archived' && error.status === 409);
  assert.equal(await provider.wakeSession!(project, a), false);
  const stopped = await provider.archiveSessions!(project, null);
  assert.ok(stopped.includes(b) && !stopped.includes(a), 'the project archive stops the running ones');
  assert.equal(await state(b), 'stopped');
  assert.deepEqual(await provider.removeBlockers!(project), []);
  assert.deepEqual(await provider.resumeInterrupted!(project), [], 'archived sessions are not interrupted ones');
  // Restoring a session while its project is archived waits for the project.
  const archivedProject = { ...project, archivedAt: '2026-11-07T00:00:00.000Z' };
  assert.deepEqual(await provider.restoreSessions!(archivedProject, a), []);
  assert.equal(await state(a), 'stopped');
  const back = await provider.restoreSessions!(project, null);
  assert.ok(back.includes(a) && back.includes(b));
  assert.equal(await state(a), 'running');
  assert.equal(await state(b), 'running');
  // A session restored alone comes back at once.
  await provider.archiveSessions!(project, b);
  assert.deepEqual(await provider.restoreSessions!(project, b), [b]);
  assert.equal(await state(b), 'running');
  await provider.stopSession!(project, a);
  await provider.stopSession!(project, b);
});

test('folder environment: start and stop as project actions, state shown, removal blocked while it runs', { skip }, async () => {
  const startAction = (await provider.actions(project)).find((a) => a.id === ENVIRONMENT_START)!;
  assert.equal(startAction.enabled, true);
  assert.ok(startAction.confirm);
  const state = await provider.runAction(ENVIRONMENT_START, project);
  assert.ok('actions' in state);
  const actions = (await provider.actions(project)) as Array<{ id: string; enabled: boolean; reason?: string }>;
  assert.equal(actions.find((a) => a.id === ENVIRONMENT_START)?.enabled, false);
  assert.match(actions.find((a) => a.id === ENVIRONMENT_START)?.reason ?? '', /работает с/);
  assert.equal(actions.find((a) => a.id === ENVIRONMENT_STOP)?.enabled, true);
  assert.deepEqual(await provider.removeBlockers!(project), ['работает окружение папки']);
  const call = (await fakeCalls()).find((c) => c.argv[0] === 'remote-control')!;
  assert.deepEqual(call.argv.slice(0, 4), ['remote-control', '--name', 'Alpha', '--spawn=same-dir']);
  const records = JSON.parse(await readFile(providerSessionsFile(context.dirs, 'claude'), 'utf8'));
  assert.match(records.environments[0].environmentId, /^env_FAKE/);
  await provider.runAction(ENVIRONMENT_STOP, project);
  assert.equal(alive(call.pid), false);
  const after = await provider.actions(project);
  assert.equal(after.find((a) => a.id === ENVIRONMENT_STOP)?.reason, 'окружение папки остановлено');
  assert.deepEqual(await provider.removeBlockers!(project), []);
  await assert.rejects(provider.runAction('nope', project), code('unknown-action'));
});
