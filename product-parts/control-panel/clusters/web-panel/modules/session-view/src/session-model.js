// @ts-check
// Pure models of the session screen (spec sections 6, 8.3, 9.3, 10): the agent activity line, the
// path choice card, the plan card with its buttons and «Ревью плана». No DOM; node --test.

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
  'waiting-for-review': 'Ревью плана: ждёт ответа ревьюера',
  'waiting-for-main': 'Ревью плана: ждёт ответа основного агента',
});

const PROVIDER_NAMES = Object.freeze({ claude: 'Claude', codex: 'ChatGPT' });

/** Plan card buttons in the order they are drawn. */
export const ACTION_BUTTONS = Object.freeze({
  start: { label: 'Начать выполнение плана', route: 'start', primary: true },
  resume: { label: 'Продолжить', route: 'resume', primary: true },
  pause: { label: 'Пауза', route: 'pause', primary: false },
  accept: { label: 'Принять план', route: 'accept', primary: true },
  'request-fixes': { label: 'Нужны исправления', route: 'fixes', primary: false },
  close: { label: 'Закрыть план', route: 'close', primary: true },
});

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
 * The id part of a session key "<client>:<id>".
 * @param {string} key
 */
export function sessionId(key) {
  return key.slice(key.indexOf(':') + 1);
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
  if (channel.state === 'working') return { state: 'working', who, text: 'работает над ответом', since: channel.turnStartedAt ?? channel.since ?? null, detail: lastLabel, pending };
  if (channel.state === 'holding') {
    const reason = /** @type {Record<string, string>} */ (REASON_LABELS)[channel.holdReason] ?? channel.holdReason ?? null;
    return { state: 'holding', who, text: 'ждёт вашего решения в панели', since: channel.since ?? null, detail: reason, pending };
  }
  return { state: 'waiting', who, text: 'ждёт вашего сообщения', since: channel.since ?? null, detail: lastLabel, pending };
}

/**
 * The key of the session that holds its Stop for the mode choice in a project, or null.
 * @param {Record<string, unknown>} state
 * @param {string} projectId
 * @returns {string | null}
 */
function choiceHolder(state, projectId) {
  const held = array(record(state['channel'])['sessions']).find((s) => s && s.projectId === projectId && s.holdReason === 'waiting-for-mode-choice');
  return held ? String(held.key) : null;
}

/**
 * @typedef {object} ChoiceView
 * @property {number} generation
 * @property {string} reason
 * @property {Array<{ option: string, title: string, description: string, recommended: boolean }>} options
 */

/**
 * The path choice card for a session: the session holding the choice (or any session of the
 * project when none does); Codex sessions do not get orchestration.
 * @param {Record<string, unknown>} state
 * @param {string} projectId
 * @param {string} key
 * @returns {ChoiceView | null}
 */
export function choiceView(state, projectId, key) {
  const choice = record(record(record(record(state['workflow'])['projects'])[projectId])['choice']);
  if (typeof choice['generation'] !== 'number') return null;
  const holder = choiceHolder(state, projectId);
  if (holder && holder !== key) return null;
  if (projectReviews(state, projectId).some((r) => r.active || r.reviewerKey === key)) return null;
  return {
    generation: choice['generation'],
    reason: typeof choice['reason'] === 'string' ? choice['reason'] : '',
    options: array(choice['options'])
      .map((o) => ({ option: String(o.option), title: String(o.title), description: String(o.description ?? ''), recommended: Boolean(o.recommended) })),
  };
}

/**
 * @typedef {object} PlanCardView
 * @property {string} scopeId
 * @property {string} phase
 * @property {string} heading
 * @property {number} percent
 * @property {string} progressLabel
 * @property {string | null} blockedReason
 * @property {Array<{ id: string, title: string, state: string, stateLabel: string, modeLabel: string | null, where: string | null, current: boolean }>} tasks
 * @property {Array<{ action: string, label: string, route: string, primary: boolean }>} buttons
 * @property {boolean} delivery the autopilot waits for «Подтвердить выпуск»
 */

/**
 * The plan card of the session that owns the plan (any session while the plan has no owner).
 * @param {Record<string, unknown>} state
 * @param {string} projectId
 * @param {string} key
 * @returns {PlanCardView | null}
 */
export function planView(state, projectId, key) {
  const plan = record(record(record(record(state['workflow'])['projects'])[projectId])['plan']);
  if (typeof plan['scopeId'] !== 'string') return null;
  const owner = typeof plan['ownerSession'] === 'string' ? plan['ownerSession'] : null;
  if (owner && owner !== sessionId(key)) return null;
  const progress = record(plan['progress']);
  const total = typeof progress['total'] === 'number' ? progress['total'] : 0;
  const done = typeof progress['done'] === 'number' ? progress['done'] : 0;
  const pilot = array(record(state['autopilot'])['sessions']).find((s) => s && s.key === key);
  const delivery = record(pilot?.last)['reason'] === 'delivery-confirmation';
  const actions = array(plan['actions']).map(String);
  return {
    scopeId: plan['scopeId'],
    phase: String(plan['phase'] ?? ''),
    heading: String(plan['phaseLabel'] ?? ''),
    percent: total > 0 ? Math.round((done / total) * 100) : 0,
    progressLabel: String(plan['progressLabel'] ?? `в main ${done} из ${total}`),
    blockedReason: typeof plan['blockedReason'] === 'string' ? plan['blockedReason'] : null,
    tasks: array(plan['tasks']).map((t) => ({
      id: String(t.id),
      title: String(t.title),
      state: String(t.state),
      stateLabel: String(t.stateLabel ?? ''),
      modeLabel: typeof t.labelText === 'string' ? t.labelText : null,
      where: typeof t.executorWorktree === 'string' ? 'исполнитель · своя рабочая копия' : null,
      current: Boolean(t.current),
    })),
    buttons: Object.entries(ACTION_BUTTONS)
      .filter(([action]) => actions.includes(action))
      .map(([action, b]) => ({ action, label: b.label, route: b.route, primary: b.primary })),
    delivery,
  };
}

/**
 * «Ревью плана» of a session: visible until the path is chosen; off unless the session turned it on.
 * @param {Record<string, unknown>} state
 * @param {string} projectId
 * @param {string} key
 * @returns {{ on: boolean, hint: string } | null}
 */
export function reviewView(state, projectId, key) {
  const project = record(record(record(state['review'])['projects'])[projectId]);
  const execution = record(record(record(state['workflow'])['projects'])[projectId])['execution'];
  if (project['visible'] === false || (execution && typeof execution === 'object')) return null;
  // M4 section 10: gone while its review runs, for the plan it reviewed and for a reviewer.
  const review = crossReviewView(state, projectId, key);
  const open = record(record(record(record(state['workflow'])['projects'])[projectId])['proposal'])['scopeId'];
  if (review && (review.role === 'reviewer' || review.active || (typeof open === 'string' && review.scopeId === open))) return null;
  const on = record(project['sessions'])[key] === true;
  return {
    on,
    hint: on
      ? 'Своё для этой сессии. Агент отдаст спецификацию и план на ревью и учтёт замечания.'
      : 'Своё для этой сессии. Выключено: спецификация и план без ревью. Можно включить, пока не выбран способ выполнения.',
  };
}

/** @param {Record<string, unknown>} state @param {string} projectId @returns {Array<Record<string, any>>} */
function projectReviews(state, projectId) {
  return array(record(record(state['reviews'])['projects'])[projectId]);
}

/**
 * @typedef {object} CrossReviewView
 * @property {'main' | 'reviewer'} role the session is the reviewed one or the reviewer
 * @property {boolean} active
 * @property {string} status
 * @property {string} statusLabel
 * @property {string} turn who answers now ("" when finished)
 * @property {number} round
 * @property {number} maxRounds
 * @property {string} reviewerName provider of the reviewer
 * @property {string | null} reviewerKey
 * @property {string} mainKey
 * @property {string} mainTitle
 * @property {string | null} scopeId
 * @property {string | null} reason
 * @property {Array<{ from: string, who: string, round: number, text: string, at: string }>} entries newest first
 */

/**
 * The cross review of a session as the main one or the reviewer (spec M4 section 6); the newest.
 * @param {Record<string, unknown>} state
 * @param {string} projectId
 * @param {string} key
 * @returns {CrossReviewView | null}
 */
export function crossReviewView(state, projectId, key) {
  const found = projectReviews(state, projectId)
    .filter((r) => r && (r.mainKey === key || r.reviewerKey === key))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
  if (!found) return null;
  const reviewerName = PROVIDER_NAMES[/** @type {'claude' | 'codex'} */ (found.reviewerProvider)] ?? 'ревьюер';
  const mainName = PROVIDER_NAMES[/** @type {'claude' | 'codex'} */ (found.mainProvider)] ?? 'агент';
  const who = (/** @type {string} */ from) => (from === 'reviewer' ? `Ревьюер (${reviewerName})` : from === 'main' ? `Агент (${mainName})` : 'Workflow Kit');
  const turn = { preparing: `агент (${mainName}) описывает план`, starting: `${reviewerName} запускается`, reviewing: `отвечает ревьюер (${reviewerName})`, answering: `отвечает агент (${mainName})` };
  return {
    role: found.mainKey === key ? 'main' : 'reviewer',
    active: found.active === true,
    status: String(found.status),
    statusLabel: String(found.statusLabel ?? found.status),
    turn: turn[/** @type {'preparing' | 'starting' | 'reviewing' | 'answering'} */ (found.status)] ?? '',
    round: Number(found.round) || 0,
    maxRounds: Number(found.maxRounds) || 5,
    reviewerName,
    reviewerKey: typeof found.reviewerKey === 'string' ? found.reviewerKey : null,
    mainKey: String(found.mainKey),
    mainTitle: String(found.mainTitle ?? ''),
    scopeId: typeof found.scopeId === 'string' ? found.scopeId : null,
    reason: typeof found.reason === 'string' ? found.reason : null,
    entries: array(found.entries)
      .map((e) => ({ from: String(e.from), who: who(String(e.from)), round: Number(e.round) || 0, text: String(e.text ?? ''), at: String(e.at ?? '') }))
      .reverse(),
  };
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
