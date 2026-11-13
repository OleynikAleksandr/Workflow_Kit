export const PARAMETER_NATIVE = '.parameters-native';
export const PARAMETER_STATE = '.parameters-state';
export const PARAMETER_REQUEST = '.parameters-request';
export const PARAMETER_RESULT = '.parameters-result';
export const PARAMETER_CANCEL = '.parameters-cancel';
export const PARAMETER_FRESH_MS = 3500;
export const NATIVE_PARAMETER_FLOOR = '2.1.323';
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export const MODES = ['auto', 'default', 'acceptEdits', 'plan'] as const;
export type NativeField = 'model' | 'effort' | 'mode' | 'ultracode' | 'catalog';
export interface NativeMetadata {
  version: 1; hostId: string; sessionId: string; cwd: string; cliVersion: string;
  model: { id: string; label: string }; effort: string | null; fast: boolean | null; at: number;
}
export interface NativeModelOption { key: string; label: string; group: 'primary' | 'more' }
export interface NativePending {
  id: string; sessionId: string; epoch: string; expires: number; field: NativeField; command: string | null;
}
export interface NativeParameterState {
  version: 1; hostId: string; sessionId: string; epoch: string; at: number; cliVersion: string;
  status: 'idle' | 'busy' | 'dialog' | 'unknown' | 'control'; inputEmpty: boolean; reason: string | null;
  model: { id: string; label: string } | null; effort: string | null; mode: string | null;
  fast: boolean | null; ultracode: boolean | null; models: NativeModelOption[]; efforts: string[];
  fastReason: string | null; pending: NativePending | null;
}
export interface NativeParameterRequest {
  version: 1; id: string; hostId: string; sessionId: string; epoch: string; expires: number;
  field: NativeField; value: string;
}
export interface NativeParameterResult {
  version: 1; id: string; hostId: string; sessionId: string;
  status: 'applied' | 'busy' | 'stale' | 'unavailable' | 'timeout' | 'cancelled' | 'invalid';
  reason?: string; state?: NativeParameterState;
}
export const NATIVE_KEYS = { up: '\x1b[A', down: '\x1b[B', left: '\x1b[D', right: '\x1b[C', session: 's', enter: '\r', escape: '\x1b', mode: '\x1b[Z', clear: '\x15' } as const;
export type NativeKey = keyof typeof NATIVE_KEYS;
export interface NativeAction { kind: 'text' | 'key'; value: string; revision: number }
export function supportedNativeVersion(version: unknown): version is string {
  if (typeof version !== 'string') return false;
  const m = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
  if (!m) return false;
  const [major, minor, patch] = m.slice(1).map(Number);
  return major! > 2 || (major === 2 && (minor! > 1 || (minor === 1 && patch! >= 323)));
}
export const nativeModelKey = (label: string): string => `native:${encodeURIComponent(label)}`;
export function validNativeRequest(value: unknown, now: number): value is NativeParameterRequest {
  if (!value || typeof value !== 'object') return false;
  const r = value as NativeParameterRequest;
  return r.version === 1 && /^[a-f0-9-]{36}$/i.test(r.id) && /^[a-f0-9-]{36}$/i.test(r.hostId)
    && /^[a-f0-9-]{36}$/i.test(r.sessionId) && typeof r.epoch === 'string' && r.epoch.length < 100
    && ['catalog', 'model', 'effort', 'mode', 'ultracode'].includes(r.field)
    && typeof r.value === 'string' && r.value.length <= 300 && Number.isFinite(r.expires) && r.expires > now && r.expires <= now + 60_000;
}
