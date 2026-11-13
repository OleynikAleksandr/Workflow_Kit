import { NativeControlArbiter } from '#pty-host';
import type { ClaudeRuntime } from './runtime.ts';

const arbiters = new WeakMap<ClaudeRuntime, NativeControlArbiter>();
function arbiter(rt: ClaudeRuntime): NativeControlArbiter {
  let value = arbiters.get(rt);
  if (!value) { value = new NativeControlArbiter(); arbiters.set(rt, value); }
  return value;
}

/** Preserve invocation order while a session is resolved or resumed. */
export function withNativeSession<T>(rt: ClaudeRuntime, projectId: string, sid: string, action: () => Promise<T>): Promise<T> {
  return arbiter(rt).run(`session:${projectId}:${sid}`, action);
}

/** debugFile is the canonical host identity, shared by local/remote session aliases. */
export function withNativeHost<T>(rt: ClaudeRuntime, debugFile: string, action: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  return arbiter(rt).run(`host:${debugFile}`, action, signal);
}
