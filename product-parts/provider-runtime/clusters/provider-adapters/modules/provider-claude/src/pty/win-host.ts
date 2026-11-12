// Entry point of the Windows pty host: node win-host.ts session|environment <args…> (spec M5 4.1).
// The process supervisor starts it detached with stdout and stderr going to the session log.
import { readFile, rm } from 'node:fs/promises';
import { loadNodePty, startTerminal } from '#pty-host';
import { HOST_TIMINGS, claudeEnv, parseHostArgs, runHost } from './host.ts';

const parsed = parseHostArgs(process.argv.slice(2), process.env);
if (!parsed) {
  process.stderr.write('usage: win-host.ts session <dir> <claude> <title> <debug> [<resume>] | environment <dir> <claude> <name> <debug>\n');
  process.exit(64);
}
// The first message is not passed on to claude's environment; a session gets WFK_PANEL_SESSION=1.
const env = claudeEnv(parsed.mode, process.env);
const pty = loadNodePty();
let current: { kill(): void } | null = null;
process.on('uncaughtException', (error) => {
  process.stdout.write(`\nHOST_ERROR ${error instanceof Error ? error.message : String(error)}\n`);
  current?.kill();
  process.exit(1);
});
await runHost(parsed.mode, {
  start(file, args, size) {
    const term = startTerminal(pty, { file, args, cwd: parsed.dir, env, ...size });
    current = term;
    return term;
  },
  print: (text) => void process.stdout.write(text),
  async takeFile(file) {
    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch {
      return null;
    }
    await rm(file, { force: true });
    return text;
  },
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
  exit: (code) => void setTimeout(() => process.exit(code), 50),
}, HOST_TIMINGS);
