// A stand-in for the `claude` CLI used by the provider tests (never the real one). Tests copy it
// with a `#!<node>` line into a temporary folder. It writes only under $HOME (a temporary folder)
// and the project folder, and mimics what the provider relies on:
//   claude --version                                  prints a version
//   claude                                            trust dialog: Down + Enter writes
//                                                     ~/.claude.json projects[cwd].hasTrustDialogAccepted
//   claude [--resume <id>] --remote-control <name> --debug-file <f>
//                                                     prints claude.ai/code/session_<X> and stays alive
//   claude remote-control --name <n> --spawn=same-dir --debug-file <f>
//                                                     prints environment=<id> and stays alive
// Every start of a session (including the trust dialog) appends a line to the project's hook
// journal, as the Kit SessionStart hook would, and a bridge-session record to its transcript.
// FAKE_CLAUDE_MODE: "debug-only" (no link on the screen), "exit" (fail right away).
// FAKE_CLAUDE_LOG: JSON lines with argv, cwd and the CLAUDE*/WFK_* variables seen.
import { randomBytes, randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const home = process.env.HOME;
const cwd = process.cwd();
const mode = process.env.FAKE_CLAUDE_MODE ?? '';
const configFile = path.join(home, '.claude.json');

if (process.env.FAKE_CLAUDE_LOG) {
  const vars = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('CLAUDE') || k.startsWith('WFK_')));
  appendFileSync(process.env.FAKE_CLAUDE_LOG, `${JSON.stringify({ argv, cwd, vars, pid: process.pid })}\n`);
}

function option(name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function readConfig() {
  return existsSync(configFile) ? JSON.parse(readFileSync(configFile, 'utf8')) : {};
}

function trusted() {
  return readConfig().projects?.[cwd]?.hasTrustDialogAccepted === true;
}

function transcriptFile(localId) {
  const dir = path.join(home, '.claude', 'projects', cwd.replace(/[^A-Za-z0-9]/g, '-'));
  mkdirSync(dir, { recursive: true });
  return path.join(dir, `${localId}.jsonl`);
}

function hook(localId, source) {
  const journal = path.join(cwd, '.workflow-kit', 'local', 'sessions.jsonl');
  if (!existsSync(path.dirname(journal))) return;
  const row = {
    time: new Date().toISOString(),
    client: 'claude',
    session_id: localId,
    transcript_path: transcriptFile(localId),
    cwd,
    source,
    model: 'fake-model',
    permission_mode: 'default',
    service: process.env.WFK_SERVICE_SESSION || null,
  };
  appendFileSync(journal, `${JSON.stringify(row)}\n`);
}

function stayAlive() {
  const timer = setInterval(() => undefined, 1000);
  for (const signal of ['SIGTERM', 'SIGHUP', 'SIGINT']) process.on(signal, () => {
    clearInterval(timer);
    process.exit(0);
  });
}

if (argv[0] === '--version') {
  process.stdout.write('2.1.318 (Claude Code)\n');
  process.exit(0);
}

if (mode === 'exit') {
  process.stdout.write('fatal: fake failure\n');
  process.exit(1);
}

if (argv[0] === 'remote-control') {
  if (!trusted()) {
    process.stdout.write('Error: Workspace not trusted\n');
    process.exit(1);
  }
  const debug = option('--debug-file');
  if (debug) writeFileSync(debug, `environment ${option('--name')} started\n`);
  process.stdout.write(`Remote Control ready: https://claude.ai/code?environment=env_FAKE${randomBytes(3).toString('hex')}\n`);
  stayAlive();
} else if (argv.includes('--remote-control')) {
  if (!trusted()) {
    process.stdout.write('Error: Workspace not trusted\n');
    process.exit(1);
  }
  const resume = option('--resume');
  const localId = resume ?? randomUUID();
  const transcript = transcriptFile(localId);
  let remote;
  if (resume) {
    const line = readFileSync(transcript, 'utf8').split('\n').find((l) => l.includes('bridge-session'));
    remote = JSON.parse(line).bridgeSessionId.replace(/^cse_/, '');
  } else {
    remote = `FAKE${randomBytes(6).toString('hex')}`;
    appendFileSync(transcript, `${JSON.stringify({ type: 'user', message: { content: 'hello' } })}\n`);
    appendFileSync(transcript, `${JSON.stringify({ type: 'bridge-session', bridgeSessionId: `cse_${remote}`, title: option('--remote-control') })}\n`);
  }
  hook(localId, resume ? 'resume' : 'startup');
  const debug = option('--debug-file');
  if (debug) writeFileSync(debug, `[DEBUG] Created session cse_${remote}\n[DEBUG] server title ${option('--remote-control')}\n`);
  if (mode !== 'debug-only') process.stdout.write(`\x1b[2mRemote Control:\x1b[0m https://claude.ai/code/session_${remote}\r\n`);
  else process.stdout.write('Remote Control connecting...\r\n');
  stayAlive();
} else if (argv.length === 0) {
  process.stdout.write('Do you trust the files in this folder?\r\n> 1. No, exit\r\n  2. Yes, proceed\r\nEnter to confirm\r\n');
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  let yes = false;
  let input = '';
  process.stdin.on('data', (chunk) => {
    input += chunk.toString('utf8');
    if (input.includes('\x1b[B')) yes = true;
    if (input.includes('\r') && !input.includes('/exit')) {
      if (yes && !trusted()) {
        const config = readConfig();
        config.projects ??= {};
        config.projects[cwd] = { ...(config.projects[cwd] ?? {}), hasTrustDialogAccepted: true };
        writeFileSync(configFile, JSON.stringify(config, null, 2));
        hook(randomUUID(), 'startup');
        process.stdout.write('Welcome\r\n');
      } else if (!yes) {
        process.exit(1);
      }
    }
    if (input.includes('/exit\r')) process.exit(0);
  });
} else {
  process.stdout.write(`unexpected arguments: ${argv.join(' ')}\n`);
  process.exit(2);
}
