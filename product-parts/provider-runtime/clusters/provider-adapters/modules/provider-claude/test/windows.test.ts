// Windows parts of the Claude provider (spec M5 section 4): the ConPTY host driven by a fake
// terminal, the launch command line and the ~/.claude.json keys of Windows folders.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { parseClaudeConfig, trustFromSnapshot } from '../src/claude-config.ts';
import { patchProjectEntry, renameRetrying } from '../src/config-writer.ts';
import { claudeFolderKey, findFolderKey, folderKey } from '../src/folder-key.ts';
import { claudeCapabilities } from '../src/programs.ts';
import { PTY_SCRIPTS, parseMarkers, ptyCommand } from '../src/pty.ts';
import { parseHostArgs, runHost } from '../src/pty/host.ts';
import type { HostMode, HostTerminal } from '../src/pty/host.ts';

let tmp = '';
before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'wfk-claude-win-'));
});
after(async () => {
  await rm(tmp, { recursive: true, force: true });
});

const DEBUG = 'C:/logs/session-1.debug.log';

/** A fake terminal and host dependencies; the clock advances only through sleep. */
function fakeHost() {
  const data: Array<(text: string) => void> = [];
  const exits: Array<(code: number) => void> = [];
  const written: string[] = [];
  const files = new Map<string, string>();
  const codes: number[] = [];
  let out = '';
  let clock = 0;
  let killed = 0;
  let started: { file: string; args: string[]; size: { cols: number; rows: number } } | null = null;
  const term: HostTerminal = {
    pid: 4242,
    onData: (listener) => void data.push(listener),
    onExit: (listener) => void exits.push(listener),
    write(text) {
      written.push(text);
      return true;
    },
    kill() {
      killed += 1;
      for (const listener of exits) listener(1);
    },
  };
  return {
    written,
    files,
    codes,
    out: () => out,
    killed: () => killed,
    started: () => started,
    emit: (text: string) => data.forEach((listener) => listener(text)),
    exit: (code = 0) => exits.forEach((listener) => listener(code)),
    deps: {
      start(file: string, args: string[], size: { cols: number; rows: number }) {
        started = { file, args, size };
        return term;
      },
      print: (text: string) => void (out += text),
      async takeFile(file: string) {
        const text = files.get(file);
        files.delete(file);
        return text ?? null;
      },
      sleep(ms: number) {
        clock += ms;
        return new Promise<void>((resolve) => setImmediate(resolve));
      },
      now: () => clock,
      exit: (code: number) => void codes.push(code),
    },
  };
}

async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 2000 && !check(); i += 1) await new Promise((resolve) => setImmediate(resolve));
  assert.ok(check(), 'condition was not reached');
}

const TIMINGS = { sessionMs: 60_000, environmentMs: 60_000, pollMs: 1000 };
const session = (extra: Partial<Extract<HostMode, { kind: 'session' }>> = {}): HostMode => ({
  kind: 'session',
  claude: 'C:/Users/u/.local/bin/claude.exe',
  title: 'Задача',
  debug: DEBUG,
  resume: null,
  first: null,
  ...extra,
});

test('session host: link, first message, rename and wake files, end — the markers of session.exp', async () => {
  const host = fakeHost();
  const done = runHost(session({ first: 'Привет, план' }), host.deps, TIMINGS);
  assert.deepEqual(host.started(), {
    file: 'C:/Users/u/.local/bin/claude.exe',
    args: ['--remote-control', 'Задача', '--debug-file', DEBUG],
    size: { cols: 160, rows: 40 },
  });
  host.emit('\u001b[2J Remote Control: https://\u001b[1Cclaude.ai/code/session_AbC123 \r\n');
  await until(() => host.out().includes('FIRST_MESSAGE_SENT'));
  assert.deepEqual(host.written, ['Привет, план', '\r']);
  host.emit('screen output after the link is not copied');
  host.files.set(`${DEBUG}.rename`, '  Новое\n имя ');
  await until(() => host.out().includes('RENAMED'));
  host.files.set(`${DEBUG}.message`, '');
  await until(() => host.out().includes('WOKEN'));
  assert.deepEqual(host.written.slice(2), ['/rename Новое имя', '\r', 'Workflow Kit: новое сообщение из панели.', '\r']);
  host.exit(0);
  await done;
  const markers = parseMarkers(host.out());
  assert.equal(markers.sessionId, 'session_AbC123');
  assert.equal(markers.claudePid, 4242);
  assert.equal(markers.failure, null);
  assert.match(host.out(), /^SESSION_ENDED$/m);
  assert.doesNotMatch(host.out(), /not copied/);
  assert.deepEqual(host.codes, [0]);
});

test('session host: --resume, the link timeout and an early exit', async () => {
  const late = fakeHost();
  const lateDone = runHost(session({ resume: 'local-1' }), late.deps, { ...TIMINGS, sessionMs: 20 });
  assert.deepEqual(late.started()?.args.slice(0, 2), ['--resume', 'local-1']);
  await until(() => late.out().includes('NO_SESSION_URL'));
  late.exit(0);
  await lateDone;
  assert.equal(parseMarkers(late.out()).noSessionUrl, true);
  assert.deepEqual(late.codes, [0]);

  const early = fakeHost();
  const earlyDone = runHost(session(), early.deps, TIMINGS);
  early.exit(1);
  await earlyDone;
  assert.equal(parseMarkers(early.out()).failure, 'exited');
  assert.deepEqual(early.codes, [4]);
});

test('session host: Workspace not trusted and dialogs stop claude without a key pressed', async () => {
  const untrusted = fakeHost();
  const untrustedDone = runHost(session(), untrusted.deps, TIMINGS);
  untrusted.emit('Error: Workspace not trusted');
  await untrustedDone;
  assert.equal(parseMarkers(untrusted.out()).failure, 'not-trusted');
  assert.deepEqual(untrusted.codes, [5]);
  assert.equal(untrusted.killed(), 1);

  for (const [screen, kind] of [
    ['Do you trust\u001b[1Cthe files in this folder?\r\n Enter to confirm · Esc to cancel', 'trust'],
    ['Allow external CLAUDE.md file imports?\r\n Enter to confirm', 'imports'],
    ['New MCP server found\r\n Esc to cancel', 'unknown'],
  ] as const) {
    const host = fakeHost();
    const done = runHost(session(), host.deps, TIMINGS);
    host.emit(screen);
    await done;
    assert.equal(parseMarkers(host.out()).dialog, kind);
    assert.deepEqual(host.codes, [6]);
    assert.equal(host.killed(), 1);
    assert.deepEqual(host.written, []);
  }
});

test('environment host: ENV_READY, ENV_ENDED and the arguments of environment.exp', async () => {
  const host = fakeHost();
  const mode: HostMode = { kind: 'environment', claude: 'claude.exe', name: 'Проект', debug: DEBUG };
  const done = runHost(mode, host.deps, TIMINGS);
  assert.deepEqual(host.started(), {
    file: 'claude.exe',
    args: ['remote-control', '--name', 'Проект', '--spawn=same-dir', '--debug-file', DEBUG],
    size: { cols: 120, rows: 40 },
  });
  host.emit('Connected: https://claude.ai/code?environment=env_9x-Y');
  await until(() => host.out().includes('ENV_READY'));
  host.exit(0);
  await done;
  const markers = parseMarkers(host.out());
  assert.equal(markers.envId, 'env_9x-Y');
  assert.equal(markers.envStarted, true);
  assert.match(host.out(), /^ENV_ENDED$/m);

  const untrusted = fakeHost();
  const untrustedDone = runHost(mode, untrusted.deps, TIMINGS);
  untrusted.emit('Workspace not trusted environment=env_1');
  await untrustedDone;
  assert.equal(parseMarkers(untrusted.out()).failure, 'not-trusted');
  assert.equal(parseMarkers(untrusted.out()).envId, null);
});

test('host arguments and the launch command: expect elsewhere, node + win-host.ts on Windows', () => {
  assert.deepEqual(parseHostArgs(['session', 'C:\\p', 'claude.exe', 'T', 'd.log'], { WFK_FIRST_MESSAGE: '  hi ' }), {
    dir: 'C:\\p',
    mode: { kind: 'session', claude: 'claude.exe', title: 'T', debug: 'd.log', resume: null, first: 'hi' },
  });
  assert.equal(parseHostArgs(['environment', 'C:\\p', 'claude.exe', 'N', 'd.log'], {})?.mode.kind, 'environment');
  assert.equal(parseHostArgs(['other', 'a', 'b', 'c', 'd'], {}), null);
  const args = ['C:\\p', 'claude.exe', 'T', 'd.log'];
  assert.deepEqual(ptyCommand({ kind: 'host', node: 'C:\\node.exe' }, PTY_SCRIPTS, 'session', args), {
    command: 'C:\\node.exe',
    args: [PTY_SCRIPTS.host, 'session', ...args],
  });
  assert.deepEqual(ptyCommand({ kind: 'expect', expect: '/usr/bin/expect' }, PTY_SCRIPTS, 'environment', args), {
    command: '/usr/bin/expect',
    args: [PTY_SCRIPTS.environment, ...args],
  });
  assert.match(PTY_SCRIPTS.host, /win-host\.ts$/);
  const noBuild = claudeCapabilities('win32', { claude: 'claude.exe', expect: null }, null);
  assert.equal(noBuild['createSession']!.available, true);
});

test('Windows folder keys of ~/.claude.json: any slashes and drive case; new keys as Claude writes them', async () => {
  assert.equal(folderKey('/Users/a/Proj'), '/Users/a/Proj');
  assert.equal(folderKey('C:\\Users\\A\\Proj\\'), 'c:/users/a/proj');
  assert.equal(claudeFolderKey('c:\\Users\\A\\Proj\\'), 'C:/Users/A/Proj');
  assert.equal(claudeFolderKey('/Users/a/Proj'), '/Users/a/Proj');
  assert.equal(findFolderKey(['c:/users/a/proj', 'C:/Users/A/Proj'], 'C:/Users/A/Proj'), 'C:/Users/A/Proj');
  assert.equal(findFolderKey(['c:/users/a/proj'], 'C:\\Users\\A\\Proj'), 'c:/users/a/proj');
  assert.equal(findFolderKey(['/users/a/proj'], '/Users/a/Proj'), null);

  const file = path.join(tmp, '.claude.json');
  await writeFile(file, JSON.stringify({ projects: { 'c:/Users/A/Proj': { hasTrustDialogAccepted: false, keep: 1 } } }));
  await patchProjectEntry(file, 'C:\\Users\\A\\Proj', { hasTrustDialogAccepted: true });
  await patchProjectEntry(file, 'd:\\work\\new', { hasTrustDialogAccepted: true });
  const text = await readFile(file, 'utf8');
  assert.deepEqual(JSON.parse(text).projects, {
    'c:/Users/A/Proj': { hasTrustDialogAccepted: true, keep: 1 },
    'D:/work/new': { hasTrustDialogAccepted: true },
  });
  const snapshot = parseClaudeConfig(file, text);
  assert.deepEqual(trustFromSnapshot(snapshot, 'C:\\Users\\A\\Proj'), { trusted: true });
  assert.deepEqual(trustFromSnapshot(snapshot, 'D:\\Work\\New'), { trusted: true });
  await assert.rejects(renameRetrying(path.join(tmp, 'missing'), path.join(tmp, 'x')), { code: 'ENOENT' });
});
