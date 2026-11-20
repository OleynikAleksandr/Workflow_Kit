// @ts-check
// M48 T005: the autopilot card of a session and the rule «under the autopilot no button it presses
// itself». Settings are the defaults of new sessions; each session has its own mode and review
// (`autopiloting.sessions[project][key]`), changed on its card at any stage. While the project's run
// goes on, the plan cards hide the mode choice, the start of a full run, the acceptance and the
// closing the grant lets the run do; a paused, blocked or stopped run gives the buttons back. A
// press that waits for a busy Kit (`kitWaits`) is told on the card. No DOM.

/** @param {unknown} value @returns {Record<string, any>} */
function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? /** @type {Record<string, any>} */ (value) : {};
}

/** @param {unknown} list @returns {any[]} */
const array = (list) => (Array.isArray(list) ? list : []);

/** The modes of the session card, in the order of «Настройки». */
export const SESSION_MODES = Object.freeze([
  { mode: 'off', label: 'Выкл' },
  { mode: 'after-start', label: 'После старта' },
  { mode: 'full', label: 'Полный' },
]);

export const SESSION_AUTOPILOT_TEXTS = Object.freeze({
  title: 'Автопилот сессии',
  review: 'Ревью спецификации и плана',
  reviewRunning: 'Ревью идёт: снимите флажок, чтобы отменить его.',
  reviewed: 'План прошёл ревью: решение о ревью больше не меняется.',
  hint: 'Режим и ревью этой сессии. «Настройки» задают значения только для новых сессий.',
  unknown: 'Настройки сессии ещё не прочитаны.',
});

/** Phases of a run that goes on: its own buttons are pressed by the run. */
const LIVE = new Set(['preparing', 'reviewing', 'choosing', 'starting', 'executing', 'delivering', 'verifying', 'accepting', 'closing', 'publishing', 'waiting']);
/** Phases of a full run before its plan is started. */
const PRE_START = new Set(['preparing', 'reviewing', 'choosing', 'starting']);

/**
 * The project's run while it goes on, or null (none, paused, blocked, stopped, ended).
 * @param {Record<string, unknown>} state
 * @param {string} projectId
 * @returns {Record<string, any> | null}
 */
export function liveRun(state, projectId) {
  const run = record(record(record(state['autopiloting'])['projects'])[projectId]);
  return typeof run['runId'] === 'string' && LIVE.has(String(run['phase'])) ? run : null;
}

/**
 * @typedef {object} AutopilotPresses
 * @property {string | null} choice the line shown instead of the mode choice card, or null (card as usual)
 * @property {boolean} start the run starts the plan itself
 * @property {boolean} accept the run accepts itself (no manual criterion and no automatic acceptance gave way)
 * @property {boolean} close the run closes the plan itself
 * @property {boolean} publish the run publishes itself
 * @property {boolean} delivery the run confirms its delivery tasks itself (a started run with the grant)
 * @property {string | null} note the line of the plan card about what the run does instead of the buttons
 */

/** @type {AutopilotPresses} */
const MANUAL = Object.freeze({ choice: null, start: false, accept: false, close: false, publish: false, delivery: false, note: null });

/**
 * Which buttons of the project the run presses itself (spec M48 3.5).
 * @param {Record<string, unknown>} state
 * @param {string} projectId
 * @returns {AutopilotPresses}
 */
export function autopilotPresses(state, projectId) {
  const run = liveRun(state, projectId);
  if (!run) return MANUAL;
  const phase = String(run['phase']);
  const grant = record(run['grant']);
  const preparing = run['mode'] === 'full' && PRE_START.has(phase);
  const choice = !preparing
    ? null
    : run['returned'] === true
      ? 'Автопилот вернул план агенту: в нём нет описания для автопилота, агент добавит его.'
      : phase === 'reviewing'
        ? 'Идёт ревью плана: после него автопилот сам выберет способ выполнения и запустит план.'
        : 'Автопилот сам выберет способ выполнения и запустит план.';
  const userAccepts = Boolean(record(run['manualAcceptance'])['reason']);
  // An older service sends no `grant`: nothing is hidden but the start of a full run.
  const accept = grant['accept'] === true && !userAccepts;
  const close = grant['close'] === true;
  const publish = grant['publish'] === true;
  const note = preparing
    ? 'План запустит автопилот.'
    : accept && close
      ? `Приёмку, закрытие${publish ? ' и публикацию' : ''} выполнит автопилот.`
      : close
        ? `Приёмка — ваша (ручной критерий); закрытие${publish ? ' и публикацию' : ''} выполнит автопилот.`
        : null;
  const delivery = run['authorized'] === true && !PRE_START.has(phase);
  return { choice, start: preparing, accept, close, publish, delivery, note };
}

/**
 * @typedef {object} SessionAutopilotView
 * @property {boolean} known the service has the record of the session (else the card asks for it)
 * @property {number} revision
 * @property {string} mode
 * @property {boolean} review
 * @property {'open' | 'running' | 'reviewed' | 'closed' | null} reviewState
 * @property {boolean} reviewShown the switch of the review is on the card
 * @property {string | null} reviewLine
 * @property {string | null} effect what the last switch did
 */

/**
 * The card of a main session; null for a reviewer session and an archived one.
 * @param {Record<string, unknown>} state
 * @param {string} projectId
 * @param {string} key
 * @param {(state: Record<string, unknown>, projectId: string, key: string) => boolean} [isReviewer]
 * @returns {SessionAutopilotView | null}
 */
export function sessionAutopilotView(state, projectId, key, isReviewer = () => false) {
  if (isReviewer(state, projectId, key)) return null;
  if (record(record(record(record(state['titles'])['projects'])[projectId])[key])['archivedAt']) return null;
  const own = record(record(record(record(state['autopiloting'])['sessions'])[projectId])[key]);
  const known = typeof own['revision'] === 'number' && typeof own['mode'] === 'string';
  const reviewState = ['open', 'running', 'reviewed', 'closed'].includes(String(own['reviewState'])) ? /** @type {SessionAutopilotView['reviewState']} */ (own['reviewState']) : null;
  return {
    known,
    revision: known ? own['revision'] : 0,
    mode: known ? own['mode'] : 'off',
    review: own['review'] === true,
    reviewState,
    reviewShown: known && (reviewState === null || reviewState === 'open' || reviewState === 'running'),
    reviewLine: reviewState === 'running' ? SESSION_AUTOPILOT_TEXTS.reviewRunning : reviewState === 'reviewed' ? SESSION_AUTOPILOT_TEXTS.reviewed : null,
    effect: typeof own['effect'] === 'string' && own['effect'] ? own['effect'] : null,
  };
}

/** Names of the waiting presses (`kitWaits` actions). */
const PRESS_LABELS = Object.freeze(/** @type {Record<string, string>} */ ({
  choose: 'Выбор способа выполнения',
  start: 'Начать выполнение плана',
  accept: 'Принять план',
  close: 'Закрыть план',
  'confirm-delivery': 'Подтвердить выпуск',
  'decision:choose': 'Выбор способа выполнения',
  'decision:accept': 'Принять план',
  'decision:close': 'Закрыть план',
  'decision:confirm-delivery': 'Подтвердить выпуск',
  'decision:unblock': 'Снять блокировку',
  'decision:approve-install': 'Разрешить установку',
  'decision:adopt-commits': 'Принять коммиты',
  'run:pause': 'Пауза',
  'run:resume': 'Продолжить',
  'run:stop': 'Остановить автопилот',
}));

/**
 * The presses of the project that wait for a busy Kit or did not go through (spec M48 3.4).
 * @param {Record<string, unknown>} state
 * @param {string} projectId
 * @returns {Array<{ id: string, tone: 'waiting' | 'warn', text: string }>}
 */
export function kitWaitsView(state, projectId) {
  return array(record(record(state['kitWaits'])['projects'])[projectId])
    .map(record)
    .filter((wait) => wait['state'] === 'waiting' || wait['state'] === 'failed')
    .map((wait) => {
      const label = PRESS_LABELS[String(wait['action'])] ?? String(wait['action'] ?? '');
      return wait['state'] === 'waiting'
        ? { id: String(wait['id']), tone: /** @type {'waiting'} */ ('waiting'), text: `«${label}» ждёт: агент выполняет команду Kit, нажатие применится, как только Kit освободится.` }
        : { id: String(wait['id']), tone: /** @type {'warn'} */ ('warn'), text: `«${label}» не применено: ${String(wait['error'] ?? 'причина не указана')}` };
    });
}

/** What a refused change of the session card shows until the next change (by `<project>\n<key>`). */
export const cardNotes = new Map();

/**
 * The line of a refused change: the actual value is on the card after the next poll.
 * @param {{ code?: string, message?: string }} error
 * @returns {string}
 */
export function sessionRefusal(error) {
  if (error.code === 'settings-stale') return 'Автопилот этой сессии изменили на другом устройстве: показано текущее значение.';
  if (error.code === 'review-closed') return 'Ревью уже не меняется: способ выполнения плана выбран.';
  if (error.code === 'review-locked') return SESSION_AUTOPILOT_TEXTS.reviewed;
  return `Не сохранено: ${error.message ?? 'ошибка службы'}.`;
}
