// @ts-check
// Model of the «Общий доступ к чатам» card (spec M12 section 2.2): which providers have a shared
// access, what its state means for the user and which buttons it gets, the last operation of the
// setup. No DOM; node --test.

/**
 * @typedef {object} SharedAccessData
 * @property {string} state unsupported | not-configured | needs-remote-login | needs-connection | active | broken
 * @property {string} label
 * @property {string | null} reason
 * @property {string | null} hint
 * @property {boolean} configured
 * @property {string | null} connectionSeenAt
 * @property {boolean | null} connected
 * @property {string} alias
 * @property {string | null} manualProfile
 */

/**
 * @typedef {object} SharedAccessButton
 * @property {'setup' | 'remote-login' | 'connections' | 'recheck' | 'remove'} id
 * @property {string} label
 * @property {boolean} primary
 */

/**
 * @typedef {object} SharedOperation
 * @property {string} id
 * @property {'apply' | 'remove'} kind
 * @property {string} status running | succeeded | failed
 * @property {string | null} error
 */

/** Question before the removal. */
export const REMOVE_CONFIRM =
  'Убрать настройку общего доступа?\n\nKit удалит свой ключ, строку в authorized_keys и свои блоки в ~/.ssh/config и профиле оболочки (с копиями). Подключение в ChatGPT и «Удалённый вход» выключите сами.';

/**
 * @param {unknown} value
 * @returns {Record<string, any>}
 */
function record(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? /** @type {Record<string, any>} */ (value) : {};
}

/** @param {unknown} value @returns {string | null} */
function text(value) {
  return typeof value === 'string' && value !== '' ? value : null;
}

/**
 * Providers whose status carries a shared access (details.sharedAccess, also null before the
 * first check), in the order of the section.
 * @param {Record<string, unknown>} state
 * @returns {Array<{ id: string, label: string }>}
 */
export function sharedAccessProviders(state) {
  const summaries = record(state['providers'])['providers'];
  /** @type {Array<{ id: string, label: string }>} */
  const list = [];
  for (const entry of Array.isArray(summaries) ? summaries : []) {
    const summary = record(entry);
    const id = text(summary['id']);
    const details = record(record(summary['status'])['details']);
    if (!id || !('sharedAccess' in details)) continue;
    list.push({ id, label: text(summary['label']) ?? text(summary['title']) ?? id });
  }
  return list;
}

/**
 * The shared access of a provider as its status reports it; null before the first check.
 * @param {Record<string, unknown>} state
 * @param {string} provider
 * @returns {SharedAccessData | null}
 */
export function sharedAccessOf(state, provider) {
  const summaries = record(state['providers'])['providers'];
  const summary = (Array.isArray(summaries) ? summaries : []).map(record).find((s) => s['id'] === provider);
  const value = record(record(record(summary)['status'])['details'])['sharedAccess'];
  return typeof record(value)['state'] === 'string' ? /** @type {SharedAccessData} */ (value) : null;
}

/**
 * The newest setup or removal operation of the provider (the "operations" section).
 * @param {Record<string, unknown>} state
 * @param {string} provider
 * @returns {SharedOperation | null}
 */
export function sharedOperation(state, provider) {
  const list = record(state['operations'])['operations'];
  /** @type {SharedOperation | null} */
  let newest = null;
  let at = '';
  for (const entry of Array.isArray(list) ? list : []) {
    const op = record(entry);
    const kind = op['kind'] === 'provider.shared-access.apply' ? 'apply' : op['kind'] === 'provider.shared-access.remove' ? 'remove' : null;
    if (!kind || record(op['scope'])['provider'] !== provider) continue;
    const started = String(op['startedAt'] ?? '');
    if (newest && started < at) continue;
    at = started;
    newest = { id: String(op['id'] ?? ''), kind, status: String(op['status'] ?? ''), error: text(record(op['error'])['message']) };
  }
  return newest;
}

/**
 * Tone of the state pill.
 * @param {SharedAccessData | null} shared
 * @returns {'ok' | 'warn' | 'muted'}
 */
export function sharedTone(shared) {
  if (!shared) return 'muted';
  if (shared.state === 'active') return 'ok';
  if (shared.state === 'unsupported' || shared.state === 'not-configured') return 'muted';
  return 'warn';
}

/**
 * Buttons of a state, the main one first.
 * @param {SharedAccessData | null} shared
 * @returns {SharedAccessButton[]}
 */
export function sharedButtons(shared) {
  const recheck = /** @type {SharedAccessButton} */ ({ id: 'recheck', label: 'Перепроверить', primary: false });
  const remove = /** @type {SharedAccessButton} */ ({ id: 'remove', label: 'Убрать настройку', primary: false });
  if (!shared) return [{ ...recheck, label: 'Проверить', primary: true }];
  switch (shared.state) {
    case 'unsupported':
      return [];
    case 'not-configured':
      return [{ id: 'setup', label: 'Настроить', primary: true }];
    case 'needs-remote-login':
      return [{ id: 'remote-login', label: 'Открыть настройки macOS', primary: true }, recheck, remove];
    case 'needs-connection':
      return [{ id: 'connections', label: 'Открыть подключения ChatGPT', primary: true }, recheck, remove];
    case 'active':
      return [recheck, remove];
    default:
      return [{ id: 'setup', label: 'Настроить ещё раз', primary: true }, recheck, remove];
  }
}

/**
 * The line under the state: what works or what is missing.
 * @param {SharedAccessData | null} shared
 * @returns {string}
 */
export function sharedSummary(shared) {
  if (!shared) return 'Ещё не проверено.';
  if (shared.state === 'active') {
    const now = shared.connected === true ? 'приложение ChatGPT подключено сейчас' : 'приложение ChatGPT сейчас не подключено — откройте его';
    return `Чаты Kit открываются в ChatGPT на компьютере, iPad и телефоне одновременно; ${now}.`;
  }
  return [shared.reason, shared.hint].filter(Boolean).join(' ') || shared.label;
}

/**
 * Text of the operation for the card; null when nothing runs or failed.
 * @param {SharedOperation | null} op
 * @returns {{ tone: 'muted' | 'error', text: string } | null}
 */
export function operationNote(op) {
  if (!op) return null;
  const what = op.kind === 'apply' ? 'Настройка' : 'Удаление настройки';
  if (op.status === 'running' || op.status === 'queued') return { tone: 'muted', text: `${what} выполняется…` };
  if (op.status === 'failed') return { tone: 'error', text: `${what} не удалась: ${op.error ?? 'ошибка'}` };
  return null;
}
