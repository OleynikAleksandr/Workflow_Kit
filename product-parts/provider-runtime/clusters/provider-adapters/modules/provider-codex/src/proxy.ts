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

/** The proxy process as a ByteStream: writes go to its stdin, data comes from its stdout. */
export function proxyStream(spec: ProxySpec, spawnProcess: typeof spawn = spawn): ByteStream {
  const child = spawnProcess(spec.command, ['app-server', 'proxy', '--sock', spec.socketPath], {
    env: spec.env,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let destroyed = false;
  let stderr = '';
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
  };
  return stream;
}

/** Connects to the daemon through `codex app-server proxy` (Windows). */
export function connectProxyWebSocket(spec: ProxySpec, options: { timeoutMs?: number } = {}): Promise<RpcTransport> {
  return connectWebSocket(proxyStream(spec), options);
}
