// The Claude provider end to end on a fake `claude` (test/fixtures/fake-claude.mjs) under the real
// expect scripts, in a temporary HOME and WFK_DATA_DIR. The real claude, ~/.claude.json and the
// real Remote Control are never touched. Needs `expect` (macOS has it); skipped without it.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFile, chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createEventLog, ensureDataDirs, eventsFile, resolveDataDirs } from '#data-store';
import { createProcessSupervisor, processesFile, runCommand } from '#process-supervisor';
import type { ProcessSupervisor } from '#process-supervisor';
import { providerSessionsFile } from '#provider-registry';
import type { Project, Provider, ProviderContext, ProviderError } from '#provider-registry';
import { ENVIRONMENT_START, ENVIRONMENT_STOP, createClaudeProvider } from '../src/index.ts';
import type { ClaudeProviderOptions } from '../src/index.ts';

const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));
const hasExpect = process.platform !== 'win32' && (() => {
  try {
    execFileSync('/bin/sh', ['-c', 'command -v expect'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
const skip = hasExpect ? false : 'expect is not installed';

let tmp = '';
let home = '';
let fakeLog = '';
let project: Project;
let supervisor: ProcessSupervisor;
let context: ProviderContext;
let provider: Provider;
const fast: ClaudeProviderOptions = { trustPaceMs: 50, pollMs: 50, sessionTimeoutMs: 20_000, stopGraceMs: 2000 };

function withEnv(extra: Record<string, string>, options: ClaudeProviderOptions = {}): Provider {
  return createClaudeProvider({ ...context, env: { ...context.env, ...extra } }, { ...fast, ...options });
}

async function fakeCalls(): Promise<Array<{ argv: string[]; vars: Record<string, string>; pid: number }>> {
  const text = await readFile(fakeLog, 'utf8').catch(() => '');
  return text.split('\n').filter(Boolean).map((line) => JSON.parse(line) as { argv: string[]; vars: Record<string, string>; pid: number });
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const code = (expected: string) => (error: unknown): boolean => (error as ProviderError).code === expected;

before(async () => {
  if (!hasExpect) return;
  tmp = await realpath(await mkdtemp(path.join(os.tmpdir(), 'wfk-claude-')));
  home = path.join(tmp, 'home');
  const folder = path.join(home, 'WorkflowKitProjects', 'Alpha');
  await mkdir(path.join(folder, '.workflow-kit', 'local'), { recursive: true });
  await mkdir(path.join(folder, '.claude'), { recursive: true });
  await writeFile(
    path.join(folder, '.claude', 'settings.json'),
    JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: '"$HOME/.local/bin/wfk" hook session-start --client claude; exit 0' }] }] } }),
  );
  await writeFile(path.join(home, '.claude.json'), JSON.stringify({ numStartups: 3, projects: { '/elsewhere': { hasTrustDialogAccepted: true } } }));
  const bin = path.join(tmp, 'bin');
  await mkdir(bin, { recursive: true });
  const claude = path.join(bin, 'claude.mjs');
  await writeFile(claude, `#!${process.execPath}\n${await readFile(path.join(fixtures, 'fake-claude.mjs'), 'utf8')}`);
  await chmod(claude, 0o755);
  fakeLog = path.join(tmp, 'fake-claude.jsonl');
  const dirs = resolveDataDirs({ platform: process.platform, env: { WFK_DATA_DIR: path.join(tmp, 'data') }, homedir: home });
  await ensureDataDirs(dirs);
  supervisor = createProcessSupervisor({ file: processesFile(dirs.stateDir), graceMs: 2000, pollMs: 50 });
  context = {
    platform: process.platform,
    env: { PATH: process.env['PATH'], HOME: home, FAKE_CLAUDE_LOG: fakeLog, CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'cli' },
    homedir: home,
    dirs,
    config: { port: 0, projectsRoot: path.join(home, 'WorkflowKitProjects'), programs: { claude } },
    events: createEventLog({ file: eventsFile(dirs) }),
    supervisor,
    runCommand,
    now: () => new Date(),
    log: () => undefined,
  };
  project = { id: 'p-alpha', name: 'Alpha', path: folder, source: 'created', createdAt: new Date().toISOString() };
  provider = createClaudeProvider(context, fast);
});

after(async () => {
  if (!hasExpect) return;
  for (const record of await supervisor.list()) await supervisor.stop(record.id, { graceMs: 500 }).catch(() => undefined);
  await rm(tmp, { recursive: true, force: true });
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
  assert.equal((await provider.trust(project)).trusted, false);
  await assert.rejects(provider.createSession(project, { title: 'x' }), code('not-trusted'));
  const actions = await provider.actions(project);
  assert.equal(actions.find((a) => a.id === ENVIRONMENT_START)?.enabled, false);
  assert.match(actions.find((a) => a.id === ENVIRONMENT_START)?.reason ?? '', /не доверена/);
  assert.deepEqual(await provider.actions(null), []);
});

test('trust: preview with token and autorun points; grant passes the dialog with a backup and a check', { skip }, async () => {
  const preview = await provider.previewTrust(project);
  assert.equal(preview.trusted, false);
  assert.equal(preview.writes[0]?.key, `projects["${project.path}"].hasTrustDialogAccepted`);
  assert.ok(preview.autorun.some((p) => p.kind === 'hook' && /хук Kit/.test(p.detail)));
  assert.ok(preview.notes?.some((n) => n.includes('WFK_SERVICE_SESSION=trust')));
  await assert.rejects(provider.grantTrust(project, 'wrong'), code('invalid-token'));
  const stale = await provider.previewTrust(project);
  await writeFile(path.join(project.path, '.mcp.json'), JSON.stringify({ mcpServers: { late: { command: 'late' } } }));
  await assert.rejects(provider.grantTrust(project, stale.token), code('preview-changed'));
  const fresh = await provider.previewTrust(project);
  assert.ok(fresh.autorun.some((p) => p.kind === 'mcp-server' && p.detail === 'late: late'));
  const granted = await provider.grantTrust(project, fresh.token);
  assert.equal(granted.trusted, true);
  assert.ok(granted.backup);
  assert.equal(JSON.parse(await readFile(granted.backup!, 'utf8')).numStartups, 3);
  const config = JSON.parse(await readFile(path.join(home, '.claude.json'), 'utf8'));
  assert.equal(config.projects[project.path].hasTrustDialogAccepted, true);
  assert.equal(config.projects['/elsewhere'].hasTrustDialogAccepted, true);
  assert.deepEqual(await provider.trust(project), { trusted: true, backup: granted.backup });
  const dialog = (await fakeCalls()).find((c) => c.argv.length === 0)!;
  assert.deepEqual(dialog.vars, { WFK_SERVICE_SESSION: 'trust' });
  // The dialog's session is in the journal but marked as a service session, so it is hidden.
  assert.match(await readFile(path.join(project.path, '.workflow-kit', 'local', 'sessions.jsonl'), 'utf8'), /"service":"trust"/);
  assert.deepEqual(await provider.listSessions(project), []);
  assert.equal((await provider.previewTrust(project)).trusted, true);
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
