// A stand-in for the `claude` CLI used by the provider tests (never the real one). Tests copy it
// with a `#!<node>` line into a temporary folder. It writes only under $HOME (a temporary folder)
// and the project folder, and mimics what the provider relies on:
//   claude --version                                  prints a version
//   claude [--resume <id>] --remote-control <name> --debug-file <f>
//                                                     prints claude.ai/code/session_<X> and stays alive
//   claude remote-control --name <n> --spawn=same-dir --debug-file <f>
//                                                     prints environment=<id> and stays alive
// Every start of a session appends a line to the project's hook journal, as the Kit SessionStart
// hook would, and a bridge-session record to its transcript.
// Dialogs, as the real claude shows them before a session (spaces printed as cursor moves, ESC[1C):
//   the trust dialog when neither the folder nor a parent is trusted (a trusted parent silences it,
//   but Remote Control then answers "Workspace not trusted"); the external-imports dialog when
//   FAKE_CLAUDE_EXTERNAL_IMPORTS names a file and projects[cwd] has no recorded answer. A dialog
//   waits for keys forever and only records them (FAKE_CLAUDE_LOG + ".keys"): Kit must press none.
// FAKE_CLAUDE_MODE: "debug-only" (no link on the screen), "exit" (fail right away), "trust-dialog"
//   (the trust dialog even in a trusted folder), "unknown-dialog" (another dialog, also for
//   remote-control).
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

function entryOf(folder) {
  return readConfig().projects?.[folder] ?? {};
}

function trusted() {
  return entryOf(cwd).hasTrustDialogAccepted === true;
}

/** A trusted parent silences the interactive trust dialog (verified 2026-11-05). */
function parentTrusted() {
  const projects = readConfig().projects ?? {};
  for (let dir = path.dirname(cwd); ; dir = path.dirname(dir)) {
    if (projects[dir]?.hasTrustDialogAccepted === true) return true;
    if (path.dirname(dir) === dir) return false;
  }
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

/** Shows a dialog like Claude's UI (spaces as cursor moves) and waits; keys are only recorded. */
function dialog(lines) {
  process.stdout.write(`${lines.join('\r\n').replace(/ /g, '\x1b[1C')}\r\n`);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.on('data', (chunk) => {
    if (process.env.FAKE_CLAUDE_LOG) appendFileSync(`${process.env.FAKE_CLAUDE_LOG}.keys`, `${JSON.stringify({ pid: process.pid, keys: chunk.toString('utf8') })}\n`);
  });
  stayAlive();
}

const TRUST_DIALOG = [
  'Accessing workspace:',
  cwd,
  'Quick safety check: Is this a project you created or one you trust?',
  '❯ 1. Yes, I trust this folder',
  '  2. No, exit',
  'Enter to confirm · Esc to cancel',
];

function importsDialog(file) {
  return [
    'Allow external CLAUDE.md file imports?',
    "This project's CLAUDE.md or .claude/rules imports files outside the current working directory. Never allow this for third-party repositories.",
    'External imports:',
    `  ${file}`,
    '❯ 1. No, disable external imports',
    '  2. Yes, allow external imports',
    'Enter to confirm · Esc to cancel',
  ];
}

const UNKNOWN_DIALOG = ['New MCP server found in .mcp.json: late', '❯ 1. Use this and all future MCP servers in this project', '  2. Continue without using this MCP server', 'Enter to confirm · Esc to cancel'];

if (argv[0] === '--version') {
  process.stdout.write('2.1.318 (Claude Code)\n');
  process.exit(0);
}

if (mode === 'exit') {
  process.stdout.write('fatal: fake failure\n');
  process.exit(1);
}

const imports = process.env.FAKE_CLAUDE_EXTERNAL_IMPORTS;

if (argv[0] === 'remote-control') {
  if (mode === 'unknown-dialog') dialog(UNKNOWN_DIALOG);
  else if (!trusted()) {
    process.stdout.write('Error: Workspace not trusted\n');
    process.exit(1);
  } else {
    const debug = option('--debug-file');
    if (debug) writeFileSync(debug, `environment ${option('--name')} started\n`);
    process.stdout.write(`Remote Control ready: https://claude.ai/code?environment=env_FAKE${randomBytes(3).toString('hex')}\n`);
    stayAlive();
  }
} else if (argv.includes('--remote-control')) {
  if (mode === 'trust-dialog' || (!trusted() && !parentTrusted())) dialog(TRUST_DIALOG);
  else if (!trusted()) {
    process.stdout.write('Error: Workspace not trusted\n');
    process.exit(1);
  } else if (imports && entryOf(cwd).hasClaudeMdExternalIncludesWarningShown !== true) dialog(importsDialog(imports));
  else if (mode === 'unknown-dialog') dialog(UNKNOWN_DIALOG);
  else {
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
    // What is typed into the session (the first message) goes to FAKE_CLAUDE_LOG + ".input".
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.on('data', (chunk) => {
      if (process.env.FAKE_CLAUDE_LOG) appendFileSync(`${process.env.FAKE_CLAUDE_LOG}.input`, chunk.toString('utf8'));
    });
    stayAlive();
  }
} else {
  process.stdout.write(`unexpected arguments: ${argv.join(' ')}\n`);
  process.exit(2);
}
