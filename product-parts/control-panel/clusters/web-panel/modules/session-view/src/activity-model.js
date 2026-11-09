// @ts-check
// The agent activity line of the session screen (spec sections 6, 8.3; M4 13.8): what the agent,
// the reviewer or the service does now, and the turn timer. No DOM; node --test.
import { crossReviewView, sessionId } from './session-model.js';

/** Why a Stop is held or the autopilot stopped, for the user (autopilot STOP_LABELS). */
export const REASON_LABELS = Object.freeze({
  blocked: 'План остановлен',
  'delivery-confirmation': 'Ждёт подтверждения выпуска',
  disabled: 'Автопилот выключен',
  limit: 'Достигнут предел в 40 продолжений подряд',
  'no-progress': 'Ход не изменил ни план, ни историю',
  'no-scope': 'Нет активного плана',
  paused: 'Пауза',
  'ready-for-acceptance': 'Ждёт приёмки',
  'transaction-pending': 'Незавершённая транзакция или проверка Kit',
  'turn-error': 'Ход прерван',
  'user-message': 'Вы написали в чат — автопилот уступил ход',
  'waiting-for-executors': 'Ждёт исполнителей',
  'waiting-for-mode-choice': 'Ждёт выбора пути',
  'waiting-for-plan-start': 'Ждёт «Начать выполнение плана»',
  'waiting-for-plan-decision': 'Ждёт ответа на вопрос о плане',
  'waiting-for-review': 'Ревью плана: ждёт ответа ревьюера',
  'waiting-for-main': 'Ревью плана: ждёт ответа основного агента',
});


/** Holds that wait for the service, not for the user, and what to say instead (spec M4 13.8). */
const SERVICE_WAITS = Object.freeze({
  'waiting-for-executors': 'ждёт исполнителей',
  'waiting-for-review': 'ждёт ответа ревьюера',
  'waiting-for-main': 'ждёт ответа основного агента',
});

/** Holds that wait for the user, said as the exact action they wait for (spec M4 13.8). */
const USER_ACTIONS = Object.freeze({
  'waiting-for-mode-choice': 'ждёт, когда вы выберете путь в карточке выше',
  'waiting-for-plan-start': 'ждёт, когда вы нажмёте «Начать выполнение плана»',
  'waiting-for-plan-decision': 'ждёт вашего ответа: нужно ли ревью плана',
  'delivery-confirmation': 'ждёт вашего подтверждения выпуска',
  'ready-for-acceptance': 'ждёт, когда вы примете результат',
});

/**
 * The step of an active review as the activity line says it (spec M4 13.8).
 * @param {import('./session-model.js').CrossReviewView} review
 * @returns {{ who: string, text: string }}
 */
function reviewStep(review) {
  const reviewer = review.role === 'main' ? `Ревьюер ${review.reviewerName}` : 'Ревьюер';
  const main = review.role === 'main' ? 'Агент' : 'Основной агент';
  if (review.status === 'preparing') return { who: main, text: 'описывает план для ревьюера' };
  if (review.status === 'starting') return { who: reviewer, text: 'запускается' };
  if (review.status === 'reviewing') return { who: reviewer, text: 'проверяет план' };
  return { who: main, text: 'отвечает на замечания ревьюера' };
}

/**
 * @param {unknown} value
 * @returns {Record<string, any>}
 */
function record(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? /** @type {Record<string, any>} */ (value) : {};
}

/**
 * @param {unknown} list
 * @returns {any[]}
 */
function array(list) {
  return Array.isArray(list) ? list : [];
}

/**
 * @typedef {object} ActivityView
 * @property {'working' | 'waiting' | 'holding' | 'unknown'} state
 * @property {string} who «Агент», or «Оркестратор» for the owner of an orchestrated plan
 * @property {string} text
 * @property {string | null} since ISO time the timer counts from
 * @property {string | null} detail reason of the last autopilot decision or of the hold
 * @property {number} pending messages waiting for delivery
 */

/**
 * @param {Record<string, unknown>} state
 * @param {string} projectId
 * @param {string} key
 * @returns {ActivityView}
 */
export function activityView(state, projectId, key) {
  const channel = array(record(state['channel'])['sessions']).find((s) => s && s.key === key);
  const pilot = array(record(state['autopilot'])['sessions']).find((s) => s && s.key === key);
  const plan = record(record(record(record(state['workflow'])['projects'])[projectId])['plan']);
  const orchestrator = plan['mode'] === 'orchestrated' && typeof plan['ownerSession'] === 'string' && plan['ownerSession'] === sessionId(key);
  const who = orchestrator ? 'Оркестратор' : 'Агент';
  const last = record(pilot?.last);
  const lastLabel = typeof last['label'] === 'string' ? last['label'] : null;
  if (!channel) return { state: 'unknown', who, text: 'ещё не присылал хуков в службу', since: null, detail: lastLabel, pending: 0 };
  const pending = typeof channel.pending === 'number' ? channel.pending : 0;
  // M4 13.8: during a review the line tells its step, not the agent's hold or a stale label.
  const review = crossReviewView(state, projectId, key);
  if (review?.active) {
    const step = reviewStep(review);
    const since = channel.state === 'working' ? channel.turnStartedAt ?? channel.since ?? null : channel.since ?? null;
    return { state: 'working', who: step.who, text: step.text, since, detail: `Ревью плана · круг ${Math.max(review.round, 1)} из ${review.maxRounds}`, pending };
  }
  if (channel.state === 'working') {
    // The autopilot's label explains the turn only when its decision started it.
    const started = last['action'] === 'continue' ? lastLabel ?? (typeof last['detail'] === 'string' ? last['detail'] : null) : null;
    return { state: 'working', who, text: 'работает над ответом', since: channel.turnStartedAt ?? channel.since ?? null, detail: started, pending };
  }
  if (channel.state === 'holding') {
    const reason = /** @type {Record<string, string>} */ (REASON_LABELS)[channel.holdReason] ?? channel.holdReason ?? null;
    const service = /** @type {Record<string, string>} */ (SERVICE_WAITS)[channel.holdReason];
    if (service) return { state: 'holding', who, text: service, since: channel.since ?? null, detail: null, pending };
    const action = /** @type {Record<string, string>} */ (USER_ACTIONS)[channel.holdReason];
    if (action) return { state: 'holding', who, text: action, since: channel.since ?? null, detail: null, pending };
    return { state: 'holding', who, text: 'остановлен', since: channel.since ?? null, detail: reason, pending };
  }
  return { state: 'waiting', who, text: 'ждёт вашего сообщения', since: channel.since ?? null, detail: lastLabel, pending };
}

/**
 * "0:15", "12:04", "1:02:03" since an ISO time.
 * @param {string | null} since
 * @param {number} now
 * @returns {string}
 */
export function timer(since, now) {
  const start = since ? Date.parse(since) : NaN;
  if (!Number.isFinite(start)) return '';
  const total = Math.max(0, Math.floor((now - start) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
