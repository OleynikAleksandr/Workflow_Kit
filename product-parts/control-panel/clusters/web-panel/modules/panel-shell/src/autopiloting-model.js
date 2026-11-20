// @ts-check
// Model of the «Автопилотирование» card of «Настройки» (spec M39 ui section 2): the exact names of
// the three modes, the review switch, the settings of the service with their revision. A newer
// revision always wins, so an old answer never overwrites a decision from another device. No DOM.

/** The modes in the order of the card, with the names the user agreed on. */
export const AUTOPILOTING_MODES = Object.freeze([
  { mode: 'off', label: 'Выключено', caption: 'Подготовка и выполнение с ручными действиями пользователя.' },
  { mode: 'after-start', label: 'После ручного запуска Плана', caption: 'Вы запускаете готовый план, Kit доводит работу до публикации.' },
  { mode: 'full', label: 'Полный автопилот', caption: 'Вы согласовываете задачу, Kit готовит план, запускает выполнение и доводит работу до публикации.' },
]);

export const REVIEW_LABEL = 'Ревью спецификации и плана';
/** M48 T005: Settings are the defaults of new sessions; a session changes its own on its card. */
export const DEFAULTS_HINT = 'Значения для новых сессий. Чтобы изменить режим уже открытой сессии — карточка автопилота под сессией.';
export const REVIEW_CAPTION = 'Ревью другим провайдером до начала выполнения.';

/**
 * @typedef {object} AutopilotingSettings
 * @property {number} revision
 * @property {'off' | 'after-start' | 'full'} mode
 * @property {boolean} review
 */

/**
 * Settings of an answer or of the state section; null for anything else.
 * @param {unknown} value
 * @returns {AutopilotingSettings | null}
 */
export function settingsOf(value) {
  if (!value || typeof value !== 'object') return null;
  const v = /** @type {Record<string, unknown>} */ (value);
  const mode = AUTOPILOTING_MODES.some((m) => m.mode === v['mode']) ? /** @type {AutopilotingSettings['mode']} */ (v['mode']) : null;
  if (!mode || typeof v['revision'] !== 'number' || typeof v['review'] !== 'boolean') return null;
  return { revision: v['revision'], mode, review: v['review'] };
}

/**
 * The settings of the `autopiloting` section of /api/state and the reading error, if any.
 * @param {Record<string, unknown>} state
 * @returns {{ settings: AutopilotingSettings | null, error: string | null }}
 */
export function autopilotingOf(state) {
  const section = state['autopiloting'];
  if (!section || typeof section !== 'object') return { settings: null, error: null };
  const s = /** @type {Record<string, unknown>} */ (section);
  return { settings: settingsOf(s['settings']), error: typeof s['error'] === 'string' && s['error'] ? s['error'] : null };
}

/**
 * The newer of two versions of the settings (by revision); an equal revision keeps the incoming.
 * @param {AutopilotingSettings | null} known
 * @param {AutopilotingSettings | null} incoming
 * @returns {AutopilotingSettings | null}
 */
export function newerSettings(known, incoming) {
  if (!incoming) return known;
  if (!known || incoming.revision >= known.revision) return incoming;
  return known;
}

/**
 * What a refused write shows: the actual settings (a stale revision brings them along) and why.
 * @param {{ code?: string, message?: string, details?: Record<string, unknown> }} error
 * @returns {{ current: AutopilotingSettings | null, text: string }}
 */
export function refusalOf(error) {
  const current = settingsOf(error.details?.['current']);
  if (error.code === 'settings-stale') return { current, text: 'Настройки изменили на другом устройстве: показано текущее значение.' };
  return { current, text: `Не сохранено: ${error.message ?? 'ошибка службы'}. Показано сохранённое значение.` };
}
