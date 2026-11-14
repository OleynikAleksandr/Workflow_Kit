// @ts-check
import { localIdOf } from './chat-model.js';
export const PARAMETER_POLL_MS = 5000;
/** While a choice waits for the agent the row is read every second (M29). */
export const PENDING_POLL_MS = 1000;
/** How long the line about a refused choice stays under the input (M29). */
export const FAILURE_SHOW_MS = 10_000;
const FIELD_NAMES = /** @type {Record<string, string>} */ ({ model: 'модель', effort: 'усилие', mode: 'режим', ultracode: 'Ultracode', speed: 'скорость' });
/** @param {import('#provider-registry').SessionParameters | null} parameters */
export const hasPending = parameters => Boolean(parameters?.items.some(item => item.pending));
/** What a row shows: a waiting choice first, with its note in the title (M29).
 * @param {import('#provider-registry').ParameterItem} item */
export const shownItem = item => item.pending
  ? { label: item.pending.label, pending: true, title: `${item.title} → ${item.pending.label}: ${item.pending.note}` }
  : { label: item.label, pending: false, title: item.title };
/** The value a menu marks: the waiting choice, else the confirmed one.
 * @param {import('#provider-registry').ParameterItem | undefined} item @param {import('#provider-registry').ParameterOption} option */
export const chosen = (item, option) => item?.pending ? option.value === item.pending.value : option.selected ?? (item?.value !== null && option.value === item?.value);
/** One line under the input for a choice the agent did not take (M29).
 * @param {import('#provider-registry').ParameterFailure} failure @param {import('#provider-registry').SessionParameters} parameters */
export function failureText(failure, parameters) {
  const label = parameters.items.find(i => i.id === failure.field)?.options?.find(o => o.value === failure.value)?.label ?? failure.value;
  // The host's generic reason repeats the line itself: only a specific one is added.
  const reason = failure.reason && !/^Claude не принял/.test(failure.reason) ? `: ${failure.reason}` : '';
  return `Claude не принял ${FIELD_NAMES[failure.field] ?? failure.field} ${label}${reason}`;
}
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
/** Second hint line when the ring counts against a threshold below the model window (M28).
 * @param {import('#provider-registry').ContextUsage | null} context */
export const contextWindowText = context => context && typeof context.modelWindowTokens === 'number' && Number.isFinite(context.modelWindowTokens) && context.modelWindowTokens !== context.windowTokens
  ? `Окно модели: ${count(context.modelWindowTokens)} · автосжатие: ${count(context.windowTokens)}` : null;
/** @param {import('#provider-registry').ContextUsage | null} context */
export const contextText = context => context ? `Контекст: ${count(context.usedTokens)} из ${count(context.windowTokens)} (${count(context.usedPercent === null ? null : Math.round(context.usedPercent))} %)` : 'Контекст: нет данных';
/** @param {import('#provider-registry').SessionParameters} parameters */
export function menuSections(parameters) {
  return parameters.items.map(item => ({ id: item.id, title: PARAMETER_TITLES[item.id] ?? item.id, label: item.label, reason: item.reason,
    options: (item.options ?? []).map(option => ({ ...option, selected: chosen(item, option) })) }));
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
