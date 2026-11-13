import type { InterruptTarget, Project, SessionInfo } from '#provider-registry';
import type { CodexRuntime, DaemonState } from '../src/runtime.ts';
import { createRpcSession, initializeSession } from '../src/rpc.ts';
import type { RpcTransport } from '../src/rpc.ts';
import { createInterruptParts } from '../src/interrupt.ts';

export const THREAD = 'thread-stop';
export const PROJECT = { id: 'p', name: 'Test', path: '/fixture', createdAt: '', source: 'opened' } as Project;
export const TARGET: InterruptTarget = { turnRef: 'kit-ref-1', nativeTurnId: 'native-1' };
export const answer = (id = 'native-1', status = 'inProgress', state = 'active') => ({ thread: { id: THREAD, status: { type: state }, turns: [{ id, status, items: [] }] } });
export const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
export function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }

export function world(timeoutMs = 1000) {
  const w = {
    value: answer(), reads: 0, closed: 0,
    calls: [] as Array<{ method: string; params: any }>,
    daemon: { running: true, error: null } as DaemonState | null,
    read: null as null | (() => unknown | Promise<unknown>),
    command: null as null | (() => unknown | Promise<unknown>),
    notify: (_method: string, _params: unknown) => {},
  };
  const runtime = {
    program: { installed: true, version: '0.167.2', error: null, unsupported: null },
    cachedDaemon: () => w.daemon,
    withDaemon: async <T>(run: Parameters<CodexRuntime['withDaemon']>[0]): Promise<T> => {
      let receive!: (message: unknown) => void;
      const transport: RpcTransport = {
        onMessage: (fn) => { receive = fn; }, onClose: () => {}, close: () => { w.closed++; },
        send: (raw) => {
          const message = raw as { id?: number; method: string; params?: unknown };
          if (message.id === undefined) return;
          w.calls.push({ method: message.method, params: message.params });
          void Promise.resolve().then(async () => {
            if (message.method === 'initialize') return {};
            if (message.method === 'thread/read') { w.reads++; return w.read ? w.read() : w.value; }
            if (message.method === 'turn/interrupt') {
              if (w.command) return w.command();
              w.value = answer('native-1', 'interrupted', 'idle');
              return {};
            }
            throw new Error('Unexpected method');
          }).then((result) => receive({ id: message.id, result }), (error: Error) => receive({ id: message.id, error: { code: -32000, message: error.message } }));
        },
      };
      w.notify = (method, params) => receive({ method, params });
      const session = createRpcSession(transport, { timeoutMs });
      try { await initializeSession(session); return await run(session, {}) as T; }
      finally { session.close(); }
    },
  } as CodexRuntime;
  const parts = createInterruptParts(runtime, { interruptWaitMs: timeoutMs, interruptPollMs: 2 });
  parts.sessions(PROJECT, [{ localId: THREAD } as SessionInfo]);
  parts.observe(THREAD, w.value);
  return { w, runtime, parts, interrupt: (target = TARGET) => parts.interruptTurn(PROJECT, THREAD, target) };
}
