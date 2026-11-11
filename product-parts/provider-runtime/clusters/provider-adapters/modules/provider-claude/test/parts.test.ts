// Pure parts of the Claude provider: links, markers, transcripts, autorun points, ~/.claude.json,
// capabilities. Everything runs on fixtures and temporary folders.
import assert from 'node:assert/strict';
import { appendFile, chmod, copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { scanAutorun } from '../src/autorun.ts';
import { INHERITED_NOTE, createClaudeConfigReader, parseClaudeConfig } from '../src/claude-config.ts';
import { normalizeRemoteId, sessionLinks } from '../src/links.ts';
import { createRecordStore, forgetProjects } from '../src/records.ts';
import { claudeCapabilities, compareVersions, findProgram, parseVersion } from '../src/programs.ts';
import { debugSessionId, dialogError, logTail, parseMarkers, stripAnsi } from '../src/pty.ts';
import { bridgeIdOfLine, createBridgeReader } from '../src/transcripts.ts';

const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));
let tmp = '';

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-claude-parts-'));
});

after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

test('links: cse_ and session_ are one id; Desktop gets claude://, iPad and web https://', () => {
  assert.equal(normalizeRemoteId('cse_01Ab'), 'session_01Ab');
  assert.equal(normalizeRemoteId('session_01Ab'), 'session_01Ab');
  assert.equal(normalizeRemoteId('env_1'), null);
  assert.equal(normalizeRemoteId('session_a/../b'), null);
  assert.deepEqual(sessionLinks('cse_01Ab'), {
    desktop: 'claude://claude.ai/code/session_01Ab',
    mobile: 'https://claude.ai/code/session_01Ab',
    web: 'https://claude.ai/code/session_01Ab',
  });
  assert.deepEqual(sessionLinks('nope'), {});
});

test('markers of the expect scripts and the debug-file fallback', () => {
  const log = 'spawn claude\r\n\nCLAUDE_PID 4242\n\x1b[2mscreen https://claude.ai/code/session_X\x1b[0m\r\n\nSESSION_URL session_Abc123\n';
  const markers = parseMarkers(log);
  assert.equal(markers.claudePid, 4242);
  assert.equal(markers.sessionId, 'session_Abc123');
  assert.equal(markers.failure, null);
  assert.equal(parseMarkers('\nCLAUDE_PID 1\n\nNO_SESSION_URL\n').noSessionUrl, true);
  assert.equal(parseMarkers('\nSESSION_NOT_TRUSTED\n').failure, 'not-trusted');
  assert.equal(parseMarkers('\nENV_EXITED\n').failure, 'exited');
  const dialog = parseMarkers('\nCLAUDE_PID 7\nAllow\x1b[1Cexternal\x1b[1CCLAUDE.md\x1b[1Cfile\x1b[1Cimports?\r\n\nDIALOG imports\n');
  assert.deepEqual([dialog.failure, dialog.dialog], ['dialog', 'imports']);
  assert.equal(parseMarkers('\nDIALOG nonsense\n').dialog, null);
  const error = dialogError('imports', '\nCLAUDE_PID 7\nAllow\x1b[1Cexternal\x1b[1CCLAUDE.md\x1b[1Cfile\x1b[1Cimports?\r\n\nDIALOG imports\n', '/logs/s.log');
  assert.equal(error.code, 'imports-dialog');
  assert.match(error.message, /Текст диалога:\nAllow external CLAUDE\.md file imports\?$/);
  assert.match(error.hint ?? '', /предпросмотре доверия.*\/logs\/s\.log/);
  const unknown = dialogError('unknown', 'x', '/l');
  assert.equal(unknown.code, 'unknown-dialog');
  assert.match(unknown.hint ?? '', /в папке проекта в терминале/);
  assert.doesNotMatch(unknown.hint ?? '', /предпросмотре доверия/);
  // Claude's first run (spec M15 section 2.3): the reason and what to do, no screen dump.
  const onboarding = dialogError('onboarding', '\nCLAUDE_PID 7\nSyntax theme: Monokai\n\nDIALOG onboarding\n', '/l');
  assert.equal(onboarding.code, 'onboarding-dialog');
  assert.equal(onboarding.message, 'Claude не завершил первый запуск (выбор темы или вход).');
  assert.match(onboarding.hint ?? '', /выберите тему и войдите, затем «Повторить»/);
  assert.equal(stripAnsi('a\x1b[3Cb\x1b[Cc'), 'a   b c');
  assert.deepEqual([parseMarkers('\nENV_READY env_1\n').envId, parseMarkers('\nENV_STARTED\n').envStarted], ['env_1', true]);
  assert.equal(debugSessionId('x\nCreated session cse_Old1\nserver title t\nCreated session cse_New2\n'), 'session_New2');
  assert.equal(debugSessionId('nothing here'), null);
  assert.equal(logTail('\x1b[31mred\x1b[0m\r\n\n  \nlast line\n', 2), 'red\nlast line');
});

test('transcripts: bridge-session gives the Remote Control id; plain transcripts and bad paths give null', async () => {
  assert.equal(bridgeIdOfLine('{"type":"bridge-session","bridgeSessionId":"cse_Z9"}'), 'session_Z9');
  assert.equal(bridgeIdOfLine('{"type":"user","message":"bridge-session"}'), null);
  const reader = createBridgeReader();
  assert.equal(await reader.remoteIdOf(path.join(fixtures, 'transcript-bridge.jsonl')), 'session_01AbCdEf234');
  assert.equal(await reader.remoteIdOf(path.join(fixtures, 'transcript-plain.jsonl')), null);
  assert.equal(await reader.remoteIdOf(null), null);
  assert.equal(await reader.remoteIdOf('relative/x.jsonl'), null);
  assert.equal(await reader.remoteIdOf(path.join(tmp, 'missing.jsonl')), null);
  assert.equal(await reader.remoteIdOf(path.join(fixtures, 'fake-claude.mjs')), null);
});

test('transcripts are read incrementally: a record appended later (or split across writes) is found', async () => {
  const file = path.join(tmp, 'growing.jsonl');
  await copyFile(path.join(fixtures, 'transcript-plain.jsonl'), file);
  const reader = createBridgeReader({ maxBytesPerCall: 64 });
  assert.equal(await reader.remoteIdOf(file), null);
  await appendFile(file, '{"type":"bridge-session","bridge');
  assert.equal(await reader.remoteIdOf(file), null);
  await appendFile(file, `SessionId":"cse_Later1"}\n${'{"type":"user","message":"' + 'x'.repeat(300) + '"}\n'}`);
  let id: string | null = null;
  for (let i = 0; i < 20 && id === null; i += 1) id = await reader.remoteIdOf(file);
  assert.equal(id, 'session_Later1');
  // A rewritten (smaller) file is scanned again from the start.
  await writeFile(file, '{"type":"bridge-session","bridgeSessionId":"session_New9"}\n');
  assert.equal(await createBridgeReader().remoteIdOf(file), 'session_New9');
});

test('autorun points: hooks, permissions, MCP servers, foreign Codex hooks; fingerprint follows contents', async () => {
  const project = path.join(tmp, 'autorun');
  await mkdir(path.join(project, '.claude'), { recursive: true });
  await mkdir(path.join(project, '.codex'), { recursive: true });
  await writeFile(
    path.join(project, '.claude', 'settings.json'),
    JSON.stringify({
      hooks: {
        SessionStart: [{ hooks: [{ type: 'command', command: '[ -x "$HOME/.local/bin/wfk" ] && "$HOME/.local/bin/wfk" hook session-start --client claude; exit 0' }] }],
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: './guard.sh' }] }],
      },
      permissions: { allow: ['Bash(npm test)'] },
      enableAllProjectMcpServers: true,
      statusLine: { type: 'command', command: './status.sh' },
    }),
  );
  await writeFile(path.join(project, '.claude', 'settings.local.json'), '{ broken');
  await writeFile(path.join(project, '.mcp.json'), JSON.stringify({ mcpServers: { db: { command: 'npx', args: ['db-mcp'] }, web: { url: 'https://mcp.example' } } }));
  await writeFile(path.join(project, '.codex', 'hooks.json'), JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ command: 'codex-thing' }] }] } }));
  const scan = await scanAutorun(project);
  const pairs = scan.autorun.map((p) => `${p.file}|${p.kind}`);
  assert.deepEqual(pairs, [
    '.claude/settings.json|hook',
    '.claude/settings.json|hook',
    '.claude/settings.json|permission',
    '.claude/settings.json|mcp',
    '.claude/settings.json|command',
    '.claude/settings.local.json|invalid',
    '.mcp.json|mcp-server',
    '.mcp.json|mcp-server',
    '.codex/hooks.json|codex-hook',
  ]);
  assert.match(scan.autorun[0]!.detail, /хук Kit/);
  assert.equal(scan.autorun[1]!.detail, 'PreToolUse [Bash]: ./guard.sh');
  assert.equal(scan.autorun[6]!.detail, 'db: npx db-mcp');
  assert.equal((await scanAutorun(project)).fingerprint, scan.fingerprint);
  await writeFile(path.join(project, '.mcp.json'), '{}');
  assert.notEqual((await scanAutorun(project)).fingerprint, scan.fingerprint);
  assert.deepEqual((await scanAutorun(path.join(tmp, 'empty-folder'))).autorun, []);
});

test('~/.claude.json: trust per exact folder, login, broken file; cached by mtime', async () => {
  const parsed = parseClaudeConfig('/h/.claude.json', JSON.stringify({ oauthAccount: { emailAddress: 'a@b' }, projects: { '/p': { hasTrustDialogAccepted: true }, '/p/sub': {} } }));
  assert.deepEqual([...parsed.trusted], ['/p']);
  assert.equal(parsed.loggedIn, true);
  assert.match(parseClaudeConfig('/x', '{').error ?? '', /JSON/);
  const file = path.join(tmp, 'claude.json');
  const reader = createClaudeConfigReader(file);
  // Folders of the running OS; on Windows Claude Code writes the key with forward slashes.
  const win = process.platform === 'win32';
  const [p, key, deeper, q] = win ? ['C:\\p', 'C:/p', 'C:\\p\\sub\\deeper', 'C:\\q'] : ['/p', '/p', '/p/sub/deeper', '/q'];
  assert.equal((await reader.trustOf(p)).trusted, false);
  await writeFile(file, JSON.stringify({ projects: { [key]: { hasTrustDialogAccepted: true } } }));
  assert.deepEqual(await reader.trustOf(p), { trusted: true });
  assert.deepEqual(await reader.trustOf(deeper), { trusted: false, inherited: { from: p, note: INHERITED_NOTE } }, 'a trusted parent is only a mark');
  assert.deepEqual(await reader.trustOf(q), { trusted: false });
  assert.equal((await reader.read()).loggedIn, false);
  await writeFile(file, 'not json at all, longer than before');
  assert.equal((await reader.trustOf('/p')).trusted, null);
});

test('capabilities follow the OS, expect and the claude version', async () => {
  const both = { claude: '/bin/claude', expect: '/usr/bin/expect' };
  const ready = claudeCapabilities('darwin', both, '2.1.318');
  assert.equal(ready['createSession']!.available, true);
  assert.equal(ready['environment']!.available, true);
  // Windows (spec M5): the ConPTY host replaces expect; trust and stop work as on macOS.
  const windows = claudeCapabilities('win32', { claude: 'C:\\Users\\u\\.local\\bin\\claude.exe', expect: null }, '2.1.318');
  assert.equal(windows['trust']!.available, true);
  assert.equal(windows['stopSession']!.available, true);
  assert.equal(windows['createSession']!.available, true);
  assert.equal(windows['environment']!.available, true);
  const linux = claudeCapabilities('linux', { claude: '/bin/claude', expect: null }, null);
  assert.match(linux['createSession']!.reason ?? '', /expect/);
  assert.equal(linux['sessions']!.available, true);
  assert.match(claudeCapabilities('darwin', both, '1.0.0')['resumeSession']!.reason ?? '', /старее/);
  assert.match(claudeCapabilities('darwin', { claude: null, expect: '/usr/bin/expect' }, null)['trust']!.reason ?? '', /не найден/);
  assert.equal(parseVersion('2.1.318 (Claude Code)'), '2.1.318');
  assert.ok(compareVersions('2.1.10', '2.1.9') > 0);
  const bin = path.join(tmp, 'bin');
  await mkdir(bin, { recursive: true });
  await writeFile(path.join(bin, 'claude'), '#!/bin/sh\n');
  await chmod(path.join(bin, 'claude'), 0o755);
  assert.equal(await findProgram('claude', { env: { PATH: ['relative', bin].join(path.delimiter) } }), path.join(bin, 'claude'));
  assert.equal(await findProgram('claude', { env: {}, configured: path.join(tmp, 'nope') }), null);
  assert.equal(await findProgram('claude', { env: {}, extraDirs: [bin] }), path.join(bin, 'claude'));
});

test('forgetProjects drops session and environment records of removed projects only', async () => {
  const file = path.join(tmp, 'claude-records.json');
  const session = (projectId: string, remoteId: string) => ({
    localId: null, remoteId, title: remoteId, projectId, projectPath: '/p', origin: 'panel', createdAt: '2026-11-07T10:00:00.000Z',
    startedAt: '2026-11-07T10:00:00.000Z', processId: null, claudePid: null, logFile: '', debugFile: '', stoppedAt: null,
  });
  await writeFile(file, JSON.stringify({ version: 1, sessions: [session('keep', 'session_a'), session('gone', 'session_b'), session('gone', 'session_c')], environments: [{ projectId: 'gone', projectPath: '/p' }] }));
  const store = createRecordStore(file);
  assert.equal(await forgetProjects(store, new Set(['keep'])), 3);
  const left = await store.read();
  assert.deepEqual(left.sessions.map((s) => s.remoteId), ['session_a']);
  assert.deepEqual(left.environments, []);
  assert.equal(await forgetProjects(store, new Set(['keep'])), 0);
});
