// A ConPTY terminal for one program (spec M5 section 2): output is read continuously, input is
// written as UTF-8 buffers, kill happens once (a second node-pty kill crashes, #983) and is followed
// by taskkill of the process tree. Errors of the internal sockets never reach the process.
import { spawn as spawnChild } from 'node:child_process';
import type { NodePty, NodePtyProcess } from './loader.ts';

export interface TerminalOptions {
  file: string;
  args: string[];
  cwd: string;
  env: Record<string, string | undefined>;
  cols: number;
  rows: number;
}

export interface Terminal {
  readonly pid: number;
  /** Everything the program printed (VT text); listeners added later miss nothing printed later. */
  onData(listener: (text: string) => void): void;
  onExit(listener: (code: number) => void): void;
  /** Writes text; false once the program has exited or the write failed. */
  write(text: string): boolean;
  /** Ends the program and its process tree; safe to call many times. */
  kill(): void;
  readonly exited: boolean;
}

/** Kills a Windows process tree; resolves when taskkill ends. */
export type TreeKiller = (pid: number) => Promise<void>;

export const taskkillTree: TreeKiller = (pid) =>
  new Promise((resolve) => {
    const child = spawnChild('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    child.on('error', () => resolve());
    child.on('exit', () => resolve());
  });

/** Silences 'error' events of node-pty's internal sockets (#976, #942, #960). */
function guardSockets(pty: NodePtyProcess): void {
  const agent = (pty as unknown as { _agent?: Record<string, unknown> })._agent;
  for (const name of ['_inSocket', '_outSocket']) {
    const socket = agent?.[name] as { on?: (event: string, cb: () => void) => void } | undefined;
    socket?.on?.('error', () => undefined);
  }
}

export function startTerminal(pty: NodePty, options: TerminalOptions, killTree: TreeKiller = taskkillTree): Terminal {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(options.env)) if (value !== undefined) env[key] = value;
  const proc = pty.spawn(options.file, options.args, {
    name: 'xterm-256color',
    cols: options.cols,
    rows: options.rows,
    cwd: options.cwd,
    env,
    useConpty: true,
    // The bundled conpty.dll and OpenConsole.exe instead of the system conhost, which loses keys (#99659).
    useConptyDll: true,
  });
  guardSockets(proc);
  let exited = false;
  let killed = false;
  proc.onExit(() => void (exited = true));
  return {
    pid: proc.pid,
    onData: (listener) => void proc.onData(listener),
    onExit: (listener) => void proc.onExit((event) => listener(event.exitCode)),
    write(text) {
      if (exited) return false;
      try {
        proc.write(Buffer.from(text, 'utf8'));
        return true;
      } catch {
        return false;
      }
    },
    kill() {
      if (killed) return;
      killed = true;
      const pid = proc.pid;
      if (!exited) {
        try {
          proc.kill();
        } catch {
          // The tree kill below still ends the program.
        }
      }
      void killTree(pid);
    },
    get exited() {
      return exited;
    },
  };
}
