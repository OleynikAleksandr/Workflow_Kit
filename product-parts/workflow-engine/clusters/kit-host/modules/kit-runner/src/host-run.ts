// runHost (M39): a host-only Kit command forked with a Node IPC channel. The
// child asks this parent to verify the one-time ticket of the operation
// (hello → ticket → verify → verdict); the handler is created with the child,
// so there is no verifier address, socket file or environment setting. The
// same protocol runs on macOS, Linux and Windows x64/ARM64.
import { fork } from 'node:child_process';

/** The protocol tag of every message (`HOST_PROTOCOL` of the Kit). */
export const HOST_PROTOCOL = 'wfk-host/1';

/** The binding the Kit sends; the verifier compares it with its ticket. */
export interface HostPayload {
  expectedRevision: number;
  inputDigest: string;
  operation: string;
  ownerSession: string | null;
  root: string;
  runId: string;
  scopeId: string;
}

export type HostVerdict = { ok: true } | { ok: false; reason: string };

/** The ticket of one operation and its one-time check (see `#autopilot` host tickets). */
export interface HostVerifier {
  ticket: string;
  verify(request: { payload: unknown; payloadDigest: unknown; ticket: unknown }): HostVerdict;
}

export interface HostRunOptions {
  args: readonly string[];
  bundle: string;
  cwd: string;
  /** The environment of the child: never the ticket. */
  env?: Readonly<Record<string, string | undefined>>;
  maxBytes: number;
  nodePath: string;
  timeoutMs: number;
  verifier: HostVerifier;
}

export interface HostRunResult {
  startError: string | null;
  stderr: string;
  stdout: string;
  timedOut: boolean;
}

interface Message {
  payload?: unknown;
  payloadDigest?: unknown;
  protocol?: unknown;
  requestId?: unknown;
  ticket?: unknown;
  type?: unknown;
}

/** Forks the Kit bundle with the IPC channel and answers its ticket requests. */
export function runHostProcess(options: HostRunOptions): Promise<HostRunResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    let requestId: string | null = null;
    let verified = false;
    const done = (startError: string | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ startError, stderr, stdout, timedOut });
    };
    let child: ReturnType<typeof fork>;
    try {
      child = fork(options.bundle, [...options.args], {
        cwd: options.cwd,
        env: { ...(options.env ?? process.env) } as NodeJS.ProcessEnv,
        execPath: options.nodePath,
        serialization: 'json',
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      });
    } catch (error) {
      resolve({ startError: error instanceof Error ? error.message : String(error), stderr, stdout, timedOut });
      return;
    }
    const take = (current: string, chunk: Buffer): string =>
      current.length >= options.maxBytes ? current : (current + chunk.toString('utf8')).slice(0, options.maxBytes);
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout = take(stdout, chunk);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = take(stderr, chunk);
    });
    const reply = (message: Record<string, unknown>): void => {
      if (child.connected) child.send({ protocol: HOST_PROTOCOL, ...message });
    };
    child.on('message', (raw: unknown) => {
      const message = (raw ?? {}) as Message;
      if (message.protocol !== HOST_PROTOCOL || typeof message.requestId !== 'string') return;
      // One operation per child: the first hello names the only request id.
      if (message.type === 'wfk-host-hello' && requestId === null) {
        requestId = message.requestId;
        reply({ requestId, ticket: options.verifier.ticket, type: 'wfk-host-ticket' });
        return;
      }
      if (message.type === 'wfk-host-verify' && message.requestId === requestId && !verified) {
        verified = true;
        let verdict: HostVerdict;
        try {
          verdict = options.verifier.verify({ payload: message.payload, payloadDigest: message.payloadDigest, ticket: message.ticket });
        } catch (error) {
          verdict = { ok: false, reason: error instanceof Error ? error.message : String(error) };
        }
        reply(verdict.ok ? { ok: true, requestId, type: 'wfk-host-verdict' } : { ok: false, reason: verdict.reason, requestId, type: 'wfk-host-verdict' });
      }
    });
    // "close" does not always follow when the IPC channel ends first: wait for the exit and both outputs.
    let pending = 3;
    const settle = (): void => {
      pending -= 1;
      if (pending === 0) done(null);
    };
    child.on('error', (error) => done(error.message));
    child.on('exit', settle);
    child.stdout?.on('end', settle);
    child.stderr?.on('end', settle);
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, options.timeoutMs);
  });
}
