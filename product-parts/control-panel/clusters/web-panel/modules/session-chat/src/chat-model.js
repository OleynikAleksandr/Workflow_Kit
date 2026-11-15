// @ts-check
// Pure logic of the «Диалог» card (spec M18 2.6): request URLs, merging a polled page into the
// feed, and labels. No DOM here; covered by node --test.

/**
 * One message of the session conversation as the service returns it.
 * @typedef {object} ChatMessage
 * @property {string} id
 * @property {'user' | 'assistant'} role
 * @property {string} text
 * @property {string | null} at
 */

/**
 * The feed after a poll.
 * @typedef {object} MergedFeed
 * @property {ChatMessage[]} messages the messages to show, oldest first
 * @property {string[]} added ids that were not in the previous feed
 * @property {boolean} hasNew new messages appeared
 * @property {boolean} changed the feed differs from the previous one (ids, order, texts or times)
 */

/** Polling interval of an open session screen, in milliseconds. */
export const POLL_MS = 3000;

/** Longest text the service accepts (agent-channel MESSAGE_MAX_CHARS). */
export const SEND_MAX_CHARS = 20_000;

/** Line shown when older messages were left out. */
export const TRUNCATED_TEXT = 'Показаны последние сообщения; полная переписка — в чате провайдера';

/** Feed placeholder before the first page. */
export const LOADING_TEXT = 'Загружаю диалог…';

/** Feed placeholder of a conversation without messages. */
export const EMPTY_TEXT = 'Сообщений пока нет';

/** Reading states (spec M32 2.7) shown in the state line of the feed (loading, partial). */
export const SYNC_LOADING_TEXT = 'Загружаем диалог…';
export const SYNC_PARTIAL_TEXT = 'Часть диалога недоступна';
/** Fallbacks of the error line while the provider reconnects (the service sends its own text). */
export const RECONNECTING_TEXT = 'Восстанавливаем подключение к Codex…';
export const UNAVAILABLE_TEXT = 'Нет подключения к Codex. Проверьте демон в настройках провайдера';
/** Error codes of a read that is retried by the service itself (HTTP 503). */
export const TRANSIENT_CODES = ['codex-reconnecting', 'codex-unavailable'];

const SYNC_STATES = ['loading', 'ready', 'partial', 'reconnecting', 'unavailable'];

/**
 * How a page (or its absence) shows: the state line above the feed, the error line, and whether
 * the page may replace the shown messages.
 * @typedef {object} SyncView
 * @property {string} state text of the state line ('' hides it): loading, a gap
 * @property {string} error text of the error line ('' hides it): reconnecting, unavailable
 * @property {boolean} replace the page is a full snapshot (or the first one) and replaces the feed
 * @property {boolean} full the page is a full snapshot
 */

/**
 * The view of a page's sync (M32): no sync (Claude, Kimi) and ready show nothing; loading shows
 * «Загружаем диалог…» and replaces the feed only while no full snapshot was shown; partial shows
 * its reason; reconnecting and unavailable come with the full last snapshot and show their reason
 * in the error line. A successful read clears the lines without a success message.
 * @param {unknown} sync
 * @param {boolean} hadFull a full snapshot is already shown
 * @returns {SyncView}
 */
export function syncView(sync, hadFull) {
  const raw = sync && typeof sync === 'object' ? /** @type {Record<string, unknown>} */ (sync) : null;
  const state = raw && typeof raw['state'] === 'string' && SYNC_STATES.includes(raw['state']) ? raw['state'] : 'ready';
  const reason = raw && typeof raw['reason'] === 'string' && raw['reason'].trim() ? raw['reason'].trim() : '';
  const gaps = raw && Array.isArray(raw['gaps']) && raw['gaps'].length > 0;
  if (state === 'loading') return { state: SYNC_LOADING_TEXT, error: '', replace: !hadFull, full: false };
  if (state === 'reconnecting') return { state: '', error: reason || RECONNECTING_TEXT, replace: true, full: true };
  if (state === 'unavailable') return { state: '', error: reason || UNAVAILABLE_TEXT, replace: true, full: true };
  if (state === 'partial' || gaps) return { state: reason || SYNC_PARTIAL_TEXT, error: '', replace: true, full: true };
  return { state: '', error: '', replace: true, full: true };
}

/**
 * Part of the session key after the first colon (`<provider>:<localId>`).
 * @param {string} key
 * @returns {string}
 */
export function localIdOf(key) {
  const colon = key.indexOf(':');
  return colon < 0 ? key : key.slice(colon + 1);
}

/**
 * URL of the newest messages of a session.
 * @param {string} projectId
 * @param {{ key: string, provider?: string }} session
 * @returns {string}
 */
export function messagesUrl(projectId, session) {
  const colon = session.key.indexOf(':');
  const provider = session.provider || (colon < 0 ? '' : session.key.slice(0, colon));
  return `/api/projects/${encodeURIComponent(projectId)}/providers/${encodeURIComponent(provider)}/sessions/${encodeURIComponent(localIdOf(session.key))}/messages`;
}

/**
 * URL of sending a message to the agent of a session.
 * @param {string} projectId
 * @param {string} key
 * @returns {string}
 */
export function sendUrl(projectId, key) {
  return `/api/projects/${encodeURIComponent(projectId)}/sessions/${encodeURIComponent(key)}/message`;
}

/**
 * Keeps only well-formed messages of an answer.
 * @param {unknown} value
 * @returns {ChatMessage[]}
 */
function cleanMessages(value) {
  if (!Array.isArray(value)) return [];
  /** @type {ChatMessage[]} */
  const out = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const { id, role, text, at } = /** @type {Record<string, unknown>} */ (item);
    if (typeof id !== 'string' || (role !== 'user' && role !== 'assistant') || typeof text !== 'string') continue;
    out.push({ id, role, text, at: typeof at === 'string' ? at : null });
  }
  return out;
}

/**
 * Merges a polled page into the previous feed by message id. The page is the newest window of the
 * conversation, so it decides what is shown; known ids keep their nodes, unknown ids are new.
 * @param {ChatMessage[] | null} previous null before the first page
 * @param {{ messages?: unknown } | null | undefined} page
 * @returns {MergedFeed}
 */
export function mergePage(previous, page) {
  const messages = cleanMessages(page?.messages);
  const before = previous ?? [];
  const known = new Set(before.map((m) => m.id));
  const added = messages.filter((m) => !known.has(m.id)).map((m) => m.id);
  const changed = previous === null
    || before.length !== messages.length
    || messages.some((m, i) => before[i]?.id !== m.id || before[i]?.text !== m.text || before[i]?.at !== m.at);
  return { messages, added, hasNew: added.length > 0, changed };
}

/**
 * Whether the «Отправить» button is enabled.
 * @param {string} text
 * @param {boolean} busy a send is under way
 * @returns {boolean}
 */
export function canSend(text, busy) {
  return !busy && text.trim().length > 0 && text.length <= SEND_MAX_CHARS;
}

/**
 * Who wrote a message.
 * @param {string} role
 * @param {string} providerLabel
 * @returns {string}
 */
export function roleLabel(role, providerLabel) {
  if (role === 'user') return 'Вы';
  return providerLabel.trim() || 'Агент';
}

/**
 * Time of a message in local time: «14:05» today, «11.11 14:05» on another day of this year,
 * «11.11.2025 14:05» otherwise; empty when the provider gave no time.
 * @param {string | null} at ISO time
 * @param {Date} [now]
 * @returns {string}
 */
export function timeLabel(at, now = new Date()) {
  if (!at) return '';
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return '';
  const two = (/** @type {number} */ n) => String(n).padStart(2, '0');
  const time = `${two(date.getHours())}:${two(date.getMinutes())}`;
  const sameYear = date.getFullYear() === now.getFullYear();
  if (sameYear && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()) return time;
  const day = `${two(date.getDate())}.${two(date.getMonth() + 1)}`;
  return sameYear ? `${day} ${time}` : `${day}.${date.getFullYear()} ${time}`;
}

/**
 * The note of a provider that does not give its conversation.
 * @param {string} providerLabel
 * @returns {string}
 */
export function unsupportedText(providerLabel) {
  return `${providerLabel.trim() || 'Провайдер'} не отдаёт переписку; сообщение агенту можно отправить`;
}

/**
 * Text of a failed request: the message of the service and its hint.
 * @param {unknown} error
 * @returns {string}
 */
export function errorText(error) {
  if (error && typeof error === 'object') {
    const { code, message: said } = /** @type {{ code?: unknown, message?: unknown }} */ (error);
    // The service's own reconnecting or unavailable line, without a hint (spec M32 2.6).
    if (typeof code === 'string' && TRANSIENT_CODES.includes(code)) {
      return typeof said === 'string' && said ? said : code === 'codex-unavailable' ? UNAVAILABLE_TEXT : RECONNECTING_TEXT;
    }
    const { message, hint } = /** @type {{ message?: unknown, hint?: unknown }} */ (error);
    const text = typeof message === 'string' && message ? message : 'Неизвестная ошибка';
    return typeof hint === 'string' && hint ? `${text}. ${hint}` : text;
  }
  return String(error);
}
