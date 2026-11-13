// @ts-check
import { localIdOf } from './chat-model.js';
export const PARAMETER_POLL_MS = 5000;
export const PARAMETER_TITLES = { model: 'Модель', effort: 'Усилие', speed: 'Скорость', mode: 'Режим', permissions: 'Разрешения', ultracode: 'Ultracode' };
/** @param {string} project @param {string} provider @param {string} key */
export const parametersUrl = (project, provider, key) => `/api/projects/${encodeURIComponent(project)}/providers/${encodeURIComponent(provider)}/sessions/${encodeURIComponent(localIdOf(key))}/parameters`;
/** @param {unknown} value */
export const safeFont = value => typeof value === 'string' && /^[A-Za-z0-9 ,"'-]{1,200}$/.test(value) ? value : null;
/** @param {unknown} value */
export const safeAccent = value => typeof value === 'string' && /^#[a-f0-9]{6}$/i.test(value) ? value : null;
/** @param {unknown} value */
export const percent = value => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
/** @param {number} value */
export const limitTone = value => value >= 95 ? 'error' : value >= 80 ? 'warn' : 'muted';
/** @param {number | null | undefined} value */
const count = value => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('ru-RU') : '—';
/** @param {import('#provider-registry').ContextUsage | null} context */
export const contextText = context => context ? `Контекст: ${count(context.usedTokens)} из ${count(context.windowTokens)} (${count(context.usedPercent === null ? null : Math.round(context.usedPercent))} %)` : 'Контекст: нет данных';
/** @param {import('#provider-registry').SessionParameters} parameters */
export function menuSections(parameters) {
  return parameters.items.map(item => ({ id: item.id, title: PARAMETER_TITLES[item.id] ?? item.id, label: item.label, reason: item.reason,
    options: (item.options ?? []).map(option => ({ ...option, selected: option.selected ?? (item.value !== null && option.value === item.value) })) }));
}
/** Single-flight polling with stale-response protection and visible-only forced refreshes.
 * @param {() => Promise<any>} read @param {(value: any) => void} apply @param {(error: any) => void} failed
 */
export function createParameterPoll(read, apply, failed) {
  let visible = false, pending = false, again = false, last = -Infinity, revision = 0;
  async function poll(force = false, now = Date.now()) {
    if (!visible) return;
    if (pending) { again ||= force; return; }
    if (!force && now - last < PARAMETER_POLL_MS) return;
    pending = true; last = now; const version = revision;
    try { const value = await read(); if (version === revision) apply(value); }
    catch (error) { if (version === revision) failed(error); }
    finally { pending = false; if (again) { again = false; await poll(true); } }
  }
  return {
    /** @param {boolean} value */
    visible(value) { const opened = value && !visible; visible = value; if (opened) void poll(true); else if (value) void poll(); },
    refresh: () => poll(true), invalidate() { revision++; },
  };
}
