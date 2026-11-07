import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { installStructure, recordSessionStart } from '#kit-structure';
import { providerSessionsFile } from '#provider-registry';
import type { Project, Provider } from '#provider-registry';
import { CONNECTING_REASON, KIT_HOOK_COMMAND, STALE_LOGIN_REASON, KIT_HOOK_COMMANDS, createCodexProvider } from '../src/index.ts';
import type { FakeDaemon } from './fake-daemon.ts';
import { fakeMachine } from './helpers.ts';
import type { FakeMachine } from './helpers.ts';

let machine: FakeMachine;
let daemon: FakeDaemon;
let provider: Provider;
let project: Project;
const FOREIGN = 'echo foreign-hook';
const hashOf = (command: string): string => 'sha256:' + createHash('sha256').update(command).digest('hex');
const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;

before(async () => {
  machine = await fakeMachine();
  daemon = await machine.daemon();
  project = await machine.project('Alpha');
  // A foreign hook first, then the Kit structure appends its own group at the end.
  await mkdir(path.join(project.path, '.codex'), { recursive: true });
  await writeFile(path.join(project.path, '.codex', 'hooks.json'), JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: FOREIGN }] }] } }, null, 2));
  await installStructure(project.path);
  provider = createCodexProvider(machine.context());
  await provider.refresh!();
});

after(async () => {
  await machine.close();
});

test('status: CLI version and path, daemon connected over the socket; daemon start is disabled while it works', async () => {
  const status = await provider.status();
  assert.equal(provider.title, 'ChatGPT (Codex)');
  assert.equal(status.state, 'ready');
  assert.equal(status.label, 'демон подключён');
  assert.equal(status.version, '9.9.9');
  assert.equal(status.path, path.join(machine.bin, 'codex'));
  assert.deepEqual((status.details as { daemon: unknown }).daemon, { running: true, pid: process.pid, remoteControl: 'connected', serverName: 'fake-mac' });
  const initializes = daemon.calls.filter((c) => c.method === 'initialize').length;
  await provider.status();
  assert.equal(daemon.calls.filter((c) => c.method === 'initialize').length, initializes, 'the probe is cached');
  assert.equal((await provider.capabilities())['createSession']?.available, true);
  const [action] = await provider.actions(null);
  assert.deepEqual([action?.id, action?.enabled, action?.reason], ['daemon-start', false, 'демон работает и подключён к ChatGPT']);
  assert.deepEqual(await provider.actions(project), []);
});

test('trust: preview lists the key and autorun points; the write goes through codex app-server after a backup and is verified', async () => {
  assert.deepEqual(await provider.trust(project), { trusted: false });
  const before = await provider.hooks(project);
  assert.equal(before.complete, false);
  assert.match(before.note ?? '', /не доверена/);
  await assert.rejects(provider.grantTrust(project, 'forged'), code('invalid-token'));

  const stale = await provider.previewTrust(project);
  const hooksFile = path.join(project.path, '.codex', 'hooks.json');
  const original = await readFile(hooksFile, 'utf8');
  await writeFile(hooksFile, `${original}\n`);
  await assert.rejects(provider.grantTrust(project, stale.token), code('preview-stale'));

  const preview = await provider.previewTrust(project);
  assert.equal(preview.trusted, false);
  assert.deepEqual(preview.writes.map((w) => [w.key, w.value]), [[`projects."${project.path}".trust_level`, 'trusted']]);
  assert.deepEqual(preview.autorun.map((a) => [a.kind, a.detail]), [
    ['hook', `SessionStart: ${FOREIGN}`],
    ['kit-hook', `SessionStart: ${KIT_HOOK_COMMAND}`],
    ['kit-hook', `Stop: ${KIT_HOOK_COMMANDS[1]}`],
    ['kit-hook', `UserPromptSubmit: ${KIT_HOOK_COMMANDS[2]}`],
  ]);
  const granted = await provider.grantTrust(project, preview.token);
  assert.equal(granted.trusted, true);
  assert.ok(granted.backup, 'a copy of config.toml is taken before the write');
  assert.equal(await readFile(granted.backup!, 'utf8'), 'model = "gpt-test"\n');
  assert.match(await readFile(path.join(machine.codexHome, 'config.toml'), 'utf8'), new RegExp(`\\[projects\\."${project.path}"\\]\\ntrust_level = "trusted"`));
  const writes = (await machine.calls()).filter((c) => c.method === 'config/value/write');
  assert.deepEqual(writes.map((w) => w.params), [{ keyPath: `projects."${project.path}".trust_level`, value: 'trusted', mergeStrategy: 'upsert' }]);
  assert.equal((await provider.trust(project)).trusted, true);
  const again = await provider.previewTrust(project);
  assert.equal(again.trusted, true);
  assert.deepEqual(again.writes, []);
});

test('approveHooks approves only the Kit hook with the exact command and hash; foreign hooks stay pending', async () => {
  const state = await provider.hooks(project);
  assert.equal(state.kitHook?.command, KIT_HOOK_COMMAND);
  assert.equal(state.kitHook?.hash, hashOf(KIT_HOOK_COMMAND));
  assert.equal(state.kitHook?.status, 'pending');
  assert.equal(state.kitHook?.key, `${project.path}/.codex/hooks.json:session_start:1:0`);
  assert.deepEqual(state.hooks.map((h) => [h.command, h.hash, h.status, h.kit]), [[FOREIGN, hashOf(FOREIGN), 'pending', false]]);
  assert.equal(state.complete, false);
  assert.match(state.note ?? '', /список сессий неполон/);

  await assert.rejects(provider.approveHooks!(project, { command: FOREIGN, hash: hashOf(FOREIGN) }), code('not-kit-hook'));
  await assert.rejects(provider.approveHooks!(project, { command: KIT_HOOK_COMMAND, hash: 'sha256:other' }), code('hash-changed'));
  const approved = await provider.approveHooks!(project, { command: KIT_HOOK_COMMAND, hash: hashOf(KIT_HOOK_COMMAND) });
  assert.equal(approved.kitHook?.status, 'approved');
  assert.equal(approved.complete, true);
  assert.equal(approved.hooks[0]?.status, 'pending', 'the foreign hook is not approved');
  const config = await readFile(path.join(machine.codexHome, 'config.toml'), 'utf8');
  assert.ok(config.includes(`[hooks.state."${project.path}/.codex/hooks.json:session_start:1:0"]\ntrusted_hash = "${hashOf(KIT_HOOK_COMMAND)}"`));
  assert.ok(!config.includes(':session_start:0:0'), 'no approval key for the foreign hook');
  const writes = (await machine.calls()).filter((c) => c.method === 'config/value/write').length;
  await provider.approveHooks!(project, { command: KIT_HOOK_COMMAND, hash: hashOf(KIT_HOOK_COMMAND) });
  assert.equal((await machine.calls()).filter((c) => c.method === 'config/value/write').length, writes, 'nothing is written twice');
  assert.equal((await provider.hooks(project)).complete, true);
});

test('createSession: thread/start, thread/name/set, a service turn without policy overrides, then thread/unsubscribe; recorded in sessions/codex.json', async () => {
  const session = await provider.createSession(project, { title: 'Alpha · 2026-11-05 10:00' });
  const threadId = '019a0000-0000-7000-8000-000000000001';
  assert.equal(session.localId, threadId);
  assert.equal(session.origin, 'panel');
  assert.deepEqual(session.links, { desktop: `codex://threads/${threadId}`, mobile: `codex://threads/${threadId}` });
  const calls = daemon.calls.slice(-7);
  assert.deepEqual(calls.map((c) => c.method), ['initialize', 'initialized', 'thread/start', 'thread/name/set', 'turn/start', 'thread/unsubscribe', 'thread/loaded/list']);
  assert.deepEqual(calls[2]?.params, { cwd: project.path });
  assert.deepEqual(calls[3]?.params, { threadId, name: 'Alpha · 2026-11-05 10:00' });
  const turn = calls[4]?.params as Record<string, unknown>;
  assert.deepEqual(Object.keys(turn).sort(), ['input', 'threadId'], 'no sandboxPolicy/approvalPolicy overrides');
  assert.match(((turn['input'] as Array<{ text: string }>)[0])!.text, /Workflow Kit.*«Alpha»/);
  assert.deepEqual(calls[5]?.params, { threadId });
  assert.deepEqual([...daemon.loaded], [], 'the daemon no longer holds the thread');
  const saved = JSON.parse(await readFile(providerSessionsFile(machine.dirs, 'codex'), 'utf8')) as { sessions: Array<{ threadId: string; projectId: string; title: string }> };
  assert.deepEqual(saved.sessions.map((s) => [s.threadId, s.projectId, s.title]), [[threadId, project.id, 'Alpha · 2026-11-05 10:00']]);
});

test('listSessions: hook journal plus panel records, names from session_index.jsonl, codex:// links', async () => {
  const threadId = '019a0000-0000-7000-8000-000000000001';
  const hook = (id: string): Promise<unknown> =>
    recordSessionStart({ client: 'codex', stdin: JSON.stringify({ session_id: id, cwd: project.path, source: 'startup', model: 'gpt-5' }), env: {}, cwd: project.path });
  await hook(threadId);
  await hook('019b-from-ipad');
  await recordSessionStart({ client: 'claude', stdin: JSON.stringify({ session_id: 'claude-one', cwd: project.path }), env: {}, cwd: project.path });
  await writeFile(path.join(machine.codexHome, 'session_index.jsonl'), `${JSON.stringify({ id: '019b-from-ipad', thread_name: 'С iPad' })}\n${JSON.stringify({ id: threadId, thread_name: 'Переименована' })}\n`);
  const sessions = await provider.listSessions(project);
  assert.deepEqual(sessions.map((s) => [s.localId, s.origin, s.title]).sort(), [
    [threadId, 'panel', 'Переименована'],
    ['019b-from-ipad', 'hook', 'С iPad'],
  ]);
  const ipad = sessions.find((s) => s.origin === 'hook')!;
  assert.equal(ipad.links.mobile, 'codex://threads/019b-from-ipad');
  assert.equal(sessions.find((s) => s.origin === 'panel')?.model, 'gpt-5');
  const other = await machine.project('Beta');
  assert.deepEqual(await provider.listSessions(other), [], 'records of other projects are not listed');
});

test('a daemon that is connecting asks to wait; a silent probe keeps the known status; an off link offers «Подключить к ChatGPT»', async () => {
  const options: { remoteControl: string; silentStatus?: boolean } = { remoteControl: 'connecting' };
  const local = await machine.daemon(options);
  try {
    const provider2 = createCodexProvider(machine.context());
    await provider2.refresh!();
    assert.equal((await provider2.status()).label, 'подключается к ChatGPT');
    assert.equal((await provider2.capabilities())['createSession']?.reason, CONNECTING_REASON);
    assert.deepEqual((await provider2.actions(null)).map((a) => [a.enabled, a.reason]), [[false, CONNECTING_REASON]]);
    options.remoteControl = 'connected';
    await provider2.refresh!();
    options.silentStatus = true;
    const silent = await provider2.refresh!();
    assert.equal(silent.label, 'демон подключён', 'no status in time keeps the last known one');
    assert.equal((await provider2.capabilities())['createSession']?.available, true);
    options.silentStatus = false;
    options.remoteControl = 'disabled';
    await provider2.refresh!();
    const [action] = await provider2.actions(null);
    assert.deepEqual([action?.title, action?.enabled], ['Подключить к ChatGPT', true]);
    assert.match((await provider2.capabilities())['createSession']?.reason ?? '', /Подключить к ChatGPT/);
  } finally {
    await local.close();
    daemon = await machine.daemon();
  }
});

test('a daemon that holds a login refreshed after its start is restarted, not sent to codex login; MCP 401 lines are ignored', async () => {
  const stale = await machine.daemon({ remoteControl: 'disabled' });
  const daemonDir = path.join(machine.codexHome, 'app-server-daemon');
  try {
    const startSeconds = Math.floor(Date.now() / 1000) - 3600;
    await writeFile(path.join(daemonDir, 'daemon.pid'), JSON.stringify({ pid: process.pid, processStartTime: 'earlier', processIdentity: { startSeconds } }));
    await writeFile(path.join(daemonDir, 'daemon.stderr.log'), 'ERROR rmcp::transport::worker: HTTP 401 Unauthorized token\n');
    await writeFile(path.join(machine.codexHome, 'auth.json'), '{}');
    const local = createCodexProvider(machine.context());
    await local.refresh!();
    assert.notEqual((await local.status()).label, 'ошибка входа', 'an MCP server 401 is not the ChatGPT login');
    await writeFile(path.join(daemonDir, 'daemon.stderr.log'), 'ERROR codex_models_manager: unexpected status 401 Unauthorized: Encountered invalidated oauth token\n');
    await local.refresh!();
    const status = await local.status();
    assert.deepEqual([status.state, status.label, status.note], ['error', 'демон держит устаревший вход', STALE_LOGIN_REASON]);
    assert.equal((await local.capabilities())['createSession']?.reason, STALE_LOGIN_REASON);
    const [action] = await local.actions(null);
    assert.deepEqual([action?.title, action?.enabled], ['Перезапустить демон', true]);
    await local.runAction('daemon-start', null);
    const argvs = (await machine.calls()).filter((c) => c.argv).map((c) => c.argv!.join(' '));
    assert.deepEqual(argvs.slice(-2), ['remote-control stop', 'remote-control start --json']);
  } finally {
    await stale.close();
    daemon = await machine.daemon();
  }
});

test('an expired login is shown with the hint «codex login»; session creation is refused', async () => {
  const errored = await machine.daemon({ remoteControl: 'errored' });
  try {
    await writeFile(path.join(machine.codexHome, 'app-server-daemon', 'daemon.stderr.log'), 'ERROR remote control: 401 Unauthorized: token expired\n');
    const local = createCodexProvider(machine.context());
    await local.refresh!();
    const status = await local.status();
    assert.equal(status.state, 'error');
    assert.equal(status.label, 'ошибка входа');
    assert.match(status.note ?? '', /401 Unauthorized: token expired.*codex login/);
    assert.match((await local.capabilities())['createSession']?.reason ?? '', /codex login/);
    await assert.rejects(local.createSession(project, { title: 'x' }), (error: unknown) => (error as { code: string; hint: string }).code === 'codex-login' && /codex login/.test((error as { hint: string }).hint));
  } finally {
    await errored.close();
    daemon = await machine.daemon();
  }
});

test('daemon start is a special action: codex remote-control start --json; an errored connection asks for codex login', async () => {
  const stopped = { isAlive: () => false };
  const local = createCodexProvider(machine.context(), stopped);
  await local.refresh!();
  const status = await local.status();
  assert.deepEqual([status.state, status.label], ['unavailable', 'демон не запущен']);
  assert.match((await local.capabilities())['createSession']?.reason ?? '', /Запустить демон/);
  await assert.rejects(local.createSession(project, { title: 'x' }), code('daemon-not-running'));
  const [action] = await local.actions(null);
  assert.equal(action?.enabled, true);
  assert.ok(action?.confirm);
  await local.runAction('daemon-start', null);
  assert.deepEqual((await machine.calls()).filter((c) => c.argv).at(-1)?.argv, ['remote-control', 'start', '--json']);

  const failing = createCodexProvider(machine.context({ env: { PATH: `${machine.bin}:/usr/bin:/bin`, FAKE_RC_OUTPUT: 'Error: connection is errored' } }), stopped);
  await failing.refresh!();
  await assert.rejects(failing.runAction('daemon-start', null), (error: unknown) => (error as { code: string }).code === 'codex-login');
  await assert.rejects(local.runAction('nope', null), code('unknown-action'));
});

test('a write Codex did not record fails with the backup path', async () => {
  const other = await machine.project('Gamma');
  const local = createCodexProvider(machine.context({ env: { PATH: `${machine.bin}:/usr/bin:/bin`, FAKE_WRITE_IGNORED: '1' } }));
  await local.refresh!();
  const preview = await local.previewTrust(other);
  await assert.rejects(local.grantTrust(other, preview.token), (error: unknown) => {
    const e = error as { code: string; details?: { backup?: string } };
    return e.code === 'not-recorded' && typeof e.details?.backup === 'string';
  });
});

test('without the CLI and on Windows the capabilities are unavailable with a reason', async () => {
  const missing = createCodexProvider(machine.context({ env: { PATH: '/nonexistent' } }));
  const status = await missing.refresh!();
  assert.equal(status.state, 'not-installed');
  assert.match((await missing.capabilities())['trust']?.reason ?? '', /codex не найден/);
  await assert.rejects(missing.previewTrust(project), code('not-installed'));

  const windows = createCodexProvider(machine.context({ platform: 'win32' }));
  await windows.refresh!();
  const caps = await windows.capabilities();
  for (const name of ['trust', 'hooks', 'sessions', 'createSession', 'daemon']) {
    assert.equal(caps[name]?.available, false, name);
    assert.match(caps[name]?.reason ?? '', /Windows.*Q2/);
  }
  assert.equal((await windows.status()).state, 'unavailable');
  await assert.rejects(windows.previewTrust(project), code('unsupported-os'));
  await assert.rejects(windows.createSession(project, { title: 'x' }), code('unsupported-os'));
  assert.equal((await windows.actions(null))[0]?.enabled, false);
  assert.deepEqual((await windows.listSessions(project)).every((s) => Object.keys(s.links).length === 0), true);
});

test('forgetProjects drops the records of removed projects and keeps the others', async () => {
  const file = providerSessionsFile(machine.dirs, 'codex');
  const before = JSON.parse(await readFile(file, 'utf8')) as { sessions: Array<{ projectId: string }> };
  assert.ok(before.sessions.some((r) => r.projectId === project.id));
  const extra = { threadId: '01a1ffff-0000-7000-8000-000000000001', projectId: 'gone00000000', projectPath: project.path, title: 'old', createdAt: '2026-01-01T00:00:00.000Z' };
  await writeFile(file, JSON.stringify({ version: 1, sessions: [...before.sessions, extra] }));
  assert.ok((await provider.listSessions(project)).some((s) => s.localId === extra.threadId), 'a record of the same path is listed until forgotten');
  assert.equal(await provider.forgetProjects!(new Set([project.id])), 1);
  assert.equal(await provider.forgetProjects!(new Set([project.id])), 0);
  const after = JSON.parse(await readFile(file, 'utf8')) as { sessions: Array<{ projectId: string }> };
  assert.deepEqual(after.sessions.map((r) => r.projectId), before.sessions.map((r) => r.projectId));
  assert.ok(!(await provider.listSessions(project)).some((s) => s.localId === extra.threadId));
});
