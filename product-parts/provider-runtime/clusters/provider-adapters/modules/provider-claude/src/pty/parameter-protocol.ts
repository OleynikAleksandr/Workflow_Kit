export const PARAMETER_NATIVE = '.parameters-native';
export const PARAMETER_STATE = '.parameters-state';
export const PARAMETER_RESULT = '.parameters-result';
export const PARAMETER_CANCEL = '.parameters-cancel';
/** Choices of the user the host applies when Claude is free (M29); written only by the service. */
export const PARAMETER_WANTED = '.parameters-wanted';
/** The native catalog of one Claude CLI version (M29): read once, then reused. */
export const PARAMETER_CATALOG = '.parameters-catalog';
/** Order in which wanted fields are applied: efforts depend on the model. */
export const WANTED_ORDER = ['model', 'ultracode', 'effort', 'mode'] as const;
export type WantedField = typeof WANTED_ORDER[number];
/** Counted failures after which a wanted field ends as failed (M29 3.2). */
export const WANTED_ATTEMPTS = 3;
/** Shown for speed: the host never opens /fast (M29). */
export const FAST_REASON = 'Скорость Claude меняется только в его приложении';
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
export interface NativeWanted {
  version: 1; hostId: string; sessionId: string;
  changes: Partial<Record<WantedField, string>>; ids: Partial<Record<WantedField, string>>;
}
export interface NativeWantedStatus {
  id: string; value: string; status: 'pending' | 'applying' | 'applied' | 'failed'; reason: string | null; attempts: number;
}
export interface NativeEfforts { values: string[]; recommended: string | null; ultracode: boolean }
export interface NativeCatalog {
  version: 1; cliVersion: string; primaryLast: number;
  models: (NativeModelOption & { index: number })[];
  efforts: Record<string, NativeEfforts>;
}
export interface NativePending {
  id: string; sessionId: string; epoch: string; expires: number; field: NativeField; command: string | null;
}
export interface NativeParameterState {
  version: 1; hostId: string; sessionId: string; epoch: string; at: number; cliVersion: string;
  status: 'idle' | 'busy' | 'dialog' | 'unknown' | 'control'; inputEmpty: boolean; reason: string | null;
  model: { id: string; label: string } | null; effort: string | null; mode: string | null;
  fast: boolean | null; ultracode: boolean | null; models: NativeModelOption[]; efforts: string[];
  effortRecommended?: string | null; fastReason: string | null; ultracodeAvailable?: boolean; pending: NativePending | null;
  /** Wanted fields of the current wanted file and how they went (M29). */
  wanted?: Partial<Record<WantedField, NativeWantedStatus>>;
  /** The host reads the wanted file (M29); older hosts lack it and stay read-only. */
  wantedFile?: true;
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
const UUID = /^[a-f0-9-]{36}$/i;
export function validWanted(value: unknown): value is NativeWanted {
  if (!value || typeof value !== 'object') return false;
  const w = value as NativeWanted;
  if (w.version !== 1 || !UUID.test(String(w.hostId)) || !UUID.test(String(w.sessionId)) || !w.changes || typeof w.changes !== 'object' || !w.ids || typeof w.ids !== 'object') return false;
  return Object.entries(w.changes).every(([field, v]) => (WANTED_ORDER as readonly string[]).includes(field) && typeof v === 'string' && v.length > 0 && v.length <= 300
    && UUID.test(String(w.ids[field as WantedField])));
}
export function validCatalog(value: unknown): value is NativeCatalog {
  if (!value || typeof value !== 'object') return false;
  const c = value as NativeCatalog;
  return c.version === 1 && supportedNativeVersion(c.cliVersion) && Number.isInteger(c.primaryLast) && Array.isArray(c.models) && c.models.length <= 64
    && c.models.every(m => typeof m.key === 'string' && typeof m.label === 'string' && Number.isInteger(m.index) && (m.group === 'primary' || m.group === 'more'))
    && !!c.efforts && typeof c.efforts === 'object' && Object.values(c.efforts).every(e => Array.isArray(e.values) && e.values.every(v => (EFFORTS as readonly string[]).includes(v)));
}
