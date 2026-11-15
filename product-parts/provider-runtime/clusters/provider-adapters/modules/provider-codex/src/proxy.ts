// Windows transport to the Codex daemon (spec M5 section 5): the daemon listens on an AF_UNIX socket
// that node:net cannot open on Windows, so the service starts the official relay
// `codex app-server proxy --sock <socket>` ("Proxy stdio bytes to the running app-server control
// socket") with a hidden window and runs its WebSocket client over the proxy's stdin and stdout.
import { spawn } from 'node:child_process';
import type { RpcTransport } from './rpc.ts';
import { connectWebSocket } from './ws.ts';
import type { ByteStream } from './ws.ts';

/** How the proxy is started: codex.exe, the child environment and the daemon socket. */
export interface ProxySpec {
  command: string;
  env: Record<string, string>;
  socketPath: string;
}

/** At most 300 characters of the last stderr line, one line, likely tokens and keys masked. */
export function safeStderr(text: string): string {
  const line = text.split(/\r?\n/).map((part) => part.trim()).filter(Boolean).at(-1) ?? '';
  // eslint-disable-next-line no-control-regex
  const safe = line.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/(bearer|token|key|secret|authorization)\S*\s*[:=]?\s*\S+/gi, '$1 …').replace(/[A-Za-z0-9_\-.]{32,}/g, '…');
  return safe ? `: ${safe.slice(0, 300)}` : '';
}

/** The proxy process as a ByteStream: writes go to its stdin, data comes from its stdout. */
export function proxyStream(spec: ProxySpec, spawnProcess: typeof spawn = spawn): ByteStream {
  const child = spawnProcess(spec.command, ['app-server', 'proxy', '--sock', spec.socketPath], {
    env: spec.env,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let destroyed = false;
  let stderr = '';
  let exit: string | null = null;
  child.on('exit', (code, signal) => { exit = code !== null ? `exit code ${code}` : `signal ${signal ?? 'unknown'}`; });
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', (chunk: string) => {
    if (stderr.length < 16 * 1024) stderr += chunk;
  });
  child.stdin?.on('error', () => undefined);
  const stream: ByteStream = {
    get destroyed() {
      return destroyed;
    },
    write: (data) => {
      if (!destroyed && child.stdin && !child.stdin.destroyed) child.stdin.write(data);
    },
    end: () => {
      child.stdin?.end();
      // The proxy ends with its stdin; a stuck one is killed shortly after.
      setTimeout(() => stream.destroy(), 1000).unref();
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      if (child.exitCode === null && child.signalCode === null) child.kill();
    },
    onReady: (listener) => void child.on('spawn', listener),
    onData: (listener) => void child.stdout?.on('data', (chunk: Buffer) => listener(chunk)),
    onError: (listener) => void child.on('error', listener),
    onClose: (listener) =>
      void child.on('close', () => {
        destroyed = true;
        listener();
      }),
    describeClose: () => (exit ? `codex app-server proxy ended (${exit})${safeStderr(stderr)}` : null),
  };
  return stream;
}

/** Connects to the daemon through `codex app-server proxy` (Windows). */
export function connectProxyWebSocket(spec: ProxySpec, options: { timeoutMs?: number } = {}): Promise<RpcTransport> {
  return connectWebSocket(proxyStream(spec), options);
}
