// The Windows pty host (spec M5 section 4.1): the same contract as session.exp and environment.exp —
// the same arguments, marker lines on stdout (the supervisor's log file), control files
// <debug>.rename and <debug>.message, timeouts and terminal size — over ConPTY instead of expect.
// Pure logic with injected terminal, files and clock; win-host.ts runs it for real.
import { DIALOG, ENVIRONMENT_ID, NOT_TRUSTED, SESSION_URL, WAKE_TEXT, dialogKind, screenText } from './screen.ts';

/** The terminal the host drives (pty-host's Terminal). */
export interface HostTerminal {
  readonly pid: number;
  onData(listener: (text: string) => void): void;
  onExit(listener: (code: number) => void): void;
  write(text: string): boolean;
  kill(): void;
}

export interface HostDeps {
  start(file: string, args: string[], size: { cols: number; rows: number }): HostTerminal;
  print(text: string): void;
  /** Reads and deletes a control file: its text, or null when it does not exist. */
  takeFile(file: string): Promise<string | null>;
  sleep(ms: number): Promise<void>;
  now(): number;
  exit(code: number): void;
}

export type HostMode =
  | { kind: 'session'; claude: string; title: string; debug: string; resume: string | null; first: string | null }
  | { kind: 'environment'; claude: string; name: string; debug: string };

export interface HostTimings {
  /** Wait for the session link (session.exp: 90 s). */
  sessionMs: number;
  /** Wait for the environment id (environment.exp: 20 s). */
  environmentMs: number;
  /** Polling of the control files (1 s). */
  pollMs: number;
}

export const HOST_TIMINGS: HostTimings = { sessionMs: 90_000, environmentMs: 20_000, pollMs: 1000 };

/** Parses the argv of win-host: session <dir> <claude> <title> <debug> [<resume>] | environment <dir> <claude> <name> <debug>. */
export function parseHostArgs(argv: readonly string[], env: Readonly<Record<string, string | undefined>>): { dir: string; mode: HostMode } | null {
  const [kind, dir, claude, label, debug, resume] = argv;
  if (!dir || !claude || label === undefined || !debug) return null;
  if (kind === 'session') {
    const first = env['WFK_FIRST_MESSAGE']?.trim() || null;
    return { dir, mode: { kind, claude, title: label, debug, resume: resume || null, first } };
  }
  if (kind === 'environment') return { dir, mode: { kind, claude, name: label, debug } };
  return null;
}

/** Runs the host until claude exits (or a dialog / trust failure ends it). */
export function runHost(mode: HostMode, deps: HostDeps, timings: HostTimings = HOST_TIMINGS): Promise<void> {
  const session = mode.kind === 'session';
  const args = session
    ? [...(mode.resume ? ['--resume', mode.resume] : []), '--remote-control', mode.title, '--debug-file', mode.debug]
    : ['remote-control', '--name', mode.name, '--spawn=same-dir', '--debug-file', mode.debug];
  const term = deps.start(mode.claude, args, session ? { cols: 160, rows: 40 } : { cols: 120, rows: 40 });
  deps.print(`\nCLAUDE_PID ${term.pid}\n`);
  let screen = '';
  let copying = true;
  let phase: 'waiting' | 'dialog' | 'running' | 'done' = 'waiting';
  let lastData = deps.now();
  let resolveDone!: () => void;
  const done = new Promise<void>((resolve) => (resolveDone = resolve));
  const finish = (marker: string | null, code: number): void => {
    if (phase === 'done') return;
    phase = 'done';
    if (marker) deps.print(`\n${marker}\n`);
    deps.exit(code);
    resolveDone();
  };

  const timeout = setTimeout(() => {
    if (phase !== 'waiting') return;
    deps.print(session ? '\nNO_SESSION_URL\n' : '\nENV_STARTED\n');
    void running(null);
  }, session ? timings.sessionMs : timings.environmentMs);

  async function stopOnDialog(): Promise<void> {
    phase = 'dialog';
    clearTimeout(timeout);
    // Let the dialog finish drawing: 1 s of silence, 5 s at most (dialogs.tcl).
    const deadline = deps.now() + 5000;
    while (deps.now() < deadline && deps.now() - lastData < 1000) await deps.sleep(100);
    // The marker first: the exit event of the killed claude must not overwrite it.
    finish(`DIALOG ${dialogKind(screen)}`, 6);
    term.kill();
  }

  /** After the link (or its timeout): the first message, then the control files every pollMs. */
  async function running(first: string | null): Promise<void> {
    if (phase !== 'waiting') return;
    phase = 'running';
    clearTimeout(timeout);
    copying = false;
    if (!session) return;
    if (first) {
      await deps.sleep(1500);
      term.write(first);
      await deps.sleep(500);
      term.write('\r');
      deps.print('\nFIRST_MESSAGE_SENT\n');
    }
    while (phase === 'running') {
      await deps.sleep(timings.pollMs);
      if (phase !== 'running') break;
      const name = ((await deps.takeFile(`${mode.debug}.rename`)) ?? '').replace(/\s+/g, ' ').trim();
      if (name !== '') {
        term.write(`/rename ${name}`);
        await deps.sleep(300);
        term.write('\r');
        deps.print('\nRENAMED\n');
      }
      if ((await deps.takeFile(`${mode.debug}.message`)) !== null) {
        term.write(WAKE_TEXT);
        await deps.sleep(300);
        term.write('\r');
        deps.print('\nWOKEN\n');
      }
    }
  }

  term.onData((text) => {
    lastData = deps.now();
    if (copying) deps.print(text);
    if (phase !== 'waiting') {
      if (phase === 'dialog') screen += text;
      return;
    }
    screen = (screen + text).slice(-65_536);
    const plain = screenText(screen);
    // The same pattern order as the expect scripts: environment.exp checks trust before the id.
    const notTrusted = NOT_TRUSTED.test(plain);
    const link = session ? SESSION_URL.exec(plain) : notTrusted ? null : ENVIRONMENT_ID.exec(plain);
    if (link) {
      deps.print(session ? `\nSESSION_URL ${link[1]}\n` : `\nENV_READY ${link[1]}\n`);
      void running(session ? mode.first : null);
      return;
    }
    if (notTrusted) {
      finish(session ? 'SESSION_NOT_TRUSTED' : 'ENV_NOT_TRUSTED', 5);
      term.kill();
      return;
    }
    if (DIALOG.test(plain)) void stopOnDialog();
  });

  term.onExit(() => {
    clearTimeout(timeout);
    if (phase === 'waiting') finish(session ? 'SESSION_EXITED' : 'ENV_EXITED', 4);
    else if (phase !== 'dialog') finish(session ? 'SESSION_ENDED' : 'ENV_ENDED', 0);
  });
  return done;
}
