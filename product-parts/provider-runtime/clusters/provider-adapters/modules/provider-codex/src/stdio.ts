// A short-lived `codex app-server` over stdio (one JSON message per line). It is used for
// hooks/list and config/value/write; its threads are invisible to ChatGPT, so sessions go through
// the daemon instead. The process needs an open stdin while it answers (it exits on EOF before
// answering), which is why it is spawned here and not through the one-shot CommandRunner.
import { spawn } from 'node:child_process';
import { cleanEnv } from '#process-supervisor';
import type { RpcTransport } from './rpc.ts';

/** How to start the app-server: program path, folder and the service environment (D12). */
export interface AppServerSpec {
  command: string;
  cwd: string;
  env: Readonly<Record<string, string | undefined>>;
  platform?: NodeJS.Platform;
}

/** Opens a transport to a fresh app-server; the provider gets it injected for tests. */
export type AppServerOpener = (spec: AppServerSpec) => Promise<RpcTransport>;

/** Longest stdout line kept (a hooks/list answer is a few KiB). */
const MAX_LINE_BYTES = 8 * 1024 * 1024;

/** Spawns `<command> app-server` with stdio pipes; CLAUDE* variables are not passed on. */
export const spawnAppServer: AppServerOpener = (spec) =>
  new Promise((resolve, reject) => {
    const child = spawn(spec.command, ['app-server'], {
      cwd: spec.cwd,
      env: cleanEnv(spec.env, { platform: spec.platform }),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let messageHandler: (message: unknown) => void = () => undefined;
    let closeHandler: (error?: Error) => void = () => undefined;
    let buffer = '';
    let stderr = '';
    let started = false;
    let closed = false;
    const finish = (error?: Error): void => {
      if (closed) return;
      closed = true;
      closeHandler(error);
    };
    child.on('error', (error) => {
      if (!started) reject(error);
      else finish(error);
    });
    child.on('spawn', () => {
      started = true;
      resolve({
        send: (message) => {
          if (!child.stdin.destroyed) child.stdin.write(`${JSON.stringify(message)}\n`);
        },
        onMessage: (handler) => {
          messageHandler = handler;
        },
        onClose: (handler) => {
          closeHandler = handler;
        },
        close: () => {
          child.stdin.end();
          child.kill('SIGTERM');
          setTimeout(() => {
            if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
          }, 2000).unref();
        },
      });
    });
    child.stdin.on('error', () => undefined);
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      if (stderr.length < 64 * 1024) stderr += chunk;
    });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        try {
          messageHandler(JSON.parse(line));
        } catch {
          // Not a JSON-RPC line.
        }
      }
      if (buffer.length > MAX_LINE_BYTES) buffer = '';
    });
    child.on('close', (code, signal) => {
      const tail = stderr.trim().split('\n').slice(-3).join(' | ');
      finish(new Error(`codex app-server exited (${signal ?? `code ${code}`})${tail ? `: ${tail}` : ''}`));
    });
  });
